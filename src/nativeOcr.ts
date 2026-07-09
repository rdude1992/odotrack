/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native on-device OCR via Capacitor.
 *
 * When the app is running inside the Capacitor native shell (Android/iOS),
 * this uses the platform's own OCR engine instead of the browser-only
 * Tesseract.js + OpenCV.js pipeline:
 *   - Android → Google ML Kit Text Recognition (on-device, no network)
 *   - iOS     → Apple Vision framework (on-device, no network)
 *
 * The bundled @jcesarmobile/capacitor-ocr plugin is patched (see
 * patches/@jcesarmobile+capacitor-ocr+0.3.0.patch, applied automatically via
 * `postinstall: patch-package`) to also return each line's bounding box.
 * Without that, ML Kit's own text-block grouping puts all of one column's
 * labels before all of another column's values on a two-column receipt —
 * this file reconstructs true top-to-bottom, left-to-right reading order
 * from those boxes instead of trusting the block order ML Kit returns.
 */

import { Capacitor } from '@capacitor/core';
import { Ocr } from '@jcesarmobile/capacitor-ocr';

/** Bounding box in image pixel coordinates — only present after the native patch is applied. */
interface LineBox {
  text: string;
  confidence: number;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

/** True only inside the Capacitor native (Android/iOS) shell — false in any browser, including installed PWAs. */
export function isNativeOcrAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Re-encode the image before handing it to native OCR:
 *  - Downscales anything larger than MAX_DIMENSION on its longest side.
 *    Screenshots/downloaded "digital" receipts are often much higher
 *    resolution than a compressed camera photo; ML Kit gains nothing above
 *    a couple thousand px and very large bitmaps risk failing to decode
 *    natively (OutOfMemoryError) — this keeps every image in a safe range.
 *  - Re-encodes to a plain JPEG, which normalizes odd source formats
 *    (WEBP, HEIC exports, CMYK JPEGs some scanner apps produce) into
 *    something Android's Bitmap decoder reliably handles.
 *  - Deliberately does NOT binarize/threshold/sharpen — ML Kit and Vision
 *    are trained on natural photos and do their own contrast handling;
 *    pre-thresholding tends to hurt their accuracy rather than help it.
 *    (That kind of preprocessing is still useful for the Tesseract.js web
 *    fallback, which is a much weaker recognizer — see preprocessImage in
 *    ocrEngine.ts.)
 */
const MAX_DIMENSION = 2200;

async function normalizeImageForNativeOcr(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode image'));
    el.src = dataUrl;
  });

  const longestSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longestSide > MAX_DIMENSION ? MAX_DIMENSION / longestSide : 1;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);

  // Always round-trip through canvas, even at scale=1 — this is what fixes
  // "doesn't work on digital images": it forces a clean JPEG re-encode
  // regardless of the source format/color profile.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Reconstruct reading order from per-line bounding boxes.
 * Groups lines into visual rows by vertical (Y) overlap, then sorts each
 * row's fragments left-to-right by X — this is what turns ML Kit's
 * block-clustered output ("all labels, then all values") back into the
 * receipt's actual "label: value" line pairing.
 */
function reconstructLines(lines: LineBox[]): string {
  const withBoxes = lines.filter(l => l.top !== undefined && l.bottom !== undefined);
  const withoutBoxes = lines.filter(l => l.top === undefined || l.bottom === undefined);

  if (withBoxes.length === 0) {
    // Native patch not applied yet (older plugin build) — fall back to
    // whatever order the plugin gave us rather than losing text entirely.
    return lines.map(l => l.text).join('\n');
  }

  // Sort by vertical position first so rows are built top-to-bottom.
  const sorted = [...withBoxes].sort((a, b) => (a.top! + a.bottom!) / 2 - (b.top! + b.bottom!) / 2);

  const rows: LineBox[][] = [];
  for (const line of sorted) {
    const centerY = (line.top! + line.bottom!) / 2;
    const height = line.bottom! - line.top!;
    // A line joins an existing row if its vertical center falls within that
    // row's band — using a fraction of line height as tolerance handles
    // slightly skewed/rotated receipt photos without merging distinct rows.
    const row = rows.find(r => {
      const rTop = Math.min(...r.map(l => l.top!));
      const rBottom = Math.max(...r.map(l => l.bottom!));
      const rCenter = (rTop + rBottom) / 2;
      return Math.abs(centerY - rCenter) < height * 0.6;
    });
    if (row) {
      row.push(line);
    } else {
      rows.push([line]);
    }
  }

  const reconstructed = rows.map(row =>
    row
      .sort((a, b) => a.left! - b.left!)
      .map(l => l.text)
      .join('  ')
  );

  // Any boxless fragments (shouldn't normally happen) get appended at the end
  // rather than silently dropped.
  return [...reconstructed, ...withoutBoxes.map(l => l.text)].join('\n');
}

/**
 * Run on-device text recognition on a receipt photo.
 * Returns text with receipt-layout reading order reconstructed from each
 * line's bounding box, plus the average per-block confidence when the
 * platform reports one (Vision reports real values; ML Kit's block-level API
 * often reports -1/unknown — treat a negative value as "not provided" rather
 * than "very low").
 */
export async function recognizeReceiptNative(file: File): Promise<{ rawText: string; avgConfidence: number | null }> {
  const normalizedDataUrl = await normalizeImageForNativeOcr(file);
  const { results } = await Ocr.process({ image: normalizedDataUrl });
  const lines = results as LineBox[];

  const rawText = reconstructLines(lines);
  const known = lines.map(r => r.confidence).filter(c => typeof c === 'number' && c >= 0);
  const avgConfidence = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : null;

  return { rawText, avgConfidence };
}

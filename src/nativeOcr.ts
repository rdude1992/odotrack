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
 * Both are dramatically faster and more accurate than Tesseract.js on
 * mobile hardware, ship with the OS/Play Services (no multi-MB WASM/model
 * download), and work fully offline out of the box.
 *
 * When running as a plain web page or installed PWA (no native shell),
 * `Capacitor.isNativePlatform()` returns false and callers should fall
 * back to the existing web pipeline in ocrEngine.ts.
 */

import { Capacitor } from '@capacitor/core';
import { Ocr } from '@jcesarmobile/capacitor-ocr';

/** True only inside the Capacitor native (Android/iOS) shell — false in any browser, including installed PWAs. */
export function isNativeOcrAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Run on-device text recognition on a receipt photo.
 * Returns the recognized text (all detected blocks joined by newlines) plus
 * the average per-block confidence when the platform reports one (Vision
 * reports real values; ML Kit's block-level API often reports -1/unknown —
 * treat a negative value as "not provided" rather than "very low").
 */
export async function recognizeReceiptNative(file: File): Promise<{ rawText: string; avgConfidence: number | null }> {
  const dataUrl = await fileToDataUrl(file);
  const { results } = await Ocr.process({ image: dataUrl });

  const rawText = results.map(r => r.text).join('\n');
  const known = results.map(r => r.confidence).filter(c => typeof c === 'number' && c >= 0);
  const avgConfidence = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : null;

  return { rawText, avgConfidence };
}

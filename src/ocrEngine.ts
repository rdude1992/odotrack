/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNativeOcrAvailable, recognizeReceiptNative } from './nativeOcr';

// CDNs for OCR libraries (web/PWA fallback only — see scanReceiptImage below)
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js';
const OPENCV_CDN = 'https://docs.opencv.org/4.9.0/opencv.js';

// Cache Storage bucket — bump version suffix to force a fresh download after updates
const OCR_CACHE_NAME = 'ocr-libs-v1';

// ─── Status types ────────────────────────────────────────────────────────────

export interface OCRLibraryStatus {
  /** True if the library global is present in window (in-memory, ready to use) */
  tesseract: boolean;
  opencv: boolean;
  /** True if the script bytes are saved in Cache Storage (persists across reloads) */
  tesseractCached: boolean;
  opencvCached: boolean;
}

/** Synchronous in-memory check only — safe to call on every render. */
export function getOCRLibraryStatus(): Omit<OCRLibraryStatus, 'tesseractCached' | 'opencvCached'> {
  return {
    tesseract: !!(window as any).Tesseract,
    opencv: !!(window as any).cv && !!(window as any).cv.Mat,
  };
}

/** Async full status including Cache Storage persistence check. */
export async function getOCRLibraryCacheStatus(): Promise<OCRLibraryStatus> {
  const runtime = getOCRLibraryStatus();
  let tesseractCached = false;
  let opencvCached = false;
  try {
    // Check main ocr-libs-v1 cache
    const cache = await caches.open(OCR_CACHE_NAME);
    tesseractCached = !!(await cache.match(TESSERACT_CDN));
    opencvCached = !!(await cache.match(OPENCV_CDN));

    // Fallback to checking Workbox Service Worker runtime caches
    if (!tesseractCached) {
      try {
        const jsdelivrCache = await caches.open('jsdelivr-cdn-cache');
        tesseractCached = !!(await jsdelivrCache.match(TESSERACT_CDN));
      } catch {}
    }
    if (!opencvCached) {
      try {
        const opencvCache = await caches.open('opencv-docs-cache');
        opencvCached = !!(await opencvCache.match(OPENCV_CDN));
      } catch {}
    }
  } catch {
    // Cache API unavailable (e.g. non-secure context) — treat as not cached
  }

  // Fallback indicator
  opencvCached = opencvCached || localStorage.getItem('opencv_docs_cached') === 'true';

  return { ...runtime, tesseractCached, opencvCached };
}

/**
 * Removes the Cache Storage entries AND deletes the in-memory globals so
 * the next scan triggers a fresh CDN download.
 */
export async function clearOCRLibraries(): Promise<void> {
  // Evict from Cache Storage
  try {
    await caches.delete(OCR_CACHE_NAME);
  } catch {}
  try {
    await caches.delete('jsdelivr-cdn-cache');
  } catch {}
  try {
    await caches.delete('opencv-docs-cache');
  } catch {}
  try {
    await caches.delete('tessdata-cache');
  } catch {}
  try {
    await caches.delete('unpkg-cache');
  } catch {}

  localStorage.removeItem('opencv_docs_cached');
  // Remove any injected blob script tags (src starts with "blob:")
  document.querySelectorAll('script[data-ocr-lib]').forEach(s => s.remove());
  // Delete globals
  try { delete (window as any).Tesseract; } catch { (window as any).Tesseract = undefined; }
  try { delete (window as any).cv; } catch { (window as any).cv = undefined; }
}

// ─── Progress callback type ───────────────────────────────────────────────────

/**
 * msg   — human-readable status string
 * pct   — 0–100 download percentage (only present during network fetch; absent otherwise)
 * lib   — which library this event is for
 */
export type OCRProgressCallback = (msg: string, pct?: number, lib?: 'tesseract' | 'opencv') => void;

// ─── OCR result types ─────────────────────────────────────────────────────────

export type OCRConfidence = 'high' | 'medium' | 'low' | 'missing';

export interface OCRResult {
  cost: number | null;
  litres: number | null;
  pricePerLitre: number | null;
  date: string | null; // YYYY-MM-DD
  rawText: string;
  odometer?: number | null;
  station?: string | null;
  costConf?: OCRConfidence;
  litresConf?: OCRConfidence;
  pricePerLitreConf?: OCRConfidence;
  dateConf?: OCRConfidence;
  odometerConf?: OCRConfidence;
  stationConf?: OCRConfidence;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch a script from CDN with byte-level progress reporting and store the
 * raw bytes in Cache Storage. Always returns the original CDN URL (never a
 * blob: URL) — opencv.js/tesseract.js are Emscripten/WASM builds that
 * resolve internal asset paths relative to their own <script src>, and a
 * blob: URL breaks that resolution, causing initialization to hang.
 */
async function fetchAndCache(
  url: string,
  onProgress: OCRProgressCallback,
  lib: 'tesseract' | 'opencv'
): Promise<string> {
  const cache = await caches.open(OCR_CACHE_NAME);

  const cached = await cache.match(url);
  if (cached) {
    return url;
  }

  try {
    // Network fetch with streaming progress
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const contentLength = Number(response.headers.get('Content-Length') ?? 0);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        const pct = Math.round((received / contentLength) * 100);
        onProgress(`Downloading ${lib === 'tesseract' ? 'Tesseract.js' : 'OpenCV.js'}… ${pct}%`, pct, lib);
      } else {
        // Content-Length missing (chunked transfer) — show KB received
        onProgress(`Downloading ${lib === 'tesseract' ? 'Tesseract.js' : 'OpenCV.js'}… ${Math.round(received / 1024)} KB`, undefined, lib);
      }
    }

    // Stitch chunks into a single buffer
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

    const text = new TextDecoder().decode(buffer);
    await cache.put(url, new Response(text, { headers: { 'Content-Type': 'application/javascript' } }));

    return url;
  } catch (err) {
    if (lib === 'opencv') {
      console.warn('CORS / Fetch error on OpenCV CDN, falling back to direct script tag load:', err);
      return url;
    }
    throw err;
  }
}

/**
 * Inject a script tag pointing at the real CDN URL and wait for the library
 * global to become available. Returns the global value.
 */
function injectAndWait(scriptUrl: string, globalVarName: string, label: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // Already initialized — nothing to do
    if (globalVarName === 'cv' && (window as any).cv?.Mat) {
      resolve((window as any).cv);
      return;
    }
    if (globalVarName !== 'cv' && (window as any)[globalVarName]) {
      resolve((window as any)[globalVarName]);
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.dataset.ocrLib = label; // so clearOCRLibraries can find it

    const cleanup = () => {
      // Keep the script tag in DOM (needed by some WASM loaders like opencv.js)
    };

    script.addEventListener('load', () => {
      if (globalVarName === 'cv') {
        // OpenCV initialises asynchronously after script load
        const interval = setInterval(() => {
          if ((window as any).cv?.Mat) {
            clearInterval(interval);
            cleanup();
            localStorage.setItem('opencv_docs_cached', 'true');
            resolve((window as any).cv);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(interval);
          cleanup();
          if ((window as any).cv?.Mat) {
            localStorage.setItem('opencv_docs_cached', 'true');
            resolve((window as any).cv);
          } else {
            reject(new Error('OpenCV initialization timed out'));
          }
        }, 15000);
      } else {
        cleanup();
        resolve((window as any)[globalVarName]);
      }
    });

    script.addEventListener('error', () => {
      cleanup();
      reject(new Error(`Failed to execute script for ${label}`));
    });

    document.body.appendChild(script);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Singleton promise — mirrors the old app's _ocrLibsLoading guard.
// Once loading starts, every caller gets the same promise. No double-download.
let _ocrLibsPromise: Promise<{ tesseract: any; cv: any }> | null = null;

/** Fire-and-forget preload — call when the scan modal opens so libraries are
 *  ready (or already loading) before the user picks an image. No-op inside
 *  the native Capacitor app, which uses ML Kit/Vision instead and never
 *  needs the web Tesseract/OpenCV bundle. */
export function preloadOCRLibraries(): void {
  if (isNativeOcrAvailable()) return;
  if (!_ocrLibsPromise) {
    _ocrLibsPromise = loadOCRLibraries();
  }
}

/**
 * Load OCR libraries, using Cache Storage for persistence.
 * First call: downloads from CDN and caches locally.
 * Subsequent calls (same session or new page load): served from cache — no network.
 */
export async function loadOCRLibraries(onProgress?: OCRProgressCallback): Promise<{ tesseract: any; cv: any }> {
  // Return cached promise if loading is already in progress or complete
  if (_ocrLibsPromise) return _ocrLibsPromise;
  _ocrLibsPromise = (async () => {
  try {
    // ── Tesseract ──
    if (onProgress) onProgress('Preparing Tesseract.js…', undefined, 'tesseract');
    const tesseractBlobUrl = await fetchAndCache(TESSERACT_CDN, onProgress ?? (() => {}), 'tesseract');
    if (onProgress) onProgress('Initializing Tesseract.js…', 100, 'tesseract');
    const tesseract = await injectAndWait(tesseractBlobUrl, 'Tesseract', 'tesseract');

    // ── OpenCV (enforced error propagation as requested) ──
    let cv = null;
    try {
      if (onProgress) onProgress('Preparing OpenCV.js…', undefined, 'opencv');
      const cvBlobUrl = await fetchAndCache(OPENCV_CDN, onProgress ?? (() => {}), 'opencv');
      if (onProgress) onProgress('Initializing OpenCV.js…', 100, 'opencv');

      const cvTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OpenCV init timed out')), 15000)
      );
      cv = await Promise.race([injectAndWait(cvBlobUrl, 'cv', 'opencv'), cvTimeoutPromise]);
    } catch (e) {
      console.error('OpenCV failed to load:', e);
      if (onProgress) onProgress('OpenCV load failed!', undefined, 'opencv');
      throw e;
    }

    if (onProgress) onProgress('Libraries ready!');
    return { tesseract, cv };
  } catch (err) {
    _ocrLibsPromise = null; // reset so next call can retry after failure
    console.error('Error loading OCR libraries:', err);
    throw err;
  }
  })();
  return _ocrLibsPromise;
}

// Process image using OpenCV.js or fallback Canvas
export async function preprocessImage(imageEl: HTMLImageElement, cvInstance: any): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Yield to the browser event loop between heavy WASM steps to prevent UI freeze
  const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  let width = imageEl.naturalWidth || imageEl.width;
  let height = imageEl.naturalHeight || imageEl.height;

  // Cap input at 2000px max dimension (more resolution = better contour detection)
  const maxInputDim = 2000;
  if (width > maxInputDim || height > maxInputDim) {
    const scale = maxInputDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(imageEl, 0, 0, width, height);

  if (cvInstance && cvInstance.Mat) {
    try {
      await yieldToMain();
      const src = cvInstance.imread(canvas);
      const gray = new cvInstance.Mat();
      cvInstance.cvtColor(src, gray, cvInstance.COLOR_RGBA2GRAY);

      const w = gray.cols;
      const h = gray.rows;
      const imgArea = w * h;

      // ── Step 1: Receipt contour crop ──
      // Use a small 5×5 Gaussian — aggressive blurring merges contours and breaks detection.
      const blurred = new cvInstance.Mat();
      cvInstance.GaussianBlur(gray, blurred, new cvInstance.Size(5, 5), 0);

      const edges = new cvInstance.Mat();
      cvInstance.threshold(blurred, edges, 0, 255, cvInstance.THRESH_BINARY + cvInstance.THRESH_OTSU);

      const contours = new cvInstance.MatVector();
      const hierarchy = new cvInstance.Mat();
      await yieldToMain();
      cvInstance.findContours(edges, contours, hierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);

      let bestRect = null;
      let bestArea = 0;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const rect = cvInstance.boundingRect(cnt);
        const area = rect.width * rect.height;
        // Receipt: meaningful region but NOT the whole frame.
        // Upper bound 0.92 (not 0.95) — rejects near-full-frame background contours.
        if (area > bestArea && area > imgArea * 0.04 && area < imgArea * 0.92) {
          bestArea = area;
          bestRect = rect;
        }
        cnt.delete();
      }

      let cropped: any = null;
      if (bestRect) {
        // 3% margin (not 5%) — keeps text in frame without including too much background
        const margin = Math.round(Math.max(bestRect.width, bestRect.height) * 0.03);
        const rx = Math.max(0, bestRect.x - margin);
        const ry = Math.max(0, bestRect.y - margin);
        const rw = Math.min(w - rx, bestRect.width + margin * 2);
        const rh = Math.min(h - ry, bestRect.height + margin * 2);
        cropped = gray.roi(new cvInstance.Rect(rx, ry, rw, rh));
      }

      const working = cropped || gray;

      // ── Step 2: Upscale if the receipt is small ──
      // Check the SMALLER dimension (min of cols/rows), not just cols.
      // This ensures portrait receipts that are narrow but tall also get upscaled.
      // Cap scale at 3× to avoid turning a blurry tiny crop into mush.
      const targetMinDim = 800;
      const curMinDim = Math.min(working.cols, working.rows);
      let resized = working;
      let didResize = false;
      if (curMinDim > 0 && curMinDim < targetMinDim) {
        const scaleFactor = Math.min(3, targetMinDim / curMinDim);
        resized = new cvInstance.Mat();
        await yieldToMain();
        cvInstance.resize(working, resized, new cvInstance.Size(0, 0), scaleFactor, scaleFactor, cvInstance.INTER_CUBIC);
        didResize = true;
      }

      // ── Step 3: Bilateral denoise + adaptive threshold ──
      const denoised = new cvInstance.Mat();
      await yieldToMain();
      cvInstance.bilateralFilter(resized, denoised, 3, 40, 40);

      const thresh = new cvInstance.Mat();
      let blockSize = Math.round(resized.cols / 25);
      if (blockSize % 2 === 0) blockSize += 1;
      if (blockSize < 11) blockSize = 11;
      cvInstance.adaptiveThreshold(denoised, thresh, 255, cvInstance.ADAPTIVE_THRESH_GAUSSIAN_C, cvInstance.THRESH_BINARY, blockSize, 10);

      canvas.width = thresh.cols;
      canvas.height = thresh.rows;
      cvInstance.imshow(canvas, thresh);

      // Cleanup — only delete Mats we explicitly allocated
      thresh.delete();
      denoised.delete();
      if (didResize) resized.delete();
      if (cropped) cropped.delete(); // roi view — safe to delete independently
      gray.delete();
      src.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      return canvas;
    } catch (e) {
      console.error('OpenCV processing failed, falling back to Canvas grayscale:', e);
    }
  }

  // Graceful degradation fallback: Canvas-based adaptive thresholding (Bradley-Roth algorithm)
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const numPixels = width * height;
  const grayData = new Uint8Array(numPixels);
  
  // 1. Grayscale step
  for (let i = 0; i < data.length; i += 4) {
    grayData[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // 2. Compute integral image (summed-area table)
  const integral = new Int32Array(numPixels);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const yWidth = y * width;
    for (let x = 0; x < width; x++) {
      sum += grayData[yWidth + x];
      if (y === 0) {
        integral[yWidth + x] = sum;
      } else {
        integral[yWidth + x] = integral[(y - 1) * width + x] + sum;
      }
    }
  }

  // 3. Adaptive thresholding pass
  const S = Math.round(width / 8); // window size is usually width / 8
  const T = 15; // threshold percent
  const sDiv2 = Math.round(S / 2);

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - sDiv2);
    const y2 = Math.min(height - 1, y + sDiv2);
    const yWidth = y * width;
    
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - sDiv2);
      const x2 = Math.min(width - 1, x + sDiv2);

      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      
      // Sum in O(1) using integral image
      let sum = integral[y2 * width + x2];
      if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
      if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
      if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];

      const idx = yWidth + x;
      const curr = grayData[idx];
      
      // Compare current pixel against thresholded average
      const newVal = (curr * count) < (sum * (100 - T) / 100) ? 0 : 255;
      
      const pIdx = idx * 4;
      data[pIdx] = newVal;
      data[pIdx + 1] = newVal;
      data[pIdx + 2] = newVal;
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ─── Unified scan entry point (native ML Kit/Vision vs. web fallback) ─────────

export interface ScanReceiptResult {
  rawText: string;
  /** Data URI of the image actually shown to the user as the "scanned" preview. */
  previewDataUri: string;
  engine: 'native' | 'web';
}

/**
 * Scan a receipt image and return raw OCR text.
 *
 * - Inside the Capacitor native app (Android/iOS): uses on-device ML Kit /
 *   Vision via nativeOcr.ts, including reading-order reconstruction from
 *   line bounding boxes (fixes multi-column layouts) and image
 *   downscale/re-encode (fixes large "digital" images/screenshots).
 * - In a plain browser or installed PWA (no native shell): falls back to
 *   the Tesseract.js + OpenCV.js pipeline below, unchanged.
 */
export async function scanReceiptImage(
  file: File,
  imgEl: HTMLImageElement,
  onProgress?: OCRProgressCallback
): Promise<ScanReceiptResult> {
  if (isNativeOcrAvailable()) {
    if (onProgress) onProgress('Scanning with on-device OCR…');
    const { rawText } = await recognizeReceiptNative(file);
    if (onProgress) onProgress('OCR complete');
    const previewDataUri = imgEl.src;
    return { rawText, previewDataUri, engine: 'native' };
  }

  // ── Web / PWA fallback: existing Tesseract.js + OpenCV.js pipeline ──
  if (onProgress) onProgress('Preparing Tesseract.js…', undefined, 'tesseract');
  const { tesseract, cv } = await loadOCRLibraries(onProgress);

  if (onProgress) onProgress('Preprocessing image...');
  const preprocessedCanvas = await preprocessImage(imgEl, cv);
  const previewDataUri = preprocessedCanvas.toDataURL('image/png');

  if (onProgress) onProgress('Running OCR...');
  const worker = await tesseract.createWorker('eng');
  const ret = await worker.recognize(preprocessedCanvas);
  await worker.terminate();

  return { rawText: ret.data.text, previewDataUri, engine: 'web' };
}

export function extractRobustDate(text: string): string | null {
  // Candidate list to hold detected dates with relative priority/confidence
  const candidates: { dateStr: string; priority: number }[] = [];

  // 1. Handle dates with word-based months (e.g., "15 Aug 2025", "August 15, 2025", "15-Aug-25")
  const monthsMap: { [key: string]: number } = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12
  };

  const monthNamesPattern = Object.keys(monthsMap).join('|');

  // Format 1: "15 Aug 2025", "15-Aug-2025", "15/Aug/25"
  const wordMonthRegex1 = new RegExp(`\\b(\\d{1,2})[-/\\s]+(${monthNamesPattern})[-/\\s]+(\\d{2,4})\\b`, 'i');
  const matchW1 = text.match(wordMonthRegex1);
  if (matchW1) {
    const day = parseInt(matchW1[1], 10);
    const monthName = matchW1[2].toLowerCase();
    const month = monthsMap[monthName];
    let yr = parseInt(matchW1[3], 10);
    if (matchW1[3].length === 2) {
      yr = yr < 50 ? 2000 + yr : 1900 + yr;
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && yr >= 1900 && yr <= 2100) {
      candidates.push({
        dateStr: `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        priority: 25
      });
    }
  }

  // Format 2: "Aug 15, 2025" or "August 15 2025"
  const wordMonthRegex2 = new RegExp(`\\b(${monthNamesPattern})[-/\\s]+(\\d{1,2})[-/\\s,]+(\\d{2,4})\\b`, 'i');
  const matchW2 = text.match(wordMonthRegex2);
  if (matchW2) {
    const monthName = matchW2[1].toLowerCase();
    const month = monthsMap[monthName];
    const day = parseInt(matchW2[2], 10);
    let yr = parseInt(matchW2[3], 10);
    if (matchW2[3].length === 2) {
      yr = yr < 50 ? 2000 + yr : 1900 + yr;
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && yr >= 1900 && yr <= 2100) {
      candidates.push({
        dateStr: `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        priority: 25
      });
    }
  }

  // 2. Standard numeric date patterns: separators can be -, /, . or space
  // We search globally through the text for any group of 3 numbers
  const numericDateRegex = /\b(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})\b/g;
  let match;
  while ((match = numericDateRegex.exec(text)) !== null) {
    const p1 = match[1];
    const p2 = match[2];
    const p3 = match[3];

    let day = 0;
    let month = 0;
    let year = 0;

    // Case A: p1 is a 4-digit year (YYYY/MM/DD)
    if (p1.length === 4) {
      year = parseInt(p1, 10);
      const val2 = parseInt(p2, 10);
      const val3 = parseInt(p3, 10);
      if (val2 >= 1 && val2 <= 12 && val3 >= 1 && val3 <= 31) {
        month = val2;
        day = val3;
      } else if (val3 >= 1 && val3 <= 12 && val2 >= 1 && val2 <= 31) {
        month = val3;
        day = val2;
      }
    }
    // Case B: p3 is a 4-digit year (DD/MM/YYYY or MM/DD/YYYY)
    else if (p3.length === 4) {
      year = parseInt(p3, 10);
      const val1 = parseInt(p1, 10);
      const val2 = parseInt(p2, 10);

      if (val1 > 12 && val1 <= 31 && val2 >= 1 && val2 <= 12) {
        day = val1;
        month = val2;
      } else if (val2 > 12 && val2 <= 31 && val1 >= 1 && val1 <= 12) {
        day = val2;
        month = val1;
      } else if (val1 >= 1 && val1 <= 12 && val2 >= 1 && val2 <= 12) {
        // Default to DD-MM-YYYY assuming DD/MM/YYYY
        day = val1;
        month = val2;
      }
    }
    // Case C: p3 is a 2-digit year (DD/MM/YY or MM/DD/YY)
    else if (p3.length === 2 && p1.length <= 2 && p2.length <= 2) {
      const yr2 = parseInt(p3, 10);
      year = yr2 < 50 ? 2000 + yr2 : 1900 + yr2;
      const val1 = parseInt(p1, 10);
      const val2 = parseInt(p2, 10);

      if (val1 > 12 && val1 <= 31 && val2 >= 1 && val2 <= 12) {
        day = val1;
        month = val2;
      } else if (val2 > 12 && val2 <= 31 && val1 >= 1 && val1 <= 12) {
        day = val2;
        month = val1;
      } else if (val1 >= 1 && val1 <= 12 && val2 >= 1 && val2 <= 12) {
        day = val1;
        month = val2;
      }
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      candidates.push({
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        priority: 10
      });
    }
  }

  if (candidates.length > 0) {
    // Sort highest priority first
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].dateStr;
  }

  return null;
}

type LabelConf = 'high' | 'medium' | 'low';

/** Lines that look like addresses/headers — skip for amount matching. */
function isLikelyAddressLine(line: string): boolean {
  return /\b(?:plot|sector|flat|floor|door|no\.|road|street|st\.|lane|avenue|nagar|colony|pin|pincode|post|dist|district|city|state|near|opposite|opp|behind|survey|sy\.|taluk|tehsil|village|town|highway|hwy|expressway|marg|cross|circle|phase|block|wing|tower|building|bldg|apt|apartment|suite|zip|area|locality|landmark)\b/i.test(line)
    || /\b(?:maharashtra|karnataka|delhi|mumbai|pune|chennai|hyderabad|bangalore|bengaluru|india|gujarat|rajasthan|tamil\s*nadu)\b/i.test(line);
}

/** Reject pincode-shaped integers and small bare numbers that are usually address fragments. */
function isPlausibleCostAmount(val: number, raw: string): boolean {
  if (val < 100 || val >= 20000) return false;
  const hasTwoDecimals = /\.\d{2}$/.test(raw);
  if (/^\d{6}$/.test(raw) && !hasTwoDecimals) return false;
  if (!hasTwoDecimals && val < 200) return false;
  return true;
}

// Regex parsing algorithms to extract cost, litres, pricePerLitre, date, odometer, and station name
export function parseReceiptText(text: string): OCRResult {
  // Sanitize OCR artifacts BEFORE any field matching (old pipeline order)
  const sanitized = text.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
  const clean = sanitized.replace(/[|]/g, 'l').replace(/\u20b9/g, '₹');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const joined = clean.replace(/\s+/g, ' ');

  let cost: number | null = null;
  let costConf: OCRConfidence = 'missing';
  let litres: number | null = null;
  let litresConf: OCRConfidence = 'missing';
  let pricePerLitre: number | null = null;
  let pricePerLitreConf: OCRConfidence = 'missing';
  let date: string | null = null;
  let dateConf: OCRConfidence = 'missing';
  let odometer: number | null = null;
  let odometerConf: OCRConfidence = 'missing';
  let station: string | null = null;
  let stationConf: OCRConfidence = 'missing';

  // Same-line matcher — label and number must co-occur on one receipt line.
  // allowCurrencyStrip retries once after stripping a leading digit when validation fails
  // (₹ symbol fused with the next digit during OCR, e.g. "₹96.72" → "396.72").
  function findOnSameLine(
    labelPatterns: { re: RegExp; conf: LabelConf }[],
    numberRe: RegExp,
    validate: (v: number) => boolean,
    allowCurrencyStrip = false,
    options?: { skipAddressLines?: boolean; validateRaw?: (v: number, raw: string) => boolean }
  ): { val: number; conf: LabelConf } | null {
    const validateRaw = options?.validateRaw ?? ((v: number) => validate(v));
    for (const line of lines) {
      if (options?.skipAddressLines && isLikelyAddressLine(line)) continue;
      for (const lp of labelPatterns) {
        const labelMatch = line.match(lp.re);
        if (!labelMatch || labelMatch.index === undefined) continue;
        // Only consider numbers that appear AFTER the label — never digits before it on the same line
        const afterLabel = line.slice(labelMatch.index + labelMatch[0].length);
        const m = afterLabel.match(numberRe);
        if (m) {
          const raw = m[1];
          const val = parseFloat(raw);
          if (validateRaw(val, raw)) return { val, conf: lp.conf };

          if (allowCurrencyStrip && raw.length > 1 && /^\d/.test(raw)) {
            const strippedRaw = raw.slice(1);
            const strippedVal = parseFloat(strippedRaw);
            if (!isNaN(strippedVal) && validateRaw(strippedVal, strippedRaw)) {
              const downgradedConf: LabelConf = lp.conf === 'high' ? 'medium' : 'low';
              return { val: strippedVal, conf: downgradedConf };
            }
          }
        }
      }
    }
    return null;
  }

  // DATE — searched on flattened text (distinctive enough to avoid cross-field bleed)
  const MONTHS: { [key: string]: number } = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
    sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };
  const monthNamePattern = Object.keys(MONTHS).join('|');

  const datePatterns: { re: RegExp; fmt: (m: RegExpMatchArray) => string; conf: LabelConf }[] = [
    {
      re: new RegExp(`\\b(\\d{1,2})[\\s\\-./]+(${monthNamePattern})[\\s\\-./]+(\\d{4})\\b`, 'i'),
      fmt: (m) => `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`,
      conf: 'high'
    },
    {
      re: new RegExp(`\\b(${monthNamePattern})[\\s\\-./]+(\\d{1,2}),?[\\s\\-./]+(\\d{4})\\b`, 'i'),
      fmt: (m) => `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`,
      conf: 'high'
    },
    {
      re: /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/,
      fmt: (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
      conf: 'high'
    },
    {
      re: /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/,
      fmt: (m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      conf: 'high'
    },
    {
      re: /\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{2})\b/,
      fmt: (m) => `20${m[3]}-${m[2]}-${m[1]}`,
      conf: 'medium'
    }
  ];

  for (const p of datePatterns) {
    const m = joined.match(p.re);
    if (m) {
      const candidate = p.fmt(m);
      const d = new Date(candidate);
      const [, mm, dd] = candidate.split('-').map(Number);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2015 && d.getFullYear() < 2035 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        date = candidate;
        dateConf = p.conf;
        break;
      }
    }
  }

  // LITRES / VOLUME
  const litreLabels = [
    { re: /\b(volume|vol)\b/i, conf: 'high' as LabelConf },
    { re: /\b(qty|quantity)\b/i, conf: 'high' as LabelConf },
    { re: /\bLITRES?\b/i, conf: 'high' as LabelConf },
    { re: /\bLTRS?\b/i, conf: 'high' as LabelConf },
    { re: /\bLTS?\b/i, conf: 'high' as LabelConf },
    { re: /\bLT\b/i, conf: 'high' as LabelConf },
    { re: /\bGAL\b/i, conf: 'medium' as LabelConf },
    { re: /\bGALLON\b/i, conf: 'medium' as LabelConf }
  ];

  const litreHit = findOnSameLine(litreLabels, /(\d{1,5}\.\d{1,3})/, v => v > 0 && v < 200);
  if (litreHit) {
    litres = litreHit.val;
    litresConf = litreHit.conf;
  } else {
    for (const line of lines) {
      const m = line.match(/(\d{1,5}\.\d{1,3})\s*(?:ltr|litre|liter)s?\b/i);
      if (m) {
        const val = parseFloat(m[1]);
        if (val > 0 && val < 200) {
          litres = val;
          litresConf = 'medium';
          break;
        }
      }
    }
  }

  // PRICE PER LITRE
  const pplLabels = [
    { re: /\brate\b/i, conf: 'high' as LabelConf },
    { re: /\bprice\s*(?:\/|per)?\s*l(?:tr|itre)?\b/i, conf: 'high' as LabelConf }
  ];

  const pplHit = findOnSameLine(pplLabels, /(\d{1,4}\.\d{1,2})/, v => v > 60 && v < 150, true);
  if (pplHit) {
    pricePerLitre = pplHit.val;
    pricePerLitreConf = pplHit.conf;
  }

  // TOTAL COST / AMOUNT / SALE
  // Number must follow the label (after : or whitespace), not arbitrary digits elsewhere on the line.
  const costNumberRe = /(?:[:.\-]\s*|\s+)(?:Rs\.?|Re\.?|₹|INR|R5|R8)?\s*(\d{2,6}(?:\.\d{2})?)\b/i;
  const costLabels = [
    { re: /\bsale\b/i, conf: 'high' as LabelConf },
    { re: /\btransaction\s*amount\b/i, conf: 'high' as LabelConf },
    { re: /\bamount\s*payable\b/i, conf: 'high' as LabelConf },
    { re: /\bnet\s*amount\b/i, conf: 'high' as LabelConf },
    { re: /\bgrand\s*total\b/i, conf: 'high' as LabelConf },
    { re: /\bamount\b/i, conf: 'high' as LabelConf },
    // Exclude fuel brand names like "Total Energies" / "Total Oil"
    { re: /\btotal\b(?!\s+(?:energies|oil|petrol|gas|gasoline|fuels?|ltd|limited|india|corporation|corp)\b)/i, conf: 'high' as LabelConf }
  ];

  const costHit = findOnSameLine(
    costLabels,
    costNumberRe,
    v => v >= 100 && v < 20000,
    true,
    { skipAddressLines: true, validateRaw: isPlausibleCostAmount }
  );
  if (costHit) {
    cost = costHit.val;
    costConf = costHit.conf;
  }

  // Cross-validation — conservative: only fills gaps, never overrides direct same-line matches
  if (!cost && litres && pricePerLitre) {
    cost = Math.round(litres * pricePerLitre * 100) / 100;
    costConf = 'medium';
  }
  if (!pricePerLitre && cost && litres) {
    pricePerLitre = Math.round((cost / litres) * 100) / 100;
    pricePerLitreConf = 'medium';
  }
  if (cost && litres && pricePerLitre) {
    const expected = litres * pricePerLitre;
    const diff = Math.abs(expected - cost) / cost;
    if (diff > 0.15) {
      if (pricePerLitreConf !== 'high') {
        pricePerLitre = Math.round((cost / litres) * 100) / 100;
        pricePerLitreConf = 'low';
      } else {
        costConf = 'low';
      }
    }
  }

  // ODOMETER
  const odoLabels = [
    { re: /\b(?:odo|odometer|closed\s*odo|closing\s*odo|closing)\b/i, conf: 'high' as LabelConf },
    { re: /\b(?:opening|opening\s*odo)\b/i, conf: 'medium' as LabelConf },
    { re: /\bkm\s*reading\b/i, conf: 'high' as LabelConf },
    { re: /\b(?:mileage|kms?|kilometers?|speedo)\b/i, conf: 'medium' as LabelConf }
  ];

  const odoHit = findOnSameLine(odoLabels, /(\d{3,7})/, v => v > 0 && v < 9999999);
  if (odoHit) {
    odometer = Math.round(odoHit.val);
    odometerConf = odoHit.conf;
  } else {
    const kmMatch = clean.match(/\b(\d{4,6})\s*(?:kms?|kilometers?|km\b)/i);
    if (kmMatch) {
      const val = parseInt(kmMatch[1], 10);
      if (val >= 100 && val < 999999) {
        odometer = val;
        odometerConf = 'medium';
      }
    }
  }

  // STATION NAME
  const knownBrands = [
    'HPCL', 'Hindustan Petroleum', 'HP', 'Indian Oil', 'IndianOil', 'IOCL', 'BPCL', 'Bharat Petroleum',
    'Shell', 'Reliance', 'Essar', 'Nayara', 'Jio-bp', 'Total',
    'BP', 'Exxon', 'Mobil', 'Chevron', 'Texaco', 'Gulf', 'Sunoco', 'Speedway', 'Costco', 'Wawa',
    'Circle K', '7-Eleven', 'Sinclair', 'Valero', 'Puma', 'Petronas', 'Caltex'
  ];
  for (const line of lines) {
    const hit = knownBrands.find(b =>
      line.toLowerCase().replace(/\s+/g, '').includes(b.toLowerCase().replace(/\s+/g, ''))
    );
    if (hit) {
      station = hit.replace(/IndianOil/i, 'Indian Oil');
      stationConf = 'high';
      break;
    }
  }

  return {
    cost: cost !== null ? parseFloat(cost.toFixed(2)) : null,
    litres: litres !== null ? parseFloat(litres.toFixed(2)) : null,
    pricePerLitre: pricePerLitre !== null ? parseFloat(pricePerLitre.toFixed(3)) : null,
    date,
    rawText: text,
    odometer: odometer ?? null,
    station: station ?? null,
    costConf,
    litresConf,
    pricePerLitreConf,
    dateConf,
    odometerConf,
    stationConf
  };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNativeOcrAvailable, recognizeReceiptNative } from './nativeOcr';

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

// ─── Unified scan entry point (native ML Kit/Vision only) ─────────────────────

export interface ScanReceiptResult {
  rawText: string;
  /** Data URI of the image actually shown to the user as the "scanned" preview. */
  previewDataUri: string;
  engine: 'native' | 'web';
}

/**
 * Scan a receipt image and return raw OCR text.
 *
 * Uses on-device ML Kit / Vision via nativeOcr.ts (Android/iOS) — includes
 * reading-order reconstruction from line bounding boxes (fixes multi-column
 * layouts) and image downscale/re-encode (fixes large "digital" images).
 *
 * Web/PWA fallback is no longer supported. This requires the Capacitor
 * native shell.
 */
export async function scanReceiptImage(
  file: File,
  imgEl: HTMLImageElement,
  onProgress?: (msg: string) => void
): Promise<ScanReceiptResult> {
  // Convert image to a persistent base64 data URI
  const previewDataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file as base64'));
    reader.readAsDataURL(file);
  });

  if (!isNativeOcrAvailable()) {
    if (onProgress) onProgress('Web/PWA Fallback: Image loaded as base64. Skipping native OCR.');
    return { rawText: '', previewDataUri, engine: 'web' };
  }

  if (onProgress) onProgress('Scanning with on-device OCR…');
  const { rawText } = await recognizeReceiptNative(file);
  if (onProgress) onProgress('OCR complete');
  
  return { rawText, previewDataUri, engine: 'native' };
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
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Vehicle, FuelLog, Trip, Expense, MaintenanceRecord } from '../types';
import { dbAPI } from '../db';
import { useToast } from './ToastContext';
import NeoModal from './NeoModal';
import NeoDropdown from './NeoDropdown';
import { getLocalDateString, normalizeTripPurpose, getVehicleDefaultSchedule, downloadOrShareXLSX } from '../utils';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
  Fuel,
  MapPin,
  Wrench,
  Table,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Info
} from 'lucide-react';

export type ImportRecordType = 'fuel' | 'trip' | 'maintenance';

const DEFAULT_BILL_CATEGORIES = [
  'Service',
  'Repair',
  'Toll',
  'Parking',
  'Insurance',
  'Tires',
  'Battery',
  'Accessory',
  'Other'
];

interface ExcelCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onImportSuccess: () => void;
}

interface ColumnMapping {
  vehicle: string;
  date: string;
  amount: string;
  pricePerLitre: string;
  litre: string;
  odometer: string;
  description: string;
  pumpName: string;
  fullTank: string;
  // Trip specific
  startOdo: string;
  endOdo: string;
  source: string;
  destination: string;
  purpose: string;
  // Maintenance specific
  category: string;
}

const DEFAULT_MAPPING: ColumnMapping = {
  vehicle: '',
  date: '',
  amount: '',
  pricePerLitre: '',
  litre: '',
  odometer: '',
  description: '',
  pumpName: '',
  fullTank: '',
  startOdo: '',
  endOdo: '',
  source: '',
  destination: '',
  purpose: '',
  category: ''
};

export interface ParsedDateResult {
  dateStr: string; // YYYY-MM-DD
  isValid: boolean;
  error?: string;
  warning?: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

/**
 * Multi-format date parser and validator
 * Handles:
 * - JS Date objects
 * - Excel serial numbers (e.g., 45128)
 * - ISO strings (YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss)
 * - Text months (15-Jul-2026, Jul 15, 2026, 15/July/2026)
 * - Numeric formats (DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY)
 * - Unix timestamps in seconds or milliseconds
 */
export function parseExcelDateAndValidate(val: any): ParsedDateResult {
  if (val == null || val === '') {
    return { dateStr: getLocalDateString(new Date()), isValid: true, warning: 'Date missing; using today\'s date' };
  }

  // Handle JS Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return { dateStr: '', isValid: false, error: 'Invalid Date object' };
    }
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    if (y < 1900 || y > 2100) {
      return { dateStr: '', isValid: false, error: `Year out of valid range (1900-2100): ${y}` };
    }
    return { dateStr: `${y}-${m}-${d}`, isValid: true };
  }

  // Handle Excel Serial Number (e.g. 45128 or 45128.5)
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0 || val > 100000) {
      return { dateStr: '', isValid: false, error: `Invalid numeric date code: ${val}` };
    }
    try {
      const jsDate = XLSX.SSF.parse_date_code(val);
      if (jsDate && jsDate.y && jsDate.m && jsDate.d) {
        const y = jsDate.y;
        const m = String(jsDate.m).padStart(2, '0');
        const d = String(jsDate.d).padStart(2, '0');
        if (y < 1900 || y > 2100) {
          return { dateStr: '', isValid: false, error: `Excel date year out of range (${y})` };
        }
        return { dateStr: `${y}-${m}-${d}`, isValid: true };
      }
    } catch {
      // Fall through to string parsing
    }
  }

  const rawStr = String(val).trim();
  if (!rawStr) {
    return { dateStr: '', isValid: false, error: 'Date value is empty' };
  }

  // Handle Unix timestamp in seconds (e.g. 1753190400) or milliseconds (e.g. 1753190400000)
  if (/^\d{9,13}$/.test(rawStr)) {
    const num = parseInt(rawStr, 10);
    const ts = rawStr.length === 10 ? num * 1000 : num;
    const dateObj = new Date(ts);
    if (!isNaN(dateObj.getTime())) {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      if (y >= 1900 && y <= 2100) {
        return { dateStr: `${y}-${m}-${d}`, isValid: true };
      }
    }
  }

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = rawStr.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return {
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isValid: true
      };
    }
  }

  // Text month formats e.g. "15-Jul-2026", "Jul 15, 2026", "15 July 2026"
  const monthAlphaMatch = rawStr.match(/(\d{1,2})[\s\-\/\.]([a-zA-Z]{3,9})[\s\-\/\.](\d{2,4})/) ||
                          rawStr.match(/([a-zA-Z]{3,9})[\s\-\/\.](\d{1,2})[\,\s\-\/\.]+(\d{2,4})/);
  if (monthAlphaMatch) {
    let day: number, monthName: string, year: number;
    if (isNaN(parseInt(monthAlphaMatch[1], 10))) {
      monthName = monthAlphaMatch[1].toLowerCase();
      day = parseInt(monthAlphaMatch[2], 10);
      year = parseInt(monthAlphaMatch[3], 10);
    } else {
      day = parseInt(monthAlphaMatch[1], 10);
      monthName = monthAlphaMatch[2].toLowerCase();
      year = parseInt(monthAlphaMatch[3], 10);
    }

    if (year < 100) year += 2000; // e.g. 26 -> 2026
    const mNum = MONTH_MAP[monthName.substring(0, 3)];
    if (mNum && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return {
        dateStr: `${year}-${String(mNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isValid: true
      };
    }
  }

  // DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY
  const parts = rawStr.split(/[\/\-\.\s]+/);
  if (parts.length >= 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      if (p3 < 100) p3 += 2000; // 26 -> 2026

      let day = p1;
      let month = p2;
      let year = p3;

      if (p1 > 1000) {
        // YYYY/MM/DD
        year = p1;
        month = p2;
        day = p3;
      } else if (p1 > 12 && p1 <= 31) {
        // Definitely DD/MM/YYYY
        day = p1;
        month = p2;
      } else if (p2 > 12 && p2 <= 31) {
        // Definitely MM/DD/YYYY
        month = p1;
        day = p2;
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
        return {
          dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          isValid: true
        };
      }
    }
  }

  // Fallback: Standard Date constructor
  const parsed = new Date(rawStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    if (y >= 1900 && y <= 2100) {
      return { dateStr: `${y}-${m}-${d}`, isValid: true };
    }
  }

  return { dateStr: '', isValid: false, error: `Unrecognized date format: "${rawStr}"` };
}

export interface ParsedNumberResult {
  value: number;
  isValid: boolean;
  error?: string;
}

/**
 * Strict numeric parser and type validator to prevent NaN / invalid types in IndexedDB
 */
export function parseStrictNumberAndValidate(
  val: any,
  fieldName: string,
  options: { min?: number; max?: number; allowZero?: boolean; required?: boolean } = {}
): ParsedNumberResult {
  const { min = 0, max = 10000000, allowZero = true, required = false } = options;

  if (val == null || val === '') {
    if (required) {
      return { value: 0, isValid: false, error: `${fieldName} is required` };
    }
    return { value: 0, isValid: true };
  }

  if (typeof val === 'number') {
    if (!isFinite(val) || isNaN(val)) {
      return { value: 0, isValid: false, error: `${fieldName} is invalid numeric type` };
    }
    if (!allowZero && val === 0) {
      return { value: 0, isValid: false, error: `${fieldName} must be greater than zero` };
    }
    if (val < min) {
      return { value: val, isValid: false, error: `${fieldName} (${val}) is less than minimum (${min})` };
    }
    if (val > max) {
      return { value: val, isValid: false, error: `${fieldName} (${val}) exceeds maximum (${max})` };
    }
    return { value: val, isValid: true };
  }

  const strVal = String(val).trim();
  if (strVal === '') {
    if (required) {
      return { value: 0, isValid: false, error: `${fieldName} is required` };
    }
    return { value: 0, isValid: true };
  }

  // Remove currency symbols, commas, spaces
  const sanitized = strVal.replace(/[^0-9.-]/g, '');
  if (!sanitized || isNaN(Number(sanitized))) {
    return { value: 0, isValid: false, error: `${fieldName} contains non-numeric text: "${strVal}"` };
  }

  const num = parseFloat(sanitized);
  if (!isFinite(num) || isNaN(num)) {
    return { value: 0, isValid: false, error: `${fieldName} is not a finite number` };
  }

  if (!allowZero && num === 0) {
    return { value: 0, isValid: false, error: `${fieldName} must be greater than zero` };
  }
  if (num < min) {
    return { value: num, isValid: false, error: `${fieldName} (${num}) is less than minimum (${min})` };
  }
  if (num > max) {
    return { value: num, isValid: false, error: `${fieldName} (${num}) exceeds maximum (${max})` };
  }

  return { value: num, isValid: true };
}

export default function ExcelCsvImportModal({
  isOpen,
  onClose,
  vehicles,
  onImportSuccess
}: ExcelCsvImportModalProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workflow State
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [recordType, setRecordType] = useState<ImportRecordType>('fuel');
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  
  // Raw Data & Headers
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  
  // Options
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [defaultVehicleId, setDefaultVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [autoCreateVehicles, setAutoCreateVehicles] = useState<boolean>(true);

  // Category Selection for Bills / Maintenance Records
  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_BILL_CATEGORIES);
  const [rowCategories, setRowCategories] = useState<Record<number, string>>({});
  const [globalDefaultCategory, setGlobalDefaultCategory] = useState<string>('Service');

  // Load available bill categories from localStorage & DB when modal opens
  React.useEffect(() => {
    if (isOpen) {
      const loadCategories = async () => {
        const catSet = new Set<string>(DEFAULT_BILL_CATEGORIES);

        // Custom categories from localStorage
        try {
          const savedCustom = localStorage.getItem('odotrack_custom_expense_categories');
          if (savedCustom) {
            const parsed = JSON.parse(savedCustom);
            if (Array.isArray(parsed)) {
              parsed.forEach(c => {
                if (c && typeof c === 'string' && c.trim()) catSet.add(c.trim());
              });
            }
          }
        } catch (e) {
          console.warn('Failed to load custom categories from localStorage', e);
        }

        // Existing categories from DB
        try {
          const existingExpenses = await dbAPI.getExpenses();
          existingExpenses.forEach(e => {
            if (e.category && e.category.trim()) catSet.add(e.category.trim());
          });
          const existingMaint = await dbAPI.getMaintenanceRecords();
          existingMaint.forEach(m => {
            if (m.itemType && m.itemType.trim()) catSet.add(m.itemType.trim());
          });
        } catch (e) {
          console.warn('Failed to load categories from DB', e);
        }

        const cats = Array.from(catSet);
        cats.sort((a, b) => {
          if (a === 'Service') return -1;
          if (b === 'Service') return 1;
          return a.localeCompare(b);
        });
        setAvailableCategories(cats);
      };

      loadCategories();
    }
  }, [isOpen]);

  // Filter and pagination states for preview table
  const [rowFilter, setRowFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 50;

  // Auto-detect column headers based on keywords
  const autoDetectMapping = (sheetHeaders: string[], type: ImportRecordType): ColumnMapping => {
    const newMapping: ColumnMapping = { ...DEFAULT_MAPPING };
    const normHeaders = sheetHeaders.map(h => ({ original: h, norm: h.toLowerCase().replace(/[^a-z0-9]/g, '') }));

    const findMatch = (keywords: string[]) => {
      for (const kw of keywords) {
        const found = normHeaders.find(h => h.norm.includes(kw.replace(/[^a-z0-9]/g, '')));
        if (found) return found.original;
      }
      return '';
    };

    newMapping.vehicle = findMatch(['vehicle', 'vehiclename', 'car', 'bike', 'registration', 'reg', 'veh']);
    newMapping.date = findMatch(['date', 'filldate', 'tripdate', 'servicedate', 'dt', 'timestamp']);
    newMapping.description = findMatch(['description', 'notes', 'desc', 'remarks', 'comment']);

    if (type === 'fuel') {
      newMapping.amount = findMatch(['amount', 'cost', 'totalcost', 'price', 'paid', 'total']);
      newMapping.pricePerLitre = findMatch(['priceperltr', 'priceperlitre', 'priceperliter', 'unitprice', 'price/ltr', 'price/l', 'rate']);
      newMapping.litre = findMatch(['litre', 'litres', 'liter', 'liters', 'volume', 'qty', 'quantity']);
      newMapping.odometer = findMatch(['odometer', 'odo', 'km', 'reading', 'odoreading']);
      newMapping.pumpName = findMatch(['pumpname', 'pump', 'station', 'vendor', 'shop', 'fuelstation']);
      newMapping.fullTank = findMatch(['fulltank', 'full', 'tankfull', 'isfull', 'fulltankflag', 'partial']);
    } else if (type === 'trip') {
      newMapping.startOdo = findMatch(['startodo', 'startodometer', 'odometerstart', 'startkm', 'initialodo', 'odometer']);
      newMapping.endOdo = findMatch(['endodo', 'endodometer', 'odometerend', 'endkm', 'finalodo']);
      newMapping.source = findMatch(['source', 'from', 'startlocation', 'origin', 'startpoint']);
      newMapping.destination = findMatch(['destination', 'to', 'endlocation', 'dest', 'endpoint']);
      newMapping.purpose = findMatch(['purpose', 'triptype', 'type', 'category']);
    } else if (type === 'maintenance') {
      newMapping.amount = findMatch(['amount', 'cost', 'totalcost', 'price', 'paid', 'bill']);
      newMapping.category = findMatch(['category', 'itemtype', 'maintenancetype', 'type', 'service']);
      newMapping.odometer = findMatch(['odometer', 'odo', 'km', 'reading']);
    }

    return newMapping;
  };

  // Process File Reading
  const processWorkbook = (wb: XLSX.WorkBook, preferredSheet?: string, preferredType?: ImportRecordType) => {
    const sheets = wb.SheetNames;
    setSheetNames(sheets);

    let sheetToUse = preferredSheet || sheets[0];
    const typeToUse = preferredType || recordType;

    if (!preferredSheet) {
      const fuelSheet = sheets.find(s => s.toLowerCase().includes('fuel'));
      const tripSheet = sheets.find(s => s.toLowerCase().includes('trip'));
      const maintSheet = sheets.find(s => s.toLowerCase().includes('maint') || s.toLowerCase().includes('expens'));

      if (typeToUse === 'fuel' && fuelSheet) sheetToUse = fuelSheet;
      else if (typeToUse === 'trip' && tripSheet) sheetToUse = tripSheet;
      else if (typeToUse === 'maintenance' && maintSheet) sheetToUse = maintSheet;
    }

    setSelectedSheet(sheetToUse);
    const worksheet = wb.Sheets[sheetToUse];
    if (!worksheet) return;

    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    if (jsonData.length === 0) {
      showToast('Selected sheet is empty or has no row data.', 'error');
      return;
    }

    const detectedHeaders = Object.keys(jsonData[0]);
    setHeaders(detectedHeaders);
    setRawRows(jsonData);

    const detectedMapping = autoDetectMapping(detectedHeaders, typeToUse);
    setMapping(detectedMapping);
    setRowFilter('all');
    setCurrentPage(1);
    setStep('preview');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        processWorkbook(wb);
      } catch (err: any) {
        showToast(`Failed to parse file: ${err.message || err}`, 'error');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleSheetChange = (sheetName: string) => {
    if (!file) return;
    setSelectedSheet(sheetName);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        processWorkbook(wb, sheetName);
      } catch (err) {
        showToast('Error changing worksheet.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleTypeChange = (type: ImportRecordType) => {
    setRecordType(type);
    setRowFilter('all');
    setCurrentPage(1);
    if (headers.length > 0) {
      const reMapped = autoDetectMapping(headers, type);
      setMapping(reMapped);
    }
  };

  // Computed Preview Items with Server-Side Style Type Validation
  const parsedPreview = useMemo(() => {
    if (rawRows.length === 0) return [];

    let defaultAutoVehName = 'Vehicle-1';
    if (autoCreateVehicles) {
      let num = 1;
      while (true) {
        const cand = `Vehicle-${num}`;
        if (!vehicles.some(v => v.name.toLowerCase() === cand.toLowerCase())) {
          defaultAutoVehName = cand;
          break;
        }
        num++;
      }
    }

    return rawRows.map((row, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const rawVehName = String(row[mapping.vehicle] || '').trim();
      const description = String(row[mapping.description] || '').trim();
      const pumpName = String(row[mapping.pumpName] || '').trim();

      // Vehicle matching
      let matchedVehicle = vehicles.find(
        v => v.name.toLowerCase() === rawVehName.toLowerCase() ||
             (v.registration && v.registration.toLowerCase() === rawVehName.toLowerCase()) ||
             v.id === rawVehName
      );

      let fallbackVehicle = vehicles.find(v => v.id === defaultVehicleId);
      let targetVehicleName: string;
      let isNewVeh: boolean = false;

      if (matchedVehicle) {
        targetVehicleName = matchedVehicle.name;
        isNewVeh = false;
      } else if (rawVehName) {
        if (autoCreateVehicles) {
          targetVehicleName = rawVehName;
          isNewVeh = true;
        } else {
          targetVehicleName = fallbackVehicle ? fallbackVehicle.name : (vehicles[0]?.name || 'Missing Vehicle');
          isNewVeh = false;
        }
      } else {
        if (autoCreateVehicles) {
          targetVehicleName = defaultAutoVehName;
          isNewVeh = true;
        } else {
          targetVehicleName = fallbackVehicle ? fallbackVehicle.name : (vehicles[0]?.name || 'Missing Vehicle');
          isNewVeh = false;
        }
      }

      // Date validation
      const dateRes = parseExcelDateAndValidate(row[mapping.date]);
      if (!dateRes.isValid) {
        errors.push(dateRes.error || 'Invalid date');
      }
      if (dateRes.warning) {
        warnings.push(dateRes.warning);
      }

      if (recordType === 'fuel') {
        const amountRes = parseStrictNumberAndValidate(row[mapping.amount], 'Amount', { min: 0 });
        if (!amountRes.isValid) errors.push(amountRes.error || 'Invalid amount');

        const rateRes = parseStrictNumberAndValidate(row[mapping.pricePerLitre], 'Rate/Price', { min: 0 });
        if (!rateRes.isValid) errors.push(rateRes.error || 'Invalid price per litre');

        const litresRes = parseStrictNumberAndValidate(row[mapping.litre], 'Litres', { min: 0 });
        if (!litresRes.isValid) errors.push(litresRes.error || 'Invalid litres');

        const odoRes = parseStrictNumberAndValidate(row[mapping.odometer], 'Odometer', { min: 0 });
        if (!odoRes.isValid) errors.push(odoRes.error || 'Invalid odometer reading');

        let amount = amountRes.value;
        let pricePerLitre = rateRes.value;
        let litres = litresRes.value;
        const odometer = odoRes.value;

        // Auto-calculate missing fuel metric if 2 out of 3 are provided
        if (amount > 0 && pricePerLitre > 0 && litres === 0) {
          litres = parseFloat((amount / pricePerLitre).toFixed(2));
          warnings.push('Litres auto-calculated from Amount / Price');
        } else if (amount > 0 && litres > 0 && pricePerLitre === 0) {
          pricePerLitre = parseFloat((amount / litres).toFixed(2));
          warnings.push('Price/Ltr auto-calculated from Amount / Litres');
        }

        // Parse Full Tank flag if column is mapped
        let fullTank = true;
        if (mapping.fullTank && row[mapping.fullTank] !== undefined && row[mapping.fullTank] !== null && String(row[mapping.fullTank]).trim() !== '') {
          const ftVal = String(row[mapping.fullTank]).toLowerCase().trim();
          if (['false', 'no', '0', 'partial', 'n', 'f', 'part', 'p'].includes(ftVal)) {
            fullTank = false;
          }
        }

        // Cross-field fuel validation
        if (amount <= 0 && litres <= 0) {
          errors.push('Row must contain a positive Amount or Litres value');
        }

        return {
          rowIndex: index + 1,
          vehicleName: targetVehicleName,
          isNewVehicle: isNewVeh,
          date: dateRes.dateStr,
          amount,
          pricePerLitre,
          litres,
          odometer: odometer > 0 ? odometer : null,
          description,
          pumpName,
          fullTank,
          errors,
          warnings,
          isValid: errors.length === 0
        };
      } else if (recordType === 'trip') {
        const startOdoRes = parseStrictNumberAndValidate(
          row[mapping.startOdo] || row[mapping.odometer],
          'Start Odometer',
          { min: 0, required: true }
        );
        if (!startOdoRes.isValid) errors.push(startOdoRes.error || 'Invalid start odometer');

        const endOdoRes = parseStrictNumberAndValidate(row[mapping.endOdo], 'End Odometer', { min: 0 });
        if (!endOdoRes.isValid) errors.push(endOdoRes.error || 'Invalid end odometer');

        const startOdo = startOdoRes.value;
        const endOdo = endOdoRes.value;
        const source = String(row[mapping.source] || '').trim();
        const destination = String(row[mapping.destination] || '').trim();
        const purpose = normalizeTripPurpose(String(row[mapping.purpose] || ''));

        // Trip cross-field validation
        if (endOdo > 0 && endOdo < startOdo) {
          errors.push(`End Odometer (${endOdo}) cannot be less than Start Odometer (${startOdo})`);
        }

        return {
          rowIndex: index + 1,
          vehicleName: targetVehicleName,
          isNewVehicle: isNewVeh,
          date: dateRes.dateStr,
          startOdo,
          endOdo: endOdo > 0 ? endOdo : null,
          source,
          destination,
          purpose,
          description,
          errors,
          warnings,
          isValid: errors.length === 0
        };
      } else {
        // Maintenance
        const amountRes = parseStrictNumberAndValidate(row[mapping.amount], 'Amount', { min: 0, required: true });
        if (!amountRes.isValid) errors.push(amountRes.error || 'Invalid amount');

        const odoRes = parseStrictNumberAndValidate(row[mapping.odometer], 'Odometer', { min: 0 });
        if (!odoRes.isValid) errors.push(odoRes.error || 'Invalid odometer reading');

        const amount = amountRes.value;
        const excelCat = mapping.category && row[mapping.category] ? String(row[mapping.category]).trim() : '';
        const category = rowCategories[index] || excelCat || globalDefaultCategory || 'Service';
        const odometer = odoRes.value;

        if (amount < 0) {
          errors.push('Maintenance cost cannot be negative');
        }

        return {
          rowIndex: index + 1,
          vehicleName: targetVehicleName,
          isNewVehicle: isNewVeh,
          date: dateRes.dateStr,
          amount,
          category,
          odometer: odometer > 0 ? odometer : null,
          description,
          errors,
          warnings,
          isValid: errors.length === 0
        };
      }
    });
  }, [rawRows, mapping, recordType, vehicles, defaultVehicleId, autoCreateVehicles, rowCategories, globalDefaultCategory]);

  // Execute Bulk Import with Verified Clean Data Types
  const handlePerformImport = async () => {
    const validRecords = parsedPreview.filter(p => p.isValid);

    if (validRecords.length === 0) {
      showToast('No valid records found after data type validation.', 'error');
      return;
    }

    setStep('importing');

    try {
      // Step 1: Handle Vehicles
      const vehicleMap = new Map<string, string>();
      vehicles.forEach(v => {
        vehicleMap.set(v.name.toLowerCase(), v.id);
        if (v.registration) vehicleMap.set(v.registration.toLowerCase(), v.id);
      });

      let fallbackVehId = defaultVehicleId || vehicles[0]?.id;

      if (!fallbackVehId && vehicles.length === 0) {
        const primaryVeh: Vehicle = {
          id: `veh_${Date.now()}_primary`,
          name: 'My Primary Vehicle',
          type: 'car',
          fuelType: 'Petrol',
          registration: 'DEFAULT',
          odometer: 0,
          startingOdometer: 0,
          purchaseDate: getLocalDateString(),
          maintenanceSchedule: getVehicleDefaultSchedule('car')
        };
        await dbAPI.saveVehicle(primaryVeh);
        fallbackVehId = primaryVeh.id;
        vehicleMap.set('my primary vehicle', primaryVeh.id);
      }

      const newlyCreatedVehicles: Vehicle[] = [];
      for (const item of validRecords) {
        const rawName = item.vehicleName;
        const norm = rawName.toLowerCase();

        if (item.isNewVehicle && rawName && !vehicleMap.has(norm) && autoCreateVehicles) {
          const newVeh: Vehicle = {
            id: `veh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: rawName,
            type: 'car',
            fuelType: 'Petrol',
            registration: '',
            odometer: item.odometer || (item as any).startOdo || 0,
            startingOdometer: item.odometer || (item as any).startOdo || 0,
            purchaseDate: item.date || getLocalDateString(),
            maintenanceSchedule: getVehicleDefaultSchedule('car')
          };
          await dbAPI.saveVehicle(newVeh);
          vehicleMap.set(norm, newVeh.id);
          newlyCreatedVehicles.push(newVeh);
        }
      }

      // Step 2: Clear existing records if 'replace' mode
      if (importMode === 'replace') {
        if (recordType === 'fuel') {
          await dbAPI.clearSelectiveLogs({ clearFuel: true });
        } else if (recordType === 'trip') {
          await dbAPI.clearSelectiveLogs({ clearTrips: true });
        } else if (recordType === 'maintenance') {
          await dbAPI.clearSelectiveLogs({ clearExpenses: true, clearMaintenance: true });
        }
      }

      // Step 3: Insert Verified Records
      let importedCount = 0;
      for (const item of validRecords) {
        const matchedId = vehicleMap.get(item.vehicleName.toLowerCase()) || fallbackVehId;

        if (recordType === 'fuel') {
          const fuelLog: FuelLog = {
            id: `fuel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            vehicleId: matchedId,
            date: item.date,
            odometer: item.odometer,
            litres: (item as any).litres,
            cost: (item as any).amount,
            station: (item as any).pumpName || 'Fuel Station',
            fullTank: (item as any).fullTank !== undefined ? (item as any).fullTank : true,
            notes: (item as any).description || '',
            pricePerLitre: (item as any).pricePerLitre,
            mileageSinceLast: null,
            receiptId: null
          };
          await dbAPI.saveFuelLog(fuelLog);
          importedCount++;
        } else if (recordType === 'trip') {
          const startOdoNum = (item as any).startOdo || 0;
          const endOdoNum = (item as any).endOdo;
          const isCompleted = endOdoNum != null && endOdoNum >= startOdoNum;

          const trip: Trip = {
            id: `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            vehicleId: matchedId,
            startDate: item.date,
            startOdo: startOdoNum,
            endOdo: endOdoNum,
            source: (item as any).source || null,
            destination: (item as any).destination || null,
            purpose: (item as any).purpose || 'personal',
            status: isCompleted ? 'completed' : 'active',
            notes: (item as any).description || ''
          };
          await dbAPI.saveTrip(trip);
          importedCount++;
        } else if (recordType === 'maintenance') {
          const expense: Expense = {
            id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            vehicleId: matchedId,
            date: item.date,
            category: (item as any).category || 'Service',
            cost: (item as any).amount || 0,
            vendor: '',
            odometer: item.odometer,
            notes: (item as any).description || ''
          };
          await dbAPI.saveExpense(expense);

          const record: MaintenanceRecord = {
            id: `maint_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            vehicleId: matchedId,
            date: item.date,
            itemType: (item as any).category || 'Service',
            odometer: item.odometer || 0,
            cost: (item as any).amount || null,
            notes: (item as any).description || '',
            nextDueOdometer: item.odometer ? item.odometer + 5000 : null,
            nextDueDate: null,
            expenseId: expense.id
          };
          await dbAPI.saveMaintenanceRecord(record);

          importedCount++;
        }
      }

      const skippedCount = parsedPreview.length - importedCount;

      showToast(
        `Successfully imported ${importedCount} verified ${recordType} records! ${
          skippedCount > 0 ? `(${skippedCount} invalid rows skipped)` : ''
        }`,
        'success'
      );

      onImportSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      showToast(`Import failed: ${err.message || err}`, 'error');
      setStep('preview');
    }
  };

  const resetForm = () => {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMapping(DEFAULT_MAPPING);
    setRowFilter('all');
    setCurrentPage(1);
    setRowCategories({});
    setGlobalDefaultCategory('Service');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = async (type: ImportRecordType, format: 'xlsx' | 'csv') => {
    let filename = '';
    let sheetData: Record<string, any>[] = [];

    if (type === 'fuel') {
      filename = `OdoTrack_Fuel_Import_Template.${format}`;
      sheetData = [
        {
          "Vehicle": "Honda Civic",
          "Date": "2026-07-01",
          "Amount": 2500,
          "Price Per Litre": 102.50,
          "Litres": 24.39,
          "Odometer": 45200,
          "Description": "Full tank filling before highway trip",
          "Pump Name": "Shell Petrol Station"
        },
        {
          "Vehicle": "Honda Civic",
          "Date": "15/07/2026",
          "Amount": 2800,
          "Price Per Litre": 103.00,
          "Litres": 27.18,
          "Odometer": 45750,
          "Description": "City commute fill",
          "Pump Name": "BP Fuel Pump"
        }
      ];
    } else if (type === 'trip') {
      filename = `OdoTrack_Trip_Import_Template.${format}`;
      sheetData = [
        {
          "Vehicle": "Honda Civic",
          "Date": "2026-07-05",
          "Start Odometer": 45200,
          "End Odometer": 45450,
          "Source": "Mumbai",
          "Destination": "Pune",
          "Purpose": "business",
          "Description": "Client meeting at Tech Park"
        },
        {
          "Vehicle": "Honda Civic",
          "Date": "10-Jul-2026",
          "Start Odometer": 45450,
          "End Odometer": 45520,
          "Source": "Home",
          "Destination": "Office",
          "Purpose": "commute",
          "Description": "Daily office run"
        }
      ];
    } else {
      filename = `OdoTrack_Maintenance_Import_Template.${format}`;
      sheetData = [
        {
          "Vehicle": "Honda Civic",
          "Date": "2026-06-10",
          "Amount": 4500,
          "Category": "Service",
          "Odometer": 44000,
          "Description": "Periodic 45,000 km general service and engine oil replacement"
        },
        {
          "Vehicle": "Honda Civic",
          "Date": "02.07.2026",
          "Amount": 850,
          "Category": "Toll",
          "Odometer": 45220,
          "Description": "Expressway toll pass"
        }
      ];
    }

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type.toUpperCase());

    await downloadOrShareXLSX(wb, filename, format, `OdoTrack ${type.toUpperCase()} Template`);
    showToast(`Exported ${type.toUpperCase()} template (${format.toUpperCase()})!`, 'success');
  };

  const handleDownloadWorkbookTemplate = async () => {
    const wb = XLSX.utils.book_new();

    const fuelData = [
      {
        "Vehicle": "Honda Civic",
        "Date": "2026-07-01",
        "Amount": 2500,
        "Price Per Litre": 102.50,
        "Litres": 24.39,
        "Odometer": 45200,
        "Description": "Full tank filling",
        "Pump Name": "Shell Petrol Station"
      }
    ];

    const tripData = [
      {
        "Vehicle": "Honda Civic",
        "Date": "15-Jul-2026",
        "Start Odometer": 45200,
        "End Odometer": 45450,
        "Source": "Mumbai",
        "Destination": "Pune",
        "Purpose": "business",
        "Description": "Client meeting"
      }
    ];

    const maintData = [
      {
        "Vehicle": "Honda Civic",
        "Date": "2026-06-10",
        "Amount": 4500,
        "Category": "Service",
        "Odometer": 44000,
        "Description": "Periodic service & oil change"
      }
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelData), 'Fuel Logs');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tripData), 'Trip Sheets');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maintData), 'Maintenance');

    await downloadOrShareXLSX(wb, 'OdoTrack_AllInOne_Import_Template.xlsx', 'xlsx', 'OdoTrack All-in-One Excel Template');
    showToast('Exported All-in-One Excel Template with 3 sheets!', 'success');
  };

  const visiblePreviewRows = useMemo(() => {
    if (rowFilter === 'valid') {
      return parsedPreview.filter(p => p.isValid);
    }
    if (rowFilter === 'invalid') {
      return parsedPreview.filter(p => !p.isValid);
    }
    return parsedPreview;
  }, [parsedPreview, rowFilter]);

  const totalPages = Math.max(1, Math.ceil(visiblePreviewRows.length / rowsPerPage));

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return visiblePreviewRows.slice(startIndex, startIndex + rowsPerPage);
  }, [visiblePreviewRows, currentPage, rowsPerPage]);

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Import Excel / CSV Data">
      <div className="flex flex-col gap-5 text-sm">
        
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between bg-white dark:bg-zinc-800 p-3 border-2 border-black dark:border-white neo-shadow-sm">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full border-2 border-black flex items-center justify-center font-black text-xs ${
              step === 'upload' ? 'bg-neo-accent text-black' : 'bg-neo-accent-green text-black'
            }`}>
              1
            </div>
            <span className="font-display font-bold text-xs uppercase">Select Data & File</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full border-2 border-black flex items-center justify-center font-black text-xs ${
              step === 'preview' ? 'bg-neo-accent text-black' : 'bg-gray-200 dark:bg-zinc-700 text-gray-500'
            }`}>
              2
            </div>
            <span className="font-display font-bold text-xs uppercase">Validate & Map</span>
          </div>
        </div>

        {/* STEP 1: UPLOAD & RECORD TYPE SELECTOR */}
        {step === 'upload' && (
          <div className="flex flex-col gap-5">

            {/* Select Record Category */}
            <div>
              <label className="font-display font-bold text-xs uppercase text-gray-500 dark:text-gray-400 mb-2 block">
                1. What data are you importing?
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeChange('fuel')}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 border-2 border-black dark:border-white font-display font-bold text-xs uppercase transition-all cursor-pointer ${
                    recordType === 'fuel'
                      ? 'bg-neo-accent text-black neo-shadow-sm translate-y-[-2px]'
                      : 'bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-black dark:text-white'
                  }`}
                >
                  <Fuel className="w-5 h-5 text-amber-600" />
                  <span>Fuel Logs</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('trip')}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 border-2 border-black dark:border-white font-display font-bold text-xs uppercase transition-all cursor-pointer ${
                    recordType === 'trip'
                      ? 'bg-neo-accent text-black neo-shadow-sm translate-y-[-2px]'
                      : 'bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-black dark:text-white'
                  }`}
                >
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <span>Trips</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('maintenance')}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 border-2 border-black dark:border-white font-display font-bold text-xs uppercase transition-all cursor-pointer ${
                    recordType === 'maintenance'
                      ? 'bg-neo-accent text-black neo-shadow-sm translate-y-[-2px]'
                      : 'bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-black dark:text-white'
                  }`}
                >
                  <Wrench className="w-5 h-5 text-purple-600" />
                  <span>Maintenance</span>
                </button>
              </div>
            </div>

            {/* Expected Input Columns Banner */}
            <div className="bg-[#faf9f6] dark:bg-zinc-800 p-3.5 border-2 border-black dark:border-white flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-display font-bold text-xs uppercase text-black dark:text-white">
                <Table className="w-4 h-4 text-neo-accent shrink-0" />
                <span>Expected Columns for {recordType.toUpperCase()} Import:</span>
              </div>
              <div className="font-mono text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-zinc-900 p-2 border border-black/20 dark:border-white/20 rounded">
                {recordType === 'fuel' && 'Vehicle | Date | Amount | Price Per Litre | Litres | Odometer | Full Tank | Description | Pump Name'}
                {recordType === 'trip' && 'Vehicle | Date | Start Odometer | End Odometer | Source | Destination | Purpose | Description'}
                {recordType === 'maintenance' && 'Vehicle | Date | Amount | Category | Odometer | Description'}
              </div>
              <p className="text-[11px] text-gray-500 italic">
                * Multi-format date parsing automatically handles ISO, DD/MM/YYYY, MM/DD/YYYY, DD-MMM-YYYY, and Excel serial dates.
              </p>
            </div>

            {/* Upload Zone */}
            <div>
              <label className="font-display font-bold text-xs uppercase text-gray-500 dark:text-gray-400 mb-2 block">
                2. Select Excel (.xlsx, .xls) or CSV file:
              </label>
              
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-black dark:border-white bg-white dark:bg-zinc-800 p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-neo-accent/10 transition-colors neo-shadow-sm"
              >
                <FileSpreadsheet className="w-10 h-10 text-neo-accent" />
                <div className="font-display font-bold text-sm uppercase">Click to Browse File</div>
                <div className="text-xs text-gray-500 font-mono">Supports .xlsx, .xls, .csv</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Download Sample Templates Section */}
            <div className="border-t-2 border-black/10 dark:border-white/10 pt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs uppercase text-gray-500">Need a sample template?</span>
                <button
                  type="button"
                  onClick={handleDownloadWorkbookTemplate}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download All-in-One Excel Workbook (.xlsx)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate(recordType, 'xlsx')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-green-600" />
                  <span>{recordType.toUpperCase()} Template (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate(recordType, 'csv')}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>{recordType.toUpperCase()} Template (.csv)</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* STEP 2: COLUMN MAPPING & PREVIEW */}
        {step === 'preview' && (
          <div className="flex flex-col gap-4">

            {/* Workbook Sheet Switcher if multiple sheets exist */}
            {sheetNames.length > 1 && (
              <div className="flex items-center justify-between bg-neo-accent/20 p-2.5 border-2 border-black dark:border-white">
                <span className="font-display font-bold text-xs uppercase">Excel Worksheet:</span>
                <NeoDropdown
                  value={selectedSheet}
                  onChange={handleSheetChange}
                  options={sheetNames.map(s => ({ value: s, label: s }))}
                  compact
                  className="w-48"
                />
              </div>
            )}

            {/* Column Mapping Adjuster */}
            <div className="bg-white dark:bg-zinc-800 p-3 border-2 border-black dark:border-white neo-shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2">
                <div className="font-display font-black text-sm uppercase flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-neo-accent" />
                  <span>Header Column Mapping</span>
                </div>
                <span className="text-[11px] text-gray-500 font-mono">{headers.length} Columns Found</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-44 overflow-y-auto pr-1">
                {/* Vehicle Column */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-gray-500">Vehicle Column:</label>
                  <NeoDropdown
                    value={mapping.vehicle}
                    onChange={(val) => setMapping(prev => ({ ...prev, vehicle: val }))}
                    options={[{ value: '', label: '-- None (Use Fallback) --' }, ...headers.map(h => ({ value: h, label: h }))]}
                    compact
                  />
                </div>

                {/* Date Column */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold uppercase text-gray-500">Date Column:</label>
                  <NeoDropdown
                    value={mapping.date}
                    onChange={(val) => setMapping(prev => ({ ...prev, date: val }))}
                    options={headers.map(h => ({ value: h, label: h }))}
                    compact
                  />
                </div>

                {/* Record Specific Fields */}
                {recordType === 'fuel' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">AMOUNT / Total Cost:</label>
                      <NeoDropdown
                        value={mapping.amount}
                        onChange={(val) => setMapping(prev => ({ ...prev, amount: val }))}
                        options={headers.map(h => ({ value: h, label: h }))}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Price Per Litre:</label>
                      <NeoDropdown
                        value={mapping.pricePerLitre}
                        onChange={(val) => setMapping(prev => ({ ...prev, pricePerLitre: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Fuel Litres:</label>
                      <NeoDropdown
                        value={mapping.litre}
                        onChange={(val) => setMapping(prev => ({ ...prev, litre: val }))}
                        options={[{ value: '', label: '-- Auto Calculate --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Odometer (KM):</label>
                      <NeoDropdown
                        value={mapping.odometer}
                        onChange={(val) => setMapping(prev => ({ ...prev, odometer: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Pump / Station Name:</label>
                      <NeoDropdown
                        value={mapping.pumpName}
                        onChange={(val) => setMapping(prev => ({ ...prev, pumpName: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Full Tank Flag:</label>
                      <NeoDropdown
                        value={mapping.fullTank}
                        onChange={(val) => setMapping(prev => ({ ...prev, fullTank: val }))}
                        options={[{ value: '', label: '-- Default (Yes) --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>
                  </>
                )}

                {recordType === 'trip' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Start Odometer (KM):</label>
                      <NeoDropdown
                        value={mapping.startOdo}
                        onChange={(val) => setMapping(prev => ({ ...prev, startOdo: val }))}
                        options={headers.map(h => ({ value: h, label: h }))}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">End Odometer (KM):</label>
                      <NeoDropdown
                        value={mapping.endOdo}
                        onChange={(val) => setMapping(prev => ({ ...prev, endOdo: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Source Location:</label>
                      <NeoDropdown
                        value={mapping.source}
                        onChange={(val) => setMapping(prev => ({ ...prev, source: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Destination Location:</label>
                      <NeoDropdown
                        value={mapping.destination}
                        onChange={(val) => setMapping(prev => ({ ...prev, destination: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>
                  </>
                )}

                {recordType === 'maintenance' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">AMOUNT / Cost:</label>
                      <NeoDropdown
                        value={mapping.amount}
                        onChange={(val) => setMapping(prev => ({ ...prev, amount: val }))}
                        options={headers.map(h => ({ value: h, label: h }))}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Category Column:</label>
                      <NeoDropdown
                        value={mapping.category}
                        onChange={(val) => setMapping(prev => ({ ...prev, category: val }))}
                        options={[{ value: '', label: '-- None (Use Default) --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Default Category (If Unmapped):</label>
                      <div className="flex items-center gap-1.5">
                        <NeoDropdown
                          value={globalDefaultCategory}
                          onChange={(val) => setGlobalDefaultCategory(val)}
                          options={availableCategories.map(c => ({ value: c, label: c }))}
                          compact
                          className="flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newRowCats: Record<number, string> = {};
                            rawRows.forEach((_, idx) => {
                              newRowCats[idx] = globalDefaultCategory;
                            });
                            setRowCategories(newRowCats);
                            showToast(`Applied "${globalDefaultCategory}" category to all ${rawRows.length} rows!`, 'success');
                          }}
                          className="px-2 py-1 bg-neo-accent hover:bg-sky-400 border border-black dark:border-white text-[10px] font-black uppercase text-black shrink-0 transition-colors cursor-pointer rounded"
                          title="Set this category for all records in the preview"
                        >
                          Apply All
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold uppercase text-gray-500">Odometer (KM):</label>
                      <NeoDropdown
                        value={mapping.odometer}
                        onChange={(val) => setMapping(prev => ({ ...prev, odometer: val }))}
                        options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                        compact
                      />
                    </div>
                  </>
                )}

                {/* Description Column */}
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-[11px] font-bold uppercase text-gray-500">Description / Notes Column:</label>
                  <NeoDropdown
                    value={mapping.description}
                    onChange={(val) => setMapping(prev => ({ ...prev, description: val }))}
                    options={[{ value: '', label: '-- None --' }, ...headers.map(h => ({ value: h, label: h }))]}
                    compact
                  />
                </div>
              </div>
            </div>

            {/* Validation & Import Controls */}
            <div className="bg-[#faf9f6] dark:bg-zinc-800 p-3 border-2 border-black dark:border-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-auto-vehicle"
                  checked={autoCreateVehicles}
                  onChange={(e) => setAutoCreateVehicles(e.target.checked)}
                  className="w-4 h-4 accent-black cursor-pointer"
                />
                <label htmlFor="chk-auto-vehicle" className="font-bold text-xs uppercase cursor-pointer">
                  Auto-create new vehicles if not in garage
                </label>
              </div>

              {vehicles.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase shrink-0 text-gray-500">Fallback Vehicle:</span>
                  <NeoDropdown
                    value={defaultVehicleId}
                    onChange={(val) => setDefaultVehicleId(val)}
                    options={vehicles.map(v => ({ value: v.id, label: `${v.name} (${v.registration || 'No Reg'})` }))}
                    compact
                    className="w-44"
                  />
                </div>
              )}
            </div>

            {/* Import Mode Radio */}
            <div className="flex items-center justify-between bg-white dark:bg-zinc-800 p-2.5 border-2 border-black dark:border-white font-display text-xs uppercase flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-500">Import Mode:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                    className="accent-black"
                  />
                  <span className="font-bold">Append Records</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-red-600 dark:text-red-400">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="accent-red-600"
                  />
                  <span className="font-bold">Replace Existing</span>
                </label>
              </div>

              <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 p-0.5 border border-black dark:border-white rounded-sm">
                <button
                  type="button"
                  id="filter-btn-all"
                  onClick={() => { setRowFilter('all'); setCurrentPage(1); }}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-all rounded-sm cursor-pointer ${
                    rowFilter === 'all'
                      ? 'bg-neo-accent text-black border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                      : 'text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white'
                  }`}
                >
                  All ({parsedPreview.length})
                </button>
                <button
                  type="button"
                  id="filter-btn-valid"
                  onClick={() => { setRowFilter('valid'); setCurrentPage(1); }}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-all rounded-sm cursor-pointer ${
                    rowFilter === 'valid'
                      ? 'bg-neo-accent-green text-black border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                      : 'text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Valid ({parsedPreview.filter(p => p.isValid).length})
                </button>
                <button
                  type="button"
                  id="filter-btn-invalid"
                  onClick={() => { setRowFilter('invalid'); setCurrentPage(1); }}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-all rounded-sm cursor-pointer ${
                    rowFilter === 'invalid'
                      ? 'bg-red-400 text-black border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                      : 'text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Invalid ({parsedPreview.filter(p => !p.isValid).length})
                </button>
              </div>
            </div>

            {/* Data Validation Summary Banner */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-900 border-2 border-black dark:border-white font-mono text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-green-600 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  {parsedPreview.filter(p => p.isValid).length} Valid
                </span>
                <span className="flex items-center gap-1 text-red-500 font-bold">
                  <AlertCircle className="w-4 h-4" />
                  {parsedPreview.filter(p => !p.isValid).length} Invalid (Skipped)
                </span>
              </div>
              <span className="text-gray-500 text-[11px]">Total: {parsedPreview.length} Rows</span>
            </div>

            {/* Data Preview Table */}
            <div className="flex flex-col gap-1.5">
              <div className="border-2 border-black dark:border-white overflow-x-auto max-h-56 bg-white dark:bg-zinc-900 font-mono text-xs">
                <table className="w-full text-left border-collapse min-w-[650px]">
                  <thead className="bg-neo-accent text-black font-display uppercase font-bold sticky top-0 border-b-2 border-black z-10">
                    <tr>
                      <th className="p-2 border-r border-black">#</th>
                      <th className="p-2 border-r border-black">Vehicle</th>
                      <th className="p-2 border-r border-black">Parsed Date</th>
                      {recordType === 'fuel' && (
                        <>
                          <th className="p-2 border-r border-black">Amount</th>
                          <th className="p-2 border-r border-black">Rate</th>
                          <th className="p-2 border-r border-black">Litres</th>
                          <th className="p-2 border-r border-black">Odo</th>
                        </>
                      )}
                      {recordType === 'trip' && (
                        <>
                          <th className="p-2 border-r border-black">Start Odo</th>
                          <th className="p-2 border-r border-black">End Odo</th>
                          <th className="p-2 border-r border-black">From / To</th>
                        </>
                      )}
                      {recordType === 'maintenance' && (
                        <>
                          <th className="p-2 border-r border-black">Cost</th>
                          <th className="p-2 border-r border-black">Category</th>
                          <th className="p-2 border-r border-black">Odo</th>
                        </>
                      )}
                      <th className="p-2 border-r border-black">Description</th>
                      <th className="p-2">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={`border-b border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 ${
                          !row.isValid ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                        }`}
                      >
                        <td className="p-2 border-r border-gray-200 dark:border-zinc-800 text-gray-400">{row.rowIndex}</td>
                        <td className="p-2 border-r border-gray-200 dark:border-zinc-800 font-bold">
                          {row.vehicleName}
                          {row.isNewVehicle && (
                            <span className="ml-1 text-[9px] bg-green-200 text-green-800 px-1 border border-black font-sans">NEW</span>
                          )}
                        </td>
                        <td className="p-2 border-r border-gray-200 dark:border-zinc-800">
                          {row.date ? (
                            <span className="font-bold text-black dark:text-white">{row.date}</span>
                          ) : (
                            <span className="text-red-500 font-bold">Invalid</span>
                          )}
                        </td>

                        {recordType === 'fuel' && (
                          <>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">{(row as any).amount}</td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">{(row as any).pricePerLitre}</td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800 font-bold">{(row as any).litres} L</td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">{(row as any).odometer || '-'}</td>
                          </>
                        )}

                        {recordType === 'trip' && (
                          <>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">{(row as any).startOdo}</td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">{(row as any).endOdo || '-'}</td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800 text-[11px]">
                              {(row as any).source || '?'} → {(row as any).destination || '?'}
                            </td>
                          </>
                        )}

                        {recordType === 'maintenance' && (
                          <>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800 font-bold">{(row as any).amount}</td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">
                              <div className="w-36">
                                <NeoDropdown
                                  value={(row as any).category}
                                  onChange={(val) => {
                                    const origIdx = row.rowIndex - 1;
                                    setRowCategories(prev => ({ ...prev, [origIdx]: val }));
                                  }}
                                  options={Array.from(new Set([...availableCategories, (row as any).category].filter(Boolean))).map(c => ({
                                    value: c,
                                    label: c
                                  }))}
                                  compact
                                />
                              </div>
                            </td>
                            <td className="p-2 border-r border-gray-200 dark:border-zinc-800">{(row as any).odometer || '-'}</td>
                          </>
                        )}
                        <td className="p-2 border-r border-gray-200 dark:border-zinc-800 text-[11px] truncate max-w-[120px]" title={row.description}>
                          {row.description || '-'}
                        </td>
                        <td className="p-2">
                          {row.isValid ? (
                            <div className="flex items-center gap-1">
                              <span className="text-green-600 font-bold flex items-center gap-1 text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                              </span>
                              {row.warnings.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    showToast(`Row ${row.rowIndex} Info: ${row.warnings.join(', ')}`, 'info');
                                  }}
                                  className="text-amber-600 text-[10px] flex items-center gap-0.5 ml-1 hover:underline cursor-pointer border-none bg-transparent p-0 focus:outline-none shrink-0"
                                  title={row.warnings.join(', ')}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-500" /> <span className="font-bold underline decoration-dotted">Info</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5 items-start">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showToast(`Row ${row.rowIndex} Error: ${row.errors.join('; ')}`, 'error');
                                }}
                                className="text-red-600 font-bold flex items-center gap-1 text-[11px] hover:underline cursor-pointer focus:outline-none"
                              >
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" /> <span className="underline decoration-dotted">Invalid</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showToast(`Row ${row.rowIndex} Error: ${row.errors.join('; ')}`, 'error');
                                }}
                                className="text-[10px] text-red-500 font-sans leading-tight text-left hover:underline cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                              >
                                {row.errors.join('; ')}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-zinc-800 p-2.5 border-2 border-black dark:border-white font-mono text-[11px] gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-bold">
                    Showing {Math.min(visiblePreviewRows.length, (currentPage - 1) * rowsPerPage + 1)}-{Math.min(visiblePreviewRows.length, currentPage * rowsPerPage)} of {visiblePreviewRows.length} rows
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      id="pagination-btn-prev"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 border-2 border-black dark:border-white bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase transition-all select-none cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="font-bold px-1 text-black dark:text-white">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      id="pagination-btn-next"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-2.5 py-1 border-2 border-black dark:border-white bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase transition-all select-none cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-2 pt-3 border-t-2 border-black/10 dark:border-white/10 w-full">
              <button
                type="button"
                onClick={handlePerformImport}
                disabled={parsedPreview.filter(p => p.isValid).length === 0}
                className="w-full py-3 bg-neo-accent-green hover:bg-sky-500 text-black border-2 border-black dark:border-white font-display font-black text-sm uppercase neo-shadow-sm active:translate-y-[1px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>Import {parsedPreview.filter(p => p.isValid).length} Valid Records</span>
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="w-full py-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 text-center"
              >
                Back / Change File
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: IMPORTING LOADER */}
        {step === 'importing' && (
          <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
            <RefreshCw className="w-12 h-12 text-neo-accent animate-spin" />
            <div className="font-display font-black text-lg uppercase">Importing Data Records...</div>
            <p className="text-xs text-gray-500 font-mono">
              Writing to browser IndexedDB and recalculating vehicle odometers & mileage. Please wait...
            </p>
          </div>
        )}

      </div>
    </NeoModal>
  );
}

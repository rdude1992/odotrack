/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { Vehicle, Expense, ExpenseCategory, ScannedReceipt, Journey, MaintenanceRecord } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatCurrency, getLocalDateString, getVehicleDefaultSchedule, compressImage } from '../utils';
import { parseReceiptText, scanReceiptImage, OCRResult, OCRConfidence } from '../ocrEngine';
import NeoModal from './NeoModal';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
import ReceiptViewer from './ReceiptViewer';
import {
  Plus,
  Trash2,
  Coins,
  Filter,
  Receipt,
  CreditCard,
  Calendar,
  Tag,
  Edit2,
  Camera,
  UploadCloud,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  FileText,
  Wrench
} from 'lucide-react';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Toll', 'Parking', 'Service', 'Repair', 'Insurance', 'Tires', 'Battery', 'Accessory', 'Other'
];

const vendorConfigMap: Record<ExpenseCategory, { label: string; placeholder: string }> = {
  Toll: { label: 'Toll Plaza / Booth', placeholder: 'E.g., NH-48 Khedshivpur' },
  Parking: { label: 'Parking Lot / Garage', placeholder: 'E.g., Phoenix Mall P1' },
  Service: { label: 'Service Center', placeholder: 'E.g., Authorized Service Center' },
  Repair: { label: 'Repair Shop', placeholder: 'E.g., Local Garage' },
  Insurance: { label: 'Insurance Provider', placeholder: 'E.g., HDFC ERGO, Policy #1234' },
  Tires: { label: 'Tyre Shop', placeholder: 'E.g., MRF Tyre Zone' },
  Battery: { label: 'Battery Shop', placeholder: 'E.g., Exide Battery Store' },
  Accessory: { label: 'Accessory Shop', placeholder: 'E.g., Amazon, Local Market' },
  Other: { label: 'Vendor / Payee', placeholder: 'E.g., Description of expense' },
};

function ConfidenceDot({ conf }: { conf?: OCRConfidence }) {
  if (!conf || conf === 'missing') return null;
  const colorClass =
    conf === 'high' ? 'bg-green-500' :
    conf === 'medium' ? 'bg-amber-500' :
    'bg-red-500';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colorClass}`}
      title={`${conf} confidence`}
    />
  );
}

function OcrFieldRow({
  label,
  value,
  conf,
  valueClassName = 'font-bold text-black dark:text-white'
}: {
  label: string;
  value: React.ReactNode;
  conf?: OCRConfidence;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded">
      <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1.5">
        <ConfidenceDot conf={conf} />
        {label}
      </span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

const expenseSchema = z.object({
  vehicleId: z.string().min(1, 'Vehicle is required'),
  date: z.string().min(1, 'Date is required'),
  cost: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number({ message: 'Cost must be a number' })
      .positive('Cost must be a positive number')
  ),
  vendor: z.string().trim().min(1, 'Vendor is required'),
  odometer: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number({ message: 'Odometer must be a number' })
      .nonnegative('Odometer must be a non-negative number')
      .nullable()
  ),
  syncToMaintenance: z.boolean(),
  maintenanceItemType: z.string(),
  customMaintenanceType: z.string()
}).refine(data => {
  if (data.syncToMaintenance && data.maintenanceItemType === 'custom') {
    return data.customMaintenanceType.trim().length > 0;
  }
  return true;
}, {
  message: 'Please specify custom maintenance type',
  path: ['customMaintenanceType']
});

interface ExpenseLogModalProps {
  vehicles: Vehicle[];
  expenses: Expense[];
  journeys?: Journey[];
  maintenanceRecords?: MaintenanceRecord[];
  selectedVehicleId: string | 'all';
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
  onExpenseDeleted?: (id: string) => void;
  editingExpense?: Expense | null;
}

export default function ExpenseLogModal({
  vehicles,
  expenses,
  journeys = [],
  maintenanceRecords = [],
  selectedVehicleId,
  currency,
  isOpen,
  onClose,
  onExpenseAdded,
  onExpenseDeleted,
  editingExpense = null
}: ExpenseLogModalProps) {
  const { showToast } = useToast();
  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));
  const categories = EXPENSE_CATEGORIES;

  const [formVehicleId, setFormVehicleId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCategory, setFormCategory] = useState<string>('Toll');
  const [formCost, setFormCost] = useState('');

  // Custom Categories
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [newCustomCategoryName, setNewCustomCategoryName] = useState('');

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('odotrack_custom_expense_categories');
      if (saved) {
        try {
          setCustomCategories(JSON.parse(saved));
        } catch (e) {
          setCustomCategories([]);
        }
      }
    }
  }, [isOpen]);
  const [formVendor, setFormVendor] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formJourneyId, setFormJourneyId] = useState('');

  // Sync to maintenance states
  const [syncToMaintenance, setSyncToMaintenance] = useState(false);
  const [maintenanceItemType, setMaintenanceItemType] = useState('Service');
  const [customMaintenanceType, setCustomMaintenanceType] = useState('');
  const [isMultipleTasks, setIsMultipleTasks] = useState(false);
  const [checkedMinorTasks, setCheckedMinorTasks] = useState<string[]>([]);
  const [newMinorTaskName, setNewMinorTaskName] = useState('');

  // Scanning refs
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);

  // Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgressMsg, setOcrProgressMsg] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [originalImgUri, setOriginalImgUri] = useState<string | null>(null);
  const [preprocessedImgUri, setPreprocessedImgUri] = useState<string | null>(null);
  const [scannedReceiptToSave, setScannedReceiptToSave] = useState<ScannedReceipt | null>(null);
  const [existingReceipt, setExistingReceipt] = useState<ScannedReceipt | null>(null);
  const [isDeleteReceiptConfirmOpen, setIsDeleteReceiptConfirmOpen] = useState(false);

  // Multi-page receipts states
  const [uploadedPages, setUploadedPages] = useState<{ id: string; imageUri: string; fileName: string; rawText: string }[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReceiptImage, setActiveReceiptImage] = useState<string | null>(null);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Real-time validation when fields change
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      const result = expenseSchema.safeParse({
        vehicleId: formVehicleId,
        date: formDate,
        cost: formCost,
        vendor: formVendor,
        odometer: formOdometer || null,
        syncToMaintenance,
        maintenanceItemType,
        customMaintenanceType
      });
      const newErrors: Record<string, string> = {};
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          const path = issue.path[0] as string;
          newErrors[path] = issue.message;
        });
      }
      const finalErrors: Record<string, string> = {};
      Object.keys(errors).forEach((key) => {
        if (newErrors[key]) {
          finalErrors[key] = newErrors[key];
        }
      });
      const hasChanged = Object.keys(errors).length !== Object.keys(finalErrors).length || 
                         Object.keys(errors).some(k => errors[k] !== finalErrors[k]);
      if (hasChanged) {
        setErrors(finalErrors);
      }
    }
  }, [formVehicleId, formDate, formCost, formVendor, formOdometer, syncToMaintenance, maintenanceItemType, customMaintenanceType]);

  const lastLoadedRef = useRef<string | null | undefined>(undefined);

  // Dynamic schedule options based on selected vehicle
  const selectedVehicleObj = vehicles.find(v => v.id === formVehicleId);
  const scheduleOptions = selectedVehicleObj
    ? [
        ...(selectedVehicleObj.maintenanceSchedule ?? getVehicleDefaultSchedule(selectedVehicleObj.type)).map((s) => ({
          value: s.type,
          label: s.type
        })),
        { value: 'custom', label: '✏️ Custom (Type manually...)' }
      ]
    : [
        { value: 'General Service', label: 'General Service' },
        { value: 'Oil Change', label: 'Oil Change' },
        { value: 'Air Filter', label: 'Air Filter' },
        { value: 'Tyres', label: 'Tyres' },
        { value: 'Brake Pads', label: 'Brake Pads' },
        { value: 'Battery', label: 'Battery' },
        { value: 'PUC', label: 'PUC' },
        { value: 'Insurance', label: 'Insurance' },
        { value: 'custom', label: '✏️ Custom (Type manually...)' }
      ];

  // Initialize form when modal opens or editing expense changes
  useEffect(() => {
    if (!isOpen) {
      lastLoadedRef.current = undefined;
      return;
    }

    setErrors({}); // Clear errors state on open

    const currentKey = editingExpense ? editingExpense.id : 'new';
    if (lastLoadedRef.current === currentKey) {
      return; // Already initialized, don't overwrite edits
    }

    lastLoadedRef.current = currentKey;

    if (editingExpense) {
      setFormVehicleId(editingExpense.vehicleId);
      setFormDate(editingExpense.date);
      setFormCategory(editingExpense.category);
      setFormCost(String(editingExpense.cost));
      setFormVendor(editingExpense.vendor);
      setFormOdometer(editingExpense.odometer !== null && editingExpense.odometer !== undefined ? String(editingExpense.odometer) : '');
      setFormNotes(editingExpense.notes || '');
      setFormJourneyId(editingExpense.journeyId || '');
      setOcrResult(null);
      setScannedReceiptToSave(null);
      setOriginalImgUri(null);
      setPreprocessedImgUri(null);

      // Fetch existing receipt
      if (editingExpense.receiptId) {
        dbAPI.getScannedReceipt(editingExpense.receiptId).then(rcpt => {
          if (rcpt) {
            setExistingReceipt(rcpt);
            if (rcpt.pages && rcpt.pages.length > 0) {
              setUploadedPages(rcpt.pages.map((p, idx) => ({
                id: `page-${idx}-${Date.now()}`,
                imageUri: p,
                fileName: rcpt.fileName || `Page ${idx + 1}`,
                rawText: idx === 0 ? rcpt.rawText : ''
              })));
            } else if (rcpt.imageUri) {
              setUploadedPages([{
                id: `page-0-${Date.now()}`,
                imageUri: rcpt.imageUri,
                fileName: rcpt.fileName || 'Page 1',
                rawText: rcpt.rawText
              }]);
            } else {
              setUploadedPages([]);
            }
          } else {
            setExistingReceipt(null);
            setUploadedPages([]);
          }
        }).catch(() => {
          setExistingReceipt(null);
          setUploadedPages([]);
        });
      } else {
        setExistingReceipt(null);
        setUploadedPages([]);
      }

      // Initialize sync with maintenance
      const linkedMaintRecords = maintenanceRecords.filter(mr => mr.expenseId === editingExpense.id);
      const savedLinkedTypes = editingExpense.linkedMaintenanceTypes;

      if (savedLinkedTypes && savedLinkedTypes.length > 0) {
        setSyncToMaintenance(true);
        setIsMultipleTasks(true);
        setCheckedMinorTasks(savedLinkedTypes);
        setMaintenanceItemType('General Service');
        setCustomMaintenanceType('');
      } else if (linkedMaintRecords.length > 0) {
        setSyncToMaintenance(true);
        if (linkedMaintRecords.length > 1) {
          setIsMultipleTasks(true);
          setCheckedMinorTasks(linkedMaintRecords.map(r => r.itemType));
          setMaintenanceItemType('General Service');
          setCustomMaintenanceType('');
        } else {
          setIsMultipleTasks(false);
          const singleRecord = linkedMaintRecords[0];
          const currentVehicle = vehicles.find(v => v.id === editingExpense.vehicleId);
          const scheduleTypes = currentVehicle
            ? (currentVehicle.maintenanceSchedule ?? getVehicleDefaultSchedule(currentVehicle.type)).map(s => s.type)
            : ['General Service', 'Oil Change', 'Air Filter', 'Tyres', 'Brake Pads', 'Battery', 'PUC', 'Insurance'];
          
          if (scheduleTypes.includes(singleRecord.itemType)) {
            setMaintenanceItemType(singleRecord.itemType);
            setCustomMaintenanceType('');
          } else {
            setMaintenanceItemType('custom');
            setCustomMaintenanceType(singleRecord.itemType);
          }
          setCheckedMinorTasks([singleRecord.itemType]);
        }
      } else {
        setSyncToMaintenance(false);
        setIsMultipleTasks(false);
        setMaintenanceItemType('General Service');
        setCustomMaintenanceType('');
        setCheckedMinorTasks([]);
      }
    } else {
      const today = getLocalDateString();
      setFormVehicleId(selectedVehicleId !== 'all' ? selectedVehicleId : (vehicles[0]?.id || ''));
      setFormDate(today);
      setFormCategory('Toll');
      setFormCost('');
      setFormVendor('');
      setFormOdometer('');
      setFormNotes('');
      setFormJourneyId('');
      setOcrResult(null);
      setScannedReceiptToSave(null);
      setOriginalImgUri(null);
      setPreprocessedImgUri(null);
      setExistingReceipt(null);
      setUploadedPages([]);

      setSyncToMaintenance(false);
      setIsMultipleTasks(false);
      setMaintenanceItemType('General Service');
      setCustomMaintenanceType('');
      setCheckedMinorTasks([]);
      setNewMinorTaskName('');
    }
  }, [isOpen, editingExpense, selectedVehicleId, vehicles, maintenanceRecords]);

  // Auto-set syncToMaintenance based on category changes (only when logging a NEW expense)
  useEffect(() => {
    if (!editingExpense && isOpen) {
      if (['Service', 'Repair', 'Tires', 'Battery', 'Insurance'].includes(formCategory)) {
        setSyncToMaintenance(true);
        if (formCategory === 'Service') {
          setMaintenanceItemType('General Service');
          setIsMultipleTasks(true);
          const vehicleObj = vehicles.find(v => v.id === formVehicleId);
          const defaultTasks = vehicleObj 
            ? (vehicleObj.maintenanceSchedule ?? getVehicleDefaultSchedule(vehicleObj.type)).map(s => s.type)
            : ['General Service', 'Oil Change'];
          const initialChecked = defaultTasks.filter(t => t === 'General Service' || t === 'Oil Change');
          setCheckedMinorTasks(initialChecked.length > 0 ? initialChecked : ['General Service']);
        } else {
          setIsMultipleTasks(false);
          if (formCategory === 'Repair') setMaintenanceItemType('Brake Pads');
          else if (formCategory === 'Tires') setMaintenanceItemType('Tyres');
          else if (formCategory === 'Battery') setMaintenanceItemType('Battery');
          else if (formCategory === 'Insurance') setMaintenanceItemType('Insurance');
          setCheckedMinorTasks([]);
        }
      } else {
        setSyncToMaintenance(false);
        setIsMultipleTasks(false);
        setCheckedMinorTasks([]);
      }
    }
  }, [formCategory, editingExpense, isOpen, formVehicleId, vehicles]);

  const vendorConfig = vendorConfigMap[formCategory as ExpenseCategory] || { label: 'Vendor / Merchant', placeholder: 'E.g., Payee name / Description of expense' };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImage(file);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await processImage(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const processImage = async (file: File) => {
    setIsScanning(true);
    setOcrProgressMsg('Loading image...');
    setOcrError(null);
    setOcrResult(null);

    let finalStoredUri = '';

    try {
      const imgUri = URL.createObjectURL(file);
      setOriginalImgUri(imgUri);

      const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load receipt image'));
        img.src = imgUri;
      });

      const { rawText, previewDataUri } = await scanReceiptImage(file, imgEl, setOcrProgressMsg as (msg: string) => void);
      
      setOcrProgressMsg('Compressing image for storage...');
      let tempUri = previewDataUri;
      if (!tempUri) {
        try {
          tempUri = await fileToBase64(file);
        } catch (b64Err) {
          console.error('Failed fallback base64 conversion', b64Err);
        }
      }

      if (tempUri) {
        try {
          finalStoredUri = await compressImage(tempUri, 1024, 1024, 0.7);
        } catch (compErr) {
          console.warn('Failed to compress preprocessed data URI', compErr);
          finalStoredUri = tempUri;
        }
      }
      
      setPreprocessedImgUri(finalStoredUri);

      const parsed = parseReceiptText(rawText);
      const hasExtractedValues = parsed && (
        parsed.cost !== null ||
        parsed.litres !== null ||
        parsed.pricePerLitre !== null ||
        parsed.date !== null ||
        parsed.odometer !== null ||
        parsed.station !== null
      );

      // Add as a page to uploadedPages array
      const pageId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newPage = {
        id: pageId,
        imageUri: finalStoredUri,
        fileName: file.name,
        rawText: rawText || ''
      };
      setUploadedPages(prev => [...prev, newPage]);

      if (hasExtractedValues) {
        setOcrResult(parsed);
        if (parsed.cost) setFormCost(String(parsed.cost));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormVendor(parsed.station);
        showToast('Receipt page scanned and added!', 'scanned');
      } else {
        setOcrResult(null);
        setOcrError('No values detected by OCR, but the page was added.');
        showToast('Page added! Please enter details manually.', 'warning');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      
      // Since OCR failed, we still add the page! "also allow to save even if no values are detected by ocr"
      if (!finalStoredUri) {
        try {
          finalStoredUri = await compressImage(file, 1024, 1024, 0.7);
        } catch (cErr) {
          try {
            finalStoredUri = await fileToBase64(file);
          } catch (fb64) {
            console.error('Failed all image conversions in error handler', fb64);
          }
        }
      }

      const pageId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newPage = {
        id: pageId,
        imageUri: finalStoredUri,
        fileName: file.name,
        rawText: ''
      };
      setUploadedPages(prev => [...prev, newPage]);

      setOcrError('OCR processing failed, but the page was added.');
      showToast('Page added (OCR failed). Please enter details manually.', 'warning');
    } finally {
      setIsScanning(false);
      setOcrProgressMsg('');
    }
  };

  const reRunOCR = async () => {
    if (uploadedPages.length === 0) {
      showToast('No receipt images to run OCR on.', 'warning');
      return;
    }

    setIsScanning(true);
    setOcrProgressMsg('Re-running OCR on all pages...');
    setOcrError(null);
    setOcrResult(null);

    try {
      let combinedRawText = '';
      const updatedPages = [...uploadedPages];

      for (let i = 0; i < updatedPages.length; i++) {
        const page = updatedPages[i];
        setOcrProgressMsg(`Scanning page ${i + 1} of ${updatedPages.length}...`);

        const res = await fetch(page.imageUri);
        const blob = await res.blob();
        const file = new File([blob], page.fileName, { type: blob.type });

        const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load receipt image'));
          img.src = page.imageUri;
        });

        const scanResult = await scanReceiptImage(file, imgEl, (msg) => setOcrProgressMsg(`Page ${i + 1}: ${msg}`));
        const isNative = scanResult.engine === 'native';
        const rawText = isNative ? (scanResult.rawText || '') : (page.rawText || '');
        
        updatedPages[i].rawText = rawText;
        combinedRawText += (combinedRawText ? '\n\n' : '') + `[Page ${i + 1}]\n${rawText}`;
      }

      setUploadedPages(updatedPages);

      const parsed = parseReceiptText(combinedRawText);
      const hasExtractedValues = parsed && (
        parsed.cost !== null ||
        parsed.litres !== null ||
        parsed.pricePerLitre !== null ||
        parsed.date !== null ||
        parsed.odometer !== null ||
        parsed.station !== null
      );

      if (hasExtractedValues) {
        setOcrResult(parsed);
        if (parsed.cost) setFormCost(String(parsed.cost));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormVendor(parsed.station);
        showToast('All pages processed! Expense data extracted successfully.', 'scanned');
      } else {
        setOcrResult(null);
        setOcrError('No values detected by OCR across all pages.');
        showToast('OCR ran but no values were extracted.', 'warning');
      }
    } catch (err) {
      console.error('Re-run OCR Error:', err);
      setOcrError('OCR processing failed.');
      showToast('OCR processing failed.', 'error');
    } finally {
      setIsScanning(false);
      setOcrProgressMsg('');
    }
  };

  const reRunOCRForPage = async (pageId: string) => {
    const pageIndex = uploadedPages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;

    setIsScanning(true);
    setOcrProgressMsg(`Scanning page ${pageIndex + 1}...`);
    setOcrError(null);
    setOcrResult(null);

    try {
      const page = uploadedPages[pageIndex];
      const res = await fetch(page.imageUri);
      const blob = await res.blob();
      const file = new File([blob], page.fileName, { type: blob.type });

      const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load receipt image'));
        img.src = page.imageUri;
      });

      const scanResult = await scanReceiptImage(file, imgEl, (msg) => setOcrProgressMsg(msg));
      const isNative = scanResult.engine === 'native';
      const rawText = isNative ? (scanResult.rawText || '') : (page.rawText || '');

      const updatedPages = [...uploadedPages];
      updatedPages[pageIndex] = {
        ...page,
        rawText
      };
      setUploadedPages(updatedPages);

      const parsed = parseReceiptText(rawText);
      const hasExtractedValues = parsed && (
        parsed.cost !== null ||
        parsed.litres !== null ||
        parsed.pricePerLitre !== null ||
        parsed.date !== null ||
        parsed.odometer !== null ||
        parsed.station !== null
      );

      if (hasExtractedValues) {
        setOcrResult(parsed);
        if (parsed.cost) setFormCost(String(parsed.cost));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormVendor(parsed.station);
        showToast(`Page ${pageIndex + 1} processed! Expense data extracted.`, 'scanned');
      } else {
        setOcrResult(null);
        setOcrError(`Could not extract values from Page ${pageIndex + 1}.`);
        showToast(`Page ${pageIndex + 1} processed, but no values were extracted.`, 'warning');
      }
    } catch (err) {
      console.error('Re-run OCR for page Error:', err);
      setOcrError('OCR processing failed.');
      showToast('OCR processing failed.', 'error');
    } finally {
      setIsScanning(false);
      setOcrProgressMsg('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = expenseSchema.safeParse({
      vehicleId: formVehicleId,
      date: formDate,
      cost: formCost,
      vendor: formVendor,
      odometer: formOdometer || null,
      syncToMaintenance,
      maintenanceItemType,
      customMaintenanceType
    });

    if (!result.success) {
      const validationErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        if (!validationErrors[path]) {
          validationErrors[path] = issue.message;
        }
      });
      setErrors(validationErrors);
      showToast('Please correct the validation errors in the form.', 'error');
      return;
    }

    if (syncToMaintenance && isMultipleTasks && checkedMinorTasks.length === 0) {
      showToast('Please select or add at least one minor task.', 'error');
      return;
    }

    setErrors({});

    const validatedData = result.data;
    const costNum = validatedData.cost;
    const odoNum = validatedData.odometer;

    // Multi-page receipt save logic
    let receiptId = editingExpense?.receiptId || null;
    let receiptImageUri: string | null = null;
    let receiptPagesUris: string[] = [];

    if (uploadedPages.length > 0) {
      if (!receiptId) {
        receiptId = `rcpt-${Date.now()}`;
      }
      
      receiptImageUri = uploadedPages[0].imageUri;
      receiptPagesUris = uploadedPages.map(p => p.imageUri);

      // Concatenate rawText of all pages for searchability!
      const combinedRawText = uploadedPages.map((p, idx) => `[Page ${idx + 1} (${p.fileName})]\n${p.rawText}`).join('\n\n');

      const scannedReceipt: ScannedReceipt = {
        id: receiptId,
        date: formDate || getLocalDateString(),
        fileName: uploadedPages[0].fileName,
        imageUri: receiptImageUri,
        extractedCost: formCost ? Number(formCost) : null,
        extractedLitres: null,
        extractedPricePerLitre: null,
        rawText: combinedRawText,
        pages: receiptPagesUris
      };

      await dbAPI.saveReceipt(scannedReceipt);
    } else {
      // If no pages left, delete or unlink the receipt
      if (receiptId) {
        await dbAPI.deleteReceipt(receiptId);
      }
      receiptId = null;
    }

    const activeExpenseId = editingExpense ? editingExpense.id : `e-${Date.now()}`;

    // Clean up all existing maintenance records linked to this expense first
    if (editingExpense) {
      const recordsToClean = maintenanceRecords.filter(m => m.expenseId === editingExpense.id || (editingExpense.maintenanceRecordId && m.id === editingExpense.maintenanceRecordId));
      for (const r of recordsToClean) {
        await dbAPI.deleteMaintenanceRecord(r.id);
      }
    }

    let linkedMaintId: string | null = null;
    let linkedMaintTypesToSave: string[] = [];

    if (syncToMaintenance) {
      const tasksToLog = isMultipleTasks 
        ? checkedMinorTasks 
        : [maintenanceItemType === 'custom' ? customMaintenanceType.trim() : maintenanceItemType];

      linkedMaintTypesToSave = tasksToLog.filter((t): t is string => !!t);

      const vehicleObj = vehicles.find(v => v.id === formVehicleId);
      const finalOdo = odoNum !== null ? odoNum : (vehicleObj ? vehicleObj.odometer : 0);

      for (let i = 0; i < linkedMaintTypesToSave.length; i++) {
        const taskType = linkedMaintTypesToSave[i];
        const recordId = `mr-${Date.now()}-${i}`;
        if (i === 0) {
          linkedMaintId = recordId;
        }

        const linkedMaint: MaintenanceRecord = {
          id: recordId,
          vehicleId: formVehicleId,
          date: formDate,
          itemType: taskType,
          odometer: finalOdo,
          // Only assign cost to the first record to avoid duplicate sum in maintenance cost charts
          cost: i === 0 ? costNum : null,
          notes: `Linked Bill: ${formVendor}. ${formNotes || ''}`.trim(),
          nextDueOdometer: null,
          nextDueDate: null,
          expenseId: activeExpenseId,
          receiptImage: receiptImageUri,
        };

        await dbAPI.saveMaintenanceRecord(linkedMaint);
      }
    }

    if (editingExpense) {
      const updated: Expense = {
        ...editingExpense,
        vehicleId: formVehicleId,
        date: formDate,
        category: formCategory,
        cost: costNum,
        vendor: formVendor,
        odometer: odoNum,
        notes: formNotes || null,
        receiptId: receiptId,
        journeyId: formJourneyId || null,
        maintenanceRecordId: linkedMaintId,
        linkedMaintenanceTypes: linkedMaintTypesToSave,
        receiptImage: receiptImageUri,
        receiptImages: receiptPagesUris,
      };

      await dbAPI.saveExpense(updated);
      showToast('Expense and linked maintenance updated!', 'success');
    } else {
      const newExpense: Expense = {
        id: activeExpenseId,
        vehicleId: formVehicleId,
        date: formDate,
        category: formCategory,
        cost: costNum,
        vendor: formVendor,
        odometer: odoNum,
        notes: formNotes || null,
        receiptId: receiptId,
        journeyId: formJourneyId || null,
        maintenanceRecordId: linkedMaintId,
        linkedMaintenanceTypes: linkedMaintTypesToSave,
        receiptImage: receiptImageUri,
        receiptImages: receiptPagesUris,
      };

      await dbAPI.saveExpense(newExpense);
      showToast('Expense logged successfully!', 'success');
    }

    onClose();
    onExpenseAdded();
  };

  const handleClose = () => {
    setOcrResult(null);
    setScannedReceiptToSave(null);
    setOriginalImgUri(null);
    setPreprocessedImgUri(null);
    setShowRawOcr(false);
    onClose();
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingExpense ? "Edit Expense Log" : "Log Other Expense"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">

        {/* OFFLINE RECEIPT SCANNING REGION */}
        <div
          className={`border-2 ${isDragOver ? 'border-neo-accent' : 'border-black dark:border-white'} dark:border dark:border-white bg-neo-bg dark:bg-neo-dark-bg p-4 relative text-center rounded-lg transition-all duration-300`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <h4 className="font-display font-bold text-sm uppercase tracking-wider mb-2 flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            Offline Receipt Scanner
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Scan and upload multiple receipt images with 100% offline privacy. Supports multi-page bills!
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span className="font-display font-bold text-xs uppercase">Take Photo</span>
            </button>
            <button
              onClick={() => uploadInputRef.current?.click()}
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-neo-accent border-2 border-black dark:border dark:border-white neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="font-display font-bold text-xs uppercase">Upload Files</span>
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*;capture=camera" className="hidden" onChange={handleImageUpload} />
          <input ref={uploadInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />

          {/* Uploaded Receipt Pages Grid */}
          {uploadedPages.length > 0 && (
            <div className="mt-4 p-3 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-card rounded-md text-left">
              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-1.5 mb-3">
                <span className="font-display font-black text-xs uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-neo-accent" /> Uploaded Receipt Pages ({uploadedPages.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={reRunOCR}
                    disabled={isScanning}
                    className="flex items-center gap-1 px-2 py-0.5 bg-neo-accent hover:bg-[#c9e83e] disabled:opacity-50 disabled:pointer-events-none border-2 border-black text-black font-display font-bold text-[10px] uppercase neo-shadow-sm active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                    title="Re-run data extraction on all receipt pages"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                    Re-run OCR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedPages([]);
                      setOcrResult(null);
                      showToast('Cleared all uploaded receipt pages.', 'success');
                    }}
                    className="text-[10px] font-display font-bold uppercase text-red-500 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {uploadedPages.map((page, index) => (
                  <div
                    key={page.id}
                    className="relative border-2 border-black dark:border-white p-2 bg-[#faf9f6] dark:bg-neo-dark-bg rounded flex flex-col items-center gap-1 group active:translate-y-[1px] transition-all"
                  >
                    {/* Page badge */}
                    <span className="absolute top-1 left-1 bg-black text-white dark:bg-white dark:text-black font-mono font-bold text-[9px] px-1 rounded">
                      #{index + 1}
                    </span>

                    <img
                      src={page.imageUri}
                      alt={`Page ${index + 1}`}
                      className="h-20 w-auto object-contain border border-black/25 dark:border-white/25 rounded bg-white cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => {
                        setActiveReceiptImage(page.imageUri);
                        setIsReceiptModalOpen(true);
                      }}
                    />

                    <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400 truncate max-w-full block" title={page.fileName}>
                      {page.fileName}
                    </span>

                    <div className="flex items-center gap-1.5 mt-1 w-full justify-center">
                      <button
                        type="button"
                        onClick={() => reRunOCRForPage(page.id)}
                        disabled={isScanning}
                        className="px-1.5 py-0.5 bg-blue-300 hover:bg-blue-400 border border-black text-black font-display font-bold text-[8px] uppercase active:translate-y-[1px] cursor-pointer flex items-center gap-0.5"
                        title="Re-run OCR on this specific page"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Re-run
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedPages(prev => prev.filter(p => p.id !== page.id));
                          showToast(`Removed page ${index + 1}.`, 'success');
                        }}
                        className="px-1.5 py-0.5 bg-red-400 hover:bg-red-500 border border-black text-black font-display font-bold text-[8px] uppercase active:translate-y-[1px] cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scanning progress indicator */}
          {isScanning && (
            <div className="mt-4 p-3 border-2 border-dashed border-black/30 dark:border-white/30 bg-white/50 dark:bg-zinc-900/50 text-left font-sans text-xs rounded">
              <div className="font-display font-bold text-[10px] uppercase tracking-wider text-neo-accent mb-2 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Offline Processing Pipeline
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-black dark:text-white">
                <li className="flex items-center gap-2">
                  <span className={(ocrProgressMsg.includes('Loading image') || ocrProgressMsg.includes('Processing...')) ? 'animate-pulse text-neo-accent font-black' : 'text-green-500 font-bold'}>
                    {(ocrProgressMsg.includes('image') && !ocrProgressMsg.includes('Preprocessing')) ? '▶' : '✓'}
                  </span>
                  <span>1. Loading image file...</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className={ocrProgressMsg.includes('Loading Tesseract') || ocrProgressMsg.includes('Loading OpenCV') ? 'animate-pulse text-neo-accent font-black' : (ocrProgressMsg.includes('Preprocessing') || ocrProgressMsg.includes('OCR') ? 'text-green-500 font-bold' : 'text-gray-400 dark:text-gray-600')}>
                    {ocrProgressMsg.includes('Libraries') || ocrProgressMsg.includes('Loading Tesseract') || ocrProgressMsg.includes('Loading OpenCV') ? '▶' : (ocrProgressMsg.includes('Preprocessing') || ocrProgressMsg.includes('OCR') ? '✓' : '○')}
                  </span>
                  <span>2. Initializing local OCR engine...</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className={ocrProgressMsg.includes('Preprocessing') ? 'animate-pulse text-neo-accent font-black' : (ocrProgressMsg.includes('Running OCR') ? 'text-green-500 font-bold' : 'text-gray-400 dark:text-gray-600')}>
                    {ocrProgressMsg.includes('Preprocessing') ? '▶' : (ocrProgressMsg.includes('Running OCR') ? '✓' : '○')}
                  </span>
                  <span>3. Running local contrast & contour optimization...</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className={ocrProgressMsg.includes('Running OCR') ? 'animate-pulse text-neo-accent font-black' : 'text-gray-400 dark:text-gray-600'}>
                    {ocrProgressMsg.includes('Running OCR') ? '▶' : '○'}
                  </span>
                  <span className={ocrProgressMsg.includes('Running OCR') ? 'text-neo-accent font-bold' : ''}>4. Reading text offline (running on device CPU)...</span>
                </li>
              </ul>
            </div>
          )}

          {/* OCR Error Message */}
          {ocrError && (
            <div className="mt-3 flex items-center justify-center gap-2 text-red-500">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-sans text-[11px] font-semibold">{ocrError}</span>
            </div>
          )}

          {/* Image Preview Grid (original + preprocessed) */}
          {originalImgUri && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {originalImgUri && (
                <div>
                  <p className="font-display font-bold text-[9px] uppercase text-gray-400 mb-1">Original</p>
                  <img src={originalImgUri} alt="Original" className="w-full h-auto border border-black rounded" />
                </div>
              )}
              {preprocessedImgUri && (
                <div>
                  <p className="font-display font-bold text-[9px] uppercase text-gray-400 mb-1">Processed</p>
                  <img src={preprocessedImgUri} alt="Preprocessed" className="w-full h-auto border border-black rounded" />
                </div>
              )}
            </div>
          )}

          {/* OCR Result Summary Card */}
          {ocrResult && !isScanning && (
            <div className="mt-4 border-2 border-black dark:border-white bg-neo-bg dark:bg-neo-dark-bg p-3.5 text-left rounded-md relative overflow-hidden">
              {/* Privacy badge in corner */}
              <div className="absolute top-2 right-2 bg-neo-accent text-black font-mono font-bold text-[9px] px-1.5 py-0.5 border border-black rounded leading-none uppercase select-none">
                Local Engine
              </div>

              <h5 className="font-display font-black text-xs uppercase tracking-wider text-black dark:text-white mb-1 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-green-500 animate-bounce" />
                Extracted Fields
              </h5>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-3">
                <span className="flex items-center gap-1"><ConfidenceDot conf="high" /> High</span>
                <span className="flex items-center gap-1"><ConfidenceDot conf="medium" /> Medium</span>
                <span className="flex items-center gap-1"><ConfidenceDot conf="low" /> Low</span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                {ocrResult.cost !== undefined && ocrResult.cost !== null && (
                  <OcrFieldRow
                    label="💰 Cost"
                    conf={ocrResult.costConf}
                    value={formatCurrency(ocrResult.cost, currency)}
                    valueClassName="font-black text-black dark:text-white bg-neo-accent-yellow/30 px-1 py-0.5 rounded border border-neo-accent-yellow/50"
                  />
                )}
                {ocrResult.odometer !== undefined && ocrResult.odometer !== null && (
                  <OcrFieldRow
                    label="🚗 Odo"
                    conf={ocrResult.odometerConf}
                    value={`${ocrResult.odometer.toLocaleString()} km`}
                    valueClassName="font-black text-black dark:text-white bg-purple-400/30 px-1 py-0.5 rounded border border-purple-400/50"
                  />
                )}
                {ocrResult.date && (
                  <OcrFieldRow
                    label="📅 Date"
                    conf={ocrResult.dateConf}
                    value={ocrResult.date}
                    valueClassName="font-bold text-black dark:text-white bg-gray-200/50 dark:bg-zinc-800 px-1 py-0.5 rounded"
                  />
                )}
                {ocrResult.station && (
                  <div className="sm:col-span-2">
                    <OcrFieldRow
                      label="🏪 Merchant"
                      conf={ocrResult.stationConf}
                      value={
                        <span className="truncate max-w-[180px] sm:max-w-[300px]">
                          {ocrResult.station}
                        </span>
                      }
                    />
                  </div>
                )}
              </div>

              {/* Raw OCR Text Toggle */}
              <div className="mt-3 flex items-center justify-between border-t border-black/10 dark:border-white/10 pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowRawOcr(!showRawOcr)}
                  className="text-[10px] font-display font-black uppercase text-gray-500 hover:text-black dark:hover:text-white underline underline-offset-2 cursor-pointer flex items-center gap-1"
                >
                  {showRawOcr ? 'Hide' : 'View'} Raw OCR Text dump
                </button>
                <span className="text-[9px] text-green-600 dark:text-green-400 font-bold flex items-center gap-1 uppercase">
                  ⚡ Auto-populated
                </span>
              </div>
              {showRawOcr && ocrResult.rawText && (
                <pre className="mt-2 p-2 bg-black text-green-400 text-[10px] font-mono leading-tight max-h-28 overflow-y-auto border-2 border-black rounded whitespace-pre-wrap break-words text-left">
                  {ocrResult.rawText}
                </pre>
              )}
            </div>
          )}

          {/* OCR Dismiss Button (always visible when result present) */}
          {ocrResult && !isScanning && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setOcrResult(null);
                  setOriginalImgUri(null);
                  setPreprocessedImgUri(null);
                  setScannedReceiptToSave(null);
                }}
                className="px-3 py-1.5 bg-white border-2 border-black text-black dark:text-white dark:bg-neo-dark-card font-display font-bold text-[10px] uppercase neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Dismiss Scan
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Vehicle */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
            <NeoDropdown
              id="form-exp-vehicle"
              value={formVehicleId}
              onChange={(val) => { 
                setFormVehicleId(val); 
                setFormJourneyId(''); 
                if (errors.vehicleId) setErrors(prev => ({ ...prev, vehicleId: '' }));
              }}
              options={vehicleOptions}
              className="w-full"
            />
            {errors.vehicleId && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.vehicleId}
              </span>
            )}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Category *</label>
            <NeoDropdown
              id="form-exp-category"
              value={formCategory}
              onChange={(val) => {
                if (val === '__add_custom__') {
                  setIsAddingCustomCategory(true);
                  setNewCustomCategoryName('');
                } else {
                  setFormCategory(val);
                }
              }}
              options={[
                ...categories.map(cat => ({ value: cat, label: cat })),
                ...customCategories.map(cat => ({ value: cat, label: cat })),
                { value: '__add_custom__', label: '➕ Add Custom Category...' }
              ]}
              className="w-full"
            />
            
            {isAddingCustomCategory && (
              <div className="flex flex-col gap-1.5 p-2 bg-[#faf9f6] dark:bg-zinc-900 border-2 border-black dark:border-white rounded-sm mt-1.5 animate-in fade-in zoom-in duration-100">
                <label className="font-display font-bold text-[10px] uppercase tracking-wider text-black dark:text-white">
                  Add Custom Category
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCustomCategoryName}
                    onChange={(e) => setNewCustomCategoryName(e.target.value)}
                    placeholder="E.g., Cleaning, Detailing"
                    className="flex-1 p-2 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg font-sans text-xs focus:outline-none focus:border-neo-accent text-black dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = newCustomCategoryName.trim();
                      if (!name) {
                        showToast('Please enter a category name.', 'error');
                        return;
                      }
                      const allCats = [...categories, ...customCategories];
                      if (allCats.some(c => c.toLowerCase() === name.toLowerCase())) {
                        showToast('This category already exists!', 'error');
                        return;
                      }
                      const updated = [...customCategories, name];
                      setCustomCategories(updated);
                      localStorage.setItem('odotrack_custom_expense_categories', JSON.stringify(updated));
                      setFormCategory(name);
                      setIsAddingCustomCategory(false);
                      showToast(`Added custom category: ${name}`, 'success');
                    }}
                    className="px-2.5 py-1.5 bg-neo-accent text-black font-display font-bold text-[11px] uppercase border-2 border-black hover:bg-orange-600 active:translate-y-[1px] cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCustomCategory(false);
                      setFormCategory('Toll');
                    }}
                    className="px-2.5 py-1.5 bg-white dark:bg-neo-dark-bg text-black dark:text-white font-display font-bold text-[11px] uppercase border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 active:translate-y-[1px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {journeys.filter(j => j.vehicleId === formVehicleId).length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-gray-400">Journey (optional)</label>
            <NeoDropdown
              id="form-exp-journey"
              value={formJourneyId}
              onChange={(val) => setFormJourneyId(val)}
              options={[
                { value: '', label: 'No Journey' },
                ...journeys.filter(j => j.vehicleId === formVehicleId).map(j => ({ value: j.id, label: j.name }))
              ]}
              className="w-full"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Cost */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Cost Amount ({currency}) *</label>
            <input
              type="number"
              step="any"
              id="form-exp-cost"
              value={formCost}
              onChange={(e) => {
                setFormCost(e.target.value);
                if (errors.cost) setErrors(prev => ({ ...prev, cost: '' }));
              }}
              placeholder="45.00"
              className={`p-2.5 sm:p-2 border-2 ${errors.cost ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
            />
            {errors.cost && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.cost}
              </span>
            )}
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Date *</label>
            <input
              type="date"
              id="form-exp-date"
              value={formDate}
              onChange={(e) => {
                setFormDate(e.target.value);
                if (errors.date) setErrors(prev => ({ ...prev, date: '' }));
              }}
              className={`p-2.5 sm:p-2 border-2 ${errors.date ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
            />
            {errors.date && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.date}
              </span>
            )}
          </div>

          {/* Odometer (Optional) */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1">
              <span>Odometer (km)</span>
              <span className="text-[9px] text-gray-400 font-normal italic">Optional</span>
            </label>
            <input
              type="number"
              id="form-exp-odometer"
              value={formOdometer}
              onChange={(e) => {
                setFormOdometer(e.target.value);
                if (errors.odometer) setErrors(prev => ({ ...prev, odometer: '' }));
              }}
              placeholder="E.g., current km"
              className={`p-2.5 sm:p-2 border-2 ${errors.odometer ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
            />
            {errors.odometer && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.odometer}
              </span>
            )}
          </div>

        </div>

        {/* Vendor Specific input label and placeholder */}
        <div className="flex flex-col gap-1">
          <label className="font-display font-bold text-xs uppercase tracking-wider">
            {vendorConfig.label} *
          </label>
          <input
            type="text"
            id="form-exp-vendor"
            value={formVendor}
            onChange={(e) => {
              setFormVendor(e.target.value);
              if (errors.vendor) setErrors(prev => ({ ...prev, vendor: '' }));
            }}
            placeholder={vendorConfig.placeholder}
            className={`p-2.5 sm:p-2 border-2 ${errors.vendor ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-sm text-black dark:text-white`}
          />
          {errors.vendor && (
            <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
              ⚠️ {errors.vendor}
            </span>
          )}
        </div>

        {/* Sync to Maintenance Record */}
        <div className="p-3 border-2 border-black dark:border-white bg-purple-50 dark:bg-purple-950/20 rounded flex flex-col gap-3">
          <label className="flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider cursor-pointer select-none text-black dark:text-white">
            <input
              type="checkbox"
              checked={syncToMaintenance}
              onChange={(e) => setSyncToMaintenance(e.target.checked)}
              className="w-4 h-4 border-2 border-black dark:border-white accent-purple-600 focus:ring-0 cursor-pointer"
            />
            <Wrench className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Link & Sync with Maintenance Log</span>
          </label>

          {syncToMaintenance && (
            <div className="flex flex-col gap-3 pl-6 border-l-2 border-black/15 animate-fadeIn">
              {/* Task Mode Toggle */}
              <div className="flex items-center gap-4 border-b border-black/10 dark:border-white/10 pb-2">
                <span className="font-display font-bold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300">Task Mode:</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                    <input
                      type="radio"
                      name="taskMode"
                      checked={!isMultipleTasks}
                      onChange={() => setIsMultipleTasks(false)}
                      className="w-3.5 h-3.5 border-2 border-black dark:border-white accent-purple-600 cursor-pointer"
                    />
                    <span className="font-semibold text-black dark:text-white">Single Task</span>
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                    <input
                      type="radio"
                      name="taskMode"
                      checked={isMultipleTasks}
                      onChange={() => setIsMultipleTasks(true)}
                      className="w-3.5 h-3.5 border-2 border-black dark:border-white accent-purple-600 cursor-pointer"
                    />
                    <span className="font-semibold text-black dark:text-white">Multiple Minor Tasks (Service Log)</span>
                  </label>
                </div>
              </div>

              {!isMultipleTasks ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-display font-bold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300">Maintenance Item Type *</label>
                    <NeoDropdown
                      value={maintenanceItemType}
                      onChange={(val) => {
                        setMaintenanceItemType(val);
                        if (errors.customMaintenanceType) setErrors(prev => ({ ...prev, customMaintenanceType: '' }));
                      }}
                      options={scheduleOptions}
                      className="w-full bg-white dark:bg-neo-dark-bg text-black dark:text-white"
                    />
                  </div>

                  {maintenanceItemType === 'custom' && (
                    <div className="flex flex-col gap-1">
                      <label className="font-display font-bold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300">Custom Maintenance Item *</label>
                      <input
                        type="text"
                        value={customMaintenanceType}
                        onChange={(e) => {
                          setCustomMaintenanceType(e.target.value);
                          if (errors.customMaintenanceType) setErrors(prev => ({ ...prev, customMaintenanceType: '' }));
                        }}
                        placeholder="e.g. Belt Replacement"
                        className={`p-2 sm:p-1.5 border-2 ${errors.customMaintenanceType ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-xs text-black dark:text-white`}
                      />
                      {errors.customMaintenanceType && (
                        <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                          ⚠️ {errors.customMaintenanceType}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="font-display font-bold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    Select covered minor tasks *
                  </label>
                  
                  {/* Grid of default maintenance tasks */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 bg-white dark:bg-neo-dark-bg border-2 border-black rounded">
                    {scheduleOptions.filter(o => o.value !== 'custom').map((opt) => {
                      const isChecked = checkedMinorTasks.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2 p-1.5 border-2 ${isChecked ? 'bg-purple-100 border-purple-500 text-purple-950 dark:bg-purple-950/40 dark:text-purple-100' : 'border-gray-200 dark:border-zinc-700'} rounded cursor-pointer select-none text-xs transition-all`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCheckedMinorTasks(prev => [...prev, opt.value]);
                              } else {
                                setCheckedMinorTasks(prev => prev.filter(t => t !== opt.value));
                              }
                            }}
                            className="w-3.5 h-3.5 accent-purple-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="font-medium text-black dark:text-white">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Custom Minor Task Input */}
                  <div className="flex gap-2 items-end mt-1">
                    <div className="flex flex-col gap-0.5 flex-1">
                      <label className="font-display font-bold text-[9px] uppercase tracking-wider text-purple-700 dark:text-purple-300">
                        Add Other Minor Task
                      </label>
                      <input
                        type="text"
                        value={newMinorTaskName}
                        onChange={(e) => setNewMinorTaskName(e.target.value)}
                        placeholder="e.g., Chain lube, Coolant, Spark plug"
                        className="p-1.5 border-2 border-black bg-white dark:bg-neo-dark-bg text-xs font-semibold focus:outline-none text-black dark:text-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newMinorTaskName.trim()) {
                              const task = newMinorTaskName.trim();
                              if (!checkedMinorTasks.includes(task)) {
                                setCheckedMinorTasks(prev => [...prev, task]);
                              }
                              setNewMinorTaskName('');
                            }
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (newMinorTaskName.trim()) {
                          const task = newMinorTaskName.trim();
                          if (!checkedMinorTasks.includes(task)) {
                            setCheckedMinorTasks(prev => [...prev, task]);
                          }
                          setNewMinorTaskName('');
                        }
                      }}
                      className="px-3 py-2 bg-neo-accent border-2 border-black text-black font-display font-black text-xs uppercase neo-shadow-sm active:translate-y-[1px] cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* List of checked tasks */}
                  {checkedMinorTasks.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="text-[10px] font-mono text-gray-500 mt-1 mr-1">Active Tasks:</span>
                      {checkedMinorTasks.map(task => {
                        const isDefault = scheduleOptions.some(opt => opt.value === task);
                        return (
                          <span
                            key={task}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold border-2 border-black rounded-full ${isDefault ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-100' : 'bg-neo-accent text-black'}`}
                          >
                            {task}
                            <button
                              type="button"
                              onClick={() => setCheckedMinorTasks(prev => prev.filter(t => t !== task))}
                              className="hover:text-red-500 font-bold focus:outline-none text-[11px] ml-1 shrink-0"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {checkedMinorTasks.length === 0 && (
                    <span className="text-[10px] text-red-500 font-mono font-bold mt-1">
                      ⚠️ Please check or add at least one minor task to link with the maintenance log.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="font-display font-bold text-xs uppercase tracking-wider">Expense Notes</label>
          <textarea
            id="form-exp-notes"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Any comments, replacement descriptions, or receipt codes..."
            rows={2}
            className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none resize-none text-sm"
          />
        </div>

        {/* Form Actions */}
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
          <button
            type="button"
            id="btn-exp-cancel"
            onClick={handleClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            id="btn-exp-submit"
            className="w-full sm:w-auto px-5 py-2.5 bg-neo-accent border-2 border-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
          >
            Save Expense
          </button>
        </div>

      </form>

      <ConfirmModal
        isOpen={isDeleteReceiptConfirmOpen}
        title="Delete Receipt"
        message="Are you sure you want to remove the receipt from this record? The receipt image will be unlinked (you will need to save the record to apply this change)."
        confirmText="Remove"
        cancelText="Cancel"
        danger={true}
        onConfirm={() => {
          setExistingReceipt(null);
          setUploadedPages([]);
          setIsDeleteReceiptConfirmOpen(false);
          showToast('Receipt unlinked! Save to confirm.', 'success');
        }}
        onCancel={() => {
          setIsDeleteReceiptConfirmOpen(false);
        }}
      />

      <ReceiptViewer
        isOpen={isReceiptModalOpen}
        onClose={() => { setIsReceiptModalOpen(false); setActiveReceiptImage(null); }}
        imageUri={activeReceiptImage}
        imageUris={uploadedPages.map(p => p.imageUri)}
        title="Uploaded Receipt Page"
      />
    </NeoModal>
  );
}
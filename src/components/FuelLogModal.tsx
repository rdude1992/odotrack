/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { Vehicle, FuelLog, ScannedReceipt, Journey } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatCurrency, formatNumber, getLocalDateString } from '../utils';
import { parseReceiptText, scanReceiptImage, OCRResult } from '../ocrEngine';
import NeoModal from './NeoModal';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
import ReceiptViewer from './ReceiptViewer';
import {
  Plus,
  Trash2,
  Eye,
  UploadCloud,
  Camera,
  FileText,
  Check,
  X,
  Flame,
  MapPin,
  Tag,
  FileImage,
  AlertCircle,
  RefreshCw,
  Edit2
} from 'lucide-react';

const fuelLogSchema = z.object({
  vehicleId: z.string().min(1, 'Vehicle selection is required'),
  date: z.string().min(1, 'Date is required'),
  litres: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number({ message: 'Litres must be a number' })
      .positive('Litres must be a positive number')
  ),
  cost: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number({ message: 'Cost must be a number' })
      .positive('Cost must be a positive number')
  ),
  odometer: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number({ message: 'Odometer must be a number' })
      .nonnegative('Odometer must be a non-negative number')
      .nullable()
  )
});

interface FuelLogModalProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  journeys?: Journey[];
  selectedVehicleId: string | 'all';
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onLogAdded: () => void;
  onLogDeleted?: (id: string) => void;
  editingLog?: FuelLog | null;
}

export default function FuelLogModal({
  vehicles,
  fuelLogs,
  journeys = [],
  selectedVehicleId,
  currency,
  isOpen,
  onClose,
  onLogAdded,
  onLogDeleted,
  editingLog = null
}: FuelLogModalProps) {
  const { showToast } = useToast();
  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));

  // OCR/Scanning States
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgressMsg, setOcrProgressMsg] = useState('');
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [originalImgUri, setOriginalImgUri] = useState<string | null>(null);
  const [preprocessedImgUri, setPreprocessedImgUri] = useState<string | null>(null);
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [showVisualInsights, setShowVisualInsights] = useState(true);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [scannedReceiptToSave, setScannedReceiptToSave] = useState<ScannedReceipt | null>(null);
  const [isDeleteReceiptConfirmOpen, setIsDeleteReceiptConfirmOpen] = useState(false);

  // Multi-page receipts states
  const [uploadedPages, setUploadedPages] = useState<{ id: string; imageUri: string; fileName: string; rawText: string }[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReceiptImage, setActiveReceiptImage] = useState<string | null>(null);

  // Form states
  const [existingReceipt, setExistingReceipt] = useState<ScannedReceipt | null>(null);
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [formLitres, setFormLitres] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formStation, setFormStation] = useState('');
  const [formFullTank, setFormFullTank] = useState(true);
  const [formNotes, setFormNotes] = useState('');
  const [formJourneyId, setFormJourneyId] = useState<string>('');

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Real-time validation when fields change
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      const result = fuelLogSchema.safeParse({
        vehicleId: formVehicleId,
        date: formDate,
        litres: formLitres,
        cost: formCost,
        odometer: formOdometer || null
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
  }, [formVehicleId, formDate, formLitres, formCost, formOdometer]);

  // Date conversion helpers
  const toDbDate = (dStr: string): string => {
    if (!dStr) return '';
    const cleanStr = dStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      return cleanStr;
    }
    const match = cleanStr.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (match) {
      const d = match[1].padStart(2, '0');
      const m = match[2].padStart(2, '0');
      const y = match[3];
      return `${y}-${m}-${d}`;
    }
    return cleanStr;
  };
  const toUiDate = (dStr: string): string => {
    if (!dStr) return '';
    const cleanStr = dStr.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(cleanStr)) {
      return cleanStr;
    }
    const match = cleanStr.match(/^(\d{4})[-\/.](\d{2})[-\/.](\d{2})$/);
    if (match) {
      const y = match[1];
      const m = match[2];
      const d = match[3];
      return `${d}-${m}-${y}`;
    }
    return cleanStr;
  };

  const lastLoadedRef = useRef<string | null | undefined>(undefined);

  // Initialize form when modal opens or editing log changes
  useEffect(() => {
    if (!isOpen) {
      lastLoadedRef.current = undefined;
      return;
    }

    setErrors({}); // Reset error state on open!

    const currentKey = editingLog ? editingLog.id : 'new';
    if (lastLoadedRef.current === currentKey) {
      return; // Already initialized, don't overwrite edits
    }

    lastLoadedRef.current = currentKey;

    if (editingLog) {
      setFormVehicleId(editingLog.vehicleId);
      setFormDate(editingLog.date);
      setFormOdometer(editingLog.odometer !== null && editingLog.odometer !== undefined ? String(editingLog.odometer) : '');
      setFormLitres(String(editingLog.litres));
      setFormCost(String(editingLog.cost));
      setFormStation(editingLog.station || '');
      setFormFullTank(editingLog.fullTank);
      setFormNotes(editingLog.notes || '');
      setFormJourneyId(editingLog.journeyId || '');
      setOcrResult(null);
      setScannedReceiptToSave(null);
      setOriginalImgUri(null);
      setPreprocessedImgUri(null);
      setShowRawOcr(false);
      
      // Fetch existing receipt
      if (editingLog.receiptId) {
        dbAPI.getScannedReceipt(editingLog.receiptId).then(rcpt => {
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
    } else {
      // Reset form for new log
      setFormVehicleId(selectedVehicleId !== 'all' ? selectedVehicleId : (vehicles[0]?.id || ''));
      setFormDate(getLocalDateString());
      setFormOdometer('');
      setFormLitres('');
      setFormCost('');
      setFormStation('');
      setFormFullTank(true);
      setFormNotes('');
      setFormJourneyId('');
      setOcrResult(null);
      setScannedReceiptToSave(null);
      setOriginalImgUri(null);
      setPreprocessedImgUri(null);
      setShowRawOcr(false);
      setExistingReceipt(null);
      setUploadedPages([]);
    }
  }, [isOpen, editingLog, selectedVehicleId, vehicles]);

  // OCR Handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await processImage(files[i]);
    }
    e.target.value = '';
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
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          await processImage(file);
        }
      }
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

    let base64Uri = '';
    try {
      base64Uri = await fileToBase64(file);
    } catch (e) {
      console.error('Failed to convert file to base64', e);
      showToast('Failed to load image file.', 'error');
      setIsScanning(false);
      return;
    }

    try {
      // Step 1: Create blob URL and load into an HTMLImageElement
      const imgUri = URL.createObjectURL(file);
      setOriginalImgUri(imgUri);

      const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load receipt image'));
        img.src = imgUri;
      });

      // Step 2: Scan using native on-device OCR or web fallback
      const { rawText, previewDataUri } = await scanReceiptImage(file, imgEl, setOcrProgressMsg as (msg: string) => void);
      const preprocessedDataUri = previewDataUri || base64Uri;
      setPreprocessedImgUri(preprocessedDataUri);

      // Step 3: Parse and apply extracted data
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
        imageUri: preprocessedDataUri,
        fileName: file.name,
        rawText: rawText || ''
      };
      setUploadedPages(prev => [...prev, newPage]);

      if (hasExtractedValues) {
        setOcrResult(parsed);
        if (parsed.cost) setFormCost(String(parsed.cost));
        if (parsed.litres) setFormLitres(String(parsed.litres));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormStation(parsed.station);
        showToast('Receipt page scanned and added!', 'scanned');
      } else {
        setOcrResult(null);
        setOcrError('No values detected by OCR, but the page was added.');
        showToast('Page added! Please enter details manually.', 'warning');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      
      // Since OCR failed, we still add the page
      const pageId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newPage = {
        id: pageId,
        imageUri: base64Uri,
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
        if (parsed.litres) setFormLitres(String(parsed.litres));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormStation(parsed.station);
        showToast('All pages processed! Fuel data extracted successfully.', 'scanned');
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
        if (parsed.litres) setFormLitres(String(parsed.litres));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormStation(parsed.station);
        showToast(`Page ${pageIndex + 1} processed! Fuel data extracted.`, 'scanned');
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

  const applyOcrResult = () => {
    if (ocrResult) {
      if (ocrResult.cost) setFormCost(String(ocrResult.cost));
      if (ocrResult.litres) setFormLitres(String(ocrResult.litres));
      if (ocrResult.date) setFormDate(ocrResult.date);
      if (ocrResult.odometer) setFormOdometer(String(ocrResult.odometer));
      if (ocrResult.station) setFormStation(ocrResult.station);
      showToast('Receipt data applied to form!', 'scanned');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = fuelLogSchema.safeParse({
      vehicleId: formVehicleId,
      date: formDate,
      litres: formLitres,
      cost: formCost,
      odometer: formOdometer || null
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

    setErrors({});

    const validatedData = result.data;
    const odoNum = validatedData.odometer;
    const litresNum = validatedData.litres;
    const costNum = validatedData.cost;
    const pricePerLitre = costNum / litresNum;
    const dbDate = toDbDate(formDate);

    // Multi-page receipt save logic
    let receiptId = editingLog?.receiptId || null;
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
        date: dbDate || getLocalDateString(),
        fileName: uploadedPages[0].fileName,
        imageUri: receiptImageUri,
        extractedCost: costNum,
        extractedLitres: litresNum,
        extractedPricePerLitre: pricePerLitre,
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

    if (editingLog) {
      const updated: FuelLog = {
        ...editingLog,
        vehicleId: formVehicleId,
        date: dbDate,
        odometer: odoNum,
        litres: litresNum,
        cost: costNum,
        station: formStation || 'Unknown Station',
        fullTank: formFullTank,
        notes: formNotes,
        pricePerLitre,
        receiptId,
        journeyId: formJourneyId || null,
        receiptImage: receiptImageUri,
        receiptImages: receiptPagesUris,
      };
      await dbAPI.saveFuelLog(updated);
      showToast('Fuel log updated successfully!', 'success');
    } else {
      const newLog: FuelLog = {
        id: `f-${Date.now()}`,
        vehicleId: formVehicleId,
        date: dbDate,
        odometer: odoNum,
        litres: litresNum,
        cost: costNum,
        station: formStation || 'Unknown Station',
        fullTank: formFullTank,
        notes: formNotes,
        pricePerLitre,
        mileageSinceLast: null,
        receiptId,
        journeyId: formJourneyId || null,
        receiptImage: receiptImageUri,
        receiptImages: receiptPagesUris,
      };
      await dbAPI.saveFuelLog(newLog);
      showToast('Fuel fill-up logged successfully!', 'success');
    }

    onClose();
    onLogAdded();
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
      title={editingLog ? "Edit Fuel Fill-Up" : "Log Fuel Fill-Up"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">
        {/* RECEIPT OCR SCANNING REGION */}
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
            Scan multiple receipt pages with 100% offline privacy. Your images are processed locally on this device.
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
              <span className="font-display font-bold text-xs uppercase">Upload Pages</span>
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*;capture=camera" className="hidden" onChange={handleImageUpload} />
          <input ref={uploadInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />

          {/* Uploaded Receipt Pages Grid */}
          {uploadedPages.length > 0 && (
            <div className="mt-4 p-3 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-card rounded-md text-left">
              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-1.5 mb-3">
                <span className="font-display font-black text-xs uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-neo-accent" /> Uploaded Pages ({uploadedPages.length})
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
                <li className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={
                      ocrProgressMsg.includes('Preparing') || ocrProgressMsg.includes('Downloading') || ocrProgressMsg.includes('Initializing')
                        ? 'animate-pulse text-neo-accent font-black'
                        : (ocrProgressMsg.includes('Preprocessing') || ocrProgressMsg.includes('Running OCR') || ocrProgressMsg.includes('ready')
                          ? 'text-green-500 font-bold'
                          : 'text-gray-400 dark:text-gray-600')
                    }>
                      {ocrProgressMsg.includes('Preparing') || ocrProgressMsg.includes('Downloading') || ocrProgressMsg.includes('Initializing') ? '▶'
                        : (ocrProgressMsg.includes('Preprocessing') || ocrProgressMsg.includes('Running OCR') || ocrProgressMsg.includes('ready') ? '✓' : '○')}
                    </span>
                    <span>2. Loading OCR engine {ocrProgressMsg.includes('Downloading') ? <span className="text-neo-accent font-bold">({ocrProgressMsg.split('…')[1]?.trim() ?? ''})</span> : ''}…</span>
                  </div>
                  {/* Per-library download bars — only visible while actually downloading */}
                  {false && null}
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

              <h5 className="font-display font-black text-xs uppercase tracking-wider text-black dark:text-white mb-3 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-green-500 animate-bounce" />
                Extracted Fields
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                {ocrResult.cost !== undefined && ocrResult.cost !== null && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1">💰 Cost</span>
                    <span className="font-black text-black dark:text-white bg-neo-accent-yellow/30 px-1 py-0.5 rounded border border-neo-accent-yellow/50">
                      {formatCurrency(ocrResult.cost, currency)}
                    </span>
                  </div>
                )}
                {ocrResult.litres !== undefined && ocrResult.litres !== null && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1">⛽ Litres</span>
                    <span className="font-black text-black dark:text-white bg-blue-300/30 px-1 py-0.5 rounded border border-blue-300/50">
                      {formatNumber(ocrResult.litres, 2)}L
                    </span>
                  </div>
                )}
                {ocrResult.pricePerLitre !== undefined && ocrResult.pricePerLitre !== null && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1">📈 Rate</span>
                    <span className="font-black text-black dark:text-white bg-neo-accent-green/30 px-1 py-0.5 rounded border border-neo-accent-green/50">
                      {formatCurrency(ocrResult.pricePerLitre, currency, 2)}/L
                    </span>
                  </div>
                )}
                {ocrResult.odometer !== undefined && ocrResult.odometer !== null && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1">🚗 Odo</span>
                    <span className="font-black text-black dark:text-white bg-purple-400/30 px-1 py-0.5 rounded border border-purple-400/50">
                      {ocrResult.odometer.toLocaleString()} km
                    </span>
                  </div>
                )}
                {ocrResult.date && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1">📅 Date</span>
                    <span className="font-bold text-black dark:text-white bg-gray-200/50 dark:bg-zinc-800 px-1 py-0.5 rounded">
                      {ocrResult.date}
                    </span>
                  </div>
                )}
                {ocrResult.station && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded sm:col-span-2">
                    <span className="text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1">🏪 Station</span>
                    <span className="font-bold text-black dark:text-white truncate max-w-[180px] sm:max-w-[300px]">
                      {ocrResult.station}
                    </span>
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

        {/* Vehicle and Date (Inline) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
            <NeoDropdown
              id="form-fuel-vehicle"
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
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Date *</label>
            <input
              type="date"
              id="form-fuel-date"
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
        </div>

        {journeys.filter(j => j.vehicleId === formVehicleId).length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-gray-400">Journey (optional)</label>
            <NeoDropdown
              id="form-fuel-journey"
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

        {/* Odometer Section (Inline) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Odometer (km)</label>
            <input
              type="number"
              id="form-fuel-odo"
              value={formOdometer}
              onChange={(e) => {
                setFormOdometer(e.target.value);
                if (errors.odometer) setErrors(prev => ({ ...prev, odometer: '' }));
              }}
              placeholder="Optional"
              className={`p-2.5 sm:p-2 border-2 ${errors.odometer ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
            />
            {errors.odometer && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.odometer}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Litres *</label>
            <input
              type="number"
              step="any"
              id="form-fuel-litres"
              value={formLitres}
              onChange={(e) => {
                setFormLitres(e.target.value);
                if (errors.litres) setErrors(prev => ({ ...prev, litres: '' }));
              }}
              className={`p-2.5 sm:p-2 border-2 ${errors.litres ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
            />
            {errors.litres && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.litres}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Total Cost *</label>
            <input
              type="number"
              step="any"
              id="form-fuel-cost"
              value={formCost}
              onChange={(e) => {
                setFormCost(e.target.value);
                if (errors.cost) setErrors(prev => ({ ...prev, cost: '' }));
              }}
              className={`p-2.5 sm:p-2 border-2 ${errors.cost ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
            />
            {errors.cost && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {errors.cost}
              </span>
            )}
          </div>
        </div>

        {/* Station */}
        <div className="flex flex-col gap-1">
          <label className="font-display font-bold text-xs uppercase tracking-wider">Station</label>
          <input
            type="text"
            id="form-fuel-station"
            value={formStation}
            onChange={(e) => setFormStation(e.target.value)}
            placeholder="Shell, BP, etc."
            className="p-2.5 sm:p-2 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg focus:outline-none text-black dark:text-white focus:border-neo-accent"
          />
        </div>

        {/* Full Tank Checkbox */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="form-fuel-fulltank"
            checked={formFullTank}
            onChange={(e) => setFormFullTank(e.target.checked)}
            className="w-5 h-5 accent-neo-accent cursor-pointer border-2 border-black"
          />
          <label htmlFor="form-fuel-fulltank" className="font-display font-bold text-xs uppercase tracking-wider cursor-pointer">
            Full Tank Fill
          </label>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="font-display font-bold text-xs uppercase tracking-wider">Notes</label>
          <textarea
            id="form-fuel-notes"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            rows={2}
            className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none resize-none"
          />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
          <button
            type="button"
            id="btn-fuel-cancel"
            onClick={handleClose}
            className="px-4 py-2.5 border-2 border-black dark:border dark:border-white bg-white dark:bg-neo-dark-card text-black dark:text-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-800 neo-shadow-sm cursor-pointer"
          >
            CANCEL
          </button>
          <button
            type="submit"
            id="btn-fuel-submit"
            className="px-4 py-2.5 bg-neo-accent border-2 border-black text-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          >
            {editingLog ? 'UPDATE' : 'LOG FILL-UP'}
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
        imageUri={activeReceiptImage}
        imageUris={uploadedPages.map(p => p.imageUri)}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title="Fuel Receipt"
      />
    </NeoModal>
  );
}
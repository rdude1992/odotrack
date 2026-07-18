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
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
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

  // Form states
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
    }
  }, [isOpen, editingLog, selectedVehicleId, vehicles]);

  // OCR Handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
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
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await processImage(file);
    }
  };

  const processImage = async (file: File) => {
    setIsScanning(true);
    setOcrProgressMsg('Loading image...');
    setOcrError(null);
    setOcrResult(null);
    setScannedReceiptToSave(null);
    setOriginalImgUri(null);
    setPreprocessedImgUri(null);
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

      // Step 2: Scan using native on-device OCR (Capacitor app only)
      const { rawText, previewDataUri } = await scanReceiptImage(file, imgEl, setOcrProgressMsg);
      const preprocessedDataUri = previewDataUri;
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

      if (hasExtractedValues) {
        setOcrResult(parsed);
        if (parsed.cost) setFormCost(String(parsed.cost));
        if (parsed.litres) setFormLitres(String(parsed.litres));
        if (parsed.date) setFormDate(parsed.date);
        if (parsed.odometer) setFormOdometer(String(parsed.odometer));
        if (parsed.station) setFormStation(parsed.station);

        // Build a ScannedReceipt to persist offline for later reference
        const receipt: ScannedReceipt = {
          id: `rcpt-${Date.now()}`,
          date: parsed.date || getLocalDateString(),
          fileName: file.name,
          imageUri: preprocessedDataUri,
          extractedCost: parsed.cost,
          extractedLitres: parsed.litres,
          extractedPricePerLitre: parsed.pricePerLitre,
          rawText,
        };
        setScannedReceiptToSave(receipt);
        showToast('Receipt scanned successfully!', 'scanned');
      } else {
        setOcrError('Could not extract fuel data from receipt. Please enter manually.');
        showToast('Could not extract details. Please enter manually.', 'error');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      setOcrError('OCR processing failed. Please enter details manually.');
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
        receiptId: scannedReceiptToSave ? scannedReceiptToSave.id : editingLog.receiptId,
        journeyId: formJourneyId || null,
      };
      await dbAPI.saveFuelLog(updated);
      showToast('Fuel log updated successfully!', 'success');
    } else {
      if (scannedReceiptToSave) {
        await dbAPI.saveReceipt(scannedReceiptToSave);
      }
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
        receiptId: scannedReceiptToSave ? scannedReceiptToSave.id : null,
        journeyId: formJourneyId || null,
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
            Scan receipts with 100% offline privacy. Your image is processed locally on this device.
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
              <span className="font-display font-bold text-xs uppercase">Upload</span>
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*;capture=camera" className="hidden" onChange={handleImageUpload} />
          <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

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
    </NeoModal>
  );
}
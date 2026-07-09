/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, Expense, ExpenseCategory, ScannedReceipt } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatCurrency } from '../utils';
import { loadOCRLibraries, preprocessImage, parseReceiptText, preloadOCRLibraries, scanReceiptImage, OCRResult, OCRConfidence } from '../ocrEngine';
import NeoModal from './NeoModal';
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
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
  FileText
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

interface ExpenseLogModalProps {
  vehicles: Vehicle[];
  expenses: Expense[];
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
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Toll');
  const [formCost, setFormCost] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [formNotes, setFormNotes] = useState('');

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

  const lastLoadedRef = useRef<string | null | undefined>(undefined);

  // Initialize form when modal opens or editing expense changes
  useEffect(() => {
    if (!isOpen) {
      lastLoadedRef.current = undefined;
      return;
    }

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
      setOcrResult(null);
      setScannedReceiptToSave(null);
      setOriginalImgUri(null);
      setPreprocessedImgUri(null);
    } else {
      const today = new Date().toISOString().split('T')[0];
      setFormVehicleId(selectedVehicleId !== 'all' ? selectedVehicleId : (vehicles[0]?.id || ''));
      setFormDate(today);
      setFormCategory('Toll');
      setFormCost('');
      setFormVendor('');
      setFormOdometer('');
      setFormNotes('');
      setOcrResult(null);
      setScannedReceiptToSave(null);
      setOriginalImgUri(null);
      setPreprocessedImgUri(null);
    }
    // Kick off library loading immediately when modal opens
    preloadOCRLibraries();
  }, [isOpen, editingExpense, selectedVehicleId, vehicles]);

  const vendorConfig = vendorConfigMap[formCategory];

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

  const processImage = async (file: File) => {
    setIsScanning(true);
    setOcrProgressMsg('Loading image...');
    setOcrError(null);
    setOcrResult(null);
    setScannedReceiptToSave(null);
    setOriginalImgUri(null);
    setPreprocessedImgUri(null);

    try {
      const imgUri = URL.createObjectURL(file);
      setOriginalImgUri(imgUri);

      const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load receipt image'));
        img.src = imgUri;
      });

      const { rawText, previewDataUri } = await scanReceiptImage(file, imgEl, setOcrProgressMsg);
      const preprocessedDataUri = previewDataUri;
      setPreprocessedImgUri(preprocessedDataUri);

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

        const receipt: ScannedReceipt = {
          id: `rcpt-${Date.now()}`,
          date: parsed.date || new Date().toISOString().split('T')[0],
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
        setOcrError('Could not extract details from receipt. Please enter manually.');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formVehicleId || !formDate || !formCost || !formVendor) {
      alert('Please fill out all required fields.');
      return;
    }

    const costNum = parseFloat(formCost);
    const odoNum = formOdometer ? parseFloat(formOdometer) : null;

    if (scannedReceiptToSave) {
      await dbAPI.saveReceipt(scannedReceiptToSave);
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
        receiptId: scannedReceiptToSave ? scannedReceiptToSave.id : editingExpense.receiptId,
      };
      await dbAPI.saveExpense(updated);
      showToast('Expense updated successfully!', 'success');
    } else {
      const newExpense: Expense = {
        id: `e-${Date.now()}`,
        vehicleId: formVehicleId,
        date: formDate,
        category: formCategory,
        cost: costNum,
        vendor: formVendor,
        odometer: odoNum,
        notes: formNotes || null,
        receiptId: scannedReceiptToSave ? scannedReceiptToSave.id : null,
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
              onChange={(val) => setFormVehicleId(val)}
              options={vehicleOptions}
              className="w-full"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Category *</label>
            <NeoDropdown
              id="form-exp-category"
              value={formCategory}
              onChange={(val) => setFormCategory(val as ExpenseCategory)}
              options={categories.map(cat => ({ value: cat, label: cat }))}
              className="w-full"
            />
          </div>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Cost */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Cost Amount ({currency}) *</label>
            <input
              type="number"
              step="any"
              id="form-exp-cost"
              value={formCost}
              onChange={(e) => setFormCost(e.target.value)}
              placeholder="45.00"
              required
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
            />
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Date *</label>
            <input
              type="date"
              id="form-exp-date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              required
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
            />
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
              onChange={(e) => setFormOdometer(e.target.value)}
              placeholder="E.g., current km"
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
            />
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
            onChange={(e) => setFormVendor(e.target.value)}
            placeholder={vendorConfig.placeholder}
            required
            className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-sm"
          />
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
    </NeoModal>
  );
}
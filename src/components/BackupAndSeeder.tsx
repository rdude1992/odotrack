/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Vehicle, FuelLog, Trip, Expense, ScannedReceipt, AppSettings, FontSize, TripPurpose, DesignStyle } from '../types';
import ConfirmModal from './ConfirmModal';
import ExcelCsvImportModal from './ExcelCsvImportModal';
import BulkResetModal from './BulkResetModal';
import { dbAPI } from '../db';
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
import { convertToCSV, shareFileOrData, triggerFileDownload, normalizeTripPurpose, getLocalDateString, getVehicleDefaultSchedule } from '../utils';
import {
  Database,
  Download,
  Upload,
  Trash2,
  CheckCircle,
  Bell,
  HelpCircle,
  FileSpreadsheet,
  Share2,
  AlertTriangle,
  Settings,
  Palette,
  Type,
  SlidersHorizontal,
  Info,
  Coins,
  HardDrive,
  RefreshCw,
  Filter
} from 'lucide-react';

interface BackupProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: AppSettings;
  onDataResetOrSeeded: () => void;
  onFontSizeChange?: (fontSize: FontSize) => void;
  onAccentColorChange?: (accentColor: string) => void;
  onDesignStyleChange?: (designStyle: DesignStyle) => void;
  onDensityChange?: (density: 'compact' | 'comfortable') => void;
}

const ACCENT_COLORS = [
  '#ff6b35', // Orange (default)
  '#ef4444', // Red
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#22c55e', // Green
  '#84cc16', // Lime
  '#eab308', // Yellow
  '#f97316', // Amber
  '#71717a', // Zinc Grey
  '#ffffff', // White
];

const FONT_SIZE_OPTIONS = [
  { value: 'small', label: 'Small (85%)' },
  { value: 'medium', label: 'Medium (100%)' },
  { value: 'large', label: 'Large (115%)' },
];

export default function BackupAndSeeder({
  vehicles,
  fuelLogs,
  trips,
  expenses,
  settings,
  onDataResetOrSeeded,
  onFontSizeChange,
  onAccentColorChange,
  onDesignStyleChange,
  onDensityChange
}: BackupProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [reminderDays, setReminderDays] = useState(settings.backupReminderDays);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isBulkResetModalOpen, setIsBulkResetModalOpen] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [storageStats, setStorageStats] = useState<{
    textBytes: number;
    imageBytes: number;
    totalBytes: number;
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const loadStorageStats = useCallback(async () => {
    setIsCalculating(true);
    try {
      // Small artificial delay to show a fun tactile loader
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      let textBytes = 0;
      let imageBytes = 0;

      const dbReceipts = await dbAPI.getReceipts();
      const dbJourneys = await dbAPI.getJourneys();
      const dbMaintenance = await dbAPI.getMaintenanceRecords();

      const getByteSize = (str: string): number => {
        try {
          return new Blob([str]).size;
        } catch {
          return str.length;
        }
      };

      const processItem = (item: any, imageKeys: string[]) => {
        if (!item) return;
        const clone = { ...item };
        
        for (const key of imageKeys) {
          if (clone[key]) {
            const val = clone[key];
            if (typeof val === 'string') {
              imageBytes += getByteSize(val);
            } else if (Array.isArray(val)) {
              for (const subVal of val) {
                if (typeof subVal === 'string') {
                  imageBytes += getByteSize(subVal);
                }
              }
            }
            delete clone[key];
          }
        }
        
        const textJson = JSON.stringify(clone);
        textBytes += getByteSize(textJson);
      };

      // Vehicles
      for (const v of vehicles) {
        processItem(v, ['profileImage']);
      }

      // Fuel Logs
      for (const f of fuelLogs) {
        processItem(f, ['receiptImage', 'receiptImages']);
      }

      // Trips
      for (const t of trips) {
        processItem(t, []);
      }

      // Expenses
      for (const e of expenses) {
        processItem(e, ['receiptImage', 'receiptImages']);
      }

      // Receipts
      for (const r of dbReceipts) {
        processItem(r, ['imageUri', 'pages']);
      }

      // Journeys
      for (const j of dbJourneys) {
        processItem(j, []);
      }

      // Maintenance Records
      for (const m of dbMaintenance) {
        processItem(m, ['receiptImage']);
      }

      // Settings
      textBytes += getByteSize(JSON.stringify(settings));

      setStorageStats({
        textBytes,
        imageBytes,
        totalBytes: textBytes + imageBytes,
      });
    } catch (err) {
      console.error('Failed to calculate storage size', err);
      showToast('Error calculating storage size.', 'error');
    } finally {
      setIsCalculating(false);
    }
  }, [vehicles, fuelLogs, trips, expenses, settings, showToast]);

  useEffect(() => {
    loadStorageStats();
  }, [loadStorageStats]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };



  // Trigger JSON database export with native Share Sheet or direct download
  const handleExportJSON = async () => {
    try {
      const receipts = await dbAPI.getReceipts();
      const journeys = await dbAPI.getJourneys();
      const backupData = {
        metadata: {
          app: 'OdoTrack',
          version: '1.0.0',
          exportedAt: new Date().toISOString()
        },
        vehicles,
        fuelLogs,
        trips,
        expenses,
        receipts,
        journeys,
        settings: {
          ...settings,
          backupReminderDays: reminderDays
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const fileName = `odotrack_backup_${getLocalDateString()}.json`;

      const shared = await shareFileOrData(
        jsonStr,
        fileName,
        'application/json',
        'OdoTrack Full Database Backup'
      );

      // Record backup date in settings
      const newSettings: AppSettings = {
        ...settings,
        lastBackupDate: getLocalDateString()
      };
      await dbAPI.saveSettings(newSettings);

      showToast(shared ? 'Database backup shared successfully!' : 'Backup JSON file downloaded successfully!', 'success');
      setSuccessMsg(shared ? 'Database backup shared successfully!' : 'Backup file downloaded!');
      setTimeout(() => setSuccessMsg(''), 3000);
      onDataResetOrSeeded(); // Refreshes state to capture lastBackupDate update
    } catch (e) {
      showToast('Database backup generation failed.', 'error');
    }
  };

  // Export specific stores as CSV
  const handleExportCSV = (type: 'fuel' | 'trips' | 'expenses' | 'vehicles') => {
    let csvData: Record<string, unknown>[] = [];
    let name = '';

    if (type === 'fuel') {
      csvData = fuelLogs as unknown as Record<string, unknown>[];
      name = 'fuel_logs';
    } else if (type === 'trips') {
      csvData = trips as unknown as Record<string, unknown>[];
      name = 'trips_sheet';
    } else if (type === 'expenses') {
      csvData = expenses as unknown as Record<string, unknown>[];
      name = 'other_expenses';
    } else {
      csvData = vehicles as unknown as Record<string, unknown>[];
      name = 'vehicles_garage';
    }

    if (csvData.length === 0) {
      showToast(`There are no ${type} records to export yet.`, 'error');
      return;
    }

    const csvContent = convertToCSV(csvData);
    const fileName = `odotrack_${name}_${getLocalDateString()}.csv`;

    triggerFileDownload(csvContent, fileName, 'text/csv');
    showToast(`${type.toUpperCase()} records exported to CSV successfully!`, 'success');
    setSuccessMsg(`${type.toUpperCase()} CSV downloaded!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Helper for actual JSON file restoring
  const executeImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Support for both current format and legacy "v2" export format
      const hasVehicles = Array.isArray(parsed.vehicles);
      const importedFuel = parsed.fuelLogs || parsed.fuelEntries || [];
      const importedTrips = parsed.trips || parsed.tripEntries || [];
      const importedExpenses = parsed.expenses || parsed.expenseEntries || [];

      if (!hasVehicles) {
        showToast('Invalid file format. This is not a valid OdoTrack backup file.', 'error');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Clear current data
      await dbAPI.clearAllData();

      // Restore Vehicles with mapping
      for (const v of parsed.vehicles) {
        const vehicle = {
          id: v.id,
          name: v.name,
          type: v.type || 'car',
          fuelType: v.fuelType || v.fuel || 'Petrol',
          registration: v.registration || v.reg || '',
          odometer: v.odometer !== undefined ? v.odometer : (v.odo || 0),
          purchaseDate: v.purchaseDate || '',
          profileImage: v.profileImage || null,
          maintenanceSchedule: (v.maintenanceSchedule && v.maintenanceSchedule.length > 0)
            ? v.maintenanceSchedule
            : getVehicleDefaultSchedule(v.type || 'car')
        };
        await dbAPI.saveVehicle(vehicle as any);
      }

      // Restore Fuel Logs with mapping
      for (const f of importedFuel) {
        const fuel = {
          id: f.id,
          vehicleId: f.vehicleId,
          date: f.date || (f.createdAt ? f.createdAt.split('T')[0] : ''),
          odometer: f.odometer !== undefined ? f.odometer : (f.odo !== undefined ? f.odo : null),
          litres: f.litres || 0,
          cost: f.cost || 0,
          station: f.station || '',
          fullTank: f.fullTank || false,
          notes: f.notes || '',
          pricePerLitre: f.pricePerLitre || f.pricePerL || 0,
          mileageSinceLast: f.mileageSinceLast || null,
          receiptId: f.receiptId || null,
          journeyId: f.journeyId || null
        };
        await dbAPI.saveFuelLog(fuel as any);
      }

      // Restore Trips with mapping
      for (const t of importedTrips) {
        const cleanPurpose = normalizeTripPurpose(t.purpose);
        const parsedEndOdo = t.endOdo !== undefined && t.endOdo !== null ? Number(t.endOdo) : null;
        const startOdoNum = Number(t.startOdo || 0);

        // Conclude status from start and end odometer readings if status is not explicitly "active" or "completed"
        const isCompleted = t.status === 'completed' ||
          (t.status !== 'active' && parsedEndOdo !== null && !isNaN(parsedEndOdo) && parsedEndOdo >= startOdoNum && parsedEndOdo > 0);
        const cleanStatus = isCompleted ? 'completed' : 'active';

        const trip = {
          id: t.id,
          vehicleId: t.vehicleId,
          startDate: t.startDate || t.date || (t.createdAt ? t.createdAt.split('T')[0] : ''),
          startTime: t.startTime || null,
          startOdo: startOdoNum,
          endOdo: parsedEndOdo !== null && !isNaN(parsedEndOdo) ? parsedEndOdo : null,
          source: t.source || null,
          destination: t.destination || null,
          purpose: cleanPurpose,
          status: cleanStatus,
          elapsedMinutes: t.elapsedMinutes !== undefined && t.elapsedMinutes !== null ? Number(t.elapsedMinutes) : null,
          notes: t.notes || '',
          journeyId: t.journeyId || null
        };
        await dbAPI.saveTrip(trip as any);
      }

      // Restore Expenses with mapping
      for (const exp of importedExpenses) {
        const categoryMap: Record<string, string> = {
          'toll': 'Toll',
          'parking': 'Parking',
          'repair': 'Repair',
          'service': 'Service',
          'insurance': 'Insurance',
          'tire': 'Tires',
          'accessory': 'Accessory'
        };
        const rawCat = (exp.category || 'Other').toLowerCase();

        const expense = {
          id: exp.id,
          vehicleId: exp.vehicleId,
          date: exp.date || (exp.createdAt ? exp.createdAt.split('T')[0] : ''),
          category: categoryMap[rawCat] || 'Other',
          cost: exp.cost !== undefined ? exp.cost : (exp.amount || 0),
          vendor: exp.vendor || '',
          odometer: exp.odometer || null,
          notes: exp.notes ? `${exp.desc ? exp.desc + ' - ' : ''}${exp.notes}` : (exp.desc || ''),
          journeyId: exp.journeyId || null
        };
        await dbAPI.saveExpense(expense as any);
      }

      // Restore Receipts
      if (parsed.receipts) {
        for (const rec of parsed.receipts) {
          await dbAPI.saveReceipt(rec);
        }
      }

      // Restore Journeys
      if (Array.isArray(parsed.journeys)) {
        for (const j of parsed.journeys) {
          const journey = {
            id: j.id,
            vehicleId: j.vehicleId,
            name: j.name || 'Untitled Journey',
            startDate: j.startDate || (j.createdAt ? j.createdAt.split('T')[0] : ''),
            endDate: j.endDate || null,
            notes: j.notes || null
          };
          await dbAPI.saveJourney(journey as any);
        }
      }

      // Restore settings
      if (parsed.settings) {
        await dbAPI.saveSettings({
          ...parsed.settings,
          lastBackupDate: getLocalDateString() // updated to today since backed up/restored
        });
      }

      showToast('Database restored successfully! All records loaded.', 'success');
      onDataResetOrSeeded();
    } catch (err: any) {
      showToast(`Import failed: ${err.message || err}`, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Import JSON backup
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setConfirmModalConfig({
      isOpen: true,
      title: 'Overwrite Current Data?',
      message: 'WARNING: Importing this backup will PERMANENTLY overwrite and replace all current records, vehicles, and logs in your browser storage! This action cannot be undone. Do you want to continue?',
      danger: true,
      onConfirm: () => {
        executeImport(file);
      }
    });
  };

  // Update backup warning frequency
  const handleUpdateFrequency = async (days: number) => {
    setReminderDays(days);
    const newSettings: AppSettings = {
      ...settings,
      backupReminderDays: days
    };
    await dbAPI.saveSettings(newSettings);
    onDataResetOrSeeded();
  };

  // Seed sample data
  const handleSeedData = () => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Seed Mock Data?',
      message: 'Are you sure you want to seed mock data? This will clear all of your current records and fill them with realistic vehicles, mileage, fuel logs, and trip timers.',
      danger: true,
      onConfirm: async () => {
        await dbAPI.seedSampleData();
        onDataResetOrSeeded();
        showToast('Sample/mock data seeded successfully!', 'success');
      }
    });
  };

  // Clear all data
  const handleClearAll = () => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Wipe All Data?',
      message: 'CRITICAL: Are you sure you want to WIPE out all browser logs? This will delete all vehicles, fuel details, trips, and receipts.',
      danger: true,
      onConfirm: () => {
        setTimeout(() => {
          setConfirmModalConfig({
            isOpen: true,
            title: 'Are you 100% Sure?',
            message: 'ARE YOU ABSOLUTELY 100% SURE? All offline data stored locally in your browser cache will be deleted forever!',
            danger: true,
            onConfirm: async () => {
              await dbAPI.clearAllData();
              onDataResetOrSeeded();
              showToast('All browser databases have been completely wiped.', 'deleted');
            }
          });
        }, 150);
      }
    });
  };

  const handleCurrencyChange = async (val: string) => {
    const newSettings: AppSettings = {
      ...settings,
      currency: val
    };
    await dbAPI.saveSettings(newSettings);
    onDataResetOrSeeded(); // Trigger a reload
  };

  return (
    <div className="w-full flex flex-col gap-4 select-none font-sans">

      {/* Font Size & Accent Color section */}
      <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6 text-black dark:text-white" />
          <h2 className="font-display font-black text-xl uppercase tracking-wider">App Settings</h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-x-6 gap-y-4">
          {/* Currency */}
          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-28 shrink-0 text-gray-500 dark:text-gray-400">
              <Coins className="w-4 h-4 shrink-0" />
              <label className="font-bold text-xs uppercase tracking-wide">Currency</label>
            </div>
            <NeoDropdown
              value={settings.currency || 'INR'}
              onChange={handleCurrencyChange}
              options={[
                { value: 'INR', label: 'INR (₹)' },
                { value: 'USD', label: 'USD ($)' },
                { value: 'EUR', label: 'EUR (€)' },
                { value: 'GBP', label: 'GBP (£)' },
                { value: 'AUD', label: 'AUD ($)' },
                { value: 'CAD', label: 'CAD ($)' },
                { value: 'JPY', label: 'JPY (¥)' }
              ]}
              className="w-48"
              compact
            />
          </div>

          {/* Design Style */}
          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-28 shrink-0 text-gray-500 dark:text-gray-400">
              <Palette className="w-4 h-4 shrink-0" />
              <label className="font-bold text-xs uppercase tracking-wide">Design</label>
            </div>
            <NeoDropdown
              value={settings.designStyle || 'neobrutalist'}
              onChange={(val) => onDesignStyleChange?.(val as DesignStyle)}
              options={[
                { value: 'neobrutalist', label: 'Classic Neobrutalist' },
                { value: 'refined', label: 'Refined Minimalist' },
                { value: 'material3', label: 'Material 3 (M3)' },
                { value: 'aistudio', label: 'AI Studio Theme' }
              ]}
              className="w-48"
              compact
            />
          </div>

          {/* Font Size */}
          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-28 shrink-0 text-gray-500 dark:text-gray-400">
              <Type className="w-4 h-4 shrink-0" />
              <label className="font-bold text-xs uppercase tracking-wide">Font Size</label>
            </div>
            <NeoDropdown
              value={settings.fontSize || 'medium'}
              onChange={(val) => onFontSizeChange?.(val as FontSize)}
              options={FONT_SIZE_OPTIONS}
              className="w-48"
              compact
            />
          </div>

          {/* Density Mode (Specifically for Material 3) */}
          {settings.designStyle === 'material3' && (
            <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto" id="setting-m3-density">
              <div className="flex items-center gap-2 w-28 shrink-0 text-gray-500 dark:text-gray-400">
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <label className="font-bold text-xs uppercase tracking-wide">Density</label>
              </div>
              <NeoDropdown
                value={settings.density || 'comfortable'}
                onChange={(val) => onDensityChange?.(val as 'compact' | 'comfortable')}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' }
                ]}
                className="w-48"
                compact
              />
            </div>
          )}
        </div>

        {/* Accent Color */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-gray-500" />
            <label className="font-bold text-sm uppercase tracking-wide text-gray-500">Accent Color</label>
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onAccentColorChange?.(color)}
                className={`w-8 h-8 border-2 transition-all cursor-pointer ${
                  settings.accentColor === color
                    ? 'border-black dark:border-white scale-110 neo-shadow-sm'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-500'
                }`}
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`Set accent color to ${color}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Header controls */}
      <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark">
        <h2 className="font-display font-black text-xl uppercase tracking-wider">Database & Backups</h2>
        <p className="font-sans text-xs text-gray-500 dark:text-gray-400">
          Sync files locally, export standard csv matrices, configure schedules, or reset databases
        </p>
      </div>

      {/* Backup and Restore sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* EXPORT COLUMN */}
        <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-neo-accent" />
              <h3 className="font-display font-black text-lg uppercase tracking-wider">Export Backups</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Download your relational data offline. JSON holds all files (including base64 scanned receipts), suitable for full restoration. CSV files are formatted for Excel.
            </p>

            {successMsg && (
              <div className="p-3 mb-4 bg-green-100 border-2 border-green-400 text-green-700 text-xs font-bold font-mono uppercase flex items-center gap-1.5 animate-pulse">
                <CheckCircle className="w-4 h-4" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {/* Export JSON Bundle (Native Share Sheet) */}
              <button
                id="btn-export-json"
                onClick={handleExportJSON}
                className="w-full flex items-center justify-center gap-2 py-3 bg-neo-accent text-black font-display font-black text-sm uppercase border-2 border-black dark:border-white hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>Backup Full Database (JSON)</span>
              </button>

              <div className="border-t border-black/10 dark:border-white/10 pt-3 mt-1">
                <div className="font-display font-bold text-xs uppercase text-gray-500 dark:text-gray-400 mb-2">Export CSV spreadsheets:</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="btn-export-csv-fuel"
                    onClick={() => handleExportCSV('fuel')}
                    className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 bg-neo-bg dark:bg-neo-dark-bg hover:bg-gray-200 dark:hover:bg-zinc-800 text-black dark:text-white border-2 border-black dark:border-white font-display font-bold text-xs uppercase cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                    <span>Fuel Logs</span>
                  </button>
                  <button
                    id="btn-export-csv-trips"
                    onClick={() => handleExportCSV('trips')}
                    className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 bg-neo-bg dark:bg-neo-dark-bg hover:bg-gray-200 dark:hover:bg-zinc-800 text-black dark:text-white border-2 border-black dark:border-white font-display font-bold text-xs uppercase cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span>Trip Sheets</span>
                  </button>
                  <button
                    id="btn-export-csv-expenses"
                    onClick={() => handleExportCSV('expenses')}
                    className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 bg-neo-bg dark:bg-neo-dark-bg hover:bg-gray-200 dark:hover:bg-zinc-800 text-black dark:text-white border-2 border-black dark:border-white font-display font-bold text-xs uppercase cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                    <span>Expenses</span>
                  </button>
                  <button
                    id="btn-export-csv-vehicles"
                    onClick={() => handleExportCSV('vehicles')}
                    className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 bg-neo-bg dark:bg-neo-dark-bg hover:bg-gray-200 dark:hover:bg-zinc-800 text-black dark:text-white border-2 border-black dark:border-white font-display font-bold text-xs uppercase cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-purple-600" />
                    <span>Vehicles</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[10px] text-gray-400 italic">
            * Receipts images will only be backed up inside the JSON database bundle.
          </div>
        </div>

        {/* IMPORT & SCHEDULES COLUMN */}
        <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark flex flex-col justify-between gap-4">

          {/* Import section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-5 h-5 text-neo-accent-green" />
              <h3 className="font-display font-black text-lg uppercase tracking-wider">Import & Restore Data</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Import existing fuel logs, trip sheets, or maintenance records from Excel (.xlsx) / CSV files, or restore a full OdoTrack JSON backup.
            </p>

            <div className="flex flex-col gap-2.5">
              {/* New Excel / CSV Spreadsheet Import Action */}
              <button
                id="btn-import-excel-csv"
                onClick={() => setIsExcelModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-neo-accent text-black font-display font-black text-sm uppercase border-2 border-black dark:border-white hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-black" />
                <span>Import Excel / CSV Data</span>
              </button>

              {/* JSON Backup File Restore Action */}
              <button
                id="btn-trigger-import"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-neo-bg dark:bg-zinc-800 text-black dark:text-white font-display font-bold text-xs uppercase border-2 border-black dark:border-white hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 shrink-0 text-neo-accent-green" />
                <span>Restore Full JSON Backup</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJSON}
              accept=".json,application/json"
              className="hidden"
            />
          </div>

          {/* Schedulers */}
          <div className="border-t-2 border-black/10 dark:border-white/10 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-5 h-5 text-neo-accent-yellow" />
              <h3 className="font-display font-black text-sm uppercase tracking-wider">Backup Reminder Alerts</h3>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              Configure how often the application displays warnings reminding you to secure your local database.
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase font-display shrink-0">Notify me:</span>
              <NeoDropdown
                id="select-backup-frequency"
                value={String(reminderDays)}
                onChange={(val) => handleUpdateFrequency(Number(val))}
                options={[
                  { value: '3', label: 'Every 3 Days' },
                  { value: '7', label: 'Every 7 Days (Recommended)' },
                  { value: '14', label: 'Every 14 Days' },
                  { value: '30', label: 'Every 30 Days (Monthly)' }
                ]}
                className="flex-1"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Storage Usage Section */}
      <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 sm:p-4 neo-shadow dark:neo-shadow-dark flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-neo-accent" />
            <h3 className="font-display font-black text-sm sm:text-base uppercase tracking-wider">Storage Usage Analysis</h3>
          </div>
          <button
            onClick={loadStorageStats}
            disabled={isCalculating}
            title="Recalculate Storage"
            className="p-1 border-2 border-black dark:border-white bg-[#faf9f6] dark:bg-zinc-800 hover:bg-neo-accent active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center neo-shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
          Breakdown of text database entries (logs, settings, journeys) versus compressed scanned receipt images stored locally.
        </p>

        {/* Visual Progress Bar representing proportions */}
        {(() => {
          const total = storageStats?.totalBytes || 0;
          const textPercent = total > 0 ? Math.round((storageStats?.textBytes || 0) / total * 100) : 0;
          const imagePercent = total > 0 ? Math.round((storageStats?.imageBytes || 0) / total * 100) : 0;

          return (
            <div className="flex flex-col gap-2.5">
              <div className="w-full h-5 border-2 border-black dark:border-white flex overflow-hidden font-mono text-[9px] font-bold bg-[#f0f0f0] dark:bg-zinc-900">
                {textPercent > 0 && (
                  <div
                    style={{ width: `${textPercent}%` }}
                    className="bg-neo-accent-green text-black flex items-center justify-center border-r-2 border-black h-full shrink-0 transition-all duration-300"
                    title={`Text Logs: ${textPercent}%`}
                  >
                    {textPercent >= 10 && `${textPercent}%`}
                  </div>
                )}
                {imagePercent > 0 && (
                  <div
                    style={{ width: `${imagePercent}%` }}
                    className="bg-blue-300 text-black flex items-center justify-center h-full shrink-0 transition-all duration-300"
                    title={`Receipt Images: ${imagePercent}%`}
                  >
                    {imagePercent >= 10 && `${imagePercent}%`}
                  </div>
                )}
                {total === 0 && (
                  <div className="w-full text-gray-400 flex items-center justify-center h-full">
                    No storage records found
                  </div>
                )}
              </div>

              {/* Legends showing exact sizes */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-1.5 sm:p-2 bg-[#faf9f6] dark:bg-zinc-800 border-2 border-black dark:border-white neo-shadow-sm">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="w-2.5 h-2.5 bg-neo-accent-green border border-black shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Text</span>
                  </div>
                  <div className="font-mono font-black text-[11px] sm:text-xs text-black dark:text-white leading-tight truncate">
                    {storageStats ? formatBytes(storageStats.textBytes) : '...'}
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-gray-400 font-mono mt-0.5">
                    {textPercent}% of total
                  </div>
                </div>

                <div className="p-1.5 sm:p-2 bg-[#faf9f6] dark:bg-zinc-800 border-2 border-black dark:border-white neo-shadow-sm">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="w-2.5 h-2.5 bg-blue-300 border border-black shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Images</span>
                  </div>
                  <div className="font-mono font-black text-[11px] sm:text-xs text-black dark:text-white leading-tight truncate">
                    {storageStats ? formatBytes(storageStats.imageBytes) : '...'}
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-gray-400 font-mono mt-0.5">
                    {imagePercent}% of total
                  </div>
                </div>

                <div className="p-1.5 sm:p-2 bg-[#faf9f6] dark:bg-zinc-800 border-2 border-black dark:border-white neo-shadow-sm">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="w-2.5 h-2.5 bg-black dark:bg-white shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total</span>
                  </div>
                  <div className="font-mono font-black text-[11px] sm:text-xs text-black dark:text-white leading-tight truncate">
                    {storageStats ? formatBytes(storageStats.totalBytes) : '...'}
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-gray-400 font-mono mt-0.5">
                    Local Device
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* About Section */}
      <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-about'))}
          className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="bg-neo-accent border-2 border-black p-1.5 rotate-[-1deg]">
              <h3 className="font-display font-black text-xs sm:text-sm text-black uppercase leading-none">ODOTRACK</h3>
            </div>
            <div className="flex flex-col text-left">
              <span className="font-display font-bold text-xs sm:text-sm uppercase tracking-wider">About ODOTRACK</span>
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-mono">Version {settings.appVersion}</span>
            </div>
          </div>
          <Info className="w-4 h-4 text-gray-500 shrink-0" />
        </button>
      </div>

      {/* EXPERIMENTAL SEEDER AND RESET DANGER ZONE */}
      <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-5 neo-shadow dark:neo-shadow-dark">
        <h3 className="font-display font-black text-lg uppercase tracking-wider text-red-500 mb-1">Data Reset & Cleaning Zone</h3>
        <p className="font-sans text-xs text-gray-500 dark:text-gray-400 mb-4">
          Perform targeted bulk data wipes for specific log types (e.g., clear fuel logs or trips while preserving vehicle profiles) or manage demo datasets.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Selective Bulk Reset (Featured Action) */}
          <button
            id="btn-selective-reset"
            onClick={() => setIsBulkResetModalOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-300 hover:bg-amber-400 text-black font-display font-black text-xs uppercase border-2 border-black dark:border-white neo-shadow-sm active:translate-y-[1px] cursor-pointer"
          >
            <Filter className="w-4 h-4 shrink-0" />
            <span>Selective Bulk Reset</span>
          </button>

          {/* Seed demo records */}
          <button
            id="btn-seed-sample"
            onClick={handleSeedData}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-neo-bg hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-black dark:text-white font-display font-black text-xs uppercase border-2 border-black dark:border-white cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            <span>Load Demo Mock Data</span>
          </button>

          {/* Delete All Database */}
          <button
            id="btn-clear-all"
            onClick={handleClearAll}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-400 hover:bg-red-500 text-black font-display font-black text-xs uppercase border-2 border-black dark:border-white neo-shadow-sm active:translate-y-[1px] cursor-pointer"
          >
            <Trash2 className="w-4 h-4 shrink-0 animate-pulse" />
            <span>Wipe All Data</span>
          </button>
        </div>
      </div>

      {confirmModalConfig && (
        <ConfirmModal
          isOpen={confirmModalConfig.isOpen}
          title={confirmModalConfig.title}
          message={confirmModalConfig.message}
          onConfirm={() => {
            confirmModalConfig.onConfirm();
            setConfirmModalConfig(null);
          }}
          onCancel={() => {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setConfirmModalConfig(null);
          }}
          danger={confirmModalConfig.danger !== false}
        />
      )}

      <ExcelCsvImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        vehicles={vehicles}
        onImportSuccess={() => {
          onDataResetOrSeeded();
          loadStorageStats();
        }}
      />

      <BulkResetModal
        isOpen={isBulkResetModalOpen}
        onClose={() => setIsBulkResetModalOpen(false)}
        vehicles={vehicles}
        onResetSuccess={() => {
          onDataResetOrSeeded();
          loadStorageStats();
        }}
      />

    </div>
  );
}

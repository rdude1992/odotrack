/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { dbAPI } from '../db';
import { useToast } from './ToastContext';
import NeoModal from './NeoModal';
import NeoDropdown from './NeoDropdown';
import ConfirmModal from './ConfirmModal';
import {
  Trash2,
  Filter,
  CheckSquare,
  Square,
  AlertTriangle,
  Fuel,
  MapPin,
  Wrench,
  Compass,
  FileImage,
  RefreshCw,
  Database
} from 'lucide-react';

interface BulkResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onResetSuccess: () => void;
}

interface CategoryCounts {
  fuel: number;
  trips: number;
  expenses: number;
  maintenance: number;
  journeys: number;
  receipts: number;
}

export default function BulkResetModal({
  isOpen,
  onClose,
  vehicles,
  onResetSuccess
}: BulkResetModalProps) {
  const { showToast } = useToast();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('ALL');
  const [counts, setCounts] = useState<CategoryCounts>({
    fuel: 0,
    trips: 0,
    expenses: 0,
    maintenance: 0,
    journeys: 0,
    receipts: 0
  });
  const [loadingCounts, setLoadingCounts] = useState<boolean>(false);

  // Checkbox selections - initially false, updated dynamically once counts are loaded
  const [clearFuel, setClearFuel] = useState<boolean>(false);
  const [clearTrips, setClearTrips] = useState<boolean>(false);
  const [clearExpenses, setClearExpenses] = useState<boolean>(false);
  const [clearMaintenance, setClearMaintenance] = useState<boolean>(false);
  const [clearJourneys, setClearJourneys] = useState<boolean>(false);
  const [clearReceipts, setClearReceipts] = useState<boolean>(false);

  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load counts whenever modal opens or vehicle filter changes
  const loadCategoryCounts = async () => {
    setLoadingCounts(true);
    try {
      const [fuels, trips, expenses, maintenance, journeys, receipts] = await Promise.all([
        dbAPI.getFuelLogs(),
        dbAPI.getTrips(),
        dbAPI.getExpenses(),
        dbAPI.getMaintenanceRecords(),
        dbAPI.getJourneys(),
        dbAPI.getReceipts()
      ]);

      const filterId = selectedVehicleId === 'ALL' ? null : selectedVehicleId;

      const fCount = filterId ? fuels.filter(f => f.vehicleId === filterId).length : fuels.length;
      const tCount = filterId ? trips.filter(t => t.vehicleId === filterId).length : trips.length;
      const eCount = filterId ? expenses.filter(e => e.vehicleId === filterId).length : expenses.length;
      const mCount = filterId ? maintenance.filter(m => m.vehicleId === filterId).length : maintenance.length;
      const jCount = filterId ? journeys.filter(j => j.vehicleId === filterId).length : journeys.length;
      const rCount = receipts.length;

      setCounts({
        fuel: fCount,
        trips: tCount,
        expenses: eCount,
        maintenance: mCount,
        journeys: jCount,
        receipts: rCount
      });

      // Preselect only categories that have > 0 records
      setClearFuel(fCount > 0);
      setClearTrips(tCount > 0);
      setClearExpenses(eCount > 0);
      setClearMaintenance(mCount > 0);
      setClearJourneys(false);
      setClearReceipts(false);
    } catch (err) {
      console.error('Failed to count records:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategoryCounts();
    }
  }, [isOpen, selectedVehicleId]);

  const totalSelectedRecords =
    (clearFuel ? counts.fuel : 0) +
    (clearTrips ? counts.trips : 0) +
    (clearExpenses ? counts.expenses : 0) +
    (clearMaintenance ? counts.maintenance : 0) +
    (clearJourneys ? counts.journeys : 0) +
    (clearReceipts ? counts.receipts : 0);

  const selectPreset = (type: 'all_logs' | 'fuel_only' | 'trips_only' | 'expenses_only') => {
    if (type === 'all_logs') {
      setClearFuel(counts.fuel > 0);
      setClearTrips(counts.trips > 0);
      setClearExpenses(counts.expenses > 0);
      setClearMaintenance(counts.maintenance > 0);
      setClearJourneys(counts.journeys > 0);
      setClearReceipts(counts.receipts > 0);
    } else if (type === 'fuel_only') {
      setClearFuel(counts.fuel > 0);
      setClearTrips(false);
      setClearExpenses(false);
      setClearMaintenance(false);
      setClearJourneys(false);
      setClearReceipts(false);
    } else if (type === 'trips_only') {
      setClearFuel(false);
      setClearTrips(counts.trips > 0);
      setClearExpenses(false);
      setClearMaintenance(false);
      setClearJourneys(false);
      setClearReceipts(false);
    } else if (type === 'expenses_only') {
      setClearFuel(false);
      setClearTrips(false);
      setClearExpenses(counts.expenses > 0);
      setClearMaintenance(counts.maintenance > 0);
      setClearJourneys(false);
      setClearReceipts(false);
    }
  };

  const handleExecuteReset = async () => {
    if (totalSelectedRecords === 0) {
      showToast('Please select at least one log type to clear.', 'error');
      return;
    }

    setIsDeleting(true);
    setConfirmModalOpen(false);

    try {
      const vId = selectedVehicleId === 'ALL' ? undefined : selectedVehicleId;
      const res = await dbAPI.clearSelectiveLogs({
        vehicleId: vId,
        clearFuel,
        clearTrips,
        clearExpenses,
        clearMaintenance,
        clearJourneys,
        clearReceipts
      });

      const parts: string[] = [];
      if (res.fuelCleared > 0) parts.push(`${res.fuelCleared} Fuel Logs`);
      if (res.tripsCleared > 0) parts.push(`${res.tripsCleared} Trips`);
      if (res.expensesCleared > 0) parts.push(`${res.expensesCleared} Expenses`);
      if (res.maintenanceCleared > 0) parts.push(`${res.maintenanceCleared} Maintenance Records`);
      if (res.journeysCleared > 0) parts.push(`${res.journeysCleared} Journeys`);
      if (res.receiptsCleared > 0) parts.push(`${res.receiptsCleared} Receipts`);

      const targetVehName = selectedVehicleId === 'ALL'
        ? 'All Vehicles'
        : vehicles.find(v => v.id === selectedVehicleId)?.name || 'Selected Vehicle';

      showToast(
        `Successfully cleared data for ${targetVehName}: ${parts.join(', ')}. Vehicle profiles preserved!`,
        'deleted'
      );

      onResetSuccess();
      onClose();
    } catch (err: any) {
      showToast(`Failed to clear records: ${err.message || err}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const targetVehicleName = selectedVehicleId === 'ALL'
    ? 'All Vehicles'
    : vehicles.find(v => v.id === selectedVehicleId)?.name || 'Selected Vehicle';

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Selective Data Reset">
      <div className="flex flex-col gap-4 text-sm font-sans select-none">
        
        {/* Banner */}
        <div className="bg-[#faf9f6] dark:bg-zinc-800 p-3.5 border-2 border-black dark:border-white neo-shadow-sm flex items-start gap-3">
          <Database className="w-5 h-5 text-neo-accent shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <h4 className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-black dark:text-white">
              Targeted Data Cleaning
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Clear specific log categories (e.g. reset fuel fills after an import test) while keeping vehicle profiles, registration details, and app settings intact.
            </p>
          </div>
        </div>

        {/* 1. Target Vehicle Selection */}
        <div className="flex flex-col gap-1.5 bg-white dark:bg-zinc-900 p-3 border-2 border-black dark:border-white">
          <label className="font-display font-bold text-xs uppercase text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neo-accent" />
            <span>Target Vehicle Scope:</span>
          </label>
          <NeoDropdown
            value={selectedVehicleId}
            onChange={(val) => setSelectedVehicleId(val)}
            options={[
              { value: 'ALL', label: '⚡ All Vehicles (Global Reset)' },
              ...vehicles.map(v => ({ value: v.id, label: `🚗 ${v.name} (${v.registration || 'No Reg'})` }))
            ]}
            compact
          />
        </div>

        {/* 2. Presets Quick Action Bar */}
        <div className="flex flex-col gap-1.5">
          <span className="font-display font-bold text-xs uppercase text-gray-500 dark:text-gray-400">
            Quick Select Presets:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectPreset('all_logs')}
              className="py-1 px-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Select All Logs
            </button>
            <button
              type="button"
              onClick={() => selectPreset('fuel_only')}
              className="py-1 px-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Fuel Logs Only
            </button>
            <button
              type="button"
              onClick={() => selectPreset('trips_only')}
              className="py-1 px-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Trips Only
            </button>
            <button
              type="button"
              onClick={() => selectPreset('expenses_only')}
              className="py-1 px-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-white font-display font-bold text-xs uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Expenses & Maintenance
            </button>
          </div>
        </div>

        {/* 3. Category Checkbox List */}
        <div className="flex flex-col gap-2 bg-white dark:bg-zinc-800 p-3 border-2 border-black dark:border-white neo-shadow-sm">
          <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2">
            <span className="font-display font-black text-xs uppercase">Select Categories To Delete:</span>
            {loadingCounts && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">

            {/* Fuel Logs */}
            <label
              onClick={() => {
                if (counts.fuel > 0) setClearFuel(!clearFuel);
              }}
              className={`flex items-center justify-between p-2.5 border-2 transition-all ${
                counts.fuel === 0
                  ? 'bg-gray-100 dark:bg-zinc-900/40 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                  : clearFuel
                  ? 'bg-amber-100 dark:bg-amber-950/40 text-black dark:text-white font-bold cursor-pointer border-black dark:border-white'
                  : 'bg-gray-50 dark:bg-zinc-900/50 cursor-pointer border-black dark:border-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Fuel className={`w-4 h-4 shrink-0 ${counts.fuel > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                <span className="font-display text-xs uppercase truncate">Fuel Fill Logs</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                  counts.fuel > 0
                    ? 'bg-white dark:bg-zinc-800 border-black/30 dark:border-white/30'
                    : 'bg-gray-200 dark:bg-zinc-800/80 text-gray-400 border-gray-300 dark:border-zinc-700'
                }`}>
                  {counts.fuel}
                </span>
                {clearFuel && counts.fuel > 0 ? (
                  <CheckSquare className="w-4 h-4 text-black dark:text-white shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
            </label>

            {/* Trips */}
            <label
              onClick={() => {
                if (counts.trips > 0) setClearTrips(!clearTrips);
              }}
              className={`flex items-center justify-between p-2.5 border-2 transition-all ${
                counts.trips === 0
                  ? 'bg-gray-100 dark:bg-zinc-900/40 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                  : clearTrips
                  ? 'bg-blue-100 dark:bg-blue-950/40 text-black dark:text-white font-bold cursor-pointer border-black dark:border-white'
                  : 'bg-gray-50 dark:bg-zinc-900/50 cursor-pointer border-black dark:border-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className={`w-4 h-4 shrink-0 ${counts.trips > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="font-display text-xs uppercase truncate">Trip Sheets</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                  counts.trips > 0
                    ? 'bg-white dark:bg-zinc-800 border-black/30 dark:border-white/30'
                    : 'bg-gray-200 dark:bg-zinc-800/80 text-gray-400 border-gray-300 dark:border-zinc-700'
                }`}>
                  {counts.trips}
                </span>
                {clearTrips && counts.trips > 0 ? (
                  <CheckSquare className="w-4 h-4 text-black dark:text-white shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
            </label>

            {/* Expenses */}
            <label
              onClick={() => {
                if (counts.expenses > 0) setClearExpenses(!clearExpenses);
              }}
              className={`flex items-center justify-between p-2.5 border-2 transition-all ${
                counts.expenses === 0
                  ? 'bg-gray-100 dark:bg-zinc-900/40 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                  : clearExpenses
                  ? 'bg-purple-100 dark:bg-purple-950/40 text-black dark:text-white font-bold cursor-pointer border-black dark:border-white'
                  : 'bg-gray-50 dark:bg-zinc-900/50 cursor-pointer border-black dark:border-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Wrench className={`w-4 h-4 shrink-0 ${counts.expenses > 0 ? 'text-purple-600' : 'text-gray-400'}`} />
                <span className="font-display text-xs uppercase truncate">Expenses & Bills</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                  counts.expenses > 0
                    ? 'bg-white dark:bg-zinc-800 border-black/30 dark:border-white/30'
                    : 'bg-gray-200 dark:bg-zinc-800/80 text-gray-400 border-gray-300 dark:border-zinc-700'
                }`}>
                  {counts.expenses}
                </span>
                {clearExpenses && counts.expenses > 0 ? (
                  <CheckSquare className="w-4 h-4 text-black dark:text-white shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
            </label>

            {/* Maintenance */}
            <label
              onClick={() => {
                if (counts.maintenance > 0) setClearMaintenance(!clearMaintenance);
              }}
              className={`flex items-center justify-between p-2.5 border-2 transition-all ${
                counts.maintenance === 0
                  ? 'bg-gray-100 dark:bg-zinc-900/40 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                  : clearMaintenance
                  ? 'bg-orange-100 dark:bg-orange-950/40 text-black dark:text-white font-bold cursor-pointer border-black dark:border-white'
                  : 'bg-gray-50 dark:bg-zinc-900/50 cursor-pointer border-black dark:border-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Wrench className={`w-4 h-4 shrink-0 ${counts.maintenance > 0 ? 'text-orange-600' : 'text-gray-400'}`} />
                <span className="font-display text-xs uppercase truncate">Maintenance Schedules</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                  counts.maintenance > 0
                    ? 'bg-white dark:bg-zinc-800 border-black/30 dark:border-white/30'
                    : 'bg-gray-200 dark:bg-zinc-800/80 text-gray-400 border-gray-300 dark:border-zinc-700'
                }`}>
                  {counts.maintenance}
                </span>
                {clearMaintenance && counts.maintenance > 0 ? (
                  <CheckSquare className="w-4 h-4 text-black dark:text-white shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
            </label>

            {/* Journeys */}
            <label
              onClick={() => {
                if (counts.journeys > 0) setClearJourneys(!clearJourneys);
              }}
              className={`flex items-center justify-between p-2.5 border-2 transition-all ${
                counts.journeys === 0
                  ? 'bg-gray-100 dark:bg-zinc-900/40 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                  : clearJourneys
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-black dark:text-white font-bold cursor-pointer border-black dark:border-white'
                  : 'bg-gray-50 dark:bg-zinc-900/50 cursor-pointer border-black dark:border-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Compass className={`w-4 h-4 shrink-0 ${counts.journeys > 0 ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="font-display text-xs uppercase truncate">Journeys Groupings</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                  counts.journeys > 0
                    ? 'bg-white dark:bg-zinc-800 border-black/30 dark:border-white/30'
                    : 'bg-gray-200 dark:bg-zinc-800/80 text-gray-400 border-gray-300 dark:border-zinc-700'
                }`}>
                  {counts.journeys}
                </span>
                {clearJourneys && counts.journeys > 0 ? (
                  <CheckSquare className="w-4 h-4 text-black dark:text-white shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
            </label>

            {/* Receipt Scans */}
            <label
              onClick={() => {
                if (counts.receipts > 0) setClearReceipts(!clearReceipts);
              }}
              className={`flex items-center justify-between p-2.5 border-2 transition-all ${
                counts.receipts === 0
                  ? 'bg-gray-100 dark:bg-zinc-900/40 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                  : clearReceipts
                  ? 'bg-rose-100 dark:bg-rose-950/40 text-black dark:text-white font-bold cursor-pointer border-black dark:border-white'
                  : 'bg-gray-50 dark:bg-zinc-900/50 cursor-pointer border-black dark:border-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileImage className={`w-4 h-4 shrink-0 ${counts.receipts > 0 ? 'text-rose-600' : 'text-gray-400'}`} />
                <span className="font-display text-xs uppercase truncate">Scanned Receipt Images</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                  counts.receipts > 0
                    ? 'bg-white dark:bg-zinc-800 border-black/30 dark:border-white/30'
                    : 'bg-gray-200 dark:bg-zinc-800/80 text-gray-400 border-gray-300 dark:border-zinc-700'
                }`}>
                  {counts.receipts}
                </span>
                {clearReceipts && counts.receipts > 0 ? (
                  <CheckSquare className="w-4 h-4 text-black dark:text-white shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
            </label>

          </div>
        </div>

        {/* Total Summary Footer */}
        <div className="bg-[#faf9f6] dark:bg-zinc-900 p-3 border-2 border-black dark:border-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-bold">Total Selected For Wipe:</span>
          </div>
          <span className="font-mono font-black text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50 px-2.5 py-0.5 border border-red-300">
            {totalSelectedRecords} Records
          </span>
        </div>

        {/* Submit Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:flex-1 py-2.5 px-4 bg-white dark:bg-zinc-800 text-black dark:text-white font-display font-bold text-xs uppercase border-2 border-black dark:border-white hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer text-center"
          >
            Cancel
          </button>
          
          <button
            type="button"
            disabled={totalSelectedRecords === 0 || isDeleting}
            onClick={() => setConfirmModalOpen(true)}
            className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-black font-display font-black text-xs uppercase border-2 border-black dark:border-white neo-shadow-sm transition-all ${
              totalSelectedRecords > 0
                ? 'bg-red-400 hover:bg-red-500 active:translate-y-[1px] cursor-pointer'
                : 'bg-gray-200 dark:bg-zinc-700 text-gray-400 border-gray-300 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span className="truncate">Clear Selected Logs ({totalSelectedRecords})</span>
          </button>
        </div>

      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <ConfirmModal
          isOpen={confirmModalOpen}
          title={`Wipe ${totalSelectedRecords} Selected Logs?`}
          message={`Are you sure you want to permanently delete ${totalSelectedRecords} logs for [${targetVehicleName}]? Vehicle profiles will remain intact, but these log entries will be erased from IndexedDB storage forever.`}
          danger={true}
          onConfirm={handleExecuteReset}
          onCancel={() => setConfirmModalOpen(false)}
        />
      )}
    </NeoModal>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Vehicle, FuelLog, ScannedReceipt, Journey } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatCurrency, formatNumber } from '../utils';
import { parseReceiptText, OCRResult } from '../ocrEngine';
import ConfirmModal from './ConfirmModal';
import NeoModal from './NeoModal';
import ReceiptViewer from './ReceiptViewer';
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
  Edit2,
  Download,
  Calendar,
  Search
} from 'lucide-react';

interface FuelLogProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  journeys?: Journey[];
  selectedVehicleId: string | 'all';
  currency: string;
  onLogAdded: () => void;
  onLogDeleted: (id: string) => void;
  onEditLog?: (log: FuelLog) => void;
  onAddClick?: () => void;
}

export default function FuelLogComponent({
  vehicles,
  fuelLogs,
  journeys = [],
  selectedVehicleId,
  currency,
  onLogAdded,
  onLogDeleted,
  onEditLog,
  onAddClick
}: FuelLogProps) {
  const { showToast } = useToast();
  const getJourneyName = (journeyId?: string | null) => journeys.find(j => j.id === journeyId)?.name || null;
  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));

  // UI states
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReceiptImage, setActiveReceiptImage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);

  // Track scroll to shrink pinned cards
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getVehicleName = (vid: string) => {
    const v = vehicles.find(v => v.id === vid);
    return v ? v.name : 'Unknown';
  };

  // Month / Year filter options
  const monthOptions = [
    { value: 'all', label: 'All Months' },
    { value: '01', label: 'Jan' },
    { value: '02', label: 'Feb' },
    { value: '03', label: 'Mar' },
    { value: '04', label: 'Apr' },
    { value: '05', label: 'May' },
    { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' },
    { value: '08', label: 'Aug' },
    { value: '09', label: 'Sep' },
    { value: '10', label: 'Oct' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dec' },
  ];
  const yearOptions = [
    { value: 'all', label: 'All Years' },
    ...Array.from(new Set(fuelLogs.map(l => l.date.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a))
      .map(y => ({ value: y, label: y })),
  ];

  // Filtered logs
  const filteredLogs = fuelLogs
    .filter(log => selectedVehicleId === 'all' ? true : log.vehicleId === selectedVehicleId)
    .filter(log => selectedMonth === 'all' ? true : log.date.slice(5, 7) === selectedMonth)
    .filter(log => selectedYear === 'all' ? true : log.date.slice(0, 4) === selectedYear)
    .filter(log => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase().trim();
      const vName = getVehicleName(log.vehicleId).toLowerCase();
      const stationMatch = log.station ? log.station.toLowerCase().includes(query) : false;
      const notesMatch = log.notes ? log.notes.toLowerCase().includes(query) : false;
      const vehicleMatch = vName.includes(query);
      return stationMatch || notesMatch || vehicleMatch;
    })
    .sort((a, b) => {
      const cmp = new Date(b.date).getTime() - new Date(a.date).getTime();
      return sortOrder === 'newest' ? cmp : -cmp;
    });

  const totalFuelCost = filteredLogs.reduce((sum, log) => sum + log.cost, 0);

  // Selected vehicle name
  const selectedVehicleName = selectedVehicleId === 'all' ? 'All Vehicles' : getVehicleName(selectedVehicleId);

  // Filter logs for selected vehicle to calculate historical summary (ignoring date/month filter to get full historical picture)
  const vehicleHistoricalLogs = fuelLogs.filter(
    log => selectedVehicleId === 'all' ? true : log.vehicleId === selectedVehicleId
  );

  // Calculate Average Fuel Economy based on logsWithMileage
  const logsWithMileage = vehicleHistoricalLogs.filter(l => l.mileageSinceLast !== null && l.mileageSinceLast > 0);
  const avgFuelEconomy = logsWithMileage.length > 0
    ? logsWithMileage.reduce((sum, l) => sum + (l.mileageSinceLast || 0), 0) / logsWithMileage.length
    : 0;

  // Calculate Total Litres filled historically
  const totalLitres = vehicleHistoricalLogs.reduce((sum, l) => sum + l.litres, 0);

  // Calculate Total Fuel Spend historically
  const totalHistoricalSpend = vehicleHistoricalLogs.reduce((sum, l) => sum + l.cost, 0);

  // Handle scanned receipt view
  const handleViewReceipt = async (receiptId: string, fallbackImage?: string | null) => {
    let imageUri: string | null = null;
    if (receiptId) {
      const receipt = await dbAPI.getScannedReceipt(receiptId);
      if (receipt) {
        imageUri = receipt.imageUri;
      }
    }
    if (!imageUri && fallbackImage) {
      imageUri = fallbackImage;
    }
    if (!imageUri) {
      showToast('Receipt not found', 'error');
      return;
    }
    setActiveReceiptImage(imageUri);
    setIsReceiptModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const log = fuelLogs.find(l => l.id === id);
    if (log && log.receiptId) {
      await dbAPI.deleteScannedReceipt(log.receiptId);
    }
    await dbAPI.deleteFuelLog(id);
    setDeleteConfirmId(null);
    setIsConfirmOpen(false);
    onLogDeleted(id);
  };

  const toggleSelectLog = (id: string) => {
    setSelectedLogs(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = () => {
    if (selectedLogs.length === 0) return;
    setDeleteConfirmId('bulk');
    setIsConfirmOpen(true);
  };

  const selectAll = () => {
    setSelectedLogs(filteredLogs.map(l => l.id));
  };

  const selectNone = () => {
    setSelectedLogs([]);
  };

  return (
    <div className="w-full flex flex-col gap-4 select-none">

      {/* Sticky Header + Controls Wrapper */}
      <div className="sticky top-0 z-30 space-y-2 bg-neo-bg dark:bg-neo-dark-bg pb-2 pt-1">
        {/* Header Card — Neo-brutalist like modal */}
        <div id="fuel-header-card" className={`bg-neo-accent border-2 border-black neo-shadow transition-all duration-300 flex items-center justify-between ${isScrolled ? 'px-3 py-2' : 'px-5 py-3.5'}`}>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-lg leading-none' : 'text-xl'}`}>Fuel Logbook</h2>
            <span className="bg-black text-white font-mono font-bold text-[9px] leading-none px-1.5 py-0.5 border border-black/50 shrink-0">
              {filteredLogs.length} LOGS
            </span>
          </div>
          <span className={`font-mono font-black text-black bg-white border-2 border-black px-2 py-0.5 leading-none transition-all ${isScrolled ? 'text-xs' : 'text-sm'}`}>
            {formatCurrency(totalFuelCost, currency)}
          </span>
        </div>
        {/* Controls Card */}
        <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark transition-all duration-300 ${isScrolled ? 'p-2' : 'p-4'} flex flex-col gap-3`}>
          {/* Search bar */}
          <div className="relative w-full">
            <input
              type="text"
              id="fuel-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fuel logs by station, notes, or vehicle..."
              className="w-full p-2.5 sm:p-2 pl-9 pr-8 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg text-black dark:text-white font-sans text-xs focus:outline-none focus:border-neo-accent"
            />
            <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                id="btn-clear-fuel-search"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black dark:hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer font-bold"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {selectedLogs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {/* Top row: Sort + Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="sort-buttons-group flex border-2 border-black shrink-0">
                  <button
                    onClick={() => setSortOrder('newest')}
                    className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                  >
                    NEWEST
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                  >
                    OLDEST
                  </button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NeoDropdown
                    id="fuel-filter-month"
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthOptions}
                    compact
                    className="w-24"
                  />
                  <NeoDropdown
                    id="fuel-filter-year"
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={yearOptions}
                    compact
                    className="w-24"
                  />
                </div>
              </div>

              {/* Bottom row: Selection controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="px-2.5 py-1.5 bg-black text-white font-display font-bold text-[10px] uppercase border-2 border-black hover:bg-gray-800 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                  >
                    SELECT ALL
                  </button>
                  <button
                    onClick={selectNone}
                    className="px-2.5 py-1.5 bg-white dark:bg-neo-dark-bg text-black dark:text-white font-display font-bold text-[10px] uppercase border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                  >
                    SELECT NONE
                  </button>
                  <span className="font-mono text-[10px] text-gray-500 font-bold">
                    {selectedLogs.length} SELECTED
                  </span>
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-400 text-black font-display font-black text-xs uppercase border-2 border-black hover:bg-red-500 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>DELETE ({selectedLogs.length})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="sort-buttons-group flex border-2 border-black shrink-0">
                <button
                  onClick={() => setSortOrder('newest')}
                  className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                >
                  NEWEST
                </button>
                <button
                  onClick={() => setSortOrder('oldest')}
                  className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}
                >
                  OLDEST
                </button>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <NeoDropdown
                  id="fuel-filter-month"
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  options={monthOptions}
                  compact
                  className="w-24"
                />
                <NeoDropdown
                  id="fuel-filter-year"
                  value={selectedYear}
                  onChange={setSelectedYear}
                  options={yearOptions}
                  compact
                  className="w-24"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fuel Summary Card */}
      {vehicleHistoricalLogs.length > 0 && (
        <div 
          id="fuel-summary-card" 
          className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex flex-col gap-3"
        >
          <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2">
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-neo-accent" />
              <h3 className="font-display font-black text-xs sm:text-sm uppercase text-black dark:text-white tracking-wider">
                Fuel Performance Summary
              </h3>
            </div>
            <span className="font-mono text-[10px] text-gray-400 font-bold uppercase">
              {selectedVehicleName}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col justify-between items-center text-center p-2.5 bg-neo-bg dark:bg-neo-dark-bg border-2 border-black">
              <span className="font-display font-black text-[9px] sm:text-[10px] text-gray-400 uppercase leading-none mb-1">
                Avg Economy
              </span>
              <div className="flex flex-col items-center">
                <span className="font-mono font-black text-sm sm:text-lg text-black dark:text-white leading-none">
                  {avgFuelEconomy > 0 ? `${formatNumber(avgFuelEconomy, 2)}` : 'N/A'}
                </span>
                <span className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-1 font-semibold">
                  {avgFuelEconomy > 0 ? 'KM / LITRE' : 'Needs 2+ fills'}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between items-center text-center p-2.5 bg-neo-bg dark:bg-neo-dark-bg border-2 border-black">
              <span className="font-display font-black text-[9px] sm:text-[10px] text-gray-400 uppercase leading-none mb-1">
                Total Fuel
              </span>
              <div className="flex flex-col items-center">
                <span className="font-mono font-black text-sm sm:text-lg text-black dark:text-white leading-none">
                  {formatNumber(totalLitres, 1)}L
                </span>
                <span className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-1 font-semibold">
                  VOLUME FILLED
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between items-center text-center p-2.5 bg-neo-bg dark:bg-neo-dark-bg border-2 border-black">
              <span className="font-display font-black text-[9px] sm:text-[10px] text-gray-400 uppercase leading-none mb-1">
                Total Spend
              </span>
              <div className="flex flex-col items-center w-full">
                <span className="font-mono font-black text-sm sm:text-lg text-black dark:text-white leading-none truncate w-full">
                  {formatCurrency(totalHistoricalSpend, currency)}
                </span>
                <span className="font-sans text-[8px] sm:text-[9px] text-gray-400 mt-1 font-semibold">
                  TOTAL SPENT
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fuel Logs Grid/List */}
      {filteredLogs.length === 0 ? (
        <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-12 neo-shadow dark:neo-shadow-dark text-center py-16">
          <Flame className="w-12 h-12 text-gray-300 dark:text-gray-700 animate-pulse mx-auto mb-3" />
          <h3 className="font-display font-bold text-lg uppercase mb-1">No Fuel Entries</h3>
          <p className="font-sans text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Log your first fuel purchase fill-up to view efficiency logs, price calculations, and receipt attachments.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLogs.map(log => (
            <div
              key={log.id}
              className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-2.5 sm:p-3 neo-shadow dark:neo-shadow-dark flex flex-col justify-between transition-colors ${selectedLogs.includes(log.id) ? 'selected-card bg-orange-50 dark:bg-orange-900/20' : ''}`}
            >
              <div>
                {/* Header info */}
                <div className="flex items-start justify-between border-b border-black/10 dark:border-white/10 pb-1.5 mb-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedLogs.includes(log.id)}
                      onChange={() => toggleSelectLog(log.id)}
                      className="w-3.5 h-3.5 mt-0.5 accent-neo-accent cursor-pointer rounded-sm border-2 border-black shrink-0"
                    />
                    <div className="flex flex-col leading-none">
                      <span className="font-display font-black text-xs uppercase text-neo-accent leading-none">
                        {getVehicleName(log.vehicleId)}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-400 font-mono mt-1">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>{formatDate(log.date)}</span>
                      </div>
                      {getJourneyName(log.journeyId) && (
                        <span className="journey-badge-pill inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 bg-pink-400 border border-black text-black text-[8px] font-bold uppercase leading-none w-fit">
                          <MapPin className="w-2.5 h-2.5" /> {getJourneyName(log.journeyId)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(log.receiptId || log.receiptImage) && (
                      <button
                        id={`btn-view-receipt-${log.id}`}
                        onClick={() => handleViewReceipt(log.receiptId || '', log.receiptImage)}
                        className="p-1 border-2 border-black bg-neo-accent-yellow hover:bg-yellow-400 text-black rounded neo-shadow-sm active:translate-y-[1px]"
                        title="View Scanned Receipt Image"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      id={`btn-edit-log-${log.id}`}
                      onClick={() => {
                        onEditLog && onEditLog(log);
                      }}
                      className="p-1 border-2 border-black bg-blue-300 hover:bg-blue-400 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer"
                      title="Edit fuel record"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      id={`btn-delete-log-${log.id}`}
                      onClick={() => {
                        setDeleteConfirmId(log.id);
                        setIsConfirmOpen(true);
                      }}
                      className="p-1 border-2 border-black bg-red-400 hover:bg-red-500 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer"
                      title="Delete fuel record"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Grid stats */}
                <div className="grid grid-cols-3 gap-0.5 bg-neo-bg dark:bg-neo-dark-bg p-1 border-2 border-black mb-2">
                  <div className="text-center">
                    <div className="font-display font-bold text-[9px] text-gray-400 uppercase leading-none">COST</div>
                    <div className="font-mono font-black text-xs sm:text-sm text-black dark:text-white mt-0.5">
                      {formatCurrency(log.cost, currency)}
                    </div>
                  </div>
                  <div className="text-center border-x border-black/10 dark:border-white/10">
                    <div className="font-display font-bold text-[9px] text-gray-400 uppercase leading-none">LITRES</div>
                    <div className="font-mono font-black text-xs sm:text-sm text-black dark:text-white mt-0.5">
                      {formatNumber(log.litres, 2)}L
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-display font-bold text-[9px] text-gray-400 uppercase leading-none">RATE</div>
                    <div className="font-mono font-black text-xs sm:text-sm text-black dark:text-white mt-0.5">
                      {formatCurrency(log.pricePerLitre, currency, 3)}/L
                    </div>
                  </div>
                </div>

                {/* Subtext info - labels shrink, values expand and align right */}
                <div className="flex flex-col gap-0.5 text-[11px] sm:text-xs">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <span className="text-gray-400 shrink-0">Odometer:</span>
                    <span className="font-mono font-semibold text-right">
                      {log.odometer !== null && log.odometer !== undefined ? `${log.odometer.toLocaleString()} km` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <span className="text-gray-400 shrink-0">Efficiency:</span>
                    <span className="font-mono font-bold text-green-600 dark:text-green-400 text-right">
                      {log.mileageSinceLast ? `${formatNumber(log.mileageSinceLast, 2)} KM/L` : 'Needs previous fill log'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-400 mt-1 border-t border-black/5 dark:border-white/5 pt-0.5 max-w-full">
                    <MapPin className="w-3 h-3 text-neo-accent shrink-0" />
                    <span className="truncate italic">Station: {log.station}</span>
                    {log.fullTank && (
                      <span id="fuel-full-tank-badge" className="m3-custom-badge ml-auto px-1 py-0.5 border border-black bg-green-200 text-black text-[8px] font-black leading-none uppercase shrink-0">
                        FULL
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {log.notes && (
                <p className="entry-notes-box fuel-log-notes">
                  "{log.notes}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL: RECEIPT PREVIEW */}
      <ReceiptViewer
        isOpen={isReceiptModalOpen}
        onClose={() => { setIsReceiptModalOpen(false); setActiveReceiptImage(null); }}
        imageUri={activeReceiptImage}
      />

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          if (deleteConfirmId === 'bulk') {
            selectedLogs.forEach(async (id) => {
              const log = fuelLogs.find(l => l.id === id);
              if (log && log.receiptId) {
                await dbAPI.deleteScannedReceipt(log.receiptId);
              }
              await dbAPI.deleteFuelLog(id);
            });
            setSelectedLogs([]);
            onLogDeleted('bulk');
          } else if (deleteConfirmId) {
            handleDelete(deleteConfirmId);
          }
          setIsConfirmOpen(false);
        }}
        title="Confirm Deletion"
        message={deleteConfirmId === 'bulk' ? `Are you sure you want to delete all ${selectedLogs.length} selected fuel logs? This cannot be undone.` : "Are you sure you want to delete this fuel log? This cannot be undone."}
        confirmText="DELETE"
        cancelText="CANCEL"
      />
    </div>
  );
}
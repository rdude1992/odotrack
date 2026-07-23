/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Vehicle, Trip, TripPurpose, Journey } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatNumber, normalizeTripPurpose } from '../utils';
import ConfirmModal from './ConfirmModal';
import NeoModal from './NeoModal';
import { useToast } from './ToastContext';
import NeoDropdown from './NeoDropdown';
import {
  Plus,
  Play,
  CheckCircle2,
  Trash2,
  MapPin,
  Activity,
  Calendar,
  Clock,
  TrendingUp,
  Briefcase,
  Smile,
  Navigation,
  FileText,
  Edit2,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  ArrowLeftRight
} from 'lucide-react';

interface TripsProps {
  vehicles: Vehicle[];
  trips: Trip[];
  journeys?: Journey[];
  selectedVehicleId: string | 'all';
  onTripAdded: () => void;
  onTripDeleted: (id: string) => void;
  activeTripIdToFinishDirectly: string | null;
  onClearDirectFinishTrigger: () => void;
  onEditTrip?: (trip: Trip) => void;
  onAddClick?: () => void;
}

const TRIP_PURPOSE_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business / Commercial' },
  { value: 'commute', label: 'Work Commute' },
  { value: 'other', label: 'Other' }
];

export default function TripsLog({
  vehicles,
  trips,
  journeys = [],
  selectedVehicleId,
  onTripAdded,
  onTripDeleted,
  activeTripIdToFinishDirectly,
  onClearDirectFinishTrigger,
  onEditTrip,
  onAddClick
}: TripsProps) {
  const { showToast } = useToast();
  const getJourneyName = (journeyId?: string | null) => journeys.find(j => j.id === journeyId)?.name || null;
  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));
  
  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(mins / 1440);
    const rem = mins % 1440;
    const h = Math.floor(rem / 60);
    const m = rem % 60;
    let result = `${d}d`;
    if (h > 0) result += ` ${h}h`;
    if (m > 0) result += ` ${m}m`;
    return result;
  };
  
  // Modal states
  const [isFinishTripModalOpen, setIsFinishTripModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDiscardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isBreakdownCollapsed, setIsBreakdownCollapsed] = useState(true);

  // Track scroll to shrink pinned cards
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Finish live trip form states
  const [finishingTrip, setFinishingTrip] = useState<Trip | null>(null);
  const [finishEndOdo, setFinishEndOdo] = useState('');
  const [finishEndDate, setFinishEndDate] = useState('');
  const [finishEndTime, setFinishEndTime] = useState('');
  const [finishNotes, setFinishNotes] = useState('');

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
    ...Array.from(new Set(trips.map(t => t.startDate.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a))
      .map(y => ({ value: y, label: y })),
  ];

  // Filtered trips
  const filteredTrips = trips
    .filter(t => selectedVehicleId === 'all' ? true : t.vehicleId === selectedVehicleId)
    .filter(t => selectedMonth === 'all' ? true : t.startDate.slice(5, 7) === selectedMonth)
    .filter(t => selectedYear === 'all' ? true : t.startDate.slice(0, 4) === selectedYear)
    .filter(t => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase().trim();
      const destMatch = t.destination ? t.destination.toLowerCase().includes(query) : false;
      const notesMatch = t.notes ? t.notes.toLowerCase().includes(query) : false;
      const sourceMatch = t.source ? t.source.toLowerCase().includes(query) : false;
      return destMatch || notesMatch || sourceMatch;
    })
    .sort((a, b) => {
      // Put active trips first, then sort by date/time
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      const dateA = new Date(`${a.startDate}T${a.startTime || '00:00'}`).getTime();
      const dateB = new Date(`${b.startDate}T${b.startTime || '00:00'}`).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  const totalDistance = filteredTrips
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

  // Handle direct finish trigger from parent (Dashboard)
  useEffect(() => {
    if (activeTripIdToFinishDirectly) {
      const match = trips.find(t => t.id === activeTripIdToFinishDirectly);
      if (match) {
        handleTriggerFinishTrip(match);
      }
      onClearDirectFinishTrigger();
    }
  }, [activeTripIdToFinishDirectly, trips, onClearDirectFinishTrigger]);

  // Trigger Finish Dialog for active trip
  const handleTriggerFinishTrip = (trip: Trip) => {
    setFinishingTrip(trip);
    // Suggest end odo based on start + a small default or current vehicle odo
    const v = vehicles.find(x => x.id === trip.vehicleId);
    setFinishEndOdo(v ? String(v.odometer) : String(trip.startOdo));
    // Pre-fill end date and time with current local time
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    setFinishEndDate(`${year}-${month}-${day}`);
    setFinishEndTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setFinishNotes(trip.notes || '');
    setIsFinishTripModalOpen(true);
  };

  // Open discard confirmation dialog
  const handleOpenDiscardConfirm = () => {
    setDiscardConfirmOpen(true);
  };

  // Discard live trip — deletes it entirely
  const handleDiscardTrip = async () => {
    if (!finishingTrip) return;
    await dbAPI.deleteTrip(finishingTrip.id);
    onTripDeleted(finishingTrip.id);
    showToast('Live trip discarded and removed.', 'deleted');
    setDiscardConfirmOpen(false);
    setIsFinishTripModalOpen(false);
    setFinishingTrip(null);
  };

  // Submit ending for live trip
  const handleFinishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishingTrip || !finishEndOdo) return;

    const endOdoNum = parseFloat(finishEndOdo);
    if (endOdoNum < finishingTrip.startOdo) {
      alert(`End odometer cannot be less than start odometer (${finishingTrip.startOdo} km).`);
      return;
    }

    // Compute elapsed time in minutes using finish end time (or current time if empty)
    let elapsedMinutes = 0;
    const endDStr = finishEndDate || finishingTrip.startDate;
    const [eYear, eMonth, eDay] = endDStr.split('-').map(Number);

    if (finishingTrip.startTime) {
      const [year, month, day] = finishingTrip.startDate.split('-').map(Number);
      const [sHours, sMinutes] = finishingTrip.startTime.split(':').map(Number);
      const startDateTime = new Date(year, month - 1, day, sHours, sMinutes);

      let endDateTime: Date;
      if (finishEndTime) {
        const [eHours, eMinutes] = finishEndTime.split(':').map(Number);
        endDateTime = new Date(eYear, eMonth - 1, eDay, eHours, eMinutes);
      } else {
        endDateTime = new Date();
      }

      const elapsedMs = endDateTime.getTime() - startDateTime.getTime();
      elapsedMinutes = Math.max(1, Math.floor(elapsedMs / (1000 * 60)));
    } else {
      const [year, month, day] = finishingTrip.startDate.split('-').map(Number);
      const startDateTime = new Date(year, month - 1, day, 0, 0);
      const elapsedMs = Date.now() - startDateTime.getTime();
      elapsedMinutes = Math.max(1, Math.floor(elapsedMs / (1000 * 60)));
    }

    const updatedTrip: Trip = {
      ...finishingTrip,
      endDate: finishEndDate || null,
      endOdo: endOdoNum,
      endTime: finishEndTime || null,
      status: 'completed',
      elapsedMinutes,
      notes: finishNotes
    };

    await dbAPI.saveTrip(updatedTrip);

    showToast('Live trip tracking completed and logged!', 'success');

    setIsFinishTripModalOpen(false);
    setFinishingTrip(null);
    onTripAdded();
  };

  // Breakdown statistics by Purpose category (Distance driven)
  const getBreakdownData = () => {
    const categoryTotals: Record<TripPurpose, number> = {
      business: 0,
      personal: 0,
      commute: 0,
      other: 0
    };

    const filterVehicle = (tId: string) => selectedVehicleId === 'all' ? true : tId === selectedVehicleId;
    const completedTrips = trips.filter(t => t.status === 'completed' && filterVehicle(t.vehicleId));

    let totalDistance = 0;
    for (const t of completedTrips) {
      const distance = parseFloat(((t.endOdo || 0) - t.startOdo).toFixed(1));
      if (distance > 0) {
        const purposeKey = normalizeTripPurpose(t.purpose);
        categoryTotals[purposeKey] = parseFloat((categoryTotals[purposeKey] + distance).toFixed(1));
        totalDistance = parseFloat((totalDistance + distance).toFixed(1));
      }
    }

    return Object.entries(categoryTotals).map(([key, val]) => {
      const pct = totalDistance > 0 ? (val / totalDistance) * 100 : 0;
      return {
        purpose: key as TripPurpose,
        distance: val,
        percentage: parseFloat(pct.toFixed(1))
      };
    }).sort((a, b) => b.distance - a.distance);
  };

  const breakdownStats = getBreakdownData();
  const getPurposeIconAndColor = (purpose: TripPurpose) => {
    switch (purpose) {
      case 'business':
        return { icon: <Briefcase className="w-3.5 h-3.5" color="black" />, color: 'bg-neo-accent', text: 'Business' };
      case 'personal':
        return { icon: <Smile className="w-3.5 h-3.5" color="black" />, color: 'bg-neo-accent-yellow', text: 'Personal' };
      case 'commute':
        return { icon: <Navigation className="w-3.5 h-3.5" color="black" />, color: 'bg-neo-accent-green', text: 'Commute' };
      default:
        return { icon: <FileText className="w-3.5 h-3.5" color="black" />, color: 'bg-gray-400', text: 'Other' };
    }
  };

  const getVehicleName = (id: string) => {
    return vehicles.find(v => v.id === id)?.name || 'Unknown';
  };

  const toggleSelectTrip = (id: string) => {
    setSelectedTrips(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (selectedTrips.length === 0) return;
    setDeleteConfirmId('bulk');
    setIsConfirmOpen(true);
  };

  const selectAll = () => {
    setSelectedTrips(filteredTrips.filter(t => t.status === 'completed').map(t => t.id));
  };

  const selectNone = () => {
    setSelectedTrips([]);
  };

  return (
    <div className="w-full flex flex-col gap-4 select-none">

      {/* Sticky Header + Controls Wrapper */}
      <div className="sticky top-[54px] sm:top-[58px] z-20 space-y-2 bg-neo-bg dark:bg-neo-dark-bg pb-2 pt-1">
        {/* Header Card */}
        <div id="trips-header-card" className={`bg-neo-accent border-2 border-black neo-shadow transition-all duration-300 flex items-center justify-between ${isScrolled ? 'px-3 py-1.5' : 'px-3.5 py-2 sm:px-4 sm:py-2.5'}`}>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-sm sm:text-base leading-none' : 'text-base sm:text-lg'}`}>Trip Tracker</h2>
            <span className="bg-black text-white font-mono font-bold text-[9px] leading-none px-1.5 py-0.5 border border-black/50 shrink-0">
              {trips.filter(t => t.status === 'completed' && (selectedVehicleId === 'all' || t.vehicleId === selectedVehicleId)).length} LOGS
            </span>
          </div>
          <span className={`font-mono font-black text-black bg-white border-2 border-black px-2 py-0.5 leading-none transition-all ${isScrolled ? 'text-xs' : 'text-xs sm:text-sm'}`}>
            {totalDistance.toFixed(0)} KM
          </span>
        </div>
        {/* Controls Card */}
        <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark transition-all duration-300 ${isScrolled ? 'p-2' : 'p-4'} flex flex-col gap-3`}>
          {/* Search bar */}
          <div className="relative w-full">
            <input
              type="text"
              id="trip-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trips by destination or notes..."
              className="w-full p-2.5 sm:p-2 pl-9 pr-8 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg text-black dark:text-white font-sans text-xs focus:outline-none focus:border-neo-accent"
            />
            <Search className="w-4 h-4 text-gray-500 dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                id="btn-clear-search"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black dark:hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer font-bold"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {selectedTrips.length > 0 ? (
            <div className="flex flex-col gap-2">
              {/* Top row: Sort + Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="sort-buttons-group flex border-2 border-black shrink-0">
                  <button
                    onClick={() => setSortOrder('newest')}
                    className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10'}`}
                  >
                    NEWEST
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10'}`}
                  >
                    OLDEST
                  </button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NeoDropdown
                    id="trip-filter-month"
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthOptions}
                    compact
                    className="w-24"
                  />
                  <NeoDropdown
                    id="trip-filter-year"
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
                    {selectedTrips.length} SELECTED
                  </span>
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-400 text-black font-display font-black text-xs uppercase border-2 border-black hover:bg-red-500 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>DELETE ({selectedTrips.length})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="sort-buttons-group flex border-2 border-black shrink-0">
                <button
                  onClick={() => setSortOrder('newest')}
                  className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10'}`}
                >
                  NEWEST
                </button>
                <button
                  onClick={() => setSortOrder('oldest')}
                  className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10'}`}
                >
                  OLDEST
                </button>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <NeoDropdown
                  id="trip-filter-month"
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  options={monthOptions}
                  compact
                  className="w-24"
                />
                <NeoDropdown
                  id="trip-filter-year"
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

      {/* 2. Breakdown and logs split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Category breakdown sidebar column */}
        <div className={`${isBreakdownCollapsed ? 'lg:col-span-1 h-fit' : 'lg:col-span-1'} bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 neo-shadow dark:neo-shadow-dark flex flex-col transition-all duration-300`}>
          <div 
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsBreakdownCollapsed(!isBreakdownCollapsed)}
          >
            <div>
              <h3 className="font-display font-black text-sm uppercase tracking-wider">Purpose Breakdown</h3>
              {!isBreakdownCollapsed && (
                <p className="font-sans text-[10px] text-gray-400">Percentage splits based on distance driven</p>
              )}
            </div>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsBreakdownCollapsed(!isBreakdownCollapsed); }}
              className="p-1 border border-black dark:border-white bg-neo-accent hover:bg-neo-accent-hover text-black rounded cursor-pointer shrink-0"
              title={isBreakdownCollapsed ? "Expand Breakdown" : "Collapse Breakdown"}
            >
              {isBreakdownCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {!isBreakdownCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden flex flex-col gap-2.5 mt-3"
              >
                {breakdownStats.map(stat => {
                  const details = getPurposeIconAndColor(stat.purpose);
                  return (
                    <div key={stat.purpose} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase font-display">
                        <div className="flex items-center gap-1.5">
                          <div className={`p-0.5 border border-black text-black dark:text-black ${details.color}`}>
                            {details.icon}
                          </div>
                          <span>{details.text}</span>
                        </div>
                        <span className="font-mono text-[10px]">{stat.distance.toLocaleString()} km ({stat.percentage}%)</span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full h-2 bg-neo-bg dark:bg-zinc-800 border border-black">
                        <div
                          style={{ width: `${stat.percentage}%` }}
                          className={`h-full border-r border-black ${details.color}`}
                        />
                      </div>
                    </div>
                  );
                })}

                {trips.filter(t => t.status === 'completed').length === 0 && (
                  <p className="text-center text-[11px] text-gray-400 py-6 italic">Log completed trips to see charts.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Trips logs main columns */}
        <div className={`${isBreakdownCollapsed ? 'lg:col-span-3' : 'lg:col-span-2'} flex flex-col gap-4`}>
          {filteredTrips.length === 0 ? (
            <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-12 neo-shadow dark:neo-shadow-dark text-center py-16">
              <Activity className="w-12 h-12 text-gray-300 dark:text-gray-700 animate-pulse mx-auto mb-3" />
              <h3 className="font-display font-bold text-lg uppercase mb-1">No Travel Records</h3>
              <p className="font-sans text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                No trips logged yet. Start a live session timer or add odometer readings for tax or personal logs.
              </p>
            </div>
          ) : (
            filteredTrips.map(trip => {
              const normalizedPurpose = normalizeTripPurpose(trip.purpose);
              const details = getPurposeIconAndColor(normalizedPurpose);
              const isCompleted = trip.status === 'completed';
              const distance = isCompleted ? parseFloat(((trip.endOdo || 0) - trip.startOdo).toFixed(1)) : 0;

              return (
                <div
                  key={trip.id}
                  className={`border-2 border-black dark:border dark:border-white p-2.5 sm:p-3 neo-shadow dark:neo-shadow-dark flex flex-col gap-2 transition-colors ${selectedTrips.includes(trip.id) ? 'selected-card' : ''} ${isCompleted
                    ? (selectedTrips.includes(trip.id) ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-white dark:bg-neo-dark-card')
                    : (selectedTrips.includes(trip.id) ? 'bg-orange-400 text-black live-trip-card' : 'bg-neo-accent-yellow text-black live-trip-card')
                    }`}
                >
                  {/* Compact Header row with Checkbox, details, and Edit/Delete Actions */}
                  <div className="flex items-start justify-between border-b border-black/10 dark:border-white/10 pb-1.5">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTrips.includes(trip.id)}
                        onChange={() => toggleSelectTrip(trip.id)}
                        className="w-3.5 h-3.5 mt-0.5 accent-neo-accent cursor-pointer rounded-sm border-2 border-black shrink-0"
                      />
                      <div className="flex flex-col leading-none">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`m3-custom-badge px-1 py-0.5 border border-black text-[8px] font-extrabold uppercase rounded ${details.color} text-black leading-none`}>
                            {details.text}
                          </span>
                          <span className="font-display font-black text-[12px] sm:text-[13px] uppercase text-neo-accent leading-none">
                            {getVehicleName(trip.vehicleId)}
                          </span>
                          {trip.isRoundTrip && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 border border-black text-[8px] font-extrabold uppercase rounded bg-purple-200 dark:bg-purple-900 text-purple-950 dark:text-purple-100 leading-none">
                              <ArrowLeftRight className="w-2 h-2 shrink-0" /> To & Fro
                            </span>
                          )}
                          {!isCompleted && (
                            <span className="flex h-1.5 w-1.5 rounded-full bg-red-600 animate-ping ml-0.5" />
                          )}
                        </div>
                        {/* Meta dates/times */}
                        <div className={`flex flex-col gap-0.5 text-[10px] sm:text-[11px] font-mono mt-1 ${isCompleted ? 'text-gray-500 dark:text-gray-400' : 'text-black/75'}`}>
                          {(!trip.endDate || trip.endDate === trip.startDate) ? (
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{formatDate(trip.startDate)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>
                                  {trip.startTime || '--:--'}
                                  {trip.endTime ? ` - ${trip.endTime}` : ''}
                                  {isCompleted && trip.elapsedMinutes ? ` (${formatDuration(trip.elapsedMinutes)})` : ''}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-gray-400 dark:text-gray-500 text-[9px] uppercase tracking-wider w-8">Start:</span>
                                <Calendar className="w-3 h-3 shrink-0 text-gray-400" />
                                <span className="mr-1">{formatDate(trip.startDate)}</span>
                                <Clock className="w-3 h-3 shrink-0 text-gray-400" />
                                <span>{trip.startTime || '--:--'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-gray-400 dark:text-gray-500 text-[9px] uppercase tracking-wider w-8">End:</span>
                                <Calendar className="w-3 h-3 shrink-0 text-gray-400" />
                                <span className="mr-1">{formatDate(trip.endDate)}</span>
                                <Clock className="w-3 h-3 shrink-0 text-gray-400" />
                                <span>{trip.endTime || '--:--'}</span>
                                {isCompleted && trip.elapsedMinutes && (
                                  <span className="text-purple-600 dark:text-purple-400 font-bold ml-1">({formatDuration(trip.elapsedMinutes)})</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {getJourneyName(trip.journeyId) && (
                          <span className="journey-badge-pill inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 bg-pink-400 border border-black text-black text-[8px] font-bold uppercase leading-none w-fit">
                            <MapPin className="w-2.5 h-2.5" /> {getJourneyName(trip.journeyId)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons on the top right */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        id={`btn-edit-trip-${trip.id}`}
                        onClick={() => {
                          onEditTrip && onEditTrip(trip);
                        }}
                        className="p-1 border-2 border-black bg-blue-300 hover:bg-blue-400 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer transition-colors"
                        title="Edit trip"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        id={`btn-delete-trip-${trip.id}`}
                        onClick={() => {
                          setDeleteConfirmId(trip.id);
                          setIsConfirmOpen(true);
                        }}
                        className="p-1 border-2 border-black bg-red-400 hover:bg-red-500 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer transition-colors"
                        title="Delete trip"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Compact Bottom row with Route Details and Distance/Status - 60:40 split */}
                  <div className="flex items-center gap-2.5">
                    {/* Routing Details (Left side) - 60% */}
                    <div className="min-w-0 w-[60%]">
                      <div className={`font-display font-bold text-[13px] sm:text-[15px] flex items-center gap-1 leading-none min-w-0 ${isCompleted ? 'text-black dark:text-white' : 'text-black'}`}>
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-neo-accent" />
                        <span className="truncate" title={trip.source || 'Start'}>
                          {trip.source || 'Start'}
                        </span>
                        <span className={`${isCompleted ? 'text-gray-400' : 'text-black/45'} text-[11px] font-bold`}>
                          {trip.isRoundTrip ? '⇆' : '➔'}
                        </span>
                        <span className="truncate" title={trip.destination || (isCompleted ? 'End' : 'Ongoing')}>
                          {trip.destination || (isCompleted ? 'End' : 'Ongoing')}
                        </span>
                      </div>
                      {trip.notes && (
                        <p className="entry-notes-box">
                          "{trip.notes}"
                        </p>
                      )}
                    </div>

                    {/* Right side stats/actions (Right side) - 40% */}
                    <div className="w-[40%] flex items-center justify-end gap-3 border-l border-black/10 dark:border-white/10 pl-4">
                      {isCompleted ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="m3-custom-km-box px-1.5 py-0.5 bg-neo-bg dark:bg-zinc-800 border border-black dark:border-white font-mono font-black text-xs sm:text-sm text-black dark:text-white whitespace-nowrap rounded-sm leading-none">
                            +{distance} <span className="text-[10px] sm:text-[11px] font-black text-gray-500 dark:text-gray-400">KM</span>
                          </div>
                          <span className="font-mono text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 font-bold leading-none hidden xs:inline">
                            {trip.startOdo} ➔ {trip.endOdo}
                          </span>
                          <span className="font-mono text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 font-bold leading-none xs:hidden">
                            {trip.startOdo}-{trip.endOdo}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 leading-none">
                          <div className="text-right">
                            <span className="font-display font-bold text-[8px] text-black/60 dark:text-white/60 uppercase block leading-none">START ODO</span>
                            <span className="font-mono font-bold text-[11px] sm:text-[13px] text-black dark:text-white leading-none">{trip.startOdo} km</span>
                          </div>
                          <button
                            id={`btn-finish-trip-${trip.id}`}
                            onClick={() => handleTriggerFinishTrip(trip)}
                            className="px-2.5 py-1 bg-red-500 text-white border-2 border-black font-display font-extrabold text-[10px] uppercase hover:bg-red-600 neo-shadow-sm active:translate-y-[1px] shrink-0 cursor-pointer rounded-sm"
                          >
                            FINISH
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* MODAL: FINISH LIVE TRIP FORM */}
      <NeoModal
        isOpen={isFinishTripModalOpen}
        onClose={() => {
          setIsFinishTripModalOpen(false);
          setFinishingTrip(null);
        }}
        title="Complete Active Trip"
      >
        {finishingTrip && (
          <form onSubmit={handleFinishSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">

            <div className="p-3 bg-neo-accent border-2 border-black text-black">
              <div className="font-display font-black text-sm uppercase">Active Trip Details:</div>
              <p className="text-xs font-semibold mt-1">
                Route: {finishingTrip.source || 'Start'} ➔ {finishingTrip.destination || 'Destination'}
              </p>
              <p className="text-xs font-semibold">
                Start Odo: <span className="font-mono">{finishingTrip.startOdo} km</span> | Started: {finishingTrip.startTime || '--:--'}
              </p>
            </div>

            {/* Ending Odometer */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Final End Odometer (km) *</label>
              <input
                type="number"
                id="form-finish-endodo"
                value={finishEndOdo}
                onChange={(e) => setFinishEndOdo(e.target.value)}
                placeholder="E.g., higher than start odo"
                required
                className="p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono font-black text-lg focus:outline-none text-black dark:text-white"
              />
            </div>

            {/* End Date & End Time Group */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">End Date *</label>
                <input
                  type="date"
                  id="form-finish-enddate"
                  value={finishEndDate}
                  onChange={(e) => setFinishEndDate(e.target.value)}
                  required
                  className="p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">End Time</label>
                <input
                  type="time"
                  id="form-finish-endtime"
                  value={finishEndTime}
                  onChange={(e) => setFinishEndTime(e.target.value)}
                  className="p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Notes / Comment</label>
              <textarea
                id="form-finish-notes"
                value={finishNotes}
                onChange={(e) => setFinishNotes(e.target.value)}
                placeholder="Any client meetings, highway toll costs, or parking codes..."
                rows={2}
                className="p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none resize-none"
              />
            </div>

            {/* Discard Button — full width above save/cancel */}
            <div className="border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
              <button
                type="button"
                id="btn-discard-trip"
                onClick={handleOpenDiscardConfirm}
                className="w-full px-4 py-3 bg-red-400 text-black border-2 border-black font-display font-bold text-xs uppercase hover:bg-red-500 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center mb-3"
              >
                Discard Trip
              </button>

              <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3">
                <button
                  type="button"
                  id="btn-finish-cancel"
                  onClick={() => {
                    setIsFinishTripModalOpen(false);
                    setFinishingTrip(null);
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-finish-submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-green-400 text-black border-2 border-black font-display font-bold text-xs uppercase hover:bg-green-500 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
                >
                  Save & Complete
                </button>
              </div>
            </div>

          </form>
        )}
      </NeoModal>

      {/* Discard trip confirmation */}
      <ConfirmModal
        isOpen={isDiscardConfirmOpen}
        title="Discard Live Trip?"
        message="This will permanently delete this active trip record. This action cannot be undone."
        onConfirm={handleDiscardTrip}
        onCancel={() => setDiscardConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={isConfirmOpen}
        title={deleteConfirmId === 'bulk' ? "Delete Selected Trips" : "Delete Trip Record"}
        message={deleteConfirmId === 'bulk' ? `Are you sure you want to delete ${selectedTrips.length} selected trips?` : "Are you sure you want to delete this trip record? This action cannot be undone."}
        onConfirm={async () => {
          if (deleteConfirmId === 'bulk') {
            const count = selectedTrips.length;
            for (const id of selectedTrips) {
              await dbAPI.deleteTrip(id);
              onTripDeleted(id);
            }
            setSelectedTrips([]);
            showToast(`Deleted ${count} selected trip records successfully.`, 'deleted');
          } else if (deleteConfirmId) {
            await dbAPI.deleteTrip(deleteConfirmId);
            onTripDeleted(deleteConfirmId);
            showToast('Trip record deleted.', 'deleted');
          }
          setDeleteConfirmId(null);
          setIsConfirmOpen(false);
        }}
        onCancel={() => {
          setDeleteConfirmId(null);
          setIsConfirmOpen(false);
        }}
      />

    </div>
  );
}

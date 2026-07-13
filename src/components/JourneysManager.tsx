/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Vehicle, Journey, FuelLog, Trip, Expense } from '../types';
import { dbAPI } from '../db';
import { useToast } from './ToastContext';
import NeoModal from './NeoModal';
import NeoDropdown from './NeoDropdown';
import ConfirmModal from './ConfirmModal';
import { formatCurrency, formatNumber, formatDate, calculateJourneyStats, formatJourneyDateRange, getLocalDateString } from '../utils';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Fuel,
  Navigation,
  CreditCard,
  Compass,
  ChevronRight,
  ArrowLeft,
  Calendar,
  Clock,
  Check,
  X
} from 'lucide-react';

interface JourneysManagerProps {
  vehicles: Vehicle[];
  journeys: Journey[];
  fuelLogs: FuelLog[];
  trips: Trip[];
  expenses: Expense[];
  currency: string;
  selectedVehicleId: string | 'all';
  isOpen: boolean;
  openRequest?: { seq: number; mode: 'list' | 'create' };
  onClose: () => void;
  onJourneysChanged: () => void;
}

export default function JourneysManager({
  vehicles,
  journeys,
  fuelLogs,
  trips,
  expenses,
  currency,
  selectedVehicleId,
  isOpen,
  openRequest,
  onClose,
  onJourneysChanged
}: JourneysManagerProps) {
  const { showToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [editingJourney, setEditingJourney] = useState<Journey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Journey | null>(null);
  const [selectedJourneys, setSelectedJourneys] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleSelectJourney = (id: string) => {
    setSelectedJourneys(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedJourneys(filteredJourneys.map(j => j.id));
  };

  const selectNone = () => {
    setSelectedJourneys([]);
  };

  const handleBulkDelete = async () => {
    if (selectedJourneys.length === 0) return;
    for (const id of selectedJourneys) {
      const journey = journeys.find(j => j.id === id);
      if (journey) {
        await dbAPI.deleteJourney(journey.id);
      }
    }
    setSelectedJourneys([]);
    onJourneysChanged();
    showToast('Selected journeys deleted successfully.', 'success');
  };

  // Form state
  const [formName, setFormName] = useState('');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));

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
    ...Array.from(new Set(journeys.map(l => l.startDate.slice(0, 4))))
      .sort((a, b) => b.localeCompare(a))
      .map(y => ({ value: y, label: y })),
  ];

  // Filtering journeys
  const filteredJourneys = journeys
    .filter(j => selectedVehicleId === 'all' || j.vehicleId === selectedVehicleId)
    .filter(j => selectedMonth === 'all' || j.startDate.slice(5, 7) === selectedMonth)
    .filter(j => selectedYear === 'all' || j.startDate.slice(0, 4) === selectedYear)
    .sort((a, b) => {
      const aTime = new Date(a.startDate).getTime();
      const bTime = new Date(b.startDate).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

  // Calculations for stats breakdown
  const journeysStats = filteredJourneys.map(j => ({
    id: j.id,
    stats: calculateJourneyStats(j.id, fuelLogs, trips, expenses)
  }));

  const totalSpend = journeysStats.reduce((sum, item) => sum + item.stats.totalSpend, 0);
  const totalDistance = journeysStats.reduce((sum, item) => sum + item.stats.distance, 0);
  const totalTripsCount = journeysStats.reduce((sum, item) => sum + item.stats.tripCount, 0);
  const totalFillUpsCount = journeysStats.reduce((sum, item) => sum + item.stats.fillUps, 0);
  
  const fuelCostSum = journeysStats.reduce((sum, item) => sum + item.stats.fuelCost, 0);
  const otherCostSum = journeysStats.reduce((sum, item) => sum + item.stats.otherCost, 0);

  const fuelPercentage = totalSpend > 0 ? Math.round((fuelCostSum / totalSpend) * 100) : 0;
  const otherPercentage = totalSpend > 0 ? (100 - fuelPercentage) : 0;

  const resetForm = () => {
    setFormName('');
    setFormVehicleId(selectedVehicleId !== 'all' ? selectedVehicleId : (vehicles[0]?.id || ''));
    setFormStartDate(getLocalDateString());
    setFormEndDate('');
    setFormNotes('');
  };

  const openCreateForm = () => {
    setEditingJourney(null);
    resetForm();
    setIsFormOpen(true);
  };

  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.mode === 'create') {
      openCreateForm();
    } else {
      setIsFormOpen(false);
      setIsDetailOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.seq]);

  const openEditForm = (journey: Journey) => {
    setEditingJourney(journey);
    setFormName(journey.name);
    setFormVehicleId(journey.vehicleId);
    setFormStartDate(journey.startDate);
    setFormEndDate(journey.endDate || '');
    setFormNotes(journey.notes || '');
    setIsFormOpen(true);
    setIsDetailOpen(false);
  };

  const openDetail = (journeyId: string) => {
    setSelectedJourneyId(journeyId);
    setIsDetailOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formVehicleId || !formStartDate) {
      showToast('Please fill in the journey name, vehicle, and start date.', 'error');
      return;
    }

    const journey: Journey = {
      id: editingJourney?.id || `j-${Date.now()}`,
      vehicleId: formVehicleId,
      name: formName.trim(),
      startDate: formStartDate,
      endDate: formEndDate ? formEndDate : null,
      notes: formNotes || null
    };

    await dbAPI.saveJourney(journey);
    showToast(editingJourney ? 'Journey updated!' : 'Journey created!', 'success');
    onJourneysChanged();
    setIsFormOpen(false);
  };

  const handleDelete = async (journey: Journey) => {
    await dbAPI.deleteJourney(journey.id);
    showToast('Journey deleted. Linked trips/fuel/expenses were kept in their normal logs.', 'success');
    onJourneysChanged();
    setConfirmDelete(null);
    setIsDetailOpen(false);
  };

  const selectedJourney = journeys.find(j => j.id === selectedJourneyId) || null;
  const selectedStats = selectedJourney ? calculateJourneyStats(selectedJourney.id, fuelLogs, trips, expenses) : null;
  const selectedVehicle = selectedJourney ? vehicles.find(v => v.id === selectedJourney.vehicleId) : null;

  return (
    <div className="w-full flex flex-col gap-4 select-none">
      
      {/* Sticky Header — Matches Trips / Fuel exactly */}
      <div className="sticky top-0 z-30 space-y-2">
        <div className={`bg-neo-accent border-2 border-black neo-shadow transition-all duration-300 flex items-center justify-between ${isScrolled ? 'px-3 py-2' : 'px-5 py-3.5'}`}>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-lg leading-none' : 'text-xl'}`}>Journeys</h2>
            <span className="bg-black text-white font-mono font-bold text-[9px] leading-none px-1.5 py-0.5 border border-black/50 shrink-0">
              {filteredJourneys.length} LOGS
            </span>
          </div>
          <span className={`font-mono font-black text-black bg-white border-2 border-black px-2 py-0.5 leading-none transition-all ${isScrolled ? 'text-xs' : 'text-sm'}`}>
            {formatCurrency(totalSpend, currency)}
          </span>
        </div>
        
        {/* Controls Card — Same structure as other pages */}
        <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark transition-all duration-300 ${isScrolled ? 'p-2' : 'p-4'}`}>
          {selectedJourneys.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex border-2 border-black shrink-0">
                  <button onClick={() => setSortOrder('newest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>NEWEST</button>
                  <button onClick={() => setSortOrder('oldest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>OLDEST</button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NeoDropdown
                    id="journey-filter-month"
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthOptions}
                    compact
                    className="w-24"
                  />
                  <NeoDropdown
                    id="journey-filter-year"
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={yearOptions}
                    compact
                    className="w-24"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="px-2.5 py-1.5 bg-black text-white font-display font-bold text-[10px] uppercase border-2 border-black hover:bg-gray-800 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">SELECT ALL</button>
                  <button onClick={selectNone} className="px-2.5 py-1.5 bg-white dark:bg-neo-dark-bg text-black dark:text-white font-display font-bold text-[10px] uppercase border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">SELECT NONE</button>
                  <span className="font-mono text-[10px] text-gray-500 font-bold">{selectedJourneys.length} SELECTED</span>
                </div>
                <button onClick={handleBulkDelete} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-400 text-black font-display font-black text-xs uppercase border-2 border-black hover:bg-red-500 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>DELETE ({selectedJourneys.length})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex border-2 border-black shrink-0">
                  <button onClick={() => setSortOrder('newest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>NEWEST</button>
                  <button onClick={() => setSortOrder('oldest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>OLDEST</button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NeoDropdown
                    id="journey-filter-month"
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthOptions}
                    compact
                    className="w-24"
                  />
                  <NeoDropdown
                    id="journey-filter-year"
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={yearOptions}
                    compact
                    className="w-24"
                  />
                </div>
              </div>
              <button
                onClick={openCreateForm}
                className="flex items-center gap-1.5 px-3 py-2 bg-neo-accent hover:bg-neo-accent-hover text-black font-display font-black text-xs uppercase border-2 border-black neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>New Journey</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Breakdown and Logs Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Category/Spending Breakdown Sidebar Column — Matches TripsLog pattern exactly */}
        <div className="lg:col-span-1 bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-3.5 neo-shadow dark:neo-shadow-dark flex flex-col">
          <h3 className="font-display font-black text-sm uppercase tracking-wider mb-0.5">Journey Breakdown</h3>
          <p className="font-sans text-[10px] text-gray-400 mb-3">Spending and travel summaries across selected logs</p>

          <div className="flex flex-col gap-4">
            {/* Stat summaries */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-black/15 p-2 bg-neo-bg dark:bg-neo-dark-bg/40">
                <span className="block text-[8px] uppercase font-bold text-gray-400">Total Distance</span>
                <span className="font-mono font-black text-sm">{formatNumber(totalDistance, 0)} km</span>
              </div>
              <div className="border border-black/15 p-2 bg-neo-bg dark:bg-neo-dark-bg/40">
                <span className="block text-[8px] uppercase font-bold text-gray-400">Total Trips</span>
                <span className="font-mono font-black text-sm">{totalTripsCount} trips</span>
              </div>
              <div className="border border-black/15 p-2 bg-neo-bg dark:bg-neo-dark-bg/40">
                <span className="block text-[8px] uppercase font-bold text-gray-400">Total Fill-ups</span>
                <span className="font-mono font-black text-sm">{totalFillUpsCount} logs</span>
              </div>
              <div className="border border-black/15 p-2 bg-neo-bg dark:bg-neo-dark-bg/40">
                <span className="block text-[8px] uppercase font-bold text-gray-400">Ongoing Travel</span>
                <span className="font-mono font-black text-sm text-green-500">
                  {filteredJourneys.filter(j => !j.endDate).length} live
                </span>
              </div>
            </div>

            {/* Spending distributions */}
            <div className="border-t border-black/10 dark:border-white/10 pt-3">
              <span className="block text-[10px] uppercase font-bold text-gray-400 mb-2">Spending distribution</span>
              
              <div className="flex flex-col gap-2">
                {/* Fuel Spends Progress */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase font-display">
                    <div className="flex items-center gap-1">
                      <Fuel className="w-3 h-3 text-neo-accent" />
                      <span>Fuel Cost</span>
                    </div>
                    <span className="font-mono">{formatCurrency(fuelCostSum, currency, 0)} ({fuelPercentage}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-neo-bg dark:bg-zinc-800 border border-black">
                    <div style={{ width: `${fuelPercentage}%` }} className="h-full bg-neo-accent border-r border-black" />
                  </div>
                </div>

                {/* Other Spends Progress */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase font-display">
                    <div className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-blue-400" />
                      <span>Other Travel Expenses</span>
                    </div>
                    <span className="font-mono">{formatCurrency(otherCostSum, currency, 0)} ({otherPercentage}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-neo-bg dark:bg-zinc-800 border border-black">
                    <div style={{ width: `${otherPercentage}%` }} className="h-full bg-blue-400 border-r border-black" />
                  </div>
                </div>
              </div>
            </div>

            {filteredJourneys.length === 0 && (
              <p className="text-center text-[11px] text-gray-400 py-4 italic">No journeys matches current filters.</p>
            )}
          </div>
        </div>

        {/* Journeys Main Columns */}
        <div className="lg:col-span-2 flex flex-col gap-3 font-sans text-black dark:text-white">
          {filteredJourneys.length === 0 ? (
            <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-12 neo-shadow dark:neo-shadow-dark text-center py-16">
              <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-700 animate-pulse mx-auto mb-3" />
              <h3 className="font-display font-bold text-lg uppercase mb-1">No Journeys Logged</h3>
              <p className="font-sans text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                No active or past travel journeys matches selected parameters. Create one to associate your logbooks under a unified travel goal.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredJourneys.map(j => {
                const stats = calculateJourneyStats(j.id, fuelLogs, trips, expenses);
                const vehicle = vehicles.find(v => v.id === j.vehicleId);
                const isSelected = selectedJourneys.includes(j.id);
                const isOngoing = !j.endDate;
                
                return (
                  <div
                    key={j.id}
                    className={`border-2 border-black dark:border dark:border-white p-3 neo-shadow dark:neo-shadow-dark flex flex-col gap-2 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/40 ${
                      isSelected 
                        ? 'bg-amber-100 dark:bg-amber-950/20 text-black dark:text-white' 
                        : 'bg-white dark:bg-neo-dark-card'
                    }`}
                    onClick={() => openDetail(j.id)}
                  >
                    <div className="flex items-start justify-between border-b border-black/10 dark:border-white/10 pb-1.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => { e.stopPropagation(); toggleSelectJourney(j.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 mt-0.5 accent-neo-accent cursor-pointer rounded-sm border-2 border-black shrink-0"
                        />
                        <div className="flex flex-col leading-none min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="px-1.5 py-0.5 border border-black text-[8px] font-extrabold uppercase rounded bg-neo-accent-green text-black leading-none">
                              {vehicle?.name || 'Unknown'}
                            </span>
                            {isOngoing && (
                              <span className="px-1.5 py-0.5 bg-green-400 text-black text-[9px] font-bold border border-black shrink-0 animate-pulse leading-none">
                                ONGOING
                              </span>
                            )}
                          </div>
                          <span className="font-display font-black text-[14px] sm:text-[15px] uppercase truncate text-black dark:text-white">{j.name}</span>
                          <div className="flex items-center gap-1 text-[10px] font-mono mt-1 text-gray-500 dark:text-gray-400">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>{formatJourneyDateRange(j)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); openEditForm(j); }} className={`p-1.5 border-2 border-black rounded hover:bg-black/5 cursor-pointer ${isSelected ? 'bg-white text-black' : 'bg-white dark:bg-neo-dark-bg text-gray-500 dark:text-gray-400'}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(j); }} className={`p-1.5 border-2 border-black rounded hover:bg-red-500 hover:text-white cursor-pointer ${isSelected ? 'bg-white text-red-600' : 'bg-white dark:bg-neo-dark-bg text-red-400'}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openDetail(j.id); }} className={`p-1.5 border-2 border-black rounded flex items-center gap-1 cursor-pointer ${isSelected ? 'bg-white text-black' : 'bg-neo-accent text-black font-bold'}`}>
                          <span className="text-[10px] font-display uppercase tracking-wider hidden sm:inline">Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-1.5 font-mono text-[11px]">
                      <span className="text-neo-accent font-bold text-sm leading-none">{formatCurrency(stats.totalSpend, currency, 0)}</span>
                      <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{formatNumber(stats.distance, 0)} km</span>
                      <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{stats.tripCount} trips</span>
                      <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{stats.fillUps} logs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ FORM VIEW MODAL ═══ */}
      <NeoModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingJourney ? 'Edit Journey' : 'New Journey'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Journey Name *</label>
            <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Summer Road Trip" className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-bold text-black dark:text-white" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
            <NeoDropdown
              id="form-journey-vehicle"
              value={formVehicleId}
              onChange={(val) => setFormVehicleId(val)}
              options={vehicleOptions}
              placeholder="-- Select Vehicle --"
              className="w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
              <input type="date" required value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-sm text-black dark:text-white" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider flex items-center justify-between">
                <span>End Date</span>
                <span className="text-[9px] text-gray-400 normal-case font-sans">(leave empty if ongoing)</span>
              </label>
              <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-sm text-black dark:text-white" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Enter details about accommodation, client name, purpose..." rows={3} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none resize-none text-black dark:text-white" />
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg text-black dark:text-white font-display font-bold text-xs uppercase cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Cancel
            </button>
            <button type="submit" className="flex-1 p-3 bg-neo-accent border-2 border-black text-black font-display font-black text-xs uppercase hover:bg-neo-accent-hover transition-colors cursor-pointer">
              {editingJourney ? 'Save Changes' : 'Create Journey'}
            </button>
          </div>
        </form>
      </NeoModal>

      {/* ═══ DETAIL VIEW MODAL ═══ */}
      <NeoModal isOpen={isDetailOpen && selectedJourney !== null} onClose={() => setIsDetailOpen(false)} title={selectedJourney?.name || 'Journey Details'}>
        {selectedJourney && selectedStats && (
          <div className="flex flex-col gap-4 font-sans text-black dark:text-white">
            <div className="bg-black dark:bg-neutral-900 border-2 border-black p-4 flex flex-col gap-1 text-white">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                {selectedVehicle?.name} • {formatJourneyDateRange(selectedJourney)}
              </div>
              <div className="font-display font-black text-3xl">
                {formatCurrency(selectedStats.totalSpend, currency)}
              </div>
              <div className="flex gap-4 mt-1 font-mono text-xs text-gray-300">
                <span>Fuel: {formatCurrency(selectedStats.fuelCost, currency, 0)}</span>
                <span>Other: {formatCurrency(selectedStats.otherCost, currency, 0)}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="border-2 border-black p-2.5 bg-white dark:bg-neo-dark-card text-center">
                <Compass className="w-4 h-4 mx-auto mb-1 text-neo-accent-green" />
                <div className="font-mono font-black text-sm">{formatNumber(selectedStats.distance, 0)}</div>
                <div className="text-[9px] text-gray-400 uppercase">KM</div>
              </div>
              <div className="border-2 border-black p-2.5 bg-white dark:bg-neo-dark-card text-center">
                <Navigation className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                <div className="font-mono font-black text-sm">{selectedStats.tripCount}</div>
                <div className="text-[9px] text-gray-400 uppercase">Trips</div>
              </div>
              <div className="border-2 border-black p-2.5 bg-white dark:bg-neo-dark-card text-center">
                <Fuel className="w-4 h-4 mx-auto mb-1 text-neo-accent" />
                <div className="font-mono font-black text-sm">{selectedStats.fillUps}</div>
                <div className="text-[9px] text-gray-400 uppercase">Fill-ups</div>
              </div>
            </div>

            {selectedJourney.notes && (
              <div className="text-xs text-gray-500 dark:text-gray-400 border-2 border-black/10 dark:border-white/10 p-2 bg-neo-bg dark:bg-neo-dark-bg">
                {selectedJourney.notes}
              </div>
            )}
            
            {/* Linked Trips */}
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1"><Navigation className="w-3 h-3" /> Linked Trips ({selectedStats.linkedTrips.length})</span>
              {selectedStats.linkedTrips.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No trips linked to this journey.</p>
              ) : (
                selectedStats.linkedTrips.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2 border border-black/10 dark:border-white/10 bg-neo-bg dark:bg-neo-dark-bg text-xs">
                    <span className="truncate">{t.source || '—'} → {t.destination || '—'}</span>
                    <span className="font-mono text-gray-400 shrink-0 ml-2">{formatDate(t.startDate)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Linked Fuel Logs */}
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1"><Fuel className="w-3 h-3" /> Linked Fuel Fill-ups ({selectedStats.linkedFuelLogs.length})</span>
              {selectedStats.linkedFuelLogs.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No fuel logs linked to this journey.</p>
              ) : (
                selectedStats.linkedFuelLogs.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-2 border border-black/10 dark:border-white/10 bg-neo-bg dark:bg-neo-dark-bg text-xs">
                    <span className="truncate">{f.station || 'Fuel Station'} • {formatNumber(f.litres, 1)}L</span>
                    <span className="font-mono text-gray-400 shrink-0 ml-2">{formatCurrency(f.cost, currency, 0)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Linked Expenses */}
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Linked Expenses ({selectedStats.linkedExpenses.length})</span>
              {selectedStats.linkedExpenses.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No other expenses linked to this journey.</p>
              ) : (
                selectedStats.linkedExpenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-2 border border-black/10 dark:border-white/10 bg-neo-bg dark:bg-neo-dark-bg text-xs">
                    <span className="truncate">{e.category} • {e.vendor || '—'}</span>
                    <span className="font-mono text-gray-400 shrink-0 ml-2">{formatCurrency(e.cost, currency, 0)}</span>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex gap-2 mt-2 pt-2 border-t border-black/10 dark:border-white/10">
              <button onClick={() => openEditForm(selectedJourney)} className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg text-black dark:text-white font-display font-bold text-xs uppercase cursor-pointer">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => setConfirmDelete(selectedJourney)} className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-red-400 hover:bg-red-500 font-display font-bold text-xs uppercase cursor-pointer text-black">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        )}
      </NeoModal>

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Journey?"
        message={`This deletes "${confirmDelete?.name}" but keeps its linked trips, fuel logs, and expenses in your normal logs — they'll just be unlinked from this journey.`}
        confirmText="Delete"
        danger
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

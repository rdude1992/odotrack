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
  ArrowLeft
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

  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [editingJourney, setEditingJourney] = useState<Journey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Journey | null>(null);
  const [selectedJourneys, setSelectedJourneys] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
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
    setSelectedJourneys(journeys.map(j => j.id));
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
  };


  // Form state
  const [formName, setFormName] = useState('');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formOngoing, setFormOngoing] = useState(true);
  const [formNotes, setFormNotes] = useState('');

  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));

  const visibleJourneys = journeys
    .filter(j => selectedVehicleId === 'all' || j.vehicleId === selectedVehicleId)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const ongoingJourneys = visibleJourneys.filter(j => !j.endDate);
  const completedJourneys = visibleJourneys
    .filter(j => !!j.endDate)
    .sort((a, b) => new Date(b.endDate as string).getTime() - new Date(a.endDate as string).getTime());

  const resetForm = () => {
    setFormName('');
    setFormVehicleId(selectedVehicleId !== 'all' ? selectedVehicleId : (vehicles[0]?.id || ''));
    setFormStartDate(getLocalDateString());
    setFormEndDate('');
    setFormOngoing(true);
    setFormNotes('');
  };

  const openCreateForm = () => {
    setEditingJourney(null);
    resetForm();
    setView('form');
  };

  // Every click of "Add New" / "View All" / the dashed "New" tile on the
  // Dashboard bumps `openRequest.seq`. Keying off the sequence number
  // (rather than a boolean flag) guarantees this always fires on every
  // request, even if the previous request had the same `mode` — a plain
  // boolean like `startInCreateMode` wouldn't re-fire on repeat clicks
  // since React skips effects whose dependencies didn't change value.
  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.mode === 'create') {
      openCreateForm();
    } else {
      setView('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.seq]);

  const openEditForm = (journey: Journey) => {
    setEditingJourney(journey);
    setFormName(journey.name);
    setFormVehicleId(journey.vehicleId);
    setFormStartDate(journey.startDate);
    setFormEndDate(journey.endDate || '');
    setFormOngoing(!journey.endDate);
    setFormNotes(journey.notes || '');
    setView('form');
  };

  const openDetail = (journeyId: string) => {
    setSelectedJourneyId(journeyId);
    setView('detail');
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
      endDate: formOngoing ? null : (formEndDate || null),
      notes: formNotes || null
    };

    await dbAPI.saveJourney(journey);
    showToast(editingJourney ? 'Journey updated!' : 'Journey created!', 'success');
    onJourneysChanged();
    setView(editingJourney ? 'detail' : 'list');
    setSelectedJourneyId(journey.id);
  };

  const handleDelete = async (journey: Journey) => {
    await dbAPI.deleteJourney(journey.id);
    showToast('Journey deleted. Linked trips/fuel/expenses were kept in their normal logs.', 'success');
    onJourneysChanged();
    setConfirmDelete(null);
    setView('list');
  };

  const selectedJourney = journeys.find(j => j.id === selectedJourneyId) || null;
  const selectedStats = selectedJourney ? calculateJourneyStats(selectedJourney.id, fuelLogs, trips, expenses) : null;
  const selectedVehicle = selectedJourney ? vehicles.find(v => v.id === selectedJourney.vehicleId) : null;

  const handleClose = () => {
    setView('list');
    onClose();
  };

  return (
    <div className="w-full flex flex-col gap-4 select-none">
      {view === 'list' && (
        <>
          <div className="sticky top-0 z-30 space-y-2">
            <div className={`bg-rose-300 border-2 border-black neo-shadow transition-all duration-300 flex items-center justify-between ${isScrolled ? 'px-3 py-2' : 'px-5 py-3.5'}`}>
              <div className="flex items-center gap-2 shrink-0 min-w-0">
                <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-lg leading-none' : 'text-xl'}`}>Journeys</h2>
                <span className="bg-black text-white font-mono font-bold text-[9px] leading-none px-1.5 py-0.5 border border-black/50 shrink-0">
                  {visibleJourneys.length} LOGS
                </span>
              </div>
            </div>
            
            <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark transition-all duration-300 ${isScrolled ? 'p-2' : 'p-4'}`}>
              {selectedJourneys.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex border-2 border-black shrink-0">
                      <button onClick={() => setSortOrder('newest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>NEWEST</button>
                      <button onClick={() => setSortOrder('oldest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>OLDEST</button>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex border-2 border-black shrink-0">
                    <button onClick={() => setSortOrder('newest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer ${sortOrder === 'newest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>NEWEST</button>
                    <button onClick={() => setSortOrder('oldest')} className={`px-3 py-2 font-display font-bold text-[10px] uppercase transition-colors cursor-pointer border-l-2 border-black ${sortOrder === 'oldest' ? 'bg-black text-white' : 'bg-white dark:bg-neo-dark-bg text-black dark:text-white hover:bg-black/5'}`}>OLDEST</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 font-sans text-black dark:text-white">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Group trips, fuel fill-ups, and expenses under a named travel (e.g. "Goa Trip") to see their combined cost and distance in one place.
            </p>

            {visibleJourneys.length === 0 && (
              <div className="p-6 border-2 border-black bg-neo-bg dark:bg-neo-dark-bg text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">No journeys yet. Create one before your next trip to track it separately.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {visibleJourneys.map(j => {
                const stats = calculateJourneyStats(j.id, fuelLogs, trips, expenses);
                const vehicle = vehicles.find(v => v.id === j.vehicleId);
                const isSelected = selectedJourneys.includes(j.id);
                
                return (
                  <div
                    key={j.id}
                    className={`border-2 border-black dark:border dark:border-white p-3 neo-shadow dark:neo-shadow-dark flex flex-col gap-2 transition-colors ${isSelected ? 'bg-rose-200 text-black' : 'bg-white dark:bg-neo-dark-card'}`}
                  >
                    <div className="flex items-start justify-between border-b border-black/10 dark:border-white/10 pb-1.5">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => { e.stopPropagation(); toggleSelectJourney(j.id); }}
                          className="w-3.5 h-3.5 mt-0.5 accent-neo-accent cursor-pointer rounded-sm border-2 border-black shrink-0"
                        />
                        <div className="flex flex-col leading-none">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-display font-bold text-[14px] uppercase truncate">{j.name}</span>
                            {!j.endDate && <span className="px-1.5 py-0.5 bg-green-400 text-black text-[9px] font-bold border border-black shrink-0">ONGOING</span>}
                          </div>
                          <div className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-black/80' : 'text-gray-500 dark:text-gray-400'}`}>
                            {vehicle?.name || 'Unknown vehicle'} • {formatJourneyDateRange(j)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); openEditForm(j); }} className={`p-1.5 border-2 border-black rounded hover:bg-black/5 ${isSelected ? 'bg-white text-black' : 'bg-white dark:bg-neo-dark-bg text-gray-500 dark:text-gray-400'}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(j); }} className={`p-1.5 border-2 border-black rounded hover:bg-red-500 hover:text-white ${isSelected ? 'bg-white text-red-600' : 'bg-white dark:bg-neo-dark-bg text-red-400'}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openDetail(j.id); }} className={`p-1.5 border-2 border-black rounded flex items-center gap-1 ${isSelected ? 'bg-white text-black' : 'bg-neo-accent text-black font-bold'}`}>
                          <span className="text-[10px] font-display uppercase tracking-wider hidden sm:inline">Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-1.5 font-mono text-[11px]">
                      <span className="text-neo-accent font-bold text-sm">{formatCurrency(stats.totalSpend, currency, 0)}</span>
                      <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{formatNumber(stats.distance, 0)} km</span>
                      <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{stats.tripCount} trips</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══ FORM VIEW (Create / Edit) ═══ */}
      {view === 'form' && (
        <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white p-4 neo-shadow dark:neo-shadow-dark">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-black text-lg uppercase tracking-wider">{editingJourney ? 'Edit Journey' : 'New Journey'}</h3>
            <button onClick={() => setView(editingJourney ? 'detail' : 'list')} className="p-1 hover:bg-black/5 rounded cursor-pointer">
               <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Journey Name *</label>
              <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Summer Road Trip" className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-bold" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
              <select required value={formVehicleId} onChange={(e) => setFormVehicleId(e.target.value)} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold">
                <option value="">-- Select Vehicle --</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
                <input type="date" required value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider flex items-center justify-between">
                  <span>End Date</span>
                  <span className="text-[9px] text-gray-400 normal-case font-sans">(leave empty if ongoing)</span>
                </label>
                <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-sm" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Notes</label>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setView(editingJourney ? 'detail' : 'list')} className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg font-display font-bold text-xs uppercase cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Cancel
              </button>
              <button type="submit" className="flex-1 p-3 bg-neo-accent border-2 border-black font-display font-black text-xs uppercase hover:bg-orange-600 transition-colors cursor-pointer">
                {editingJourney ? 'Save Changes' : 'Create Journey'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ DETAIL VIEW ═══ */}
      {view === 'detail' && selectedJourney && selectedStats && (
        <div className="bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white p-4 neo-shadow dark:neo-shadow-dark flex flex-col gap-4 font-sans text-black dark:text-white">
          <button onClick={() => setView('list')} className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-black dark:hover:text-white self-start cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> All Journeys
          </button>
          <div className="bg-black dark:bg-neutral-900 border-2 border-black p-4 flex flex-col gap-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">
              {selectedVehicle?.name} • {formatJourneyDateRange(selectedJourney)}
            </div>
            <div className="font-display font-black text-3xl text-white">
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
          {selectedStats.linkedTrips.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1"><Navigation className="w-3 h-3" /> Trips</span>
              {selectedStats.linkedTrips.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 border-2 border-black/10 dark:border-white/10 bg-white dark:bg-neo-dark-card text-xs">
                  <span className="truncate">{t.source || '—'} → {t.destination || '—'}</span>
                  <span className="font-mono text-gray-400 shrink-0 ml-2">{formatDate(t.startDate)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Linked Fuel Logs */}
          {selectedStats.linkedFuelLogs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1"><Fuel className="w-3 h-3" /> Fuel Fill-ups</span>
              {selectedStats.linkedFuelLogs.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 border-2 border-black/10 dark:border-white/10 bg-white dark:bg-neo-dark-card text-xs">
                  <span className="truncate">{f.station || 'Fuel Station'} • {formatNumber(f.litres, 1)}L</span>
                  <span className="font-mono text-gray-400 shrink-0 ml-2">{formatCurrency(f.cost, currency, 0)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Linked Expenses */}
          {selectedStats.linkedExpenses.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Other Expenses</span>
              {selectedStats.linkedExpenses.map(e => (
                <div key={e.id} className="flex items-center justify-between p-2 border-2 border-black/10 dark:border-white/10 bg-white dark:bg-neo-dark-card text-xs">
                  <span className="truncate">{e.category} • {e.vendor || '—'}</span>
                  <span className="font-mono text-gray-400 shrink-0 ml-2">{formatCurrency(e.cost, currency, 0)}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex gap-2 mt-1">
            <button onClick={() => openEditForm(selectedJourney)} className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg font-display font-bold text-xs uppercase cursor-pointer">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => setConfirmDelete(selectedJourney)} className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-red-400 hover:bg-red-500 font-display font-bold text-xs uppercase cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

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

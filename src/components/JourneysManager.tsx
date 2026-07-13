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

  // Support custom back gesture to roll back internal views (detail/form -> list) using native history
  useEffect(() => {
    if (!isOpen) return;

    let poppedByGesture = false;

    const handlePopState = (e: PopStateEvent) => {
      if (view !== 'list') {
        poppedByGesture = true;
        setView('list');
      }
    };

    if (view !== 'list') {
      window.history.pushState({ journeySubView: view }, '');
    }

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!poppedByGesture && view !== 'list') {
        window.history.back();
      }
    };
  }, [isOpen, view]);

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
    <>
      <NeoModal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          view === 'form' ? (editingJourney ? 'Edit Journey' : 'New Journey')
            : view === 'detail' ? (selectedJourney?.name || 'Journey')
            : 'Journeys'
        }
      >
        {/* ═══ LIST VIEW ═══ */}
        {view === 'list' && (
          <div className="flex flex-col gap-3 font-sans text-black dark:text-white">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Group trips, fuel fill-ups, and expenses under a named travel (e.g. "Goa Trip") to see their combined cost and distance in one place.
            </p>

            <button
              onClick={openCreateForm}
              className="flex items-center justify-center gap-2 p-3 bg-neo-accent border-2 border-black font-display font-black text-xs uppercase hover:bg-orange-600 transition-colors cursor-pointer neo-shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Journey
            </button>

            {visibleJourneys.length === 0 && (
              <div className="p-6 border-2 border-black bg-neo-bg dark:bg-neo-dark-bg text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">No journeys yet. Create one before your next trip to track it separately.</p>
              </div>
            )}

            {/* Ongoing journeys — mirrors what's surfaced on the Dashboard */}
            {ongoingJourneys.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-green-400 border border-black rounded-full" /> Ongoing
                </span>
                <div className="flex flex-col gap-2">
                  {ongoingJourneys.map(j => {
                    const stats = calculateJourneyStats(j.id, fuelLogs, trips, expenses);
                    const vehicle = vehicles.find(v => v.id === j.vehicleId);
                    return (
                      <div
                        key={j.id}
                        onClick={() => openDetail(j.id)}
                        className="bg-transparent p-[2.5px] cursor-pointer relative group flex items-stretch"
                      >
                        {/* Clipped Crisp Border Trail */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          <div 
                            className="absolute w-[300%] h-[300%] top-[-100%] left-[-100%] animate-[spin_2s_linear_infinite]"
                            style={{
                              background: `conic-gradient(from 0deg, transparent 20%, var(--accent-color, #ff6b35) 50%, transparent 80%)`
                            }}
                          />
                        </div>

                        {/* Content Layer */}
                        <div className="relative z-10 w-full flex items-center justify-between p-3 bg-white dark:bg-neo-dark-card hover:bg-neo-accent/5 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-sm uppercase truncate">{j.name}</span>
                              <span className="px-1.5 py-0.5 bg-green-400 text-black text-[9px] font-bold border border-black shrink-0">ONGOING</span>
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {vehicle?.name || 'Unknown vehicle'} • {formatJourneyDateRange(j)}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 font-mono text-[11px]">
                              <span className="text-neo-accent font-bold">{formatCurrency(stats.totalSpend, currency, 0)}</span>
                              <span className="text-gray-400">{formatNumber(stats.distance, 0)} km</span>
                              <span className="text-gray-400">{stats.tripCount} trips</span>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed / Historical journeys — not shown on the Dashboard */}
            {completedJourneys.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-display font-bold text-[10px] uppercase text-gray-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-gray-400 border border-black rounded-full" /> Completed / Historical
                </span>
                <div className="flex flex-col gap-2">
                  {completedJourneys.map(j => {
                    const stats = calculateJourneyStats(j.id, fuelLogs, trips, expenses);
                    const vehicle = vehicles.find(v => v.id === j.vehicleId);
                    return (
                      <div
                        key={j.id}
                        onClick={() => openDetail(j.id)}
                        className="flex items-center justify-between p-3 border-2 border-black bg-white dark:bg-neo-dark-card hover:bg-neo-accent/5 cursor-pointer transition-colors opacity-80"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-sm uppercase truncate">{j.name}</span>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {vehicle?.name || 'Unknown vehicle'} • {formatJourneyDateRange(j)}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 font-mono text-[11px]">
                            <span className="text-neo-accent font-bold">{formatCurrency(stats.totalSpend, currency, 0)}</span>
                            <span className="text-gray-400">{formatNumber(stats.distance, 0)} km</span>
                            <span className="text-gray-400">{stats.tripCount} trips</span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ FORM VIEW (Create / Edit) ═══ */}
        {view === 'form' && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Journey Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Goa Trip"
                required
                className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
              <NeoDropdown
                value={formVehicleId}
                onChange={setFormVehicleId}
                options={vehicleOptions}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  required
                  className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  disabled={formOngoing}
                  className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none disabled:opacity-40"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formOngoing}
                onChange={(e) => setFormOngoing(e.target.checked)}
                className="w-4 h-4 accent-neo-accent"
              />
              <span className="text-xs font-bold uppercase">Still ongoing / no end date yet</span>
            </label>

            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Notes</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setView(editingJourney ? 'detail' : 'list')}
                className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg font-display font-bold text-xs uppercase cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Cancel
              </button>
              <button
                type="submit"
                className="flex-1 p-3 bg-neo-accent border-2 border-black font-display font-black text-xs uppercase hover:bg-orange-600 transition-colors cursor-pointer"
              >
                {editingJourney ? 'Save Changes' : 'Create Journey'}
              </button>
            </div>
          </form>
        )}

        {/* ═══ DETAIL VIEW ═══ */}
        {view === 'detail' && selectedJourney && selectedStats && (
          <div className="flex flex-col gap-4 font-sans text-black dark:text-white">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-black dark:hover:text-white self-start cursor-pointer"
            >
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

            {selectedStats.linkedTrips.length === 0 && selectedStats.linkedFuelLogs.length === 0 && selectedStats.linkedExpenses.length === 0 && (
              <div className="p-4 border-2 border-black bg-neo-bg dark:bg-neo-dark-bg text-center text-xs text-gray-500 dark:text-gray-400">
                Nothing linked to this journey yet. When logging a trip, fuel fill-up, or expense for {selectedVehicle?.name}, choose "{selectedJourney.name}" from the Journey field to group it here.
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => openEditForm(selectedJourney)}
                className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg font-display font-bold text-xs uppercase cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => setConfirmDelete(selectedJourney)}
                className="flex-1 flex items-center justify-center gap-1.5 p-3 border-2 border-black bg-red-400 hover:bg-red-500 font-display font-bold text-xs uppercase cursor-pointer"
              >
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
    </>
  );
}

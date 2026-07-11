/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, Trip, TripPurpose, Journey } from '../types';
import { dbAPI } from '../db';
import { formatDate, formatNumber, normalizeTripPurpose, getLocalDateString } from '../utils';
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
  Edit2
} from 'lucide-react';

const TRIP_PURPOSE_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business / Commercial' },
  { value: 'commute', label: 'Work Commute' },
  { value: 'other', label: 'Other' }
];

interface TripLogModalProps {
  vehicles: Vehicle[];
  trips: Trip[];
  journeys?: Journey[];
  selectedVehicleId: string | 'all';
  isOpen: boolean;
  onClose: () => void;
  onTripAdded: () => void;
  onTripDeleted?: (id: string) => void;
  editingTrip?: Trip | null;
}

export default function TripLogModal({
  vehicles,
  trips,
  journeys = [],
  selectedVehicleId,
  isOpen,
  onClose,
  onTripAdded,
  onTripDeleted,
  editingTrip = null
}: TripLogModalProps) {
  const { showToast } = useToast();
  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: v.name }));

  const [tripMode, setTripMode] = useState<'manual' | 'live'>('manual');

  // Form states
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formStartOdo, setFormStartOdo] = useState('');
  const [formEndOdo, setFormEndOdo] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formPurpose, setFormPurpose] = useState<TripPurpose>('personal');
  const [formNotes, setFormNotes] = useState('');
  const [formJourneyId, setFormJourneyId] = useState<string>('');

  // Get previous trip's end odometer reading for a vehicle
  const getPreviousEndOdo = (vehicleId: string): number | null => {
    if (!vehicleId) return null;
    const vehicleTrips = trips.filter(
      t => t.vehicleId === vehicleId && t.endOdo !== null && t.endOdo !== undefined
    );
    if (vehicleTrips.length === 0) return null;

    // Sort descending by startDate, then startTime if equal
    const sorted = [...vehicleTrips].sort((a, b) => {
      const dateA = a.startDate;
      const dateB = b.startDate;
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const timeA = a.startTime || '';
      const timeB = b.startTime || '';
      return timeB.localeCompare(timeA);
    });

    return sorted[0].endOdo ?? null;
  };

  const handleFormVehicleChange = (val: string) => {
    setFormVehicleId(val);
    setFormJourneyId(''); // journeys are vehicle-specific; clear on vehicle switch
    const vehicle = vehicles.find(v => v.id === val);
    if (vehicle && tripMode === 'manual') {
      const prevOdo = getPreviousEndOdo(val);
      if (prevOdo !== null) {
        setFormStartOdo(String(prevOdo));
      } else if (vehicle.odometer) {
        setFormStartOdo(String(vehicle.odometer));
      } else {
        setFormStartOdo('');
      }
    }
  };

  const lastLoadedRef = useRef<string | null | undefined>(undefined);

  // Initialize form when modal opens or editing trip changes
  useEffect(() => {
    if (!isOpen) {
      lastLoadedRef.current = undefined;
      return;
    }

    const currentKey = editingTrip ? editingTrip.id : 'new';
    if (lastLoadedRef.current === currentKey) {
      return; // Already initialized for this trip/session, do not overwrite user's edits!
    }

    lastLoadedRef.current = currentKey;

    if (editingTrip) {
      setFormVehicleId(editingTrip.vehicleId);
      setFormStartDate(editingTrip.startDate);
      setFormEndDate(editingTrip.endDate || '');
      setFormStartTime(editingTrip.startTime || '');
      setFormEndTime(editingTrip.endTime || '');
      setFormStartOdo(editingTrip.startOdo !== null && editingTrip.startOdo !== undefined ? String(editingTrip.startOdo) : '');
      setFormEndOdo(editingTrip.endOdo !== null && editingTrip.endOdo !== undefined ? String(editingTrip.endOdo) : '');
      setFormSource(editingTrip.source || '');
      setFormDestination(editingTrip.destination || '');
      setFormPurpose(normalizeTripPurpose(editingTrip.purpose));
      setTripMode(editingTrip.endOdo !== null && editingTrip.endOdo !== undefined ? 'manual' : 'live');
      setFormNotes(editingTrip.notes || '');
      setFormJourneyId(editingTrip.journeyId || '');
    } else {
      const now = new Date();
      const today = getLocalDateString(now);
      const time = now.toTimeString().slice(0, 5);

      const defaultVehicleId = selectedVehicleId !== 'all' ? selectedVehicleId : (vehicles[0]?.id || '');
      setFormVehicleId(defaultVehicleId);
      setFormStartDate(today);
      setFormEndDate(today);
      setFormStartTime(time);
      setFormEndTime(time);

      const prevOdo = getPreviousEndOdo(defaultVehicleId);
      if (prevOdo !== null) {
        setFormStartOdo(String(prevOdo));
      } else {
        const vehicle = vehicles.find(v => v.id === defaultVehicleId);
        if (vehicle && vehicle.odometer) {
          setFormStartOdo(String(vehicle.odometer));
        } else {
          setFormStartOdo('');
        }
      }

      setFormEndOdo('');
      setFormSource('');
      setFormDestination('');
      setFormPurpose('personal');
      setTripMode('manual');
      setFormNotes('');
      setFormJourneyId('');
    }
  }, [isOpen, editingTrip, selectedVehicleId, vehicles, trips]);

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formVehicleId || !formStartDate || !formStartOdo) {
      alert('Please fill out all required fields.');
      return;
    }

    const vehicle = vehicles.find(v => v.id === formVehicleId);
    const startOdo = parseFloat(formStartOdo);
    const endOdo = formEndOdo ? parseFloat(formEndOdo) : null;

    if (!editingTrip) {
      if (vehicle && endOdo !== null && endOdo < startOdo) {
        alert('End odometer cannot be less than start odometer.');
        return;
      }

      if (vehicle && startOdo < vehicle.odometer) {
        if (!confirm(`Start odometer (${startOdo}) is less than vehicle's current odometer (${vehicle.odometer}). Continue anyway?`)) {
          return;
        }
      }
    }

    const distance = endOdo !== null ? parseFloat((endOdo - startOdo).toFixed(1)) : null;

    if (editingTrip) {
      const updated: Trip = {
        ...editingTrip,
        vehicleId: formVehicleId,
        startDate: formStartDate,
        endDate: tripMode === 'live' ? null : (formEndDate || null),
        startTime: formStartTime,
        endTime: tripMode === 'live' ? null : (formEndTime || null),
        startOdo,
        endOdo: tripMode === 'live' ? null : endOdo,
        source: formSource || null,
        destination: formDestination || null,
        purpose: formPurpose,
        notes: formNotes || null,
        status: tripMode === 'live' ? 'active' : 'completed',
        journeyId: formJourneyId || null,
      };
      await dbAPI.saveTrip(updated);
      showToast('Trip updated successfully!', 'success');
    } else {
      const newTrip: Trip = {
        id: `t-${Date.now()}`,
        vehicleId: formVehicleId,
        startDate: formStartDate,
        endDate: tripMode === 'live' ? null : (formEndDate || null),
        startTime: formStartTime,
        endTime: tripMode === 'live' ? null : (formEndTime || null),
        startOdo,
        endOdo: tripMode === 'live' ? null : endOdo,
        source: formSource || null,
        destination: formDestination || null,
        purpose: formPurpose,
        notes: formNotes || null,
        status: tripMode === 'live' ? 'active' : 'completed',
        journeyId: formJourneyId || null,
      };
      await dbAPI.saveTrip(newTrip);
      showToast(tripMode === 'live' ? 'Live trip tracking started!' : 'Trip logged successfully!', 'success');
    }

    onClose();
    onTripAdded();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingTrip ? "Edit Trip Record" : "Record Trip"}
    >
      <form onSubmit={handleCreateTrip} className="flex flex-col gap-4 font-sans text-black dark:text-white">

        {/* Dual Toggle Mode (Manual vs Live) */}
        <div className="grid grid-cols-2 border-2 border-black bg-neo-bg dark:bg-zinc-800 p-1">
          <button
            type="button"
            id="btn-mode-manual"
            onClick={() => setTripMode('manual')}
            className={`py-2 text-center font-display font-black text-xs uppercase cursor-pointer ${tripMode === 'manual'
              ? 'bg-black text-white border-2 border-black'
              : 'text-black dark:text-white hover:bg-black/5'
              }`}
          >
            Manual Log
          </button>
          <button
            type="button"
            id="btn-mode-live"
            onClick={() => setTripMode('live')}
            className={`py-2 text-center font-display font-black text-xs uppercase cursor-pointer ${tripMode === 'live'
              ? 'bg-black text-white border-2 border-black'
              : 'text-black dark:text-white hover:bg-black/5'
              }`}
          >
            Live Tracker
          </button>
        </div>

        {tripMode === 'live' && (
          <div className="bg-neo-accent-yellow/20 border-2 border-black p-4 flex items-start gap-3 select-none text-black dark:text-white">
            <span className="text-xl">⏱️</span>
            <div>
              <h4 className="font-display font-black text-xs uppercase tracking-wide">Live Session Mode</h4>
              <p className="font-sans text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
                This starts a live travel timer on your dashboard. When you reach your destination, you will enter your ending odometer reading to lock in your final route and tax records.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Vehicle Selector */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle *</label>
            <NeoDropdown
              id="form-trip-vehicle"
              value={formVehicleId}
              onChange={handleFormVehicleChange}
              options={vehicleOptions}
              className="w-full"
            />
          </div>

          {/* Purpose category */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Purpose *</label>
            <NeoDropdown
              id="form-trip-purpose"
              value={formPurpose}
              onChange={(val) => setFormPurpose(val as TripPurpose)}
              options={TRIP_PURPOSE_OPTIONS}
              className="w-full"
            />
          </div>

        </div>

        {journeys.filter(j => j.vehicleId === formVehicleId).length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider text-gray-400">Journey (optional)</label>
            <NeoDropdown
              id="form-trip-journey"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Start Date & End Date */}
          <div className="flex flex-col gap-1">
            {tripMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
                  <input
                    type="date"
                    id="form-trip-date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    required
                    className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    id="form-trip-enddate"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
                <input
                  type="date"
                  id="form-trip-date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  required
                  className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Start Time & End Time (side by side in manual mode) */}
          <div className="flex flex-col gap-1">
            {tripMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">Start Time</label>
                  <input
                    type="time"
                    id="form-trip-time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">End Time</label>
                  <input
                    type="time"
                    id="form-trip-endtime"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <>
                <label className="font-display font-bold text-xs uppercase tracking-wider">Start Time</label>
                <input
                  type="time"
                  id="form-trip-time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
              </>
            )}
          </div>

          {/* Start & End Odometer */}
          <div className="flex flex-col gap-1">
            {tripMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">Start Odo (km) *</label>
                  <input
                    type="number"
                    step="any"
                    id="form-trip-startodo"
                    value={formStartOdo}
                    onChange={(e) => setFormStartOdo(e.target.value)}
                    placeholder="14000"
                    required
                    className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">End Odo (km) *</label>
                  <input
                    type="number"
                    step="any"
                    id="form-trip-endodo"
                    value={formEndOdo}
                    onChange={(e) => setFormEndOdo(e.target.value)}
                    placeholder="14050"
                    required={tripMode === 'manual'}
                    className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono font-bold text-base focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Start Odo (km) *</label>
                <input
                  type="number"
                  step="any"
                  id="form-trip-startodo"
                  value={formStartOdo}
                  onChange={(e) => setFormStartOdo(e.target.value)}
                  placeholder="14000"
                  required
                  className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
              </div>
            )}
          </div>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Source */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Source location</label>
            <input
              type="text"
              id="form-trip-source"
              value={formSource}
              onChange={(e) => setFormSource(e.target.value)}
              placeholder="E.g., Home, Headquarters (Optional)"
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none"
            />
          </div>

          {/* Destination */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Destination location</label>
            <input
              type="text"
              id="form-trip-dest"
              value={formDestination}
              onChange={(e) => setFormDestination(e.target.value)}
              placeholder="E.g., Client Alpha, Office"
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none"
            />
          </div>

        </div>


        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="font-display font-bold text-xs uppercase tracking-wider">Trip Notes</label>
          <textarea
            id="form-trip-notes"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Any comments, travel expense codes, or detours..."
            rows={2}
            className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none resize-none"
          />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
          <button
            type="button"
            id="btn-trip-cancel"
            onClick={handleClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            id="btn-trip-submit"
            className="w-full sm:w-auto px-5 py-2.5 bg-neo-accent border-2 border-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
          >
            {editingTrip ? 'UPDATE TRIP' : (tripMode === 'live' ? 'START LIVE TRIP' : 'SAVE TRIP')}
          </button>
        </div>
      </form>
    </NeoModal>
  );
}
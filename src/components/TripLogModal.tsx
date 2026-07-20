/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
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

const tripLogSchema = z.object({
  tripMode: z.enum(['manual', 'live']),
  vehicleId: z.string().min(1, 'Vehicle is required'),
  startDate: z.string().min(1, 'Start date is required'),
  startTime: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  startOdo: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number({ message: 'Start odometer must be a number' })
      .nonnegative('Start odometer must be a non-negative number')
  ),
  endOdo: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
    z.number({ message: 'End odometer must be a number' })
      .nonnegative('End odometer must be a non-negative number')
      .nullable()
  )
}).refine(data => {
  if (data.tripMode === 'manual') {
    return data.endDate !== undefined && data.endDate !== null && data.endDate !== '';
  }
  return true;
}, {
  message: 'End date is required',
  path: ['endDate']
}).refine(data => {
  if (data.tripMode === 'manual') {
    return data.endOdo !== undefined && data.endOdo !== null;
  }
  return true;
}, {
  message: 'End odometer is required',
  path: ['endOdo']
}).refine(data => {
  if (data.tripMode === 'manual' && data.endOdo !== null && data.startOdo !== undefined) {
    return data.endOdo >= data.startOdo;
  }
  return true;
}, {
  message: 'End odometer cannot be less than start odometer',
  path: ['endOdo']
}).refine(data => {
  if (data.tripMode === 'manual' && data.startDate && data.endDate) {
    return data.endDate >= data.startDate;
  }
  return true;
}, {
  message: 'End date cannot be before start date',
  path: ['endDate']
}).refine(data => {
  if (data.tripMode === 'manual' && data.startDate && data.endDate && data.startDate === data.endDate && data.startTime && data.endTime) {
    return data.endTime >= data.startTime;
  }
  return true;
}, {
  message: 'End time cannot be before start time',
  path: ['endTime']
});

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
  const [formIsRoundTrip, setFormIsRoundTrip] = useState(false);

  // Frequent routes for autofill
  const [frequentRoutes, setFrequentRoutes] = useState<{ source: string; destination: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('odotrack_frequent_routes');
      if (saved) {
        try {
          setFrequentRoutes(JSON.parse(saved));
        } catch (e) {
          setFrequentRoutes([{ source: 'Home', destination: 'Office' }]);
        }
      } else {
        const defaultRoutes = [{ source: 'Home', destination: 'Office' }];
        setFrequentRoutes(defaultRoutes);
        localStorage.setItem('odotrack_frequent_routes', JSON.stringify(defaultRoutes));
      }
    }
  }, [isOpen]);

  const handleSaveFrequentRoute = () => {
    const src = formSource.trim();
    const dest = formDestination.trim();
    if (!src || !dest) {
      showToast('Both Source and Destination must be filled to save as a frequent route.', 'error');
      return;
    }

    const exists = frequentRoutes.some(
      r => r.source.toLowerCase() === src.toLowerCase() && r.destination.toLowerCase() === dest.toLowerCase()
    );
    if (exists) {
      showToast('This route is already saved as a frequent route!', 'info');
      return;
    }

    const updated = [...frequentRoutes, { source: src, destination: dest }];
    setFrequentRoutes(updated);
    localStorage.setItem('odotrack_frequent_routes', JSON.stringify(updated));
    showToast('Saved route to frequent routes!', 'success');
  };

  const handleDeleteFrequentRoute = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = frequentRoutes.filter((_, i) => i !== index);
    setFrequentRoutes(updated);
    localStorage.setItem('odotrack_frequent_routes', JSON.stringify(updated));
    showToast('Removed frequent route.', 'success');
  };

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Real-time validation when fields change
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      const result = tripLogSchema.safeParse({
        tripMode,
        vehicleId: formVehicleId,
        startDate: formStartDate,
        startTime: formStartTime || null,
        endDate: formEndDate || null,
        endTime: formEndTime || null,
        startOdo: formStartOdo,
        endOdo: formEndOdo || null
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
  }, [tripMode, formVehicleId, formStartDate, formStartTime, formEndDate, formEndTime, formStartOdo, formEndOdo]);

  const handleFormVehicleChange = (val: string) => {
    setFormVehicleId(val);
    setFormJourneyId(''); // journeys are vehicle-specific; clear on vehicle switch
    const vehicle = vehicles.find(v => v.id === val);
    if (vehicle) {
      if (vehicle.odometer !== undefined && vehicle.odometer !== null) {
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

    setErrors({}); // Reset validation error state on open

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
      setFormIsRoundTrip(editingTrip.isRoundTrip || false);
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

      const vehicle = vehicles.find(v => v.id === defaultVehicleId);
      if (vehicle && vehicle.odometer !== undefined && vehicle.odometer !== null) {
        setFormStartOdo(String(vehicle.odometer));
      } else {
        setFormStartOdo('');
      }

      setFormEndOdo('');
      setFormSource('');
      setFormDestination('');
      setFormPurpose('personal');
      setTripMode('manual');
      setFormNotes('');
      setFormJourneyId('');
      setFormIsRoundTrip(false);
    }
  }, [isOpen, editingTrip, selectedVehicleId, vehicles, trips]);

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = tripLogSchema.safeParse({
      tripMode,
      vehicleId: formVehicleId,
      startDate: formStartDate,
      startTime: formStartTime || null,
      endDate: formEndDate || null,
      endTime: formEndTime || null,
      startOdo: formStartOdo,
      endOdo: formEndOdo || null
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
    const vehicle = vehicles.find(v => v.id === formVehicleId);
    const startOdo = validatedData.startOdo;
    const endOdo = validatedData.endOdo;

    if (!editingTrip) {
      if (vehicle && startOdo < vehicle.odometer) {
        if (!confirm(`Start odometer (${startOdo}) is less than vehicle's current odometer (${vehicle.odometer}). Continue anyway?`)) {
          return;
        }
      }
    }

    const distance = endOdo !== null ? parseFloat((endOdo - startOdo).toFixed(1)) : null;

    let elapsedMinutes: number | null = null;
    if (tripMode === 'manual' && formStartTime && formEndTime) {
      try {
        const sDate = formStartDate;
        const eDate = formEndDate || formStartDate;
        const [sYear, sMonth, sDay] = sDate.split('-').map(Number);
        const [sHours, sMinutes] = formStartTime.split(':').map(Number);
        const startDateTime = new Date(sYear, sMonth - 1, sDay, sHours, sMinutes);

        const [eYear, eMonth, eDay] = eDate.split('-').map(Number);
        const [eHours, eMinutes] = formEndTime.split(':').map(Number);
        const endDateTime = new Date(eYear, eMonth - 1, eDay, eHours, eMinutes);

        const elapsedMs = endDateTime.getTime() - startDateTime.getTime();
        if (elapsedMs > 0) {
          elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
        }
      } catch (err) {
        console.error('Error calculating elapsed time for manual trip:', err);
      }
    }

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
        elapsedMinutes: tripMode === 'live' ? (editingTrip.elapsedMinutes || null) : elapsedMinutes,
        isRoundTrip: formIsRoundTrip,
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
        elapsedMinutes: tripMode === 'live' ? null : elapsedMinutes,
        isRoundTrip: formIsRoundTrip,
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
              onChange={(val) => {
                handleFormVehicleChange(val);
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

          {/* Purpose category */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Purpose *</label>
            <NeoDropdown
              id="form-trip-purpose"
              value={formPurpose}
              onChange={(val) => {
                const newPurpose = val as TripPurpose;
                setFormPurpose(newPurpose);
                if (newPurpose === 'commute') {
                  if (!formSource.trim() && !formDestination.trim()) {
                    setFormSource('Home');
                    setFormDestination('Office');
                  }
                }
              }}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Start Date & End Date */}
          <div className="flex flex-col gap-1 col-span-1">
            {tripMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
                  <input
                    type="date"
                    id="form-trip-date"
                    value={formStartDate}
                    onChange={(e) => {
                      setFormStartDate(e.target.value);
                      if (errors.startDate) setErrors(prev => ({ ...prev, startDate: '' }));
                    }}
                    className={`p-2.5 sm:p-2 border-2 ${errors.startDate ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                  />
                  {errors.startDate && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {errors.startDate}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    id="form-trip-enddate"
                    value={formEndDate}
                    onChange={(e) => {
                      setFormEndDate(e.target.value);
                      if (errors.endDate) setErrors(prev => ({ ...prev, endDate: '' }));
                    }}
                    className={`p-2.5 sm:p-2 border-2 ${errors.endDate ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                  />
                  {errors.endDate && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {errors.endDate}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Start Date *</label>
                <input
                  type="date"
                  id="form-trip-date"
                  value={formStartDate}
                  onChange={(e) => {
                    setFormStartDate(e.target.value);
                    if (errors.startDate) setErrors(prev => ({ ...prev, startDate: '' }));
                  }}
                  className={`p-2.5 sm:p-2 border-2 ${errors.startDate ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                />
                {errors.startDate && (
                  <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                    ⚠️ {errors.startDate}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Start Time & End Time (side by side in manual mode) */}
          <div className="flex flex-col gap-1 col-span-1">
            {tripMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">Start Time</label>
                  <input
                    type="time"
                    id="form-trip-time"
                    value={formStartTime}
                    onChange={(e) => {
                      setFormStartTime(e.target.value);
                      if (errors.startTime) setErrors(prev => ({ ...prev, startTime: '' }));
                    }}
                    className={`p-2.5 sm:p-2 border-2 ${errors.startTime ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                  />
                  {errors.startTime && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {errors.startTime}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">End Time</label>
                  <input
                    type="time"
                    id="form-trip-endtime"
                    value={formEndTime}
                    onChange={(e) => {
                      setFormEndTime(e.target.value);
                      if (errors.endTime) setErrors(prev => ({ ...prev, endTime: '' }));
                    }}
                    className={`p-2.5 sm:p-2 border-2 ${errors.endTime ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                  />
                  {errors.endTime && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {errors.endTime}
                    </span>
                  )}
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
                  className="p-2.5 sm:p-2 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white focus:border-neo-accent"
                />
              </>
            )}
          </div>

          {/* Start & End Odometer */}
          <div className="flex flex-col gap-1 col-span-1">
            {tripMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">Start Odo (km) *</label>
                  <input
                    type="number"
                    step="any"
                    id="form-trip-startodo"
                    value={formStartOdo}
                    onChange={(e) => {
                      setFormStartOdo(e.target.value);
                      if (errors.startOdo) setErrors(prev => ({ ...prev, startOdo: '' }));
                    }}
                    placeholder="14000"
                    className={`p-2.5 sm:p-2 border-2 ${errors.startOdo ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                  />
                  {errors.startOdo && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {errors.startOdo}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-xs uppercase tracking-wider">End Odo (km) *</label>
                  <input
                    type="number"
                    step="any"
                    id="form-trip-endodo"
                    value={formEndOdo}
                    onChange={(e) => {
                      setFormEndOdo(e.target.value);
                      if (errors.endOdo) setErrors(prev => ({ ...prev, endOdo: '' }));
                    }}
                    placeholder="14050"
                    className={`p-2.5 sm:p-2 border-2 ${errors.endOdo ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono font-bold text-base focus:outline-none text-black dark:text-white`}
                  />
                  {errors.endOdo && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {errors.endOdo}
                    </span>
                  )}
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
                  onChange={(e) => {
                    setFormStartOdo(e.target.value);
                    if (errors.startOdo) setErrors(prev => ({ ...prev, startOdo: '' }));
                  }}
                  placeholder="14000"
                  className={`p-2.5 sm:p-2 border-2 ${errors.startOdo ? 'border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg font-mono focus:outline-none text-black dark:text-white`}
                />
                {errors.startOdo && (
                  <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                    ⚠️ {errors.startOdo}
                  </span>
                )}
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
              className="p-2.5 sm:p-2 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg text-black dark:text-white focus:outline-none focus:border-neo-accent"
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
              className="p-2.5 sm:p-2 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg text-black dark:text-white focus:outline-none focus:border-neo-accent"
            />
          </div>

        </div>

        {/* Round Trip indicator */}
        <div className="flex items-center gap-2 p-2 bg-[#f0f0f0] dark:bg-zinc-800 border-2 border-black dark:border-white select-none">
          <label className="flex items-center gap-2.5 cursor-pointer w-full">
            <input
              type="checkbox"
              id="form-trip-roundtrip"
              checked={formIsRoundTrip}
              onChange={(e) => setFormIsRoundTrip(e.target.checked)}
              className="w-4 h-4 border-2 border-black dark:border-white text-neo-accent accent-neo-accent focus:ring-0 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="font-display font-black text-xs uppercase tracking-wider flex items-center gap-1.5 text-black dark:text-white">
                ⇆ Is To & Fro (Round Trip)
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                Indicates a complete return journey between start and end locations
              </span>
            </div>
          </label>
        </div>

        {/* Frequent Routes Section */}
        <div className="flex flex-col gap-2 p-3 bg-[#faf9f6] dark:bg-zinc-900 border-2 border-black dark:border-white">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-black text-xs uppercase tracking-wider text-black dark:text-white">
              📍 Frequent Routes & Presets
            </span>
            <button
              type="button"
              onClick={handleSaveFrequentRoute}
              className="text-[10px] font-mono font-bold px-2 py-1 border-2 border-black bg-neo-accent text-black hover:bg-orange-600 active:translate-y-[1px] transition-all cursor-pointer"
            >
              ⭐ Save Current Route
            </button>
          </div>
          
          {frequentRoutes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {frequentRoutes.map((route, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setFormSource(route.source);
                    setFormDestination(route.destination);
                    if (route.source.toLowerCase() === 'home' && route.destination.toLowerCase() === 'office') {
                      setFormPurpose('commute');
                    }
                    showToast(`Applied: ${route.source} ➔ ${route.destination}`, 'success');
                  }}
                  className="group flex items-center gap-1.5 px-2.5 py-1 text-xs border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg hover:bg-yellow-100 dark:hover:bg-yellow-950 font-mono cursor-pointer transition-all active:translate-y-[1px] select-none text-black dark:text-white"
                >
                  <span>{route.source} ➔ {route.destination}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteFrequentRoute(idx, e)}
                    className="text-red-500 hover:text-red-700 font-bold px-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    title="Delete preset"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[11px] font-mono text-gray-500">
              No saved routes yet. Enter Source & Destination, then click "Save Current Route".
            </span>
          )}
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
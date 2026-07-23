/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Vehicle, VehicleType, FuelLog, Trip, Expense, MaintenanceRecord, MaintenanceScheduleItem, ExpenseCategory, AppSettings } from '../types';
import { dbAPI } from '../db';
import { formatDate, getFirstOdoEntry, getMaintenanceAlerts, getVehicleDefaultSchedule, getLocalDateString, formatCurrency, compressImage, MaintenanceAlert } from '../utils';
import ConfirmModal from './ConfirmModal';
import NeoModal from './NeoModal';
import NeoDropdown from './NeoDropdown';
import { useToast } from './ToastContext';
import { Plus, Edit2, Trash2, ShieldAlert, Award, Calendar, Layers, PenTool, Wrench, ChevronDown, ChevronUp, History, X, CreditCard, Camera, Upload, Maximize2, Bell } from 'lucide-react';

interface VehiclesProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  trips: Trip[];
  expenses: Expense[];
  maintenanceRecords: MaintenanceRecord[];
  onVehiclesChanged: () => void;
  currency?: string;
  addVehicleTrigger?: number;
  settings?: AppSettings;
}

const VEHICLE_TYPE_OPTIONS = [
  { value: 'car', label: '🚗 Car / SUV / Sedan' },
  { value: 'bike', label: '🏍 Motorcycle / Cruiser' },
  { value: 'scooter', label: '🛵 Scooter / Moped' },
  { value: 'ev', label: '⚡ Electric Vehicle' },
  { value: 'other', label: '🚌 Truck / Fleet / Other' }
];

const FUEL_TYPE_OPTIONS = [
  { value: 'Petrol', label: 'Petrol / Gasoline' },
  { value: 'Diesel', label: 'Diesel Fuel' },
  { value: 'CNG', label: 'CNG / Autogas' },
  { value: 'Electric', label: 'Electric Power (EV)' },
  { value: 'Hybrid', label: 'Hybrid System (PHEV/HEV)' },
  { value: 'Other', label: 'Other / Alternative' }
];

export default function VehiclesManager({
  vehicles,
  fuelLogs,
  trips,
  expenses,
  maintenanceRecords,
  onVehiclesChanged,
  currency = 'INR',
  addVehicleTrigger,
  settings
}: VehiclesProps) {
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Trigger registration modal from global FAB
  useEffect(() => {
    if (addVehicleTrigger && addVehicleTrigger > 0) {
      setEditingVehicle(null);
      setIsModalOpen(true);
    }
  }, [addVehicleTrigger]);

  // Scroll shrink
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Form states
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<VehicleType>('car');
  const [formFuelType, setFormFuelType] = useState('Petrol');
  const [formRegistration, setFormRegistration] = useState('');
  const [formOdometer, setFormOdometer] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState('');
  const [formTankCapacity, setFormTankCapacity] = useState('');
  const [formClaimedEfficiency, setFormClaimedEfficiency] = useState('');
  const [formProfileImage, setFormProfileImage] = useState<string | null>(null);
  const [formBaseFuelLogId, setFormBaseFuelLogId] = useState<string | null>(null);

  // Validation states
  const [vehicleErrors, setVehicleErrors] = useState<Record<string, string>>({});
  const [maintErrors, setMaintErrors] = useState<Record<string, string>>({});

  // Maintenance section state
  const [expandedMaintId, setExpandedMaintId] = useState<string | null>(null);
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [maintVehicle, setMaintVehicle] = useState<Vehicle | null>(null);
  const [maintForm, setMaintForm] = useState({ date: '', itemType: '', odometer: '', cost: '', notes: '' });
  const [customItemType, setCustomItemType] = useState('');
  const [editingMaintRecord, setEditingMaintRecord] = useState<MaintenanceRecord | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [deleteMaintConfirmId, setDeleteMaintConfirmId] = useState<string | null>(null);

  // Maximized Maintenance states
  const [maximizedMaintVehicle, setMaximizedMaintVehicle] = useState<Vehicle | null>(null);
  const [maintHubVehicleId, setMaintHubVehicleId] = useState<string>('all');
  const [maximizedMaintSearch, setMaximizedMaintSearch] = useState('');
  const [maximizedMaintFilter, setMaximizedMaintFilter] = useState<'All' | 'Overdue' | 'Due Soon' | 'OK'>('All');

  // Dynamic Design Style & Mode Tracking
  const [theme, setTheme] = useState<'neobrutalist' | 'refined' | 'material3' | 'aistudio'>('neobrutalist');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const getThemeAndMode = () => {
      const classList = document.documentElement.classList;
      const t: 'neobrutalist' | 'refined' | 'material3' | 'aistudio' = 
        classList.contains('refined') ? 'refined'
        : classList.contains('material3') ? 'material3'
        : classList.contains('aistudio') ? 'aistudio'
        : 'neobrutalist';
      const d = classList.contains('dark');
      return { theme: t, isDark: d };
    };

    const update = () => {
      const { theme: t, isDark: d } = getThemeAndMode();
      setTheme(t);
      setIsDark(d);
    };

    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  // Sync to expense states
  const [syncToExpense, setSyncToExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<string>('Service');
  const [expenseVendor, setExpenseVendor] = useState('');

  // Auto sync to expense when cost is typed for a new record
  useEffect(() => {
    if (maintModalOpen && !editingMaintRecord) {
      if (maintForm.cost && parseFloat(maintForm.cost) > 0) {
        setSyncToExpense(true);
        // Prefill vendor to "Service Center" or match itemType
        if (!expenseVendor) {
          setExpenseVendor('Service Center');
        }
      } else {
        setSyncToExpense(false);
      }
    }
  }, [maintForm.cost, editingMaintRecord, maintModalOpen]);

  // Maintenance SCHEDULE edit state (interval/enabled config, opened by
  // clicking a maintenance tracker list item — separate from the maintenance
  // RECORD form above, which logs an actual service that was performed).
  const [scheduleEditVehicle, setScheduleEditVehicle] = useState<Vehicle | null>(null);
  const [scheduleEditItem, setScheduleEditItem] = useState<MaintenanceScheduleItem | null>(null);
  const [scheduleFormKm, setScheduleFormKm] = useState('');
  const [scheduleFormMonths, setScheduleFormMonths] = useState('');
  const [scheduleFormDueSoonDays, setScheduleFormDueSoonDays] = useState('15');
  const [scheduleFormDueSoonKm, setScheduleFormDueSoonKm] = useState('');
  const [scheduleFormEnabled, setScheduleFormEnabled] = useState(true);

  // Handle opening for Create vs Edit
  useEffect(() => {
    if (isModalOpen) {
      setVehicleErrors({});
      if (editingVehicle) {
        setFormName(editingVehicle.name);
        setFormType(editingVehicle.type);
        setFormFuelType(editingVehicle.fuelType);
        setFormRegistration(editingVehicle.registration);
        // Backward compat: fall back to odometer if startingOdometer was never set
        const startingOdo = editingVehicle.startingOdometer ?? editingVehicle.odometer;
        setFormOdometer(String(startingOdo));
        setFormPurchaseDate(editingVehicle.purchaseDate);
        setFormTankCapacity(editingVehicle.tankCapacity != null ? String(editingVehicle.tankCapacity) : '');
        setFormClaimedEfficiency(editingVehicle.claimedEfficiency != null ? String(editingVehicle.claimedEfficiency) : '');
        setFormProfileImage(editingVehicle.profileImage || null);
        setFormBaseFuelLogId(editingVehicle.baseFuelLogId || null);
      } else {
        setFormName('');
        setFormType('car');
        setFormFuelType('Petrol');
        setFormRegistration('');
        setFormOdometer('');
        setFormPurchaseDate(getLocalDateString());
        setFormTankCapacity('');
        setFormClaimedEfficiency('');
        setFormProfileImage(null);
        setFormBaseFuelLogId(null);
      }
    }
  }, [isModalOpen, editingVehicle]);

  const getVehicleIcon = (type: VehicleType) => {
    switch (type) {
      case 'car': return '🚗';
      case 'bike': return '🏍';
      case 'scooter': return '🛵';
      case 'ev': return '⚡';
      default: return '🚌';
    }
  };

  const getVehicleTypeName = (type: VehicleType) => {
    switch (type) {
      case 'car': return 'Car';
      case 'bike': return 'Bike';
      case 'scooter': return 'Scooter';
      case 'ev': return 'Electric Vehicle';
      default: return 'Other / Fleet';
    }
  };

  // Save vehicle record (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!formName.trim()) {
      errors.name = 'Vehicle Display Name is required';
    }
    if (!formType) {
      errors.type = 'Vehicle Type is required';
    }
    if (!formFuelType) {
      errors.fuelType = 'Fuel System is required';
    }
    if (!formOdometer) {
      errors.odometer = 'Starting/Current Odometer is required';
    } else {
      const odo = parseFloat(formOdometer);
      if (isNaN(odo) || odo < 0) {
        errors.odometer = 'Odometer must be a non-negative number';
      }
    }
    if (!formPurchaseDate) {
      errors.purchaseDate = 'Acquisition Date is required';
    }

    let tankCapVal: number | null = null;
    if (formTankCapacity.trim()) {
      const parsed = parseFloat(formTankCapacity);
      if (isNaN(parsed) || parsed <= 0) {
        errors.tankCapacity = 'Tank capacity must be a positive number';
      } else {
        tankCapVal = parsed;
      }
    }

    let claimedEffVal: number | null = null;
    if (formClaimedEfficiency.trim()) {
      const parsed = parseFloat(formClaimedEfficiency);
      if (isNaN(parsed) || parsed <= 0) {
        errors.claimedEfficiency = 'Claimed efficiency must be a positive number';
      } else {
        claimedEffVal = parsed;
      }
    }

    if (Object.keys(errors).length > 0) {
      setVehicleErrors(errors);
      showToast('Please fill out all required fields with valid values.', 'error');
      return;
    }

    setVehicleErrors({});
    const odoNum = parseFloat(formOdometer);

    const vehicleData: Vehicle = {
      id: editingVehicle ? editingVehicle.id : `v-${Date.now()}`,
      name: formName.trim(),
      type: formType,
      fuelType: formFuelType,
      registration: formRegistration || 'N/A',
      odometer: editingVehicle ? editingVehicle.odometer : odoNum,
      startingOdometer: odoNum,
      purchaseDate: formPurchaseDate,
      tankCapacity: tankCapVal,
      claimedEfficiency: claimedEffVal,
      maintenanceSchedule: editingVehicle
        ? editingVehicle.maintenanceSchedule // preserve existing
        : getVehicleDefaultSchedule(formType),
      profileImage: formProfileImage,
      baseFuelLogId: formBaseFuelLogId
    };

    await dbAPI.saveVehicle(vehicleData);

    showToast(
      editingVehicle
        ? `Vehicle "${vehicleData.name}" updated successfully!`
        : `Vehicle "${vehicleData.name}" registered successfully!`,
      'success'
    );

    setIsModalOpen(false);
    setEditingVehicle(null);
    onVehiclesChanged();
  };

  const handleEditTrigger = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleDeleteTrigger = async (id: string, name: string) => {
    setDeleteConfirmId(id);
  };

  // Clicking a maintenance tracker list item opens this — lets the user
  // edit that item's interval config (km/month due + enabled), not log a
  // service record (that's the separate "Log Service" flow below).
  const handleOpenScheduleEdit = (vehicle: Vehicle, item: MaintenanceScheduleItem) => {
    setScheduleEditVehicle(vehicle);
    setScheduleEditItem(item);
    setScheduleFormKm(item.kmInterval !== null ? String(item.kmInterval) : '');
    setScheduleFormMonths(item.monthInterval !== null ? String(item.monthInterval) : '');
    setScheduleFormDueSoonDays(
      item.dueSoonDays !== undefined && item.dueSoonDays !== null
        ? String(item.dueSoonDays)
        : String(settings?.maintenanceDueSoonDays ?? 15)
    );
    setScheduleFormDueSoonKm(
      item.dueSoonKm !== undefined && item.dueSoonKm !== null
        ? String(item.dueSoonKm)
        : ''
    );
    setScheduleFormEnabled(item.enabled);
  };

  const handleCloseScheduleEdit = () => {
    setScheduleEditVehicle(null);
    setScheduleEditItem(null);
  };

  const handleSaveScheduleEdit = async () => {
    if (!scheduleEditVehicle || !scheduleEditItem) return;

    // A vehicle without a custom schedule yet uses the type default at
    // render time (see getVehicleDefaultSchedule) — materialize that default
    // list now so we have something concrete to persist this one edit into.
    const baseSchedule = scheduleEditVehicle.maintenanceSchedule ?? getVehicleDefaultSchedule(scheduleEditVehicle.type);

    const updatedItem: MaintenanceScheduleItem = {
      type: scheduleEditItem.type,
      kmInterval: scheduleFormKm.trim() ? Math.max(0, parseInt(scheduleFormKm, 10)) : null,
      monthInterval: scheduleFormMonths.trim() ? Math.max(0, parseInt(scheduleFormMonths, 10)) : null,
      dueSoonDays: scheduleFormDueSoonDays.trim() ? Math.max(0, parseInt(scheduleFormDueSoonDays, 10)) : null,
      dueSoonKm: scheduleFormDueSoonKm.trim() ? Math.max(0, parseInt(scheduleFormDueSoonKm, 10)) : null,
      enabled: scheduleFormEnabled
    };

    const exists = baseSchedule.some(s => s.type === scheduleEditItem.type);
    const newSchedule = exists
      ? baseSchedule.map(s => (s.type === scheduleEditItem.type ? updatedItem : s))
      : [...baseSchedule, updatedItem];

    await dbAPI.saveVehicle({ ...scheduleEditVehicle, maintenanceSchedule: newSchedule });
    showToast(`${scheduleEditItem.type} schedule updated!`, 'success');
    onVehiclesChanged();
    handleCloseScheduleEdit();
  };

  const baseFuelLogOptions = editingVehicle
    ? [
        { value: '', label: 'Default (Use Earliest Entry)' },
        ...fuelLogs
          .filter(l => l.vehicleId === editingVehicle.id)
          .sort((a, b) => a.date.localeCompare(b.date) || (a.odometer ?? 0) - (b.odometer ?? 0))
          .map(l => {
            const hasOdo = l.odometer !== null && l.odometer !== undefined;
            const details = [
              l.date,
              `${l.litres}L`,
              hasOdo ? `@ ${l.odometer} km` : '(No Odo)',
              l.fullTank === false ? '(Partial)' : '(Full)'
            ].join(' ');
            return {
              value: l.id,
              label: (
                <div className="flex flex-col text-left font-mono text-[10px] leading-tight py-0.5">
                  <span className="font-bold text-black dark:text-white">{details}</span>
                  {l.notes && <span className="text-gray-400 truncate max-w-xs text-[9px]">{l.notes}</span>}
                </div>
              )
            };
          })
      ]
    : [];

  return (
    <div className="w-full flex flex-col gap-4 select-none">

      {/* Pinned Header */}
      <div className="sticky top-[54px] sm:top-[58px] z-20 bg-neo-bg dark:bg-neo-dark-bg pb-2 pt-1">
        {/* Header Card — Neo-brutalist like modal */}
        <div id="vehicles-header-card" className={`bg-neo-accent border-2 border-black neo-shadow transition-all duration-300 flex items-center justify-between ${isScrolled ? 'px-3 py-1.5' : 'px-3.5 py-2 sm:px-4 sm:py-2.5'}`}>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-sm sm:text-base leading-none' : 'text-base sm:text-lg'}`}>My Garage</h2>
            <span className="bg-black text-white font-mono font-bold text-[9px] leading-none px-1.5 py-0.5 border border-black/50 shrink-0">
              {vehicles.length} VEHICLES
            </span>
          </div>
        </div>
      </div>

      {/* Grid List of vehicles */}
      {vehicles.length === 0 ? (
        <div className="w-full bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-12 neo-shadow dark:neo-shadow-dark text-center py-16">
          <ShieldAlert className="w-12 h-12 text-neo-accent animate-bounce mx-auto mb-3" />
          <h3 className="font-display font-bold text-lg uppercase mb-1">No Active Vehicles</h3>
          <p className="font-sans text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            You must register a vehicle before logs, fuel slips, or trip sheets can be stored locally.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map(v => (
            <div
              key={v.id}
              className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white p-2.5 sm:p-3 neo-shadow dark:neo-shadow-dark flex flex-col justify-between`}
            >
              <div>
                {/* Header block with icons */}
                <div className="flex justify-between items-start mb-1.5 border-b-2 border-black/10 dark:border-white/10 pb-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-12 h-12 border-2 border-black rounded shadow-sm bg-neo-bg dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                      {v.profileImage ? (
                        <img src={v.profileImage} alt={v.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl">{getVehicleIcon(v.type)}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-display font-black text-base text-black dark:text-white uppercase leading-tight">
                        {v.name}
                      </h3>
                      <span className="font-sans text-[10px] text-gray-400 font-bold uppercase">
                        {getVehicleTypeName(v.type)}
                      </span>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-1.5">
                    <button
                      id={`btn-edit-vehicle-${v.id}`}
                      onClick={() => handleEditTrigger(v)}
                      className="p-1.5 border-2 border-black bg-blue-300 hover:bg-blue-400 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer"
                      title="Edit vehicle"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      id={`btn-delete-vehicle-${v.id}`}
                      onClick={() => handleDeleteTrigger(v.id, v.name)}
                      className="p-1.5 border-2 border-black bg-red-400 hover:bg-red-500 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer"
                      title="Delete vehicle"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Properties fields list */}
                <div className="flex flex-col gap-1 text-xs font-mono mb-2 mt-1">
                  <div className="flex justify-between items-center py-1 border-b border-black/5 dark:border-white/5">
                    <span className="text-gray-400 flex items-center gap-1">
                      <PenTool className="w-3.5 h-3.5 text-neo-accent" />
                      <span>Registration:</span>
                    </span>
                    <span className="font-bold text-black uppercase px-1.5 py-0.5 border border-black bg-neo-accent-yellow leading-none text-[10px] vehicle-reg-badge">
                      {v.registration}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-black/5 dark:border-white/5">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-neo-accent-green" />
                      <span>Fuel Type:</span>
                    </span>
                    <span className="font-semibold text-gray-600 dark:text-gray-300">{v.fuelType}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-black/5 dark:border-white/5">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>Purchased:</span>
                    </span>
                    <span className="font-semibold text-gray-600 dark:text-gray-300">{formatDate(v.purchaseDate)}</span>
                  </div>

                  {v.tankCapacity && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-400 flex items-center gap-1">
                        <span className="text-neo-accent">⛽</span>
                        <span>Tank Capacity:</span>
                      </span>
                      <span className="font-bold text-black dark:text-white px-1.5 py-0.5 border border-black/30 bg-emerald-100 dark:bg-emerald-950/40 text-[10px] rounded-sm">
                        {v.tankCapacity} {v.type === 'ev' ? 'kWh' : 'L'}
                        {(() => {
                          const vLogs = fuelLogs.filter(l => l.vehicleId === v.id && l.mileageSinceLast != null && l.mileageSinceLast > 0);
                          if (vLogs.length > 0) {
                            const avgMileage = vLogs.reduce((sum, l) => sum + (l.mileageSinceLast || 0), 0) / vLogs.length;
                            const estRange = Math.round(v.tankCapacity * avgMileage);
                            return ` (~${estRange} km range)`;
                          }
                          return '';
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Odometer Readings: First Entry + Current */}
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <div className="border-2 border-black bg-white dark:bg-zinc-900 p-1.5 flex flex-col items-center justify-between">
                  <span className="font-display font-black text-[9px] text-gray-400 uppercase tracking-widest">First Entry</span>
                  <div className="flex items-center gap-1">
                    <div className="flex bg-black text-blue-400 px-2 py-1 font-mono font-black text-sm tracking-widest rounded leading-none">
                      {(() => {
                        const firstOdo = getFirstOdoEntry(v.id, fuelLogs, expenses, trips);
                        const displayOdo = firstOdo != null && !isNaN(firstOdo) ? firstOdo : (v.startingOdometer ?? 0);
                        return String(Math.round(displayOdo)).padStart(6, '0');
                      })()}
                    </div>
                    <span className="text-[10px] font-black text-black dark:text-white">KM</span>
                  </div>
                </div>
                <div className="border-2 border-black bg-neo-bg dark:bg-zinc-900 p-1.5 flex flex-col items-center justify-between">
                  <span className="font-display font-black text-[9px] text-gray-400 uppercase tracking-widest">Current</span>
                  <div className="flex items-center gap-1">
                    <div className="flex bg-black text-neo-accent-yellow px-2 py-1 font-mono font-black text-sm tracking-widest rounded leading-none">
                      {String(Math.round(v.odometer)).padStart(6, '0')}
                    </div>
                    <span className="text-[10px] font-black text-black dark:text-white">KM</span>
                  </div>
                </div>
              </div>

              {/* ═══ Maintenance Tracker Section ═══ */}
              {(() => {
                const { items, summary } = getMaintenanceAlerts(v, expenses, maintenanceRecords, settings);
                const hasIssues = summary.dueSoon > 0 || summary.overdue > 0;
                const isExpanded = expandedMaintId === v.id;

                return (
                  <div className="mt-3 border-2 border-black bg-white dark:bg-neo-dark-card maint-tracker-container">
                    {/* Summary bar - always visible */}
                    <div
                      onClick={() => setExpandedMaintId(isExpanded ? null : v.id)}
                      className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="w-3.5 h-3.5 text-neo-accent" />
                        <span className="font-display font-bold text-[10px] text-black dark:text-white uppercase">Maintenance</span>
                        {summary.overdue > 0 && (
                          <span className="px-1.5 py-0.5 bg-red-400 text-black text-[9px] font-bold border-2 border-black animate-pulse">
                            {summary.overdue} Overdue
                          </span>
                        )}
                        {summary.overdue === 0 && summary.dueSoon > 0 && (
                          <span className="px-1.5 py-0.5 bg-yellow-400 text-black text-[9px] font-bold border-2 border-black">
                            {summary.dueSoon} Due Soon
                          </span>
                        )}
                        {summary.overdue === 0 && summary.dueSoon === 0 && (
                          <span className="px-1.5 py-0.5 bg-green-400 text-black text-[9px] font-bold border-2 border-black">
                            All OK
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-400">{items.length} items</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMaximizedMaintVehicle(v);
                            setMaintHubVehicleId(v.id);
                            setMaximizedMaintSearch('');
                            setMaximizedMaintFilter('All');
                          }}
                          className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded border border-transparent hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer flex items-center justify-center active:scale-95"
                          title="Maximize Maintenance Tracker"
                        >
                          <Maximize2 className="w-3.5 h-3.5 text-black dark:text-white" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expanded list */}
                    {isExpanded && (
                      <div className="border-t-2 border-black maint-tracker-expanded">
                        <div className="max-h-[220px] overflow-y-auto">
                          {(() => {
                            const sortedItems = [...items].sort((a, b) => {
                              const score = (status: string) => status === 'Overdue' ? 2 : status === 'Due Soon' ? 1 : 0;
                              return score(b.status) - score(a.status);
                            });

                            return sortedItems.map((item, idx) => (
                              <div
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.scheduleItem) handleOpenScheduleEdit(v, item.scheduleItem);
                                }}
                                className={`p-2 flex flex-col gap-1 cursor-pointer hover:brightness-95 transition-[filter] maint-item-row status-${item.status.toLowerCase().replace(' ', '-')} ${item.bgColor} ${idx > 0 ? 'border-t border-black/10' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-display font-bold text-[10px] text-black uppercase leading-tight block truncate maint-item-label">{item.label}</span>
                                    <span className="text-[9px] font-mono text-black/70 block truncate maint-item-subtext">{item.subText}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold uppercase rounded leading-none maint-item-status-badge ${
                                      item.status === 'OK' ? 'bg-green-400 text-black' :
                                      item.status === 'Due Soon' ? 'bg-yellow-400 text-black' : 'bg-red-400 text-black animate-pulse'
                                    }`}>
                                      {item.status}
                                    </span>
                                    <PenTool className="w-3 h-3 text-black/40 maint-item-pentool" />
                                  </div>
                                </div>
                                {item.progress !== undefined && (
                                  <div className="w-full h-1.5 bg-black/10 border border-black mt-0.5 maint-item-progress-bg">
                                    <div 
                                      className={`h-full maint-item-progress-fill status-${item.status.toLowerCase().replace(' ', '-')} ${
                                        item.status === 'OK' ? 'bg-green-400' :
                                        item.status === 'Due Soon' ? 'bg-yellow-400' : 'bg-red-400'
                                      }`}
                                      style={{ width: `${Math.min(100, item.progress * 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                        <div className="flex border-t-2 border-black maint-buttons-container">
                          <button
                            onClick={() => {
                              setHistoryVehicle(v);
                              setHistoryModalOpen(true);
                            }}
                            className="flex-1 p-2 bg-blue-300 text-black font-display font-bold text-[10px] uppercase border-r-2 border-black hover:bg-blue-400 cursor-pointer maint-btn-history"
                          >
                            <History className="w-3 h-3 inline mr-1" />
                            View History
                          </button>
                          <button
                            onClick={() => {
                              setEditingMaintRecord(null);
                              setMaintVehicle(v);
                              setMaintForm({
                                date: getLocalDateString(),
                                itemType: '',
                                odometer: String(v.odometer),
                                cost: '',
                                notes: ''
                              });
                              setCustomItemType('');
                              setSyncToExpense(false);
                              setExpenseCategory('Service');
                              setExpenseVendor('');
                              setMaintModalOpen(true);
                            }}
                            className="flex-1 p-2 bg-neo-accent text-black font-display font-bold text-[10px] uppercase hover:bg-orange-600 cursor-pointer maint-btn-log"
                          >
                            + Log Maintenance
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          ))}
        </div>
      )}

      {/* MODAL: ADD / EDIT VEHICLE */}
      <NeoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingVehicle(null);
        }}
        title={editingVehicle ? 'Edit Vehicle Profile' : 'Add New Vehicle'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans text-black dark:text-white">

          {/* Profile Picture */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-3 border-2 border-black bg-white dark:bg-zinc-900 neo-shadow-sm mb-1">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] bg-neo-bg dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
              {formProfileImage ? (
                <img src={formProfileImage} alt="Vehicle profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">{getVehicleIcon(formType)}</span>
              )}
              {formProfileImage && (
                <button
                  type="button"
                  onClick={() => setFormProfileImage(null)}
                  className="absolute top-0 right-0 bg-red-400 hover:bg-red-500 border-b-2 border-l-2 border-black p-0.5 text-black cursor-pointer rounded-bl"
                  title="Remove profile image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-1.5 w-full">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-neo-accent" />
                <span>Vehicle Profile Picture</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="file"
                  accept="image/*"
                  id="vehicle-avatar-input"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const compressed = await compressImage(file, 400, 400, 0.8);
                        setFormProfileImage(compressed);
                      } catch (err) {
                        console.error('Failed to compress avatar image, using raw fallback', err);
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormProfileImage(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('vehicle-avatar-input')?.click()}
                  className="px-3 py-1.5 bg-neo-accent text-black font-display font-bold text-[10px] uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#c9e83e] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Photo</span>
                </button>
                {formProfileImage && (
                  <button
                    type="button"
                    onClick={() => setFormProfileImage(null)}
                    className="px-3 py-1.5 bg-red-400 text-black font-display font-bold text-[10px] uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-red-500 active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <p className="text-[9px] font-mono text-gray-500 dark:text-gray-400">Supports JPG, PNG, WebP (under 5MB recommended)</p>
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle Display Name *</label>
            <input
              type="text"
              id="form-veh-name"
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value);
                if (vehicleErrors.name) setVehicleErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="E.g., Retro Cruiser, Red Rocket, Daily commuter"
              className={`p-2.5 sm:p-2 border-2 ${vehicleErrors.name ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-black dark:text-white`}
            />
            {vehicleErrors.name && (
              <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                ⚠️ {vehicleErrors.name}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Type */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle Type *</label>
              <NeoDropdown
                id="form-veh-type"
                value={formType}
                onChange={(val) => setFormType(val as VehicleType)}
                options={VEHICLE_TYPE_OPTIONS}
                className="w-full"
              />
            </div>

            {/* Fuel Type */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Fuel System *</label>
              <NeoDropdown
                id="form-veh-fuel"
                value={formFuelType}
                onChange={(val) => setFormFuelType(val)}
                options={FUEL_TYPE_OPTIONS}
                className="w-full"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Registration License plate */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">License Registration</label>
              <input
                type="text"
                id="form-veh-reg"
                value={formRegistration}
                onChange={(e) => setFormRegistration(e.target.value)}
                placeholder="AB-12-CD-3456"
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono uppercase"
              />
            </div>

            {/* Tank Capacity */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">
                Tank Capacity ({formType === 'ev' ? 'kWh' : 'Litres'})
              </label>
              <input
                type="number"
                id="form-veh-tank"
                min="0"
                step="0.1"
                value={formTankCapacity}
                onChange={(e) => {
                  setFormTankCapacity(e.target.value);
                  if (vehicleErrors.tankCapacity) setVehicleErrors((prev) => ({ ...prev, tankCapacity: '' }));
                }}
                placeholder={formType === 'ev' ? 'e.g., 60' : formType === 'bike' || formType === 'scooter' ? 'e.g., 14' : 'e.g., 45'}
                className={`p-2.5 sm:p-2 border-2 ${vehicleErrors.tankCapacity ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {vehicleErrors.tankCapacity && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {vehicleErrors.tankCapacity}
                </span>
              )}
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Claimed Efficiency */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">
                Claimed Mileage ({formType === 'ev' ? 'km/kWh' : 'km/L'}) <span className="text-[10px] text-gray-400 font-normal lowercase">(optional baseline)</span>
              </label>
              <input
                type="number"
                id="form-veh-claimed-eff"
                min="0"
                step="0.1"
                value={formClaimedEfficiency}
                onChange={(e) => {
                  setFormClaimedEfficiency(e.target.value);
                  if (vehicleErrors.claimedEfficiency) setVehicleErrors((prev) => ({ ...prev, claimedEfficiency: '' }));
                }}
                placeholder={formType === 'ev' ? 'e.g., 6.5' : formType === 'bike' || formType === 'scooter' ? 'e.g., 45' : 'e.g., 15'}
                className={`p-2.5 sm:p-2 border-2 ${vehicleErrors.claimedEfficiency ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {vehicleErrors.claimedEfficiency && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {vehicleErrors.claimedEfficiency}
                </span>
              )}
            </div>

          </div>

          {editingVehicle && (
            <div className="flex flex-col gap-1.5 p-3 border-2 border-dashed border-black/25 dark:border-white/25 bg-amber-50/50 dark:bg-amber-950/10">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-black dark:text-white flex flex-wrap items-center gap-1">
                <span>Calculation Baseline Fuel Log</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal lowercase">(optional start point)</span>
              </label>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug font-sans">
                Select a specific fuel log to act as the starting baseline for efficiency calculations. Older fills will be excluded from mileage computations.
              </p>
              {baseFuelLogOptions.length > 1 ? (
                <div className="mt-1">
                  <NeoDropdown
                    id="form-veh-base-fuel"
                    value={formBaseFuelLogId || ''}
                    onChange={(val) => setFormBaseFuelLogId(val || null)}
                    options={baseFuelLogOptions}
                    placeholder="Default (Use Earliest Entry Across All Logs)"
                    className="w-full"
                  />
                  {formBaseFuelLogId && !fuelLogs.find(l => l.id === formBaseFuelLogId)?.odometer && (
                    <p className="text-[9px] text-amber-500 font-semibold mt-1 font-mono">
                      ⚠️ Selected log does not have an odometer reading. Starting baseline requires an odometer reading to compute subsequent efficiency.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 italic mt-0.5">
                  No fuel logs registered for this vehicle yet. Please add fuel logs first to select a starting baseline.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Odometer */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">
                {editingVehicle ? 'Current Odometer *' : 'Starting Odometer *'}
              </label>
              <input
                type="number"
                id="form-veh-odo"
                value={formOdometer}
                onChange={(e) => {
                  setFormOdometer(e.target.value);
                  if (vehicleErrors.odometer) setVehicleErrors((prev) => ({ ...prev, odometer: '' }));
                }}
                placeholder="0"
                className={`p-2.5 sm:p-2 border-2 ${vehicleErrors.odometer ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {vehicleErrors.odometer && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {vehicleErrors.odometer}
                </span>
              )}
            </div>

            {/* Purchase date */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Acquisition Date *</label>
              <input
                type="date"
                id="form-veh-purchase"
                value={formPurchaseDate}
                onChange={(e) => {
                  setFormPurchaseDate(e.target.value);
                  if (vehicleErrors.purchaseDate) setVehicleErrors((prev) => ({ ...prev, purchaseDate: '' }));
                }}
                className={`p-2.5 sm:p-2 border-2 ${vehicleErrors.purchaseDate ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {vehicleErrors.purchaseDate && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {vehicleErrors.purchaseDate}
                </span>
              )}
            </div>

          </div>

          {/* Form Actions */}
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
            <button
              type="button"
              id="btn-veh-cancel"
              onClick={() => {
                setIsModalOpen(false);
                setEditingVehicle(null);
              }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-veh-submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-neo-accent border-2 border-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
            >
              {editingVehicle ? 'Update' : 'Register'}
            </button>
          </div>

        </form>
      </NeoModal>

      {/* Modal: Log Maintenance */}
      <NeoModal
        isOpen={maintModalOpen}
        onClose={() => {
          setMaintModalOpen(false);
          setMaintVehicle(null);
          setEditingMaintRecord(null);
          setMaintErrors({});
        }}
        title={editingMaintRecord ? `Edit Maintenance - ${maintVehicle?.name || ''}` : `Log Maintenance - ${maintVehicle?.name || ''}`}
      >
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!maintVehicle) return;

          const errors: Record<string, string> = {};
          if (!maintForm.date) {
            errors.date = 'Date is required';
          }
          if (!maintForm.itemType) {
            errors.itemType = 'Maintenance item type is required';
          }

          const finalItemType = maintForm.itemType === 'custom' ? customItemType.trim() : maintForm.itemType;
          if (maintForm.itemType === 'custom' && !finalItemType) {
            errors.customItemType = 'Please specify custom maintenance item type';
          }

          if (!maintForm.odometer) {
            errors.odometer = 'Odometer is required';
          } else {
            const odo = parseFloat(maintForm.odometer);
            if (isNaN(odo) || odo < 0) {
              errors.odometer = 'Odometer must be a non-negative number';
            }
          }

          if (maintForm.cost) {
            const costVal = parseFloat(maintForm.cost);
            if (isNaN(costVal) || costVal < 0) {
              errors.cost = 'Cost must be a non-negative number';
            }
          }

          if (syncToExpense && maintForm.cost && parseFloat(maintForm.cost) > 0) {
            if (!expenseVendor.trim()) {
              errors.expenseVendor = 'Vendor / Service Center name is required to sync';
            }
          }

          if (Object.keys(errors).length > 0) {
            setMaintErrors(errors);
            showToast('Please correct the validation errors in the form.', 'error');
            return;
          }

          setMaintErrors({});

          const maintRecordId = editingMaintRecord ? editingMaintRecord.id : `mr-${Date.now()}`;
          let linkedExpenseId = editingMaintRecord?.expenseId || null;

          if (syncToExpense && maintForm.cost && parseFloat(maintForm.cost) > 0) {
            if (!linkedExpenseId) {
              linkedExpenseId = `e-${Date.now()}`;
            }

            const linkedExpense: Expense = {
              id: linkedExpenseId,
              vehicleId: maintVehicle.id,
              date: maintForm.date,
              category: expenseCategory,
              cost: parseFloat(maintForm.cost),
              vendor: expenseVendor.trim(),
              odometer: parseFloat(maintForm.odometer),
              notes: `Linked Maintenance: ${finalItemType}.${maintForm.notes ? ' ' + maintForm.notes : ''}`,
              maintenanceRecordId: maintRecordId,
              linkedMaintenanceTypes: [finalItemType]
            };

            await dbAPI.saveExpense(linkedExpense);
          } else if (linkedExpenseId) {
            await dbAPI.deleteExpense(linkedExpenseId);
            linkedExpenseId = null;
          }

          const record: MaintenanceRecord = {
            id: maintRecordId,
            vehicleId: maintVehicle.id,
            date: maintForm.date,
            itemType: finalItemType,
            odometer: parseFloat(maintForm.odometer),
            cost: maintForm.cost ? parseFloat(maintForm.cost) : null,
            notes: maintForm.notes,
            nextDueOdometer: null,
            nextDueDate: null,
            expenseId: linkedExpenseId
          };

          await dbAPI.saveMaintenanceRecord(record);
          showToast(
            editingMaintRecord
              ? `Maintenance and synced expense updated: ${record.itemType}`
              : `Maintenance and synced expense logged: ${record.itemType}`,
            'success'
          );
          
          setMaintModalOpen(false);
          setMaintVehicle(null);
          setEditingMaintRecord(null);
          onVehiclesChanged();
        }} className="flex flex-col gap-4 font-sans text-black dark:text-white">

          {!editingMaintRecord && (
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider text-black dark:text-white">Select Vehicle *</label>
              <NeoDropdown
                value={maintVehicle?.id || ''}
                onChange={(val) => {
                  const selectedV = vehicles.find(v => v.id === val);
                  if (selectedV) {
                    setMaintVehicle(selectedV);
                    setMaintForm(prev => ({
                      ...prev,
                      odometer: String(selectedV.odometer)
                    }));
                  }
                }}
                options={vehicles.map(v => ({
                  value: v.id,
                  label: (
                    <span className="flex items-center gap-1.5">
                      {v.profileImage ? (
                        <img src={v.profileImage} alt="" className="w-4.5 h-4.5 rounded-full object-cover border border-black/20 shrink-0" />
                      ) : (
                        <span className="shrink-0">{getVehicleIcon(v.type)}</span>
                      )}
                      <span className="truncate">{v.name.toUpperCase()}</span>
                    </span>
                  )
                }))}
                placeholder="Choose vehicle..."
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Date *</label>
              <input
                type="date"
                value={maintForm.date}
                onChange={(e) => {
                  setMaintForm({ ...maintForm, date: e.target.value });
                  if (maintErrors.date) setMaintErrors((prev) => ({ ...prev, date: '' }));
                }}
                className={`p-2.5 sm:p-2 border-2 ${maintErrors.date ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {maintErrors.date && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {maintErrors.date}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Item Type *</label>
              <NeoDropdown
                value={maintForm.itemType}
                onChange={(val) => {
                  setMaintForm({ ...maintForm, itemType: val });
                  if (maintErrors.itemType) setMaintErrors((prev) => ({ ...prev, itemType: '' }));
                }}
                options={
                  maintVehicle 
                    ? [
                        ...(maintVehicle.maintenanceSchedule ?? getVehicleDefaultSchedule(maintVehicle.type)).map((s) => ({
                          value: s.type,
                          label: s.type
                        })),
                        { value: 'custom', label: '✏️ Custom / Other (Type manually)' }
                      ]
                    : []
                }
                placeholder="-- Select --"
                className="w-full"
              />
              {maintErrors.itemType && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {maintErrors.itemType}
                </span>
              )}
            </div>
          </div>

          {maintForm.itemType === 'custom' && (
            <div className="flex flex-col gap-1 animate-fadeIn">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Custom Item Name *</label>
              <input
                type="text"
                value={customItemType}
                onChange={(e) => {
                  setCustomItemType(e.target.value);
                  if (maintErrors.customItemType) setMaintErrors((prev) => ({ ...prev, customItemType: '' }));
                }}
                placeholder="e.g. Spark Plugs, Wheel Alignment"
                className={`p-2.5 sm:p-2 border-2 ${maintErrors.customItemType ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-black dark:text-white`}
              />
              {maintErrors.customItemType && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {maintErrors.customItemType}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Odometer (km) *</label>
              <input
                type="number"
                value={maintForm.odometer}
                onChange={(e) => {
                  setMaintForm({ ...maintForm, odometer: e.target.value });
                  if (maintErrors.odometer) setMaintErrors((prev) => ({ ...prev, odometer: '' }));
                }}
                className={`p-2.5 sm:p-2 border-2 ${maintErrors.odometer ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {maintErrors.odometer && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {maintErrors.odometer}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Cost ({currency}) (optional)</label>
              <input
                type="number"
                value={maintForm.cost}
                onChange={(e) => {
                  setMaintForm({ ...maintForm, cost: e.target.value });
                  if (maintErrors.cost) setMaintErrors((prev) => ({ ...prev, cost: '' }));
                }}
                placeholder="0"
                className={`p-2.5 sm:p-2 border-2 ${maintErrors.cost ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-mono text-black dark:text-white`}
              />
              {maintErrors.cost && (
                <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                  ⚠️ {maintErrors.cost}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Notes</label>
            <input
              type="text"
              value={maintForm.notes}
              onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })}
              placeholder="E.g., Replaced brake pads, front axle"
              className="p-2.5 sm:p-2 border-2 border-black dark:border-white bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-black dark:text-white focus:border-neo-accent"
            />
          </div>

          {/* Sync to Expense / Bills */}
          <div className="p-3 border-2 border-black dark:border-white bg-purple-50 dark:bg-purple-950/20 rounded flex flex-col gap-3">
            <label className="flex items-center gap-2 font-display font-bold text-xs uppercase tracking-wider cursor-pointer select-none text-black dark:text-white">
              <input
                type="checkbox"
                checked={syncToExpense}
                onChange={(e) => setSyncToExpense(e.target.checked)}
                className="w-4 h-4 border-2 border-black dark:border-white accent-purple-600 focus:ring-0 cursor-pointer"
                disabled={!maintForm.cost || parseFloat(maintForm.cost) <= 0}
              />
              <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Link & Sync with Bills (Expenses) Log</span>
            </label>

            {(!maintForm.cost || parseFloat(maintForm.cost) <= 0) && (
              <p className="text-[10px] text-gray-500 italic pl-6 leading-normal">
                (Enter a cost value above to enable automatic billing sync)
              </p>
            )}

            {syncToExpense && maintForm.cost && parseFloat(maintForm.cost) > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 border-l-2 border-black/15 animate-fadeIn">
                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300">Bill Expense Category *</label>
                  <NeoDropdown
                    value={expenseCategory}
                    onChange={(val) => setExpenseCategory(val as ExpenseCategory)}
                    options={[
                      { value: 'Service', label: 'Service' },
                      { value: 'Repair', label: 'Repair' },
                      { value: 'Tires', label: 'Tires' },
                      { value: 'Battery', label: 'Battery' },
                      { value: 'Other', label: 'Other' },
                    ]}
                    className="w-full bg-white dark:bg-neo-dark-bg"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-display font-bold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300">Vendor / Service Center Name *</label>
                  <input
                    type="text"
                    value={expenseVendor}
                    onChange={(e) => {
                      setExpenseVendor(e.target.value);
                      if (maintErrors.expenseVendor) setMaintErrors((prev) => ({ ...prev, expenseVendor: '' }));
                    }}
                    placeholder="e.g. Authorized Service Center"
                    className={`p-2 sm:p-1.5 border-2 ${maintErrors.expenseVendor ? 'border-[#ff6b6b] focus:border-[#ff6b6b]' : 'border-black dark:border-white focus:border-neo-accent'} bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold text-xs text-black dark:text-white`}
                  />
                  {maintErrors.expenseVendor && (
                    <span className="font-mono text-[10px] font-bold text-[#ff6b6b] mt-0.5 flex items-center gap-1">
                      ⚠️ {maintErrors.expenseVendor}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
            <button
              type="button"
              onClick={() => {
                setMaintModalOpen(false);
                setMaintVehicle(null);
                setEditingMaintRecord(null);
              }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-neo-accent border-2 border-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
            >
              {editingMaintRecord ? 'Save Changes' : 'Log Maintenance'}
            </button>
          </div>
        </form>
      </NeoModal>

      {/* Maintenance SCHEDULE edit modal — opened by clicking a list item in
          the Maintenance Tracker section above. Edits the interval config
          itself (km/month due + enabled), not a logged service record. */}
      <NeoModal
        isOpen={!!scheduleEditVehicle && !!scheduleEditItem}
        onClose={handleCloseScheduleEdit}
        title={scheduleEditItem ? `Edit "${scheduleEditItem.type}" Schedule` : 'Edit Schedule'}
      >
        {scheduleEditVehicle && scheduleEditItem && (
          <div className="flex flex-col gap-4 font-sans text-black dark:text-white">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {scheduleEditVehicle.name} • Set how often this maintenance item is due. Leave a field blank to not track it by that measure.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Every (KM)</label>
                <input
                  type="number"
                  min="0"
                  value={scheduleFormKm}
                  onChange={(e) => setScheduleFormKm(e.target.value)}
                  placeholder="e.g. 5000"
                  className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-display font-bold text-xs uppercase tracking-wider">Every (Months)</label>
                <input
                  type="number"
                  min="0"
                  value={scheduleFormMonths}
                  onChange={(e) => setScheduleFormMonths(e.target.value)}
                  placeholder="e.g. 12"
                  className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t-2 border-black/10 dark:border-white/10 pt-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="font-display font-bold text-xs uppercase tracking-wider">Due Soon Alert Thresholds</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Trigger a yellow "Due Soon" alert when remaining time or distance drops below these limits:
              </p>
              <div className="grid grid-cols-2 gap-4 mt-1">
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-[11px] uppercase tracking-wide">Alert Days Left</label>
                  <input
                    type="number"
                    min="1"
                    value={scheduleFormDueSoonDays}
                    onChange={(e) => setScheduleFormDueSoonDays(e.target.value)}
                    placeholder="e.g. 15"
                    className="p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono text-xs focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400">e.g. 15 days before due date</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-[11px] uppercase tracking-wide">Alert KM Left</label>
                  <input
                    type="number"
                    min="0"
                    value={scheduleFormDueSoonKm}
                    onChange={(e) => setScheduleFormDueSoonKm(e.target.value)}
                    placeholder="e.g. 500"
                    className="p-2 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono text-xs focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400">e.g. 500 km before limit</span>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scheduleFormEnabled}
                onChange={(e) => setScheduleFormEnabled(e.target.checked)}
                className="w-4 h-4 accent-neo-accent"
              />
              <span className="text-xs font-bold uppercase">Track this item on the dashboard</span>
            </label>

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={handleCloseScheduleEdit}
                className="flex-1 p-3 border-2 border-black bg-white dark:bg-neo-dark-bg font-display font-bold text-xs uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScheduleEdit}
                className="flex-1 p-3 bg-neo-accent border-2 border-black font-display font-black text-xs uppercase hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </NeoModal>

      {/* MODAL: VIEW HISTORY */}
      <NeoModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setHistoryVehicle(null);
        }}
        title={`Maintenance History - ${historyVehicle?.name || ''}`}
      >
        {historyVehicle && (
          <div className="flex flex-col gap-4 font-sans text-black dark:text-white max-h-[80vh] overflow-y-auto">
            {/* Quick stats panel */}
            {(() => {
              const vehicleRecords = maintenanceRecords
                .filter((r) => r.vehicleId === historyVehicle.id)
                .sort((a, b) => b.date.localeCompare(a.date));

              const totalSpent = vehicleRecords.reduce((sum, r) => sum + (r.cost ?? 0), 0);
              const serviceCount = vehicleRecords.length;
              const lastServiceOdo = vehicleRecords.length > 0 ? vehicleRecords[0].odometer : null;
              const kmSinceLastService = lastServiceOdo !== null ? Math.max(0, historyVehicle.odometer - lastServiceOdo) : null;

              return (
                <div className="grid grid-cols-3 gap-2 border-2 border-black bg-neo-bg dark:bg-zinc-900 p-2.5 neo-shadow-sm">
                  <div className="flex flex-col items-center justify-center text-center p-1.5 border border-black/15">
                    <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Total Spent</span>
                    <span className="text-xs font-mono font-black mt-0.5">
                      {totalSpent > 0 ? formatCurrency(totalSpent, currency) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center p-1.5 border border-black/15">
                    <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Logs Count</span>
                    <span className="text-xs font-mono font-black mt-0.5">{serviceCount}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center p-1.5 border border-black/15">
                    <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Since Last</span>
                    <span className="text-xs font-mono font-black mt-0.5">
                      {kmSinceLastService !== null ? `${Math.round(kmSinceLastService).toLocaleString()} km` : '—'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Records List */}
            <div className="flex flex-col gap-3 mt-1">
              {(() => {
                const vehicleRecords = maintenanceRecords
                  .filter((r) => r.vehicleId === historyVehicle.id)
                  .sort((a, b) => b.date.localeCompare(a.date));

                if (vehicleRecords.length === 0) {
                  return (
                    <div className="text-center py-8 border-2 border-dashed border-black/25 dark:border-white/25 rounded p-4 bg-white dark:bg-neo-dark-card">
                      <History className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-xs font-bold uppercase">No records logged yet</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Use "+ Log Maintenance" to record your vehicle's service history.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                    {vehicleRecords.map((record) => (
                      <div
                        key={record.id}
                        className="bg-white dark:bg-zinc-900 border-2 border-black dark:border-white p-3 neo-shadow-sm flex flex-col gap-1.5 relative group"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="font-display font-black text-xs uppercase text-black dark:text-white block">
                              {record.itemType}
                            </span>
                            <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                              {formatDate(record.date)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-black block">
                              {record.cost !== null ? formatCurrency(record.cost, currency) : 'No Cost'}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-neo-accent-green block">
                              {record.odometer.toLocaleString()} km
                            </span>
                          </div>
                        </div>

                        {record.notes && (
                          <div className="entry-notes-box">
                            {record.notes}
                          </div>
                        )}

                        <div className="flex justify-end gap-1.5 mt-1 border-t border-black/10 dark:border-white/10 pt-1.5">
                          <button
                            type="button"
                            id={`btn-edit-maint-${record.id}`}
                            onClick={() => {
                              // Prep fields for editing
                              setEditingMaintRecord(record);
                              setMaintVehicle(historyVehicle);
                              
                              const scheduleTypes = (historyVehicle.maintenanceSchedule ?? getVehicleDefaultSchedule(historyVehicle.type)).map(s => s.type);
                              const isCustom = !scheduleTypes.includes(record.itemType);
                              
                              setMaintForm({
                                date: record.date,
                                itemType: isCustom ? 'custom' : record.itemType,
                                odometer: String(record.odometer),
                                cost: record.cost !== null ? String(record.cost) : '',
                                notes: record.notes
                              });
                              setCustomItemType(isCustom ? record.itemType : '');

                              // Fetch linked expense if exists
                              const linkedExp = record.expenseId ? expenses.find(e => e.id === record.expenseId) : null;
                              if (linkedExp) {
                                setSyncToExpense(true);
                                setExpenseCategory(linkedExp.category);
                                setExpenseVendor(linkedExp.vendor);
                              } else {
                                setSyncToExpense(false);
                                setExpenseCategory('Service');
                                setExpenseVendor('');
                              }
                              
                              // Close history modal, open edit modal
                              setHistoryModalOpen(false);
                              setMaintModalOpen(true);
                            }}
                            className="p-1 border-2 border-black bg-blue-300 hover:bg-blue-400 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer transition-colors"
                            title="Edit maintenance record"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            id={`btn-delete-maint-${record.id}`}
                            onClick={() => setDeleteMaintConfirmId(record.id)}
                            className="p-1 border-2 border-black bg-red-400 hover:bg-red-500 text-black rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer transition-colors"
                            title="Delete maintenance record"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="mt-2 border-t-2 border-black/10 dark:border-white/10 pt-3">
              <button
                type="button"
                onClick={() => {
                  setHistoryModalOpen(false);
                  setHistoryVehicle(null);
                }}
                className="w-full p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
              >
                Close History
              </button>
            </div>
          </div>
        )}
      </NeoModal>

      {/* FULL-PAGE: MAXIMIZED MAINTENANCE TRACKER */}
      <AnimatePresence>
        {maximizedMaintVehicle && (() => {
          // Support filtering by vehicle inside the maintenance hub!
          // maintHubVehicleId could be 'all' or a specific vehicle's ID.
          const activeVehicle = vehicles.find(v => v.id === maintHubVehicleId);
          
          let items: (MaintenanceAlert & { vehicle?: Vehicle })[] = [];
          let summary = { ok: 0, dueSoon: 0, overdue: 0 };

          if (maintHubVehicleId === 'all') {
            // Aggregate from all vehicles
            vehicles.forEach(v => {
              const res = getMaintenanceAlerts(v, expenses, maintenanceRecords, settings);
              res.items.forEach(item => {
                items.push({
                  ...item,
                  vehicle: v
                });
              });
              summary.ok += res.summary.ok;
              summary.dueSoon += res.summary.dueSoon;
              summary.overdue += res.summary.overdue;
            });
          } else {
            const v = activeVehicle || maximizedMaintVehicle;
            if (v) {
              const res = getMaintenanceAlerts(v, expenses, maintenanceRecords, settings);
              items = res.items.map(item => ({
                ...item,
                vehicle: v
              }));
              summary = res.summary;
            }
          }

          // Filter items based on selected filter and search term
          const filteredItems = items
            .filter(item => {
              // Search term match
              if (maximizedMaintSearch && !item.label.toLowerCase().includes(maximizedMaintSearch.toLowerCase()) && !item.subText.toLowerCase().includes(maximizedMaintSearch.toLowerCase())) {
                return false;
              }
              // Status filter match
              if (maximizedMaintFilter === 'All') return true;
              if (maximizedMaintFilter === 'Overdue') return item.status === 'Overdue';
              if (maximizedMaintFilter === 'Due Soon') return item.status === 'Due Soon';
              if (maximizedMaintFilter === 'OK') return item.status === 'OK';
              return true;
            })
            .sort((a, b) => {
              const score = (status: string) => status === 'Overdue' ? 2 : status === 'Due Soon' ? 1 : 0;
              return score(b.status) - score(a.status);
            });

          // Dynamic style classes based on design style setting
          const headerContainerClass = {
            neobrutalist: 'flex items-center justify-between px-4 sm:px-6 py-3 border-b-2 border-black dark:border-white bg-neo-accent text-[var(--accent-text-color)] select-none shrink-0 header-banner',
            refined: 'flex items-center justify-between px-4 sm:px-6 py-3 border-b border-black/10 bg-neo-accent text-[var(--accent-text-color)] select-none shrink-0 header-banner',
            material3: 'flex items-center justify-between px-4 sm:px-6 py-3 bg-neo-accent text-[var(--accent-text-color)] select-none shrink-0 header-banner',
            aistudio: 'flex items-center justify-between px-4 sm:px-6 py-3 border-b border-black/5 bg-neo-accent text-[var(--accent-text-color)] select-none shrink-0 header-banner'
          }[theme];

          const headerIconWrapperClass = {
            neobrutalist: 'p-1.5 border-2 border-black bg-white rounded-md shrink-0',
            refined: 'p-1.5 border border-black/15 bg-white/20 rounded-md shrink-0',
            material3: 'p-1.5 bg-black/10 rounded-full shrink-0',
            aistudio: 'p-1.5 border border-black/10 bg-white/20 rounded-lg shrink-0'
          }[theme];

          const headerIconClass = {
            neobrutalist: 'w-4 h-4 text-black',
            refined: 'w-4 h-4 text-[var(--accent-text-color)]',
            material3: 'w-4 h-4 text-[var(--accent-text-color)]',
            aistudio: 'w-4 h-4 text-[var(--accent-text-color)]'
          }[theme];

          const headerTitleTextClass = {
            neobrutalist: 'font-display font-black text-sm sm:text-base uppercase tracking-wider line-clamp-1 text-[var(--accent-text-color)]',
            refined: 'font-sans font-medium text-sm sm:text-base line-clamp-1 text-[var(--accent-text-color)]',
            material3: 'font-display font-medium text-sm sm:text-base line-clamp-1 text-[var(--accent-text-color)]',
            aistudio: 'font-display font-semibold text-sm sm:text-base line-clamp-1 text-[var(--accent-text-color)]'
          }[theme];

          const headerSubtextClass = {
            neobrutalist: 'font-mono text-[9px] sm:text-xs text-[var(--accent-text-color)]/75',
            refined: 'font-mono text-[9px] sm:text-xs text-[var(--accent-text-color)]/75',
            material3: 'font-mono text-[9px] sm:text-xs text-[var(--accent-text-color)]/75',
            aistudio: 'font-mono text-[9px] sm:text-xs text-[var(--accent-text-color)]/75'
          }[theme];

          const headerCloseButtonClass = {
            neobrutalist: 'p-1 border-2 border-black bg-white dark:bg-neo-dark-card hover:bg-red-400 dark:hover:bg-red-500 text-black dark:text-white rounded neo-shadow-sm active:translate-y-[1px] cursor-pointer flex items-center justify-center transition-all duration-75',
            refined: 'p-1 border border-black/15 bg-white/20 hover:bg-red-500 hover:text-white text-[var(--accent-text-color)] rounded active:scale-95 transition-all cursor-pointer flex items-center justify-center',
            material3: 'p-1.5 bg-black/15 hover:bg-[#ffb4ab] dark:hover:bg-[#ffb4ab] text-[var(--accent-text-color)] rounded-full active:scale-95 transition-all cursor-pointer flex items-center justify-center',
            aistudio: 'p-1.5 bg-black/10 hover:bg-red-500 text-[var(--accent-text-color)] hover:text-white rounded-lg active:scale-95 transition-all cursor-pointer flex items-center justify-center'
          }[theme];

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="fixed inset-0 z-40 bg-[#faf9f6] dark:bg-zinc-950 flex flex-col w-screen h-screen overflow-hidden text-black dark:text-white"
            >
              {/* Full Page Header */}
              <div className={headerContainerClass}>
                <div className="flex items-center gap-2.5">
                  <div className={headerIconWrapperClass}>
                    <Wrench className={headerIconClass} />
                  </div>
                  <div>
                    <h2 className={headerTitleTextClass}>
                      Maintenance Hub
                    </h2>
                    <p className={headerSubtextClass}>
                      {maintHubVehicleId === 'all' ? 'All Registered Vehicles' : `${activeVehicle?.name || maximizedMaintVehicle.name} ${activeVehicle?.registration ? `(${activeVehicle.registration})` : ''}`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-close-modal"
                  onClick={() => setMaximizedMaintVehicle(null)}
                  className={headerCloseButtonClass}
                  aria-label="Close maintenance hub"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Main Scrolling Content Area */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                <div className="max-w-4xl mx-auto flex flex-col gap-4">
                  
                  {/* Grid 1: Metrics summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    <div className="border-2 border-black dark:border-white/10 bg-white dark:bg-zinc-900 p-2.5 sm:p-3 neo-shadow-sm dark:neo-shadow-dark-sm flex flex-col justify-between h-16 sm:h-20">
                      <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none">Total Items</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xl sm:text-2xl font-mono font-black">{items.length}</span>
                        <Layers className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                    </div>
                    
                    <div className="border-2 border-black dark:border-white/10 bg-red-50 dark:bg-red-950/20 p-2.5 sm:p-3 neo-shadow-sm dark:neo-shadow-dark-sm flex flex-col justify-between h-16 sm:h-20">
                      <span className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider leading-none">Overdue Alerts</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xl sm:text-2xl font-mono font-black text-red-600 dark:text-red-400">{summary.overdue}</span>
                        <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 animate-pulse" />
                      </div>
                    </div>

                    <div className="border-2 border-black dark:border-white/10 bg-yellow-50 dark:bg-yellow-950/20 p-2.5 sm:p-3 neo-shadow-sm dark:neo-shadow-dark-sm flex flex-col justify-between h-16 sm:h-20">
                      <span className="text-[9px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider leading-none">Due Soon</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xl sm:text-2xl font-mono font-black text-yellow-600 dark:text-yellow-400">{summary.dueSoon}</span>
                        <Calendar className="w-4 h-4 text-yellow-500 shrink-0" />
                      </div>
                    </div>

                    <div className="border-2 border-black dark:border-white/10 bg-green-50 dark:bg-green-950/20 p-2.5 sm:p-3 neo-shadow-sm dark:neo-shadow-dark-sm flex flex-col justify-between h-16 sm:h-20">
                      <span className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider leading-none">All Status OK</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xl sm:text-2xl font-mono font-black text-green-600 dark:text-green-400">{summary.ok}</span>
                        <Award className="w-4 h-4 text-green-500 shrink-0" />
                      </div>
                    </div>
                  </div>

                  {/* Pinned Controls Panel with Vehicle Selector, Filters, and Action Buttons */}
                  <div className="flex flex-col gap-3 border-2 border-black dark:border-white/10 p-3 bg-white dark:bg-zinc-900 neo-shadow-sm dark:neo-shadow-dark-sm">
                    {/* Row 1: Vehicle Selector Dropdown, Search Input, and Status Filters */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
                        {/* Vehicle Dropdown Filter */}
                        <NeoDropdown
                          value={maintHubVehicleId}
                          onChange={(val) => setMaintHubVehicleId(val)}
                          options={[
                            { value: 'all', label: <span className="flex items-center gap-1.5">🚗 ALL VEHICLES</span> },
                            ...vehicles.map(v => ({
                              value: v.id,
                              label: (
                                <span className="flex items-center gap-1.5">
                                  {v.profileImage ? (
                                    <img src={v.profileImage} alt="" className="w-4 h-4 rounded-full object-cover border border-black/20 shrink-0" />
                                  ) : (
                                    <span className="shrink-0">{getVehicleIcon(v.type)}</span>
                                  )}
                                  <span className="truncate">{v.name.toUpperCase()}</span>
                                </span>
                              )
                            }))
                          ]}
                          compact={true}
                          className="min-w-[150px] shrink-0"
                        />

                        <input
                          type="text"
                          placeholder="Search maintenance items..."
                          value={maximizedMaintSearch}
                          onChange={(e) => setMaximizedMaintSearch(e.target.value)}
                          className="flex-1 p-1.5 text-xs border-2 border-black dark:border-white/10 bg-white dark:bg-zinc-800 text-black dark:text-white focus:outline-none focus:ring-0 rounded-sm"
                        />
                      </div>

                      <div className="flex gap-1 overflow-x-auto shrink-0 pb-0.5 sm:pb-0">
                        {(['All', 'Overdue', 'Due Soon', 'OK'] as const).map((filterOpt) => (
                          <button
                            key={filterOpt}
                            type="button"
                            onClick={() => setMaximizedMaintFilter(filterOpt)}
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase border-2 border-black dark:border-white/10 transition-colors cursor-pointer rounded-sm whitespace-nowrap ${
                              maximizedMaintFilter === filterOpt
                                ? 'bg-neo-accent text-black border-black'
                                : 'bg-white dark:bg-zinc-800 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {filterOpt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Row 2: View History and Log Maintenance Buttons (pinned directly below on same row) */}
                    <div className="flex gap-2.5">
                      {maintHubVehicleId !== 'all' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const targetVehicle = activeVehicle || maximizedMaintVehicle;
                              if (targetVehicle) {
                                setHistoryVehicle(targetVehicle);
                                setHistoryModalOpen(true);
                              }
                            }}
                            className="flex-1 py-2 px-3 border-2 border-black bg-blue-300 hover:bg-blue-400 text-black font-display font-black text-[10px] sm:text-xs uppercase cursor-pointer text-center flex items-center justify-center gap-1.5 active:translate-y-[1px] transition-all rounded-sm shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
                          >
                            <History className="w-3.5 h-3.5" />
                            View History
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMaintRecord(null);
                              const targetVehicle = activeVehicle || maximizedMaintVehicle || vehicles[0];
                              if (!targetVehicle) return;
                              setMaintVehicle(targetVehicle);
                              setMaintForm({
                                date: getLocalDateString(),
                                itemType: '',
                                odometer: String(targetVehicle.odometer),
                                cost: '',
                                notes: ''
                              });
                              setCustomItemType('');
                              setSyncToExpense(false);
                              setExpenseCategory('Service');
                              setExpenseVendor('');
                              setMaintModalOpen(true);
                            }}
                            className="flex-1 py-2 px-3 border-2 border-black bg-neo-accent hover:bg-orange-600 text-black font-display font-black text-[10px] sm:text-xs uppercase cursor-pointer text-center flex items-center justify-center gap-1.5 active:translate-y-[1px] transition-all rounded-sm shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Log Maintenance
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMaintRecord(null);
                            const targetVehicle = vehicles[0];
                            if (!targetVehicle) return;
                            setMaintVehicle(targetVehicle);
                            setMaintForm({
                              date: getLocalDateString(),
                              itemType: '',
                              odometer: String(targetVehicle.odometer),
                              cost: '',
                              notes: ''
                            });
                            setCustomItemType('');
                            setSyncToExpense(false);
                            setExpenseCategory('Service');
                            setExpenseVendor('');
                            setMaintModalOpen(true);
                          }}
                          className="w-full py-2 px-3 border-2 border-black bg-neo-accent hover:bg-orange-600 text-black font-display font-black text-[10px] sm:text-xs uppercase cursor-pointer text-center flex items-center justify-center gap-1.5 active:translate-y-[1px] transition-all rounded-sm shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Log Maintenance
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact Scrolling List */}
                  <div className="border-2 border-black dark:border-white/10 bg-white dark:bg-neo-dark-card divide-y-2 divide-black/15 dark:divide-white/5 neo-shadow-sm dark:neo-shadow-dark-sm">
                    {filteredItems.length === 0 ? (
                      <div className="p-8 text-center text-xs text-gray-400 font-mono">
                        No matching maintenance items found.
                      </div>
                    ) : (
                      filteredItems.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (item.scheduleItem && item.vehicle) {
                              handleOpenScheduleEdit(item.vehicle, item.scheduleItem);
                            }
                          }}
                          className={`p-2.5 sm:p-3 flex flex-col gap-2 cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-[filter] maint-item-row status-${item.status.toLowerCase().replace(' ', '-')} ${item.bgColor}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="font-display font-black text-xs sm:text-sm text-black uppercase leading-tight block truncate maint-item-label">
                                {item.label}
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {maintHubVehicleId === 'all' && item.vehicle && (
                                  <span className="px-1 border border-black/30 bg-white/50 text-[9px] font-bold uppercase rounded-sm text-black shrink-0 leading-none py-0.5">
                                    {getVehicleIcon(item.vehicle.type)} {item.vehicle.name}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono text-black/70 block maint-item-subtext">
                                  {item.subText}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 border border-black text-[9px] font-bold uppercase rounded leading-none maint-item-status-badge ${
                                item.status === 'OK' ? 'bg-green-400 text-black' :
                                item.status === 'Due Soon' ? 'bg-yellow-400 text-black' : 'bg-red-400 text-black animate-pulse'
                              }`}>
                                {item.status}
                              </span>
                              <div className="p-1 border border-black/15 bg-white/20 rounded">
                                <PenTool className="w-3.5 h-3.5 text-black/60 maint-item-pentool" />
                              </div>
                            </div>
                          </div>

                          {item.progress !== undefined && (
                            <div className="w-full">
                              <div className="w-full h-1.5 bg-black/10 border border-black rounded-sm maint-item-progress-bg overflow-hidden">
                                <div 
                                  className={`h-full maint-item-progress-fill transition-all duration-300 status-${item.status.toLowerCase().replace(' ', '-')} ${
                                    item.status === 'OK' ? 'bg-green-400' :
                                    item.status === 'Due Soon' ? 'bg-yellow-400' : 'bg-red-400'
                                  }`}
                                  style={{ width: `${Math.min(100, item.progress * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Compact Bottom Controls Panel */}
                  <div className="flex justify-center mt-3">
                    <button
                      type="button"
                      onClick={() => setMaximizedMaintVehicle(null)}
                      className="px-6 py-2 border-2 border-black bg-white dark:bg-zinc-800 text-black dark:text-white font-display font-black text-xs sm:text-sm uppercase hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer active:translate-y-[1px] transition-all rounded neo-shadow-sm"
                    >
                      Close Maintenance Hub
                    </button>
                  </div>

                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!deleteMaintConfirmId}
        title="Delete Maintenance Record"
        message="Are you sure you want to permanently delete this maintenance log record and its linked bill from the database?"
        onConfirm={async () => {
          if (deleteMaintConfirmId) {
            const maintRecord = maintenanceRecords.find(m => m.id === deleteMaintConfirmId);
            if (maintRecord && maintRecord.expenseId) {
              await dbAPI.deleteExpense(maintRecord.expenseId);
            }
            await dbAPI.deleteMaintenanceRecord(deleteMaintConfirmId);
            onVehiclesChanged();
            showToast('Maintenance record and linked bill deleted successfully!', 'deleted');
          }
          setDeleteMaintConfirmId(null);
        }}
        onCancel={() => setDeleteMaintConfirmId(null)}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        title="Delete Vehicle"
        message="CRITICAL WARNING: Are you sure you want to delete this vehicle? Deleting this vehicle will PERMANENTLY erase all of its related fuel logs, trip sheets, non-fuel expenses, and receipt images from your browser's offline database!"
        onConfirm={async () => {
          if (deleteConfirmId) {
            await dbAPI.deleteVehicle(deleteConfirmId);
            onVehiclesChanged();
            showToast('Vehicle deleted successfully from garage!', 'deleted');
          }
          setDeleteConfirmId(null);
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />

    </div>
  );
}

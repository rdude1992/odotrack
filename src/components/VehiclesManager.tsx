/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Vehicle, VehicleType, FuelLog, Trip, Expense, MaintenanceRecord, MaintenanceScheduleItem } from '../types';
import { dbAPI } from '../db';
import { formatDate, getFirstOdoEntry, getMaintenanceAlerts, getVehicleDefaultSchedule, getLocalDateString } from '../utils';
import ConfirmModal from './ConfirmModal';
import NeoModal from './NeoModal';
import NeoDropdown from './NeoDropdown';
import { useToast } from './ToastContext';
import { Plus, Edit2, Trash2, ShieldAlert, Award, Calendar, Layers, PenTool, Wrench, ChevronDown, ChevronUp, History, X } from 'lucide-react';

interface VehiclesProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  trips: Trip[];
  expenses: Expense[];
  maintenanceRecords: MaintenanceRecord[];
  onVehiclesChanged: () => void;
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
  onVehiclesChanged
}: VehiclesProps) {
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

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

  // Maintenance section state
  const [expandedMaintId, setExpandedMaintId] = useState<string | null>(null);
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [maintVehicle, setMaintVehicle] = useState<Vehicle | null>(null);
  const [maintForm, setMaintForm] = useState({ date: '', itemType: '', odometer: '', cost: '', notes: '' });
  const [editingMaintRecord, setEditingMaintRecord] = useState<MaintenanceRecord | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [deleteMaintConfirmId, setDeleteMaintConfirmId] = useState<string | null>(null);

  // Maintenance SCHEDULE edit state (interval/enabled config, opened by
  // clicking a maintenance tracker list item — separate from the maintenance
  // RECORD form above, which logs an actual service that was performed).
  const [scheduleEditVehicle, setScheduleEditVehicle] = useState<Vehicle | null>(null);
  const [scheduleEditItem, setScheduleEditItem] = useState<MaintenanceScheduleItem | null>(null);
  const [scheduleFormKm, setScheduleFormKm] = useState('');
  const [scheduleFormMonths, setScheduleFormMonths] = useState('');
  const [scheduleFormEnabled, setScheduleFormEnabled] = useState(true);

  // Handle opening for Create vs Edit
  useEffect(() => {
    if (isModalOpen) {
      if (editingVehicle) {
        setFormName(editingVehicle.name);
        setFormType(editingVehicle.type);
        setFormFuelType(editingVehicle.fuelType);
        setFormRegistration(editingVehicle.registration);
        // Backward compat: fall back to odometer if startingOdometer was never set
        const startingOdo = editingVehicle.startingOdometer ?? editingVehicle.odometer;
        setFormOdometer(String(startingOdo));
        setFormPurchaseDate(editingVehicle.purchaseDate);
      } else {
        setFormName('');
        setFormType('car');
        setFormFuelType('Petrol');
        setFormRegistration('');
        setFormOdometer('');
        setFormPurchaseDate(getLocalDateString());
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

    if (!formName || !formType || !formFuelType || !formOdometer || !formPurchaseDate) {
      alert('Please fill out all required fields.');
      return;
    }

    const odoNum = parseFloat(formOdometer);

    const vehicleData: Vehicle = {
      id: editingVehicle ? editingVehicle.id : `v-${Date.now()}`,
      name: formName,
      type: formType,
      fuelType: formFuelType,
      registration: formRegistration || 'N/A',
      odometer: editingVehicle ? editingVehicle.odometer : odoNum,
      startingOdometer: odoNum,
      purchaseDate: formPurchaseDate,
      maintenanceSchedule: editingVehicle
        ? editingVehicle.maintenanceSchedule // preserve existing
        : getVehicleDefaultSchedule(formType)
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

  return (
    <div className="w-full flex flex-col gap-4 select-none">

      {/* Pinned Header + Controls */}
      <div className="sticky top-0 z-30 space-y-2">
        {/* Header Card — Neo-brutalist like modal */}
        <div className={`bg-neo-accent border-2 border-black neo-shadow transition-all duration-300 ${isScrolled ? 'px-3 py-2' : 'px-5 py-3.5'}`}>
          <h2 className={`font-display font-black text-black uppercase tracking-wider transition-all ${isScrolled ? 'text-lg leading-none' : 'text-xl'}`}>My Garage</h2>
        </div>
        {/* Controls Card */}
        <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border dark:border-white neo-shadow dark:neo-shadow-dark transition-all duration-300 ${isScrolled ? 'p-2' : 'p-4'}`}>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              id="btn-add-vehicle"
              onClick={() => {
                setEditingVehicle(null);
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-neo-accent text-black font-display font-black text-xs uppercase border-2 border-black hover:bg-orange-600 neo-shadow-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>ADD VEHICLE</span>
            </button>
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
                    <span className="text-3xl p-1 bg-neo-bg border-2 border-black rounded shadow-sm">{getVehicleIcon(v.type)}</span>
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
                    <span className="font-bold text-black uppercase px-1.5 py-0.5 border border-black bg-neo-accent-yellow leading-none text-[10px]">
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

                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>Purchased:</span>
                    </span>
                    <span className="font-semibold text-gray-600 dark:text-gray-300">{formatDate(v.purchaseDate)}</span>
                  </div>
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
                const { items, summary } = getMaintenanceAlerts(v, expenses, maintenanceRecords);
                const hasIssues = summary.dueSoon > 0 || summary.overdue > 0;
                const isExpanded = expandedMaintId === v.id;

                return (
                  <div className="mt-3 border-2 border-black bg-white dark:bg-neo-dark-card">
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
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expanded list */}
                    {isExpanded && (
                      <div className="border-t-2 border-black">
                        <div className="max-h-[200px] overflow-y-auto">
                          {items.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.scheduleItem) handleOpenScheduleEdit(v, item.scheduleItem);
                              }}
                              className={`p-2 flex items-center justify-between gap-2 cursor-pointer hover:brightness-95 transition-[filter] ${item.bgColor} ${idx > 0 ? 'border-t border-black/10' : ''}`}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-display font-bold text-[10px] text-black uppercase leading-tight block truncate">{item.label}</span>
                                <span className="text-[9px] font-mono text-black/70 block truncate">{item.subText}</span>
                              </div>
                              <span className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold uppercase rounded leading-none shrink-0 ${
                                item.status === 'OK' ? 'bg-green-400 text-black' :
                                item.status === 'Due Soon' ? 'bg-yellow-400 text-black' : 'bg-red-400 text-black animate-pulse'
                              }`}>
                                {item.status}
                              </span>
                              <PenTool className="w-3 h-3 text-black/40 shrink-0" />
                            </div>
                          ))}
                        </div>
                        <div className="flex border-t-2 border-black">
                          <button
                            onClick={() => {
                              setHistoryVehicle(v);
                              setHistoryModalOpen(true);
                            }}
                            className="flex-1 p-2 bg-blue-300 text-black font-display font-bold text-[10px] uppercase border-r-2 border-black hover:bg-blue-400 cursor-pointer"
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
                              setMaintModalOpen(true);
                            }}
                            className="flex-1 p-2 bg-neo-accent text-black font-display font-bold text-[10px] uppercase hover:bg-orange-600 cursor-pointer"
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

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Vehicle Display Name *</label>
            <input
              type="text"
              id="form-veh-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="E.g., Retro Cruiser, Red Rocket, Daily commuter"
              required
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none focus:border-neo-accent font-semibold"
            />
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Registration License plate */}
            <div className="flex flex-col gap-1 sm:col-span-1">
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

            {/* Odometer */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">
                {editingVehicle ? 'Current Odometer *' : 'Starting Odometer *'}
              </label>
              <input
                type="number"
                id="form-veh-odo"
                value={formOdometer}
                onChange={(e) => setFormOdometer(e.target.value)}
                placeholder="0"
                required
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono"
              />
            </div>

            {/* Purchase date */}
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Acquisition Date *</label>
              <input
                type="date"
                id="form-veh-purchase"
                value={formPurchaseDate}
                onChange={(e) => setFormPurchaseDate(e.target.value)}
                required
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono"
              />
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
        onClose={() => { setMaintModalOpen(false); setMaintVehicle(null); }}
        title={`Log Maintenance - ${maintVehicle?.name || ''}`}
      >
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!maintVehicle || !maintForm.itemType || !maintForm.odometer) return;

          const record: MaintenanceRecord = {
            id: `mr-${Date.now()}`,
            vehicleId: maintVehicle.id,
            date: maintForm.date,
            itemType: maintForm.itemType,
            odometer: parseFloat(maintForm.odometer),
            cost: maintForm.cost ? parseFloat(maintForm.cost) : null,
            notes: maintForm.notes,
            nextDueOdometer: null,
            nextDueDate: null
          };

          await dbAPI.saveMaintenanceRecord(record);
          if (maintVehicle) {
            showToast(`Maintenance logged: ${record.itemType}`, 'success');
          }
          setMaintModalOpen(false);
          setMaintVehicle(null);
          onVehiclesChanged();
        }} className="flex flex-col gap-4 font-sans text-black dark:text-white">

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Date *</label>
              <input
                type="date"
                required
                value={maintForm.date}
                onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })}
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Item Type *</label>
              <select
                required
                value={maintForm.itemType}
                onChange={(e) => setMaintForm({ ...maintForm, itemType: e.target.value })}
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold"
              >
                <option value="">-- Select --</option>
                {maintVehicle && (maintVehicle.maintenanceSchedule ?? getVehicleDefaultSchedule(maintVehicle.type)).map((s) => (
                  <option key={s.type} value={s.type}>{s.type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Odometer (km) *</label>
              <input
                type="number"
                required
                value={maintForm.odometer}
                onChange={(e) => setMaintForm({ ...maintForm, odometer: e.target.value })}
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-display font-bold text-xs uppercase tracking-wider">Cost (optional)</label>
              <input
                type="number"
                value={maintForm.cost}
                onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })}
                placeholder="0"
                className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-xs uppercase tracking-wider">Notes</label>
            <input
              type="text"
              value={maintForm.notes}
              onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })}
              placeholder="E.g., Replaced brake pads, front axle"
              className="p-2.5 sm:p-2 border-2 border-black bg-white dark:bg-neo-dark-bg focus:outline-none font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 border-t-2 border-black/10 dark:border-white/10 pt-4 mt-2">
            <button
              type="button"
              onClick={() => { setMaintModalOpen(false); setMaintVehicle(null); }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border-2 border-black hover:bg-gray-100 dark:hover:bg-zinc-800 font-display font-bold text-xs uppercase active:translate-y-[1px] cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-neo-accent border-2 border-black font-display font-bold text-xs uppercase hover:bg-orange-600 neo-shadow-sm active:translate-y-[1px] cursor-pointer text-center"
            >
              Log Maintenance
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
                  placeholder="e.g. 6"
                  className="p-2.5 border-2 border-black bg-white dark:bg-neo-dark-bg font-mono focus:outline-none"
                />
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

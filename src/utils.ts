/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vehicle, VehicleType, FuelLog, Trip, Expense, TripPurpose, MaintenanceRecord, MaintenanceScheduleItem, Journey, AppSettings } from './types';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as XLSX from 'xlsx';

/**
 * Today's date as a 'YYYY-MM-DD' string using the DEVICE'S LOCAL calendar
 * day — not `new Date().toISOString().split('T')[0]`, which is UTC and
 * shows the wrong date for part of every day in any timezone ahead of UTC
 * (e.g. IST, UTC+5:30): from midnight to 5:30am IST, that UTC-based pattern
 * still reports *yesterday's* date. Every "default to today" field in the
 * app (fuel/expense/trip date, journey start date, backup filename, etc.)
 * should use this instead.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a stored 'YYYY-MM-DD' date-only string as LOCAL midnight.
 * `new Date('2026-07-11')` parses as UTC midnight, which JS then displays/
 * computes against using the device's local timezone — for any timezone
 * BEHIND UTC (the Americas, etc.) that silently shifts the date back by a
 * day. Splitting the string and building the Date from local
 * year/month/day components avoids that entirely, regardless of the
 * device's timezone offset in either direction.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

// Format currency
export function formatCurrency(value: number, currencyCode: string = 'INR', decimals = 2): string {
  try {
    const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  } catch (e) {
    return `${currencyCode} ${value.toFixed(decimals)}`;
  }
}

// Format numbers
export function formatNumber(value: number, decimals = 1): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

// Format Date
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Get Year-Month string (YYYY-MM) from date
export function getYearMonth(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.substring(0, 7);
}

// Get start and end dates of a month
export function getMonthBounds(yearMonthStr: string) {
  const [year, month] = yearMonthStr.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// Calculate MoM cost changes
export function calculateMoMCosts(
  vehicleId: string | 'all',
  fuelLogs: FuelLog[],
  expenses: Expense[]
) {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const filterVehicle = (item: { vehicleId: string }) => 
    vehicleId === 'all' ? true : item.vehicleId === vehicleId;

  // Filter fuel costs
  const currentFuelLogs = fuelLogs.filter(l => filterVehicle(l) && getYearMonth(l.date) === currentYM);
  const prevFuelLogs = fuelLogs.filter(l => filterVehicle(l) && getYearMonth(l.date) === prevYM);
  
  const currentFuelCost = currentFuelLogs.reduce((sum, l) => sum + l.cost, 0);
  const prevFuelCost = prevFuelLogs.reduce((sum, l) => sum + l.cost, 0);

  // Filter expense costs
  const currentExpenses = expenses.filter(e => filterVehicle(e) && getYearMonth(e.date) === currentYM);
  const prevExpenses = expenses.filter(e => filterVehicle(e) && getYearMonth(e.date) === prevYM);

  const currentExpenseCost = currentExpenses.reduce((sum, e) => sum + e.cost, 0);
  const prevExpenseCost = prevExpenses.reduce((sum, e) => sum + e.cost, 0);

  const totalCurrent = currentFuelCost + currentExpenseCost;
  const totalPrev = prevFuelCost + prevExpenseCost;

  let pctChange = 0;
  if (totalPrev > 0) {
    pctChange = ((totalCurrent - totalPrev) / totalPrev) * 100;
  } else if (totalCurrent > 0) {
    pctChange = 100; // went from 0 to something
  }

  return {
    currentTotal: totalCurrent,
    prevTotal: totalPrev,
    pctChange: parseFloat(pctChange.toFixed(1)),
    currentFuel: currentFuelCost,
    currentOther: currentExpenseCost
  };
}

// Helper: safely coerce a value to a positive number
function toValidOdo(val: unknown): number | null {
  if (val == null) return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

// Get the first (minimum) odometer entry for a vehicle from all logs
export function getFirstOdoEntry(
  vehicleId: string,
  fuelLogs: FuelLog[],
  expenses: Expense[],
  trips: Trip[]
): number | null {
  const entries: number[] = [];

  fuelLogs
    .filter(l => l.vehicleId === vehicleId)
    .forEach(l => {
      const odo = toValidOdo(l.odometer);
      if (odo != null) entries.push(odo);
    });

  expenses
    .filter(e => e.vehicleId === vehicleId)
    .forEach(e => {
      const odo = toValidOdo(e.odometer);
      if (odo != null) entries.push(odo);
    });

  trips
    .filter(t => t.vehicleId === vehicleId)
    .forEach(t => {
      const start = toValidOdo(t.startOdo);
      const end = toValidOdo(t.endOdo);
      if (start != null) entries.push(start);
      if (end != null) entries.push(end);
    });

  if (entries.length === 0) return null;
  return Math.min(...entries);
}

// Calculate driven statistics
export function calculateDrivenStats(
  vehicleId: string | 'all',
  vehicles: Vehicle[],
  fuelLogs: FuelLog[],
  expenses: Expense[],
  trips: Trip[]
) {
  const filterVehicle = (vId: string) => vehicleId === 'all' ? true : vId === vehicleId;

  // Total expenditure (fuel + non-fuel)
  const vFuelLogs = fuelLogs.filter(l => filterVehicle(l.vehicleId));
  const vExpenses = expenses.filter(e => filterVehicle(e.vehicleId));
  const totalSpend = vFuelLogs.reduce((sum, l) => sum + l.cost, 0) + vExpenses.reduce((sum, e) => sum + e.cost, 0);

  // Driven distance
  let distanceDriven = 0;
  if (vehicleId !== 'all') {
    const v = vehicles.find(x => x.id === vehicleId);
    if (v) {
      const firstOdo = getFirstOdoEntry(vehicleId, fuelLogs, expenses, trips) ?? v.startingOdometer ?? 0;
      distanceDriven = Math.max(0, v.odometer - firstOdo);
    }
  } else {
    for (const v of vehicles) {
      const firstOdo = getFirstOdoEntry(v.id, fuelLogs, expenses, trips) ?? v.startingOdometer ?? 0;
      distanceDriven += Math.max(0, v.odometer - firstOdo);
    }
  }

  // Fallback: If distance driven calculations are 0 but trips exist, sum completed trip distance
  const vTrips = trips.filter(t => filterVehicle(t.vehicleId) && t.status === 'completed');
  const tripDistance = vTrips.reduce((sum, t) => sum + ((t.endOdo || 0) - t.startOdo), 0);
  if (distanceDriven === 0 && tripDistance > 0) {
    distanceDriven = tripDistance;
  }

  // Ensure distance driven is rounded to 1 decimal place
  distanceDriven = parseFloat(distanceDriven.toFixed(1));

  // Average mileage (km/L)
  const logsWithMileage = vFuelLogs.filter(l => l.mileageSinceLast !== null);
  const avgMileage = logsWithMileage.length > 0
    ? logsWithMileage.reduce((sum, l) => sum + (l.mileageSinceLast || 0), 0) / logsWithMileage.length
    : 0;

  // Cost per KM
  const costPerKm = distanceDriven > 0 ? totalSpend / distanceDriven : 0;

  return {
    distanceDriven,
    avgMileage: parseFloat(avgMileage.toFixed(2)),
    costPerKm: parseFloat(costPerKm.toFixed(2)),
    totalSpend
  };
}

// Calculate Maintenance Status
export interface MaintenanceAlert {
  label: string;
  status: 'OK' | 'Due Soon' | 'Overdue';
  subText: string;
  color: string; // Tailwind class
  bgColor: string; // Tailwind class
  scheduleItem?: MaintenanceScheduleItem; // underlying editable schedule config (present from getMaintenanceAlerts)
  progress?: number; // decimal from 0 to 1+
}

export function formatRemainingTime(days: number): string {
  if (days < 30) {
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  const months = Math.floor(days / 30);
  if (months < 1) {
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}

export function checkMaintenance(
  vehicle: Vehicle,
  expenses: Expense[]
): { service: MaintenanceAlert; tyres: MaintenanceAlert } {
  const currentOdo = vehicle.odometer;
  const purchaseDate = parseLocalDate(vehicle.purchaseDate);
  const now = new Date();

  // 1. SERVICE CHECK (Oil/Filter/Inspection)
  // Limit: every ~5,000–6,000 km OR ~150–180 days
  const serviceExpenses = expenses
    .filter(e => e.vehicleId === vehicle.id && e.category === 'Service')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // newest first

  let lastServiceOdo = 0;
  let lastServiceDate = purchaseDate;

  if (serviceExpenses.length > 0) {
    const lastService = serviceExpenses[0];
    lastServiceOdo = lastService.odometer || 0;
    lastServiceDate = parseLocalDate(lastService.date);
  }

  const odoDiffService = currentOdo - lastServiceOdo;
  const daysDiffService = Math.floor((now.getTime() - lastServiceDate.getTime()) / (1000 * 60 * 60 * 24));

  let serviceStatus: 'OK' | 'Due Soon' | 'Overdue' = 'OK';
  let serviceSub = '';
  let serviceColor = 'text-green-600 border-green-600';
  let serviceBg = 'bg-green-100';

  if (odoDiffService >= 6000 || daysDiffService >= 180) {
    serviceStatus = 'Overdue';
    serviceColor = 'text-red-600 border-red-600';
    serviceBg = 'bg-red-100';
    serviceSub = `${odoDiffService.toLocaleString()} km / ${daysDiffService} days ago (Limit: 5,000 km / 150 days)`;
  } else if (odoDiffService >= 5000 || daysDiffService >= 150) {
    serviceStatus = 'Due Soon';
    serviceColor = 'text-yellow-600 border-yellow-600';
    serviceBg = 'bg-yellow-100';
    serviceSub = `${odoDiffService.toLocaleString()} km / ${daysDiffService} days ago (Limit: 5,000 km / 150 days)`;
  } else {
    serviceStatus = 'OK';
    const kmLeft = Math.max(0, 5000 - odoDiffService);
    const daysLeft = Math.max(0, 150 - daysDiffService);
    serviceSub = `${kmLeft.toLocaleString()} km or ${daysLeft} days left`;
  }

  // 2. TYRES CHECK
  // Limit: every ~28,000–35,000 km OR ~4 years (1,460 days)
  const tyreExpenses = expenses
    .filter(e => e.vehicleId === vehicle.id && e.category === 'Tires')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let lastTyresOdo = 0;
  let lastTyresDate = purchaseDate;

  if (tyreExpenses.length > 0) {
    const lastTyres = tyreExpenses[0];
    lastTyresOdo = lastTyres.odometer || 0;
    lastTyresDate = parseLocalDate(lastTyres.date);
  }

  const odoDiffTyres = currentOdo - lastTyresOdo;
  const daysDiffTyres = Math.floor((now.getTime() - lastTyresDate.getTime()) / (1000 * 60 * 60 * 24));

  let tyresStatus: 'OK' | 'Due Soon' | 'Overdue' = 'OK';
  let tyresSub = '';
  let tyresColor = 'text-green-600 border-green-600';
  let tyresBg = 'bg-green-100';

  const FOUR_YEARS = 1460;
  const THREE_YEARS = 1095;

  if (odoDiffTyres >= 35000 || daysDiffTyres >= FOUR_YEARS) {
    tyresStatus = 'Overdue';
    tyresColor = 'text-red-600 border-red-600';
    tyresBg = 'bg-red-100';
    tyresSub = `${odoDiffTyres.toLocaleString()} km / ${Math.floor(daysDiffTyres/365)} yrs ago (Limit: 28,000 km / 4 yrs)`;
  } else if (odoDiffTyres >= 28000 || daysDiffTyres >= THREE_YEARS) {
    tyresStatus = 'Due Soon';
    tyresColor = 'text-yellow-600 border-yellow-600';
    tyresBg = 'bg-yellow-100';
    tyresSub = `${odoDiffTyres.toLocaleString()} km / ${Math.floor(daysDiffTyres/365)} yrs ago (Limit: 28,000 km / 4 yrs)`;
  } else {
    tyresStatus = 'OK';
    const kmLeft = Math.max(0, 28000 - odoDiffTyres);
    const daysLeft = Math.max(0, THREE_YEARS - daysDiffTyres);
    const timeText = formatRemainingTime(daysLeft);
    tyresSub = `${kmLeft.toLocaleString()} km or ${timeText} left`;
  }

  return {
    service: {
      label: 'Regular Service',
      status: serviceStatus,
      subText: serviceSub,
      color: serviceColor,
      bgColor: serviceBg
    },
    tyres: {
      label: 'Tyres Inspection',
      status: tyresStatus,
      subText: tyresSub,
      color: tyresColor,
      bgColor: tyresBg
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// NEW: Generic Maintenance Tracking System
// ═══════════════════════════════════════════════════════════════

export const VEHICLE_TYPE_MAINTENANCE: Record<VehicleType, { type: string; kmInterval: number | null; monthInterval: number | null; dueSoonDays?: number | null; dueSoonKm?: number | null }[]> = {
  car: [
    { type: 'General Service', kmInterval: 5000, monthInterval: 5 },
    { type: 'Oil Change', kmInterval: 10000, monthInterval: 12 },
    { type: 'Air Filter', kmInterval: 20000, monthInterval: 24 },
    { type: 'Tyres', kmInterval: 28000, monthInterval: 48 },
    { type: 'Brake Pads', kmInterval: 30000, monthInterval: 36 },
    { type: 'Battery', kmInterval: 40000, monthInterval: 48 },
    { type: 'PUC', kmInterval: null, monthInterval: 12 },
    { type: 'Insurance', kmInterval: null, monthInterval: 12 },
  ],
  bike: [
    { type: 'General Service', kmInterval: 3000, monthInterval: 3 },
    { type: 'Oil Change', kmInterval: 3000, monthInterval: 6 },
    { type: 'Chain Lubrication', kmInterval: 500, monthInterval: 1 },
    { type: 'Tyres', kmInterval: 20000, monthInterval: 36 },
    { type: 'Brake Pads', kmInterval: 15000, monthInterval: 24 },
    { type: 'Battery', kmInterval: 20000, monthInterval: 24 },
    { type: 'PUC', kmInterval: null, monthInterval: 12 },
    { type: 'Insurance', kmInterval: null, monthInterval: 12 },
  ],
  scooter: [
    { type: 'General Service', kmInterval: 3000, monthInterval: 3 },
    { type: 'Oil Change', kmInterval: 3000, monthInterval: 6 },
    { type: 'Belt', kmInterval: 10000, monthInterval: 12 },
    { type: 'Tyres', kmInterval: 15000, monthInterval: 36 },
    { type: 'Brake Pads', kmInterval: 12000, monthInterval: 24 },
    { type: 'Battery', kmInterval: 20000, monthInterval: 24 },
    { type: 'PUC', kmInterval: null, monthInterval: 12 },
    { type: 'Insurance', kmInterval: null, monthInterval: 12 },
  ],
  ev: [
    { type: 'General Service', kmInterval: 10000, monthInterval: 12 },
    { type: 'Battery Health Check', kmInterval: 20000, monthInterval: 12 },
    { type: 'Brake Fluid', kmInterval: 30000, monthInterval: 24 },
    { type: 'Tyres', kmInterval: 40000, monthInterval: 48 },
    { type: 'PUC', kmInterval: null, monthInterval: 12 },
    { type: 'Insurance', kmInterval: null, monthInterval: 12 },
  ],
  other: [
    { type: 'General Service', kmInterval: 5000, monthInterval: 6 },
    { type: 'Tyres', kmInterval: 28000, monthInterval: 48 },
    { type: 'PUC', kmInterval: null, monthInterval: 12 },
    { type: 'Insurance', kmInterval: null, monthInterval: 12 },
  ],
};

export function getVehicleDefaultSchedule(type: VehicleType) {
  const items = VEHICLE_TYPE_MAINTENANCE[type] || VEHICLE_TYPE_MAINTENANCE['other'];
  return items.map(item => ({
    ...item,
    enabled: true,
  }));
}

export function getMaintenanceAlerts(
  vehicle: Vehicle,
  expenses: Expense[],
  maintenanceRecords: MaintenanceRecord[],
  appSettings?: AppSettings
): { items: MaintenanceAlert[]; summary: { ok: number; dueSoon: number; overdue: number } } {
  const currentOdo = vehicle.odometer;
  const now = new Date();
  const schedule = vehicle.maintenanceSchedule ?? getVehicleDefaultSchedule(vehicle.type);

  let ok = 0;
  let dueSoon = 0;
  let overdue = 0;

  const items: MaintenanceAlert[] = [];

  for (const item of schedule) {
    if (!item.enabled) continue;

    const records = maintenanceRecords
      .filter(r => r.vehicleId === vehicle.id && r.itemType === item.type)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let lastOdo = 0;
    let lastDate = parseLocalDate(vehicle.purchaseDate);

    if (records.length > 0) {
      lastOdo = records[0].odometer;
      lastDate = parseLocalDate(records[0].date);
    } else {
      // Fallback: check expenses for old data
      const categoryMap: Record<string, string> = {
        'General Service': 'Service',
        'Tyres': 'Tires',
      };
      const expenseCategory = categoryMap[item.type];
      if (expenseCategory) {
        const expenseRecords = expenses
          .filter(e => e.vehicleId === vehicle.id && e.category === expenseCategory)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (expenseRecords.length > 0) {
          lastOdo = expenseRecords[0].odometer || 0;
          lastDate = parseLocalDate(expenseRecords[0].date);
        }
      }
    }

    const odoDiff = currentOdo - lastOdo;
    const daysDiff = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    const kmThreshold = item.kmInterval;
    const dayThreshold = item.monthInterval ? item.monthInterval * 30 : null;

    const dueSoonDaysThreshold = item.dueSoonDays ?? appSettings?.maintenanceDueSoonDays ?? 15;
    const dueSoonKmThreshold = item.dueSoonKm ?? appSettings?.maintenanceDueSoonKm ?? (kmThreshold ? Math.min(500, Math.round(kmThreshold * 0.1)) : 500);

    let status: 'OK' | 'Due Soon' | 'Overdue' = 'OK';
    let subText = '';
    let color = 'text-green-600 border-green-600';
    let bgColor = 'bg-green-100';

    const kmProgress = kmThreshold ? odoDiff / kmThreshold : 0;
    const dayProgress = dayThreshold ? daysDiff / dayThreshold : 0;
    const progress = Math.max(kmProgress, dayProgress);

    const kmLeft = kmThreshold !== null ? kmThreshold - odoDiff : null;
    const daysLeft = dayThreshold !== null ? dayThreshold - daysDiff : null;

    const isOverdue =
      (kmLeft !== null && kmLeft <= 0) ||
      (daysLeft !== null && daysLeft <= 0);

    const isDueSoon =
      !isOverdue &&
      ((daysLeft !== null && daysLeft <= dueSoonDaysThreshold) ||
       (kmLeft !== null && kmLeft <= dueSoonKmThreshold));

    if (isOverdue) {
      status = 'Overdue';
      color = 'text-red-600 border-red-600';
      bgColor = 'bg-red-100';
      if (kmThreshold && dayThreshold) {
        subText = `${odoDiff.toLocaleString()}km / ${daysDiff}d (Limit: ${kmThreshold.toLocaleString()}km / ${item.monthInterval}mo)`;
      } else if (kmThreshold) {
        subText = `${odoDiff.toLocaleString()}km (Limit: ${kmThreshold.toLocaleString()}km)`;
      } else if (dayThreshold) {
        subText = `${daysDiff}d (Limit: ${item.monthInterval}mo)`;
      }
    } else if (isDueSoon) {
      status = 'Due Soon';
      color = 'text-yellow-600 border-yellow-600';
      bgColor = 'bg-yellow-100';
      if (kmLeft !== null && daysLeft !== null) {
        const timeText = formatRemainingTime(daysLeft);
        subText = `${kmLeft.toLocaleString()} km or ${timeText} left`;
      } else if (kmLeft !== null) {
        subText = `${kmLeft.toLocaleString()} km left`;
      } else if (daysLeft !== null) {
        const timeText = formatRemainingTime(daysLeft);
        subText = `${timeText} left`;
      }
    } else {
      status = 'OK';
      if (kmLeft !== null && daysLeft !== null) {
        const timeText = formatRemainingTime(daysLeft);
        subText = `${kmLeft.toLocaleString()} km or ${timeText} left`;
      } else if (kmLeft !== null) {
        subText = `${kmLeft.toLocaleString()} km left`;
      } else if (daysLeft !== null) {
        const timeText = formatRemainingTime(daysLeft);
        subText = `${timeText} left`;
      }
    }

    if (status === 'OK') ok++;
    else if (status === 'Due Soon') dueSoon++;
    else if (status === 'Overdue') overdue++;

    items.push({
      label: item.type,
      status,
      subText,
      color,
      bgColor,
      scheduleItem: item,
      progress: Math.min(1.5, Math.max(0, progress))
    });
  }

  return { items, summary: { ok, dueSoon, overdue } };
}

// Aggregate fuel/trip/expense data linked to a Journey (see types.ts) so it
// can be viewed as a single "trip cost report" instead of scattered across
// the Fuel/Trips/Expenses logs.
export interface JourneyStats {
  fuelCost: number;
  otherCost: number;
  totalSpend: number;
  distance: number;
  fillUps: number;
  tripCount: number;
  linkedFuelLogs: FuelLog[];
  linkedTrips: Trip[];
  linkedExpenses: Expense[];
}

export function calculateJourneyStats(
  journeyId: string,
  fuelLogs: FuelLog[],
  trips: Trip[],
  expenses: Expense[]
): JourneyStats {
  const linkedFuelLogs = fuelLogs.filter(f => f.journeyId === journeyId);
  const linkedTrips = trips.filter(t => t.journeyId === journeyId);
  const linkedExpenses = expenses.filter(e => e.journeyId === journeyId);

  const fuelCost = linkedFuelLogs.reduce((sum, f) => sum + f.cost, 0);
  const otherCost = linkedExpenses.reduce((sum, e) => sum + e.cost, 0);
  const distance = linkedTrips
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + Math.max(0, (t.endOdo || 0) - t.startOdo), 0);

  return {
    fuelCost,
    otherCost,
    totalSpend: fuelCost + otherCost,
    distance,
    fillUps: linkedFuelLogs.length,
    tripCount: linkedTrips.length,
    linkedFuelLogs,
    linkedTrips,
    linkedExpenses
  };
}

// Journey date-range display helper, e.g. "12 Jun - 18 Jun" or "12 Jun - Ongoing"
export function formatJourneyDateRange(journey: Journey): string {
  const start = parseLocalDate(journey.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  if (!journey.endDate) return `${start} — Ongoing`;
  const end = parseLocalDate(journey.endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return `${start} — ${end}`;
}

// Convert JSON array to CSV string
export function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + (val ?? '')).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

// Save and Share file natively via Capacitor Filesystem and Share plugins
export async function saveAndShareNative(
  content: string,
  fileName: string,
  contentType: string,
  title?: string,
  isBase64: boolean = false
): Promise<boolean> {
  try {
    // Write file to native Cache directory
    const writeOptions: any = {
      path: fileName,
      data: content,
      directory: Directory.Cache,
    };
    if (!isBase64) {
      writeOptions.encoding = Encoding.UTF8;
    }
    const writeResult = await Filesystem.writeFile(writeOptions);

    // Share the file natively
    await Share.share({
      title: title || 'OdoTrack Export',
      url: writeResult.uri,
      files: [writeResult.uri],
    });
    return true;
  } catch (err) {
    console.error('Native export/share failed:', err);
    return false;
  }
}

// Download or share XLSX / CSV workbook (with Capacitor native support)
export async function downloadOrShareXLSX(
  wb: any,
  fileName: string,
  format: 'xlsx' | 'csv' = 'xlsx',
  title?: string
): Promise<boolean> {
  if (format === 'csv') {
    const sheetName = wb.SheetNames[0] || 'Sheet1';
    const csvContent = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    return await shareFileOrData(csvContent, fileName, 'text/csv', title || `Export ${fileName}`);
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      return await saveAndShareNative(
        base64,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        title || `Export ${fileName}`,
        true
      );
    } catch (err) {
      console.error('Failed to export native XLSX file:', err);
      return false;
    }
  }

  // Web fallback: use XLSX.writeFile
  try {
    XLSX.writeFile(wb, fileName);
    return true;
  } catch (err) {
    console.error('Failed web XLSX download:', err);
    return false;
  }
}

// Trigger plain file download fallback (with Capacitor native support)
export function triggerFileDownload(content: string, fileName: string, contentType: string) {
  if (Capacitor.isNativePlatform()) {
    saveAndShareNative(content, fileName, contentType, `Export ${fileName}`);
    return;
  }

  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Mobile Web Sharing (JSON / CSV via Native Share Sheet if supported, fallback to download)
export async function shareFileOrData(
  content: string,
  fileName: string,
  contentType: string,
  title: string
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return await saveAndShareNative(content, fileName, contentType, title);
  }

  const blob = new Blob([content], { type: contentType });
  const file = new File([blob], fileName, { type: contentType });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title,
        text: `Exported tracking data from OdoTrack.`
      });
      return true;
    } catch (e) {
      console.warn('Share Sheet failed or cancelled, using download instead', e);
      triggerFileDownload(content, fileName, contentType);
      return false;
    }
  } else {
    // Fallback to standard download
    triggerFileDownload(content, fileName, contentType);
    return false;
  }
}

// Normalize trip purpose from older app imports or direct user input
export function normalizeTripPurpose(purpose: string): TripPurpose {
  const clean = (purpose || 'other').toLowerCase().trim();
  if (clean.includes('commute') || clean === 'work') {
    return 'commute';
  }
  if (clean.includes('business') || clean.includes('work') || clean.includes('office') || clean.includes('commercial')) {
    return 'business';
  }
  if (clean.includes('personal') || clean.includes('leisure') || clean.includes('home')) {
    return 'personal';
  }
  return 'other';
}

/**
 * Compresses an image (given as a Base64 string or a File) to a maximum width/height
 * and lower quality JPEG to dramatically reduce the stored base64 size (for backups).
 */
export function compressImage(
  src: string | File,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate new dimensions preserving aspect ratio
      let width = img.width;
      let height = img.height;
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      // Create a canvas to draw the resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D context from canvas'));
        return;
      }

      // Fill with white background (to avoid transparency turning black in JPEG)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Draw image
      ctx.drawImage(img, 0, 0, width, height);

      // Export as compressed JPEG
      try {
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error('Failed to load image for compression'));
    };

    if (src instanceof File) {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = (err) => {
        reject(err);
      };
      reader.readAsDataURL(src);
    } else {
      img.src = src;
    }
  });
}


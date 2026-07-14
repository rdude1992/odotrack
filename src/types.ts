/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VehicleType = 'car' | 'bike' | 'scooter' | 'ev' | 'other';

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  fuelType: string; // Petrol, Diesel, CNG, Electric, Hybrid, etc.
  registration: string;
  odometer: number; // Current odo reading in km (auto-updated from logs)
  startingOdometer: number; // Odo reading when the vehicle was first added to the app
  purchaseDate: string; // YYYY-MM-DD
  maintenanceSchedule?: MaintenanceScheduleItem[];
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  date: string; // YYYY-MM-DD
  odometer: number | null; // km (optional)
  litres: number;
  cost: number;
  station: string;
  fullTank: boolean;
  notes: string;
  pricePerLitre: number;
  mileageSinceLast: number | null; // calculated km/L
  receiptId: string | null; // reference to ScannedReceipt
  journeyId?: string | null; // optional link to a Journey (see below)
}

export type TripPurpose = 'business' | 'personal' | 'commute' | 'other';

export interface Trip {
  id: string;
  vehicleId: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
  startOdo: number;
  endOdo?: number | null; // null if active
  source?: string | null;
  destination?: string | null;
  purpose: TripPurpose;
  status: 'active' | 'completed';
  elapsedMinutes?: number | null; // calculated when completed
  notes: string;
  activeStartTimestamp?: number; // performance.now() or Date.now() for tracking duration
  journeyId?: string | null; // optional link to a Journey (see below)
}

export type ExpenseCategory =
  | 'Toll'
  | 'Parking'
  | 'Repair'
  | 'Service'
  | 'Insurance'
  | 'Tires'
  | 'Battery'
  | 'Accessory'
  | 'Other';

export interface Expense {
  id: string;
  vehicleId: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  cost: number;
  vendor: string;
  odometer: number | null; // optional
  notes: string;
  receiptId?: string | null;
  journeyId?: string | null; // optional link to a Journey (see below)
  maintenanceRecordId?: string | null; // link to maintenance record to avoid double entries
}

/**
 * A named, dated grouping of trips/fuel fill-ups/expenses for a particular
 * piece of travel (e.g. "Goa Trip") so their combined cost and distance can
 * be viewed in one place instead of being scattered across the Fuel/Trips/
 * Expenses logs. Individual trips, fuel logs, and expenses opt in via their
 * optional `journeyId` field — a Journey itself doesn't own any data.
 */
export interface Journey {
  id: string;
  vehicleId: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD — null/unset means still ongoing
  notes?: string | null;
}

export interface ScannedReceipt {
  id: string;
  date: string; // YYYY-MM-DD
  fileName: string;
  imageUri: string; // Base64 data URI for offline storage
  extractedCost: number | null;
  extractedLitres: number | null;
  extractedPricePerLitre: number | null;
  rawText: string;
}

export type FontSize = 'small' | 'medium' | 'large';

export interface AppSettings {
  theme: 'light' | 'dark';
  currency: string; // e.g. 'USD', 'INR', 'EUR', 'GBP'
  backupReminderDays: number; // e.g. 7, 14, 30
  lastBackupDate: string | null; // YYYY-MM-DD
  fontSize: FontSize;
  accentColor: string; // hex color e.g. '#ff6b35'
  appVersion: string;
  developerName: string;
}

// Maintenance tracking types
export interface MaintenanceScheduleItem {
  type: string;
  kmInterval: number | null;
  monthInterval: number | null;
  enabled: boolean;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  date: string; // YYYY-MM-DD
  itemType: string;
  odometer: number;
  cost: number | null;
  notes: string;
  nextDueOdometer: number | null;
  nextDueDate: string | null; // YYYY-MM-DD
  expenseId?: string | null; // link to expense (bill) to avoid double entries
}

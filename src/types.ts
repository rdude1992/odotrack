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
  tankCapacity?: number | null; // Tank capacity in Litres / kWh
  claimedEfficiency?: number | null; // Manufacturer / Baseline claimed efficiency in km/L or km/kWh
  maintenanceSchedule?: MaintenanceScheduleItem[];
  profileImage?: string | null; // Base64 profile picture
  baseFuelLogId?: string | null; // Selected starting fuel log for mileage calculations
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
  receiptImage?: string | null; // Base64 data URI or Blob string
  receiptImages?: string[]; // Array of Base64 strings for multi-page receipts
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
  isRoundTrip?: boolean | null; // indicates if the trip was to and fro (round trip)
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
  category: string;
  cost: number;
  vendor: string;
  odometer: number | null; // optional
  notes: string;
  receiptId?: string | null;
  journeyId?: string | null; // optional link to a Journey (see below)
  maintenanceRecordId?: string | null; // link to maintenance record to avoid double entries
  linkedMaintenanceTypes?: string[]; // list of linked maintenance task types for multi-task service logs
  receiptImage?: string | null; // Base64 data URI or Blob string
  receiptImages?: string[]; // Array of Base64 strings for multi-page receipts
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
  pages?: string[]; // Optional array of Base64 strings for multi-page receipts
}

export type FontSize = 'small' | 'medium' | 'large';
export type DesignStyle = 'neobrutalist' | 'refined' | 'material3' | 'aistudio';
export type DensityMode = 'compact' | 'comfortable';

export interface AppSettings {
  theme: 'light' | 'dark';
  currency: string; // e.g. 'USD', 'INR', 'EUR', 'GBP'
  backupReminderDays: number; // e.g. 7, 14, 30
  maintenanceDueSoonDays?: number; // e.g. 15
  maintenanceDueSoonKm?: number; // e.g. 500
  lastBackupDate: string | null; // YYYY-MM-DD
  fontSize: FontSize;
  accentColor: string; // hex color e.g. '#ff6b35'
  appVersion: string;
  developerName: string;
  designStyle?: DesignStyle;
  density?: DensityMode;
}

// Maintenance tracking types
export interface MaintenanceScheduleItem {
  type: string;
  kmInterval: number | null;
  monthInterval: number | null;
  dueSoonDays?: number | null; // Threshold in days before due date when alert triggers "Due Soon" (e.g. 15)
  dueSoonKm?: number | null; // Threshold in KM before limit when alert triggers "Due Soon" (e.g. 500)
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
  receiptImage?: string | null; // Base64 data URI or Blob string
}

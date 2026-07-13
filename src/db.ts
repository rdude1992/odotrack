/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vehicle, FuelLog, Trip, Expense, ScannedReceipt, AppSettings, MaintenanceRecord, Journey } from './types';
import { getFirstOdoEntry, getLocalDateString } from './utils';

const DB_NAME = 'OdoTrackDB';
const DB_VERSION = 3;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;

      if (!db.objectStoreNames.contains('vehicles')) {
        db.createObjectStore('vehicles', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('fuel_logs')) {
        const fuelStore = db.createObjectStore('fuel_logs', { keyPath: 'id' });
        fuelStore.createIndex('vehicleId', 'vehicleId', { unique: false });
      }

      if (!db.objectStoreNames.contains('trips')) {
        const tripsStore = db.createObjectStore('trips', { keyPath: 'id' });
        tripsStore.createIndex('vehicleId', 'vehicleId', { unique: false });
      }

      if (!db.objectStoreNames.contains('expenses')) {
        const expensesStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expensesStore.createIndex('vehicleId', 'vehicleId', { unique: false });
      }

      if (!db.objectStoreNames.contains('receipts')) {
        db.createObjectStore('receipts', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('maintenance_records')) {
        const maintStore = db.createObjectStore('maintenance_records', { keyPath: 'id' });
        maintStore.createIndex('vehicleId', 'vehicleId', { unique: false });
      }

      if (!db.objectStoreNames.contains('journeys')) {
        const journeysStore = db.createObjectStore('journeys', { keyPath: 'id' });
        journeysStore.createIndex('vehicleId', 'vehicleId', { unique: false });
      }
    };
  });
}

// Helper generic store actions
function getStoreData<T>(storeName: string): Promise<T[]> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  });
}

function saveStoreData<T>(storeName: string, data: T): Promise<void> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function deleteStoreData(storeName: string, id: string): Promise<void> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

// Specific DB APIs
export const dbAPI = {
  // Vehicles
  getVehicles: () => getStoreData<Vehicle>('vehicles'),
  saveVehicle: (vehicle: Vehicle) => saveStoreData<Vehicle>('vehicles', vehicle),
  deleteVehicle: async (id: string) => {
    await deleteStoreData('vehicles', id);
    // Cascade delete all related data
    const fuels = await dbAPI.getFuelLogs();
    const trips = await dbAPI.getTrips();
    const expenses = await dbAPI.getExpenses();
    const records = await dbAPI.getMaintenanceRecords();
    const journeys = await dbAPI.getJourneys();

    for (const f of fuels.filter(x => x.vehicleId === id)) await dbAPI.deleteFuelLog(f.id);
    for (const t of trips.filter(x => x.vehicleId === id)) await dbAPI.deleteTrip(t.id);
    for (const e of expenses.filter(x => x.vehicleId === id)) await dbAPI.deleteExpense(e.id);
    for (const r of records.filter(x => x.vehicleId === id)) await dbAPI.deleteMaintenanceRecord(r.id);
    for (const j of journeys.filter(x => x.vehicleId === id)) await dbAPI.deleteJourney(j.id);
  },

  // Fuel Logs
  getFuelLogs: () => getStoreData<FuelLog>('fuel_logs'),
  saveFuelLog: async (log: FuelLog) => {
    await saveStoreData<FuelLog>('fuel_logs', log);
    await recalculateVehicleOdometer(log.vehicleId);
    await recalculateMileage(log.vehicleId);
  },
  updateFuelLog: async (log: FuelLog) => {
    await saveStoreData<FuelLog>('fuel_logs', log);
    await recalculateVehicleOdometer(log.vehicleId);
    await recalculateMileage(log.vehicleId);
  },
  deleteFuelLog: async (id: string) => {
    const logs = await dbAPI.getFuelLogs();
    const log = logs.find(l => l.id === id);
    await deleteStoreData('fuel_logs', id);
    if (log) {
      await recalculateVehicleOdometer(log.vehicleId);
      await recalculateMileage(log.vehicleId);
    }
  },

  // Trips
  getTrips: () => getStoreData<Trip>('trips'),
  saveTrip: async (trip: Trip) => {
    await saveStoreData<Trip>('trips', trip);
    await recalculateVehicleOdometer(trip.vehicleId);
  },
  deleteTrip: async (id: string) => {
    const trips = await dbAPI.getTrips();
    const trip = trips.find(t => t.id === id);
    await deleteStoreData('trips', id);
    if (trip) {
      await recalculateVehicleOdometer(trip.vehicleId);
    }
  },

  // Expenses
  getExpenses: () => getStoreData<Expense>('expenses'),
  saveExpense: async (expense: Expense) => {
    await saveStoreData<Expense>('expenses', expense);
    await recalculateVehicleOdometer(expense.vehicleId);
  },
  deleteExpense: async (id: string) => {
    const expenses = await dbAPI.getExpenses();
    const expense = expenses.find(e => e.id === id);
    await deleteStoreData('expenses', id);
    if (expense) {
      await recalculateVehicleOdometer(expense.vehicleId);
    }
  },

  // Maintenance Records
  getMaintenanceRecords: () => getStoreData<MaintenanceRecord>('maintenance_records'),
  saveMaintenanceRecord: (record: MaintenanceRecord) => saveStoreData<MaintenanceRecord>('maintenance_records', record),
  deleteMaintenanceRecord: (id: string) => deleteStoreData('maintenance_records', id),

  // Journeys — a named, dated grouping of trips/fuel/expenses (see types.ts).
  // Deleting a journey never deletes the trips/fuel logs/expenses linked to
  // it; it just unlinks them (journeyId -> null) so their underlying records
  // are preserved in their normal logs.
  getJourneys: () => getStoreData<Journey>('journeys'),
  saveJourney: (journey: Journey) => saveStoreData<Journey>('journeys', journey),
  deleteJourney: async (id: string) => {
    const [trips, fuelLogs, expenses] = await Promise.all([
      dbAPI.getTrips(),
      dbAPI.getFuelLogs(),
      dbAPI.getExpenses()
    ]);
    for (const t of trips.filter(x => x.journeyId === id)) {
      await saveStoreData<Trip>('trips', { ...t, journeyId: null });
    }
    for (const f of fuelLogs.filter(x => x.journeyId === id)) {
      await saveStoreData<FuelLog>('fuel_logs', { ...f, journeyId: null });
    }
    for (const e of expenses.filter(x => x.journeyId === id)) {
      await saveStoreData<Expense>('expenses', { ...e, journeyId: null });
    }
    await deleteStoreData('journeys', id);
  },

  // Receipts
  getReceipts: () => getStoreData<ScannedReceipt>('receipts'),
  getScannedReceipt: async (id: string): Promise<ScannedReceipt | null> => {
    const receipts = await getStoreData<ScannedReceipt>('receipts');
    return receipts.find(r => r.id === id) || null;
  },
  saveReceipt: (receipt: ScannedReceipt) => saveStoreData<ScannedReceipt>('receipts', receipt),
  saveScannedReceipt: (receipt: ScannedReceipt) => saveStoreData<ScannedReceipt>('receipts', receipt),
  deleteReceipt: (id: string) => deleteStoreData('receipts', id),
  deleteScannedReceipt: (id: string) => deleteStoreData('receipts', id),

  // Settings
  getSettings: async (): Promise<AppSettings> => {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('app_config');

      request.onsuccess = () => {
        if (request.result) {
          const storedSettings = request.result.value as AppSettings;
          // Apply defaults for any missing fields (backward compatibility)
          if (!storedSettings.currency) storedSettings.currency = 'INR';
          if (!storedSettings.fontSize) storedSettings.fontSize = 'medium';
          if (!storedSettings.accentColor) storedSettings.accentColor = '#ff6b35';
          if (!storedSettings.theme) storedSettings.theme = 'light';
          if (!storedSettings.appVersion) storedSettings.appVersion = '1.0.2';
          if (!storedSettings.developerName) storedSettings.developerName = 'RAHUL';
          resolve(storedSettings);
        } else {
          // Default settings
          const defaults: AppSettings = {
            theme: 'light',
            currency: 'INR',
            backupReminderDays: 7,
            lastBackupDate: null,
            fontSize: 'medium',
            accentColor: '#ff6b35',
            appVersion: '1.0.2',
            developerName: 'ODOTRACK Developer'
          };
          resolve(defaults);
        }
      };
      request.onerror = () => {
        resolve({
          theme: 'light',
          currency: 'INR',
          backupReminderDays: 7,
          lastBackupDate: null,
          fontSize: 'medium',
          accentColor: '#ff6b35',
          appVersion: '1.0.2',
          developerName: 'ODOTRACK Developer'
        });
      };
    });
  },
  saveSettings: async (settings: AppSettings): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key: 'app_config', value: settings });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // Clear Database
  clearAllData: async (): Promise<void> => {
    const db = await initDB();
    const stores = ['vehicles', 'fuel_logs', 'trips', 'expenses', 'receipts', 'settings', 'maintenance_records', 'journeys'];
    const transaction = db.transaction(stores, 'readwrite');

    return new Promise((resolve, reject) => {
      let completed = 0;
      stores.forEach((storeName) => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => {
          completed++;
          if (completed === stores.length) {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    });
  },

  // Sample Seeder
  seedSampleData: async (): Promise<void> => {
    await dbAPI.clearAllData();

    // Vehicles
    const sampleVehicles: Vehicle[] = [
      {
        id: 'v1',
        name: 'Retro Cruiser (Car)',
        type: 'car',
        fuelType: 'Petrol',
        registration: 'AB-12-CD-3456',
        odometer: 14250,
        startingOdometer: 0,
        purchaseDate: '2025-01-15'
      },
      {
        id: 'v2',
        name: 'Cyber Commuter (Bike)',
        type: 'bike',
        fuelType: 'Petrol',
        registration: 'EF-56-GH-7890',
        odometer: 4220,
        startingOdometer: 0,
        purchaseDate: '2025-05-10'
      },
      {
        id: 'v3',
        name: 'Vespa Sprint (Scooter)',
        type: 'scooter',
        fuelType: 'Petrol',
        registration: 'JK-99-LM-1122',
        odometer: 1840,
        startingOdometer: 0,
        purchaseDate: '2025-08-22'
      }
    ];

    for (const v of sampleVehicles) {
      await dbAPI.saveVehicle(v);
    }

    // Settings
    await dbAPI.saveSettings({
      theme: 'light',
      currency: 'INR',
      backupReminderDays: 7,
      lastBackupDate: getLocalDateString(),
      fontSize: 'medium',
      accentColor: '#ff6b35',
      appVersion: '1.0.3',
      developerName: 'ODOTRACK Developer'
    });

    // Fuel logs for Retro Cruiser (V1)
    // Odometer: 12000, 12550, 13120, 13700, 14250
    const fuelLogs: FuelLog[] = [
      {
        id: 'f1',
        vehicleId: 'v1',
        date: '2026-05-01',
        odometer: 12000,
        litres: 45,
        cost: 67.5, // 1.50 per litre
        station: 'Shell Brutal Gas',
        fullTank: true,
        notes: 'First log, full tank',
        pricePerLitre: 1.50,
        mileageSinceLast: null,
        receiptId: null
      },
      {
        id: 'f2',
        vehicleId: 'v1',
        date: '2026-05-15',
        odometer: 12550,
        litres: 41.5,
        cost: 63.08, // 1.52 per L
        station: 'Shell Brutal Gas',
        fullTank: true,
        notes: 'Commute and city driving',
        pricePerLitre: 1.52,
        mileageSinceLast: 13.25, // (12550 - 12000) / 41.5
        receiptId: null
      },
      {
        id: 'f3',
        vehicleId: 'v1',
        date: '2026-06-02',
        odometer: 13120,
        litres: 42.1,
        cost: 65.26, // 1.55 per L
        station: 'Texaco Retro',
        fullTank: true,
        notes: 'High fuel costs today',
        pricePerLitre: 1.55,
        mileageSinceLast: 13.54, // (13120 - 12550) / 42.1
        receiptId: null
      },
      {
        id: 'f4',
        vehicleId: 'v1',
        date: '2026-06-18',
        odometer: 13700,
        litres: 43.0,
        cost: 67.94, // 1.58 per L
        station: 'Shell Brutal Gas',
        fullTank: true,
        notes: 'Highway cruising',
        pricePerLitre: 1.58,
        mileageSinceLast: 13.49, // (13700 - 13120) / 43.0
        receiptId: null
      },
      {
        id: 'f5',
        vehicleId: 'v1',
        date: '2026-07-01',
        odometer: 14250,
        litres: 40.8,
        cost: 65.28, // 1.60 per L
        station: 'Total Blocky',
        fullTank: true,
        notes: 'Odometer rising',
        pricePerLitre: 1.60,
        mileageSinceLast: 13.48, // (14250 - 13700) / 40.8
        receiptId: null
      }
    ];

    for (const f of fuelLogs) {
      await saveStoreData('fuel_logs', f);
    }

    // Fuel logs for Cyber Commuter (V2)
    const bikeFuelLogs: FuelLog[] = [
      {
        id: 'bf1',
        vehicleId: 'v2',
        date: '2026-06-05',
        odometer: 3800,
        litres: 12,
        cost: 20.4, // 1.70 per L
        station: 'Shell Brutal Gas',
        fullTank: true,
        notes: 'Bike gas is pricey',
        pricePerLitre: 1.70,
        mileageSinceLast: null,
        receiptId: null
      },
      {
        id: 'bf2',
        vehicleId: 'v2',
        date: '2026-06-25',
        odometer: 4220,
        litres: 11.5,
        cost: 19.55, // 1.70 per L
        station: 'Velo Fillup',
        fullTank: true,
        notes: 'Great fuel efficiency!',
        pricePerLitre: 1.70,
        mileageSinceLast: 36.52, // (4220-3800)/11.5
        receiptId: null
      }
    ];

    for (const bf of bikeFuelLogs) {
      await saveStoreData('fuel_logs', bf);
    }

    // Trips for V1
    const trips: Trip[] = [
      {
        id: 't1',
        vehicleId: 'v1',
        startDate: '2026-06-05',
        startTime: '08:30',
        startOdo: 13150,
        endOdo: 13245,
        source: 'Brutal Headquarters',
        destination: 'Client Grid Alpha',
        purpose: 'business',
        status: 'completed',
        elapsedMinutes: 95,
        notes: 'Client strategy presentation'
      },
      {
        id: 't2',
        vehicleId: 'v1',
        startDate: '2026-06-12',
        startTime: '18:00',
        startOdo: 13310,
        endOdo: 13380,
        source: 'Home',
        destination: 'Blocky Beach Park',
        purpose: 'personal',
        status: 'completed',
        elapsedMinutes: 60,
        notes: 'Weekend run'
      },
      {
        id: 't3',
        vehicleId: 'v1',
        startDate: '2026-06-20',
        startTime: '07:45',
        startOdo: 13720,
        endOdo: 13765,
        source: 'Home',
        destination: 'Main Office',
        purpose: 'commute',
        status: 'completed',
        elapsedMinutes: 45,
        notes: 'Regular morning commute'
      }
    ];

    for (const t of trips) {
      await saveStoreData('trips', t);
    }

    // Expenses for V1
    const expenses: Expense[] = [
      {
        id: 'e1',
        vehicleId: 'v1',
        date: '2026-05-10',
        category: 'Toll',
        cost: 12.50,
        vendor: 'Express Highway Toll',
        odometer: 12300,
        notes: 'Highway fastpass'
      },
      {
        id: 'e2',
        vehicleId: 'v1',
        date: '2026-05-20',
        category: 'Insurance',
        cost: 120.00,
        vendor: 'Cyber Block Insurance Group',
        odometer: null,
        notes: 'Monthly premiums'
      },
      {
        id: 'e3',
        vehicleId: 'v1',
        date: '2026-06-10',
        category: 'Service',
        cost: 180.00,
        vendor: 'Neo Workshop Garage',
        odometer: 13200,
        notes: 'Regular engine oil and filter service'
      },
      {
        id: 'e4',
        vehicleId: 'v1',
        date: '2026-06-15',
        category: 'Parking',
        cost: 15.00,
        vendor: 'Downtown Bold Parking',
        odometer: null,
        notes: 'Client office lot'
      }
    ];

    for (const e of expenses) {
      await saveStoreData('expenses', e);
    }
  }
};

// Internal helpers

/**
 * Recomputes a vehicle's current odometer from scratch, from whatever
 * fuel logs / trips / expenses with an odometer reading still exist for it.
 *
 * The old `updateVehicleOdometer` only ever bumped the value UP when a new
 * odometer reading came in ("if (loggedOdo > vehicle.odometer)") and was
 * never called on delete at all. That meant deleting the fuel log/trip/
 * expense that had set the current highest reading left the vehicle's
 * odometer stuck at that now-deleted value — e.g. deleting a trip whose
 * endOdo was 6105 left the dashboard showing 6105 forever, even though
 * that reading no longer exists anywhere in the data.
 *
 * This is now called after every save AND every delete for fuel logs,
 * trips, and expenses, and always derives odometer fresh as the max
 * reading across all three sources (falling back to the vehicle's
 * startingOdometer if nothing is left).
 */
async function recalculateVehicleOdometer(vehicleId: string): Promise<void> {
  const [vehicles, fuelLogs, trips, expenses] = await Promise.all([
    dbAPI.getVehicles(),
    dbAPI.getFuelLogs(),
    dbAPI.getTrips(),
    dbAPI.getExpenses()
  ]);

  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return; // vehicle itself may already be deleted (cascade delete)

  const readings: number[] = [];

  fuelLogs
    .filter(l => l.vehicleId === vehicleId)
    .forEach(l => {
      if (l.odometer !== null && l.odometer !== undefined && !isNaN(l.odometer)) {
        readings.push(l.odometer);
      }
    });

  trips
    .filter(t => t.vehicleId === vehicleId)
    .forEach(t => {
      if (t.startOdo !== null && t.startOdo !== undefined && !isNaN(t.startOdo)) {
        readings.push(t.startOdo);
      }
      if (t.endOdo !== null && t.endOdo !== undefined && !isNaN(t.endOdo)) {
        readings.push(t.endOdo);
      }
    });

  expenses
    .filter(e => e.vehicleId === vehicleId)
    .forEach(e => {
      if (e.odometer !== null && e.odometer !== undefined && !isNaN(e.odometer)) {
        readings.push(e.odometer);
      }
    });

  const baseline = vehicle.startingOdometer ?? 0;
  const newOdo = readings.length > 0 ? Math.max(baseline, ...readings) : baseline;

  if (newOdo !== vehicle.odometer) {
    vehicle.odometer = newOdo;
    await saveStoreData('vehicles', vehicle);
  }
}

async function recalculateMileage(vehicleId: string): Promise<void> {
  // Fetch trips, expenses, and the vehicle itself to compute the baseline odometer
  const [allTrips, allExpenses, vehicles] = await Promise.all([
    dbAPI.getTrips(),
    dbAPI.getExpenses(),
    dbAPI.getVehicles()
  ]);
  const vehicle = vehicles.find(v => v.id === vehicleId);

  const db = await initDB();
  const transaction = db.transaction('fuel_logs', 'readwrite');
  const store = transaction.objectStore('fuel_logs');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const allLogs = request.result as FuelLog[];
      // Filter by vehicle
      const vLogs = allLogs.filter((l) => l.vehicleId === vehicleId);

      // Find the earliest odo entry across fuel, trips, and expenses as a baseline
      // Fallback to vehicle.startingOdometer if no log entries have odo readings
      const firstOdo = getFirstOdoEntry(vehicleId, vLogs, allExpenses, allTrips) ?? vehicle?.startingOdometer ?? null;

      // Sort ALL logs by date ascending, then by odometer if dates are equal
      const sortedLogs = vLogs.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        // If same date, ones without odo first so their litres get added before the odo reading
        if (a.odometer === null && b.odometer !== null) return -1;
        if (a.odometer !== null && b.odometer === null) return 1;
        return (a.odometer ?? 0) - (b.odometer ?? 0);
      });

      // Start with the baseline odometer so the first fuel log can also compute mileage
      let lastOdo: number | null = firstOdo;

      for (const log of sortedLogs) {
        if (log.odometer !== null && log.odometer !== undefined) {
          if (lastOdo !== null && log.odometer > lastOdo) {
            const dist = log.odometer - lastOdo;
            if (log.litres > 0) {
              log.mileageSinceLast = parseFloat((dist / log.litres).toFixed(2));
            } else {
              log.mileageSinceLast = null;
            }
          } else {
            log.mileageSinceLast = null;
          }
          lastOdo = log.odometer;
        } else {
          log.mileageSinceLast = null;
        }
        store.put(log);
      }

      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
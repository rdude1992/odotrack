import { describe, it, expect, beforeEach } from 'vitest';
import { dbAPI } from './db';
import 'fake-indexeddb/auto';
import { Vehicle } from './types';

describe('db.ts (Database API)', () => {
  beforeEach(async () => {
    // We clear all logs to ensure a clean slate before each test
    // For this, we can rely on a reset function or recreate db if needed.
    // fake-indexeddb auto-clears between script runs but not always between test cases automatically if we don't handle it.
    // Best way is to delete the whole DB between tests to ensure pure state.
    const req = indexedDB.deleteDatabase('ODOTRACK_DB');
    await new Promise((resolve) => {
      req.onsuccess = resolve;
      req.onerror = resolve;
    });
  });

  it('should initialize and add a vehicle', async () => {
    const v: Vehicle = {
      id: 'v1',
      name: 'Test Car',
      type: 'car',
      fuelType: 'Petrol',
      registration: '',
      odometer: 1000,
      startingOdometer: 1000,
      purchaseDate: '2026-07-23'
    };

    const id = 'v1';
    await dbAPI.saveVehicle(v);
    
    // getVehicles is available, so we fetch all and find it
    const vehicles = await dbAPI.getVehicles();
    const loaded = vehicles.find(veh => veh.id === id);
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('Test Car');
  });

  it('should auto-recalculate odometer when fuel log is added and deleted', async () => {
    // 1. Create a vehicle
    const v: Vehicle = {
      id: 'v2',
      name: 'Odo Test Car',
      type: 'car',
      fuelType: 'Petrol',
      registration: '',
      odometer: 1000,
      startingOdometer: 1000,
      purchaseDate: '2026-07-23'
    };
    await dbAPI.saveVehicle(v);

    // 2. Add a fuel log with higher odometer
    await dbAPI.saveFuelLog({
      id: 'f1',
      vehicleId: 'v2',
      date: '2026-07-24',
      odometer: 1500,
      litres: 20,
      cost: 30,
      pricePerLitre: 1.5,
      fullTank: true,
      station: 'Test Station',
      notes: '',
      mileageSinceLast: null,
      receiptId: null
    });

    // 3. Verify vehicle odometer updated to 1500
    let vehicles = await dbAPI.getVehicles();
    let updatedVehicle = vehicles.find(veh => veh.id === 'v2');
    expect(updatedVehicle?.odometer).toBe(1500);

    // 4. Delete the fuel log
    await dbAPI.deleteFuelLog('f1');

    // 5. Verify vehicle odometer went back to baseline 1000
    vehicles = await dbAPI.getVehicles();
    updatedVehicle = vehicles.find(veh => veh.id === 'v2');
    expect(updatedVehicle?.odometer).toBe(1000);
  });
});

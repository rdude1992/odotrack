import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import { Vehicle } from '../types';

describe('Header.tsx', () => {
  const mockVehicles: Vehicle[] = [
    { id: 'v1', name: 'Car 1', type: 'car', fuelType: 'Petrol', registration: '', odometer: 1000, startingOdometer: 1000, purchaseDate: '2026-07-23' },
    { id: 'v2', name: 'Bike 1', type: 'bike', fuelType: 'Petrol', registration: '', odometer: 500, startingOdometer: 500, purchaseDate: '2026-07-23' }
  ];

  it('renders correctly and handles vehicle selection', () => {
    const onVehicleChange = vi.fn();
    const onThemeToggle = vi.fn();
    const onBackupTrigger = vi.fn();

    render(
      <Header
        vehicles={mockVehicles}
        selectedVehicleId="v1"
        onVehicleChange={onVehicleChange}
        theme="light"
        onThemeToggle={onThemeToggle}
        lastBackupDate="2026-07-20"
        backupReminderDays={7}
        onBackupTrigger={onBackupTrigger}
      />
    );

    // Verify logo
    expect(screen.getByText('ODOTRACK')).toBeInTheDocument();
  });

  it('shows backup reminder if overdue', () => {
    render(
      <Header
        vehicles={mockVehicles}
        selectedVehicleId="v1"
        onVehicleChange={vi.fn()}
        theme="light"
        onThemeToggle={vi.fn()}
        lastBackupDate="2020-01-01" // Very old date
        backupReminderDays={7}
        onBackupTrigger={vi.fn()}
      />
    );

    expect(screen.getByText(/never backed up your data|Your last backup was/i)).toBeInTheDocument();
  });

  it('hides backup reminder if not overdue', () => {
    const today = new Date();
    // Format YYYY-MM-DD for today
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    render(
      <Header
        vehicles={mockVehicles}
        selectedVehicleId="v1"
        onVehicleChange={vi.fn()}
        theme="light"
        onThemeToggle={vi.fn()}
        lastBackupDate={todayStr}
        backupReminderDays={7}
        onBackupTrigger={vi.fn()}
      />
    );

    expect(screen.queryByText(/never backed up your data|Your last backup was/i)).not.toBeInTheDocument();
  });
});

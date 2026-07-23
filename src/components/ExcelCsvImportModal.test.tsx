import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExcelCsvImportModal, {
  parseExcelDateAndValidate,
  parseStrictNumberAndValidate
} from './ExcelCsvImportModal';
import { Vehicle } from '../types';
import { ToastProvider } from './ToastContext';

describe('ExcelCsvImportModal Utility Functions', () => {
  describe('parseExcelDateAndValidate', () => {
    it('handles JS Date objects correctly', () => {
      const date = new Date(2026, 6, 15); // July 15, 2026
      const res = parseExcelDateAndValidate(date);
      expect(res.isValid).toBe(true);
      expect(res.dateStr).toBe('2026-07-15');
    });

    it('handles Excel serial numbers', () => {
      // 46204 is roughly July 1, 2026 in Excel serial format
      const res = parseExcelDateAndValidate(46204);
      expect(res.isValid).toBe(true);
      expect(res.dateStr).toBe('2026-07-01');
    });

    it('handles ISO strings and standard text formats', () => {
      const res1 = parseExcelDateAndValidate('2026-07-15');
      expect(res1.isValid).toBe(true);
      expect(res1.dateStr).toBe('2026-07-15');

      const res2 = parseExcelDateAndValidate('15-Jul-2026');
      expect(res2.isValid).toBe(true);
      expect(res2.dateStr).toBe('2026-07-15');
    });

    it('rejects garbage date values', () => {
      const res = parseExcelDateAndValidate('not-a-date');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Unrecognized date format');
    });
  });

  describe('parseStrictNumberAndValidate', () => {
    it('parses valid numeric strings and numbers', () => {
      expect(parseStrictNumberAndValidate(123.45, 'Field').value).toBe(123.45);
      expect(parseStrictNumberAndValidate(' 1,234.50 ', 'Field').value).toBe(1234.5);
    });

    it('fails on negative values when minimum is 0', () => {
      const res = parseStrictNumberAndValidate(-5, 'Field', { min: 0 });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('is less than minimum');
    });

    it('fails on non-numeric strings', () => {
      const res = parseStrictNumberAndValidate('abc', 'Field');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('contains non-numeric text');
    });
  });
});

describe('ExcelCsvImportModal Component UI', () => {
  const mockVehicles: Vehicle[] = [
    {
      id: 'v1',
      name: 'Test Vehicle',
      type: 'car',
      fuelType: 'Petrol',
      registration: 'ABC-123',
      odometer: 1000,
      startingOdometer: 1000,
      purchaseDate: '2026-01-01'
    }
  ];

  it('renders initial state with Select Data step', () => {
    render(
      <ToastProvider>
        <ExcelCsvImportModal
          isOpen={true}
          onClose={vi.fn()}
          vehicles={mockVehicles}
          onImportSuccess={vi.fn()}
        />
      </ToastProvider>
    );

    // Verify step 1 indicators and choices are rendered
    expect(screen.getByText('Select Data & File')).toBeInTheDocument();
    expect(screen.getByText('Fuel Logs')).toBeInTheDocument();
    expect(screen.getByText('Trips')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });
});

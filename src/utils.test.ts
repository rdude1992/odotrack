import { describe, it, expect } from 'vitest';
import { getLocalDateString, parseLocalDate, formatCurrency, getMonthBounds } from './utils';

describe('utils.ts', () => {
  it('getLocalDateString should return a string in YYYY-MM-DD format', () => {
    const d = new Date(2026, 6, 15); // July 15, 2026 (Month is 0-indexed)
    expect(getLocalDateString(d)).toBe('2026-07-15');
  });

  it('parseLocalDate should parse a YYYY-MM-DD string into a local Date', () => {
    const d = parseLocalDate('2026-07-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
  });

  it('formatCurrency should format numbers correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toContain('1,234.56');
    // The exact string depends on the locale formatting rules in Node/jsdom, 
    // so we use a contains check.
  });

  it('getMonthBounds should return correct start and end dates', () => {
    const bounds = getMonthBounds('2026-07');
    expect(bounds.start).toBe('2026-07-01');
    expect(bounds.end).toBe('2026-07-31');

    const leapYearBounds = getMonthBounds('2024-02');
    expect(leapYearBounds.start).toBe('2024-02-01');
    expect(leapYearBounds.end).toBe('2024-02-29');
  });
});

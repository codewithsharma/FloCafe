import { describe, expect, it } from 'vitest';
import {
  businessDayRange,
  calendarMonthRange,
  daysBetween,
  formatAppDate,
} from '../../main/lib/dates';

describe('date-fns helpers', () => {
  it('formats ISO dates', () => {
    expect(formatAppDate('2026-08-13', 'yyyy-MM-dd')).toBe('2026-08-13');
  });

  it('builds a business day range', () => {
    const range = businessDayRange('2026-08-13T15:30:00');
    expect(range.start.getHours()).toBe(0);
    expect(range.end.getHours()).toBe(23);
  });

  it('builds a calendar month range', () => {
    const range = calendarMonthRange('2026-08-13');
    expect(formatAppDate(range.start)).toBe('2026-08-01');
    expect(formatAppDate(range.end)).toBe('2026-08-31');
  });

  it('counts calendar days between dates', () => {
    expect(daysBetween('2026-08-01', '2026-08-13')).toBe(12);
  });
});

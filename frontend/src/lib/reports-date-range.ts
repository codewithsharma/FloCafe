/**
 * Inclusive UTC calendar-day range for Reports CSV export.
 * Must stay aligned with `MAX_BILLS_CSV_RANGE_DAYS` in main/services/bills-csv-export.ts.
 */

export const MAX_REPORTS_CSV_RANGE_DAYS = 93;

export function inclusiveCalendarDays(startDate: string, endDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86400000) + 1;
}

export function reportsCsvRangeError(
  startDate: string,
  endDate: string,
): 'invalid' | 'reversed' | 'too_long' | null {
  const days = inclusiveCalendarDays(startDate, endDate);
  if (days === null) return 'invalid';
  if (days < 1) return 'reversed';
  if (days > MAX_REPORTS_CSV_RANGE_DAYS) return 'too_long';
  return null;
}

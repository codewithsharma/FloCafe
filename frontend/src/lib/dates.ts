/**
 * date-fns helpers for frontend reporting / business-day ranges.
 * Server/API timestamps still use native Date + Intl for tenant locale display.
 */

import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  isValid,
} from 'date-fns';

export type DateRange = { start: Date; end: Date };

export function parseClientDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const parsed = parseISO(value);
  if (!isValid(parsed)) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

export function formatClientDate(value: string | Date, pattern = 'yyyy-MM-dd'): string {
  return format(parseClientDate(value), pattern);
}

export function businessDayRange(value: string | Date = new Date()): DateRange {
  const day = parseClientDate(value);
  return { start: startOfDay(day), end: endOfDay(day) };
}

export function weekRange(value: string | Date = new Date()): DateRange {
  const day = parseClientDate(value);
  return {
    start: startOfWeek(day, { weekStartsOn: 1 }),
    end: endOfWeek(day, { weekStartsOn: 1 }),
  };
}

export function monthRange(value: string | Date = new Date()): DateRange {
  const day = parseClientDate(value);
  return { start: startOfMonth(day), end: endOfMonth(day) };
}

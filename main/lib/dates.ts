/**
 * Application date/time helpers built on date-fns.
 * Prefer this module over ad-hoc Date math for reporting periods and shifts.
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
  differenceInCalendarDays,
} from 'date-fns';

export type DateRange = { start: Date; end: Date };

export function parseAppDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

export function formatAppDate(value: string | Date, pattern = 'yyyy-MM-dd'): string {
  return format(parseAppDate(value), pattern);
}

export function businessDayRange(value: string | Date = new Date()): DateRange {
  const day = parseAppDate(value);
  return { start: startOfDay(day), end: endOfDay(day) };
}

export function calendarWeekRange(value: string | Date = new Date()): DateRange {
  const day = parseAppDate(value);
  return {
    start: startOfWeek(day, { weekStartsOn: 1 }),
    end: endOfWeek(day, { weekStartsOn: 1 }),
  };
}

export function calendarMonthRange(value: string | Date = new Date()): DateRange {
  const day = parseAppDate(value);
  return { start: startOfMonth(day), end: endOfMonth(day) };
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return differenceInCalendarDays(parseAppDate(b), parseAppDate(a));
}

/**
 * M5-G — Day close API client for dashboard.
 */
import axios from 'axios';
import api from './api';
import { formatVarianceLabel, type VarianceLabel } from './shifts';

export type { VarianceLabel };
export { formatVarianceLabel };

export interface DayCloseRecord {
  id: number;
  business_date: string;
  closed_by_user_id: string;
  summary_json: string;
  created_at: string;
}

export interface DayCloseShiftSummary {
  id: number;
  terminal_id: string;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  opening_float_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface DayCloseSummary {
  business_date: string;
  timezone: string;
  shift_count: number;
  open_shift_count: number;
  open_shifts_warning: boolean;
  opening_float_cents_total: number;
  expected_cash_cents_total: number;
  counted_cash_cents_total: number | null;
  variance_cents_total: number | null;
  cash_payment_total_cents: number;
  cash_payment_count: number;
  shifts: DayCloseShiftSummary[];
}

export interface DayCloseResult {
  day_close: DayCloseRecord;
  summary: DayCloseSummary;
}

function extractApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Unable to reach the server';
  const data = error.response?.data as { error?: string } | undefined;
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  return error.message || 'Request failed';
}

export async function getDayClose(businessDate: string): Promise<DayCloseResult | null> {
  try {
    const res = await api.get(`/reports/day-close/${encodeURIComponent(businessDate)}`);
    return res.data as DayCloseResult;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw new Error(extractApiErrorMessage(error));
  }
}

export async function postDayClose(businessDate?: string): Promise<DayCloseResult> {
  try {
    const body = businessDate ? { business_date: businessDate } : {};
    const res = await api.post('/reports/day-close', body);
    return res.data as DayCloseResult;
  } catch (error) {
    throw new Error(extractApiErrorMessage(error));
  }
}

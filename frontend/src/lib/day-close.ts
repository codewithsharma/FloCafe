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
  cash_payment_total_cents: number;
  cash_payment_count: number;
  cash_refund_total_cents: number;
  cash_refund_count: number;
  net_cash_movement_cents: number;
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
  /** Cash In (gross qualifying cash tender). */
  cash_payment_total_cents: number;
  cash_payment_count: number;
  /** Cash Refunds (method === cash only). */
  cash_refund_total_cents: number;
  cash_refund_count: number;
  /** Cash In − Cash Refunds. */
  net_cash_movement_cents: number;
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

function parseContentDispositionFilename(header: string | undefined): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|"?)([^";\n]+)/i.exec(header);
  if (!match) return null;
  const raw = match[1].replace(/^"|"$/g, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Audited Z download from frozen summary (server formats; no client recomputation). */
export async function downloadDayCloseZExport(businessDate: string): Promise<void> {
  try {
    const res = await api.get(
      `/reports/day-close/${encodeURIComponent(businessDate)}/export/z.txt`,
      {
        responseType: 'blob',
      },
    );
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ?? `day-close-z-${businessDate}.txt`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(extractApiErrorMessage(error));
  }
}

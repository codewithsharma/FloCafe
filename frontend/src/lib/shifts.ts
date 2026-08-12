/**
 * M4-E1 — Shift API client for browser POS.
 *
 * Uses X-Flo-Terminal-Id via the shared api client (terminal-id.ts).
 * Browser POS must never call GET /api/shifts/terminal-id (Electron host only).
 */
import axios from 'axios';
import api from './api';
import type { Shift, ShiftStatus } from './types';

export type { Shift, ShiftStatus } from './types';

export type ShiftClientErrorCode = 'invalid_terminal' | 'network' | 'server' | 'unauthorized';

export interface ShiftClientError {
  code: ShiftClientErrorCode;
  message: string;
}

/** Result of a single active-shift fetch (pure, testable). */
export type ShiftFetchOutcome =
  | { kind: 'disabled' }
  | { kind: 'no_shift' }
  | { kind: 'active'; shift: Shift }
  | { kind: 'invalid_terminal'; message: string }
  | { kind: 'error'; code: ShiftClientErrorCode; message: string };

export interface ActiveShiftState {
  enabled: boolean;
  shift: Shift | null;
  loading: boolean;
  error: ShiftClientError | null;
}

export interface OpenShiftInput {
  opening_float_cents: number;
  opening_note?: string | null;
  terminal_id?: string;
}

export interface CloseShiftInput {
  counted_cash_cents?: number | null;
  closing_note?: string | null;
  terminal_id?: string;
}

export interface ShiftPaymentSummary {
  cash_payment_count: number;
  cash_payment_total_cents: number;
  non_cash_payment_total_cents: number;
}

export interface ReconciliationPreview {
  shift: Shift;
  opening_float_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  summary: ShiftPaymentSummary;
}

export interface ShiftMutationResult {
  shift: Shift;
  summary: ShiftPaymentSummary;
}

export type VarianceLabel = 'over' | 'short' | 'balanced';

/** Map integer variance cents to Over / Short / Balanced (null when unknown). */
export function formatVarianceLabel(varianceCents: number | null): VarianceLabel | null {
  if (varianceCents === null) return null;
  if (varianceCents > 0) return 'over';
  if (varianceCents < 0) return 'short';
  return 'balanced';
}

/** Map GET /shifts/active JSON to client outcome. Backend returns 200 with shift:null when none. */
export function normalizeActiveShiftResponse(data: { shift: Shift | null }): ShiftFetchOutcome {
  if (!data.shift) return { kind: 'no_shift' };
  return { kind: 'active', shift: data.shift };
}

/** Map axios/API errors to shift client outcomes. */
export function mapShiftApiError(error: unknown): ShiftFetchOutcome {
  if (!axios.isAxiosError(error)) {
    return { kind: 'error', code: 'network', message: 'Unable to reach the server' };
  }
  const status = error.response?.status;
  const message = extractApiErrorMessage(error);
  if (status === 503) return { kind: 'disabled' };
  if (status === 400) return { kind: 'invalid_terminal', message };
  if (status === 401 || status === 403) {
    return { kind: 'error', code: 'unauthorized', message };
  }
  if (!error.response) {
    return { kind: 'error', code: 'network', message: 'Unable to reach the server' };
  }
  return { kind: 'error', code: 'server', message };
}

/** Apply a fetch outcome to shift state fields (pure, testable). */
export function applyShiftFetchOutcome(
  outcome: ShiftFetchOutcome,
  loading: boolean,
): Pick<ActiveShiftState, 'enabled' | 'shift' | 'error'> & { loading: boolean } {
  switch (outcome.kind) {
    case 'disabled':
      return { enabled: false, shift: null, error: null, loading };
    case 'no_shift':
      return { enabled: true, shift: null, error: null, loading };
    case 'active':
      return { enabled: true, shift: outcome.shift, error: null, loading };
    case 'invalid_terminal':
      return {
        enabled: true,
        shift: null,
        error: { code: 'invalid_terminal', message: outcome.message },
        loading,
      };
    case 'error':
      return {
        enabled: true,
        shift: null,
        error: { code: outcome.code, message: outcome.message },
        loading,
      };
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

export async function fetchActiveShift(): Promise<ShiftFetchOutcome> {
  try {
    const { data } = await api.get<{ shift: Shift | null }>('/shifts/active');
    return normalizeActiveShiftResponse(data);
  } catch (error) {
    return mapShiftApiError(error);
  }
}

/** Typed wrapper for POST /shifts/open (M4-E2+ UI). */
export async function openShift(input: OpenShiftInput): Promise<Shift> {
  const { data } = await api.post<{ shift: Shift }>('/shifts/open', input);
  return data.shift;
}

/** Read-only reconciliation preview before close (M5-F). */
export async function fetchReconciliationPreview(shiftId: number): Promise<ReconciliationPreview> {
  const { data } = await api.get<ReconciliationPreview>(`/shifts/${shiftId}/reconciliation-preview`);
  return data;
}

/** Typed wrapper for POST /shifts/:id/close (M4-E2+ UI). */
export async function closeShift(shiftId: number, input: CloseShiftInput = {}): Promise<Shift> {
  const { data } = await api.post<ShiftMutationResult>(`/shifts/${shiftId}/close`, input);
  return data.shift;
}

/** Roles that may open/close shifts per M4-C backend. UI hint only — backend is authoritative. */
export function canManageShifts(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'manager' || role === 'cashier';
}

/** Roles that may force-close shifts (RFC §12). UI hint only — backend is authoritative. */
export function canForceCloseShifts(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'manager';
}

/** Roles that may list shift history (RFC §12). UI hint only — backend is authoritative. */
export function canViewShiftHistory(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'manager';
}

/** Matches server default from migration v69 (`shift_stale_hours`). */
export const DEFAULT_SHIFT_STALE_HOURS = 24;

export function parseShiftStaleHours(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_SHIFT_STALE_HOURS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_SHIFT_STALE_HOURS;
  return Math.floor(parsed);
}

/** True when the open shift exceeds the configured stale threshold (RFC §18.4). */
export function isShiftStale(openedAt: string, staleHours: number, now: Date = new Date()): boolean {
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime())) return false;
  const elapsedMs = now.getTime() - opened.getTime();
  return elapsedMs > staleHours * 60 * 60 * 1000;
}

export interface ListShiftsParams {
  limit?: number;
  offset?: number;
  terminal_id?: string;
  status?: ShiftStatus;
}

export interface ForceCloseShiftInput {
  reason: string;
  counted_cash_cents?: number | null;
  closing_note?: string | null;
}

/** Read `shift_stale_hours` for stale-shift UI warnings. Falls back to 24 on error. */
export async function fetchShiftStaleHours(): Promise<number> {
  try {
    const { data } = await api.get<{ setting?: { value?: string } }>('/settings/shift_stale_hours');
    return parseShiftStaleHours(data.setting?.value);
  } catch {
    return DEFAULT_SHIFT_STALE_HOURS;
  }
}

/** Paginated shift history — owner/manager only (M4-C). */
export async function listShifts(
  params: ListShiftsParams = {},
): Promise<{ shifts: Shift[]; limit: number; offset: number }> {
  const { data } = await api.get<{ shifts: Shift[]; limit: number; offset: number }>('/shifts', { params });
  return data;
}

/** Manager/owner force-close with required reason (M4-C). */
export async function forceCloseShift(shiftId: number, input: ForceCloseShiftInput): Promise<Shift> {
  const { data } = await api.post<ShiftMutationResult>(`/shifts/${shiftId}/force-close`, input);
  return data.shift;
}

/** User-facing message for open/close mutation failures. */
export function mapShiftMutationError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Unable to reach the server';
  }
  if (!error.response) {
    return 'Unable to reach the server';
  }
  return extractApiErrorMessage(error);
}

function extractApiErrorMessage(error: import('axios').AxiosError): string {
  const body = error.response?.data;
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  if (typeof body === 'string' && body.trim()) return body;
  return 'Request failed';
}

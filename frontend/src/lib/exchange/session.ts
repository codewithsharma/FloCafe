/**
 * Phase 4.5 — Exchange attempt session persistence (ADR-012 §9).
 */

import type { ExchangeAttemptState } from './types';

export const EXCHANGE_SESSION_STORAGE_KEY = 'operavia-exchange-attempt';

export function loadExchangeAttempt(): ExchangeAttemptState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(EXCHANGE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExchangeAttemptState;
    if (!parsed || typeof parsed !== 'object' || !parsed.exchangeAttemptId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistExchangeAttempt(state: ExchangeAttemptState): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(
    EXCHANGE_SESSION_STORAGE_KEY,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
  );
}

export function clearExchangeAttempt(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(EXCHANGE_SESSION_STORAGE_KEY);
}

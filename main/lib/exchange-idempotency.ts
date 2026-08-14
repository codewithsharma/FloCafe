/**
 * Phase 4.5 — Retail exchange per-leg idempotency keys (ADR-012 §9).
 *
 * Pure key builders; no I/O.
 */

const KEY_PREFIX = 'exchange';

export function refundKey(attemptId: string): string {
  return `${KEY_PREFIX}-${attemptId}-refund`;
}

export function orderKey(attemptId: string): string {
  return `${KEY_PREFIX}-${attemptId}-order`;
}

export function paymentKey(attemptId: string): string {
  return `${KEY_PREFIX}-${attemptId}-payment`;
}

export function restockKey(attemptId: string, orderItemId: string | number): string {
  return `${KEY_PREFIX}-${attemptId}-restock-${String(orderItemId)}`;
}

export function createExchangeAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID is not available');
}

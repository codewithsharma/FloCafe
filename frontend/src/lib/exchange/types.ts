/**
 * Phase 4.5 — Retail exchange coordinator types (ADR-012).
 *
 * Leg states are coordinator-derived; no server-side exchange entity in v1.
 */

export type ExchangeRefundLegState = 'refund_pending' | 'refund_complete';

export type ExchangeReplacementLegState = 'replacement_pending' | 'replacement_complete';

export type ExchangeRestockLegState = 'restock_pending' | 'restock_complete' | 'restock_skipped';

export interface ExchangeReturnLine {
  orderItemId: string;
  lineTotal: number;
  lineQuantity: number;
  returnQuantity: number;
  status?: string | null;
  /** Operator opt-in per ADR-011. */
  restockRequested?: boolean;
  restockComplete?: boolean;
}

export interface ExchangeReplacementLine {
  productId: string;
  quantity: number;
}

export interface ExchangeAttemptState {
  exchangeAttemptId: string;
  originalBillId: number;
  originalOrderId?: string | number;
  refundLeg: ExchangeRefundLegState;
  refundId?: number;
  refundAmount?: number;
  replacementLeg: ExchangeReplacementLegState;
  replacementOrderId?: number;
  replacementBillId?: number;
  /** Bill total from replacement leg — set after generate or by UI preview before leg 2. */
  replacementPaymentTotal?: number;
  restockLeg: ExchangeRestockLegState;
  returnLines: ExchangeReturnLine[];
  replacementLines: ExchangeReplacementLine[];
  lastError?: string;
  updatedAt?: string;
}

export function isExchangeTerminal(state: ExchangeAttemptState): boolean {
  const refundDone = state.refundLeg === 'refund_complete';
  const replacementDone = state.replacementLeg === 'replacement_complete';
  const restockDone =
    state.restockLeg === 'restock_complete' || state.restockLeg === 'restock_skipped';
  return refundDone && replacementDone && restockDone;
}

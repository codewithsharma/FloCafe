/**
 * Phase 4.5 — Retail exchange coordinator (ADR-012).
 *
 * Orchestrates refund → replacement sale → optional restock. No automatic
 * compensation on partial failure; session persistence enables resume.
 */

import { orderKey, paymentKey, refundKey, restockKey } from '@exchange/idempotency';
import { totalReturnValue } from '@exchange/return-value';
import api from '@/lib/api';
import { extractRefundErrorMessage, postBillRefund, postRefundRestock } from '@/lib/refunds';
import { persistExchangeAttempt } from './session';
import type { ExchangeAttemptState } from './types';

export interface RunExchangeParams {
  attemptState: ExchangeAttemptState;
  billId: number;
  refundReason: string;
  overridePin: string;
  refundMethod?: string;
  /** Tender for replacement bill payment (leg 2). */
  paymentMethod: string;
  customerId?: string | number | null;
  onProgress?: (state: ExchangeAttemptState) => void;
}

function touchState(state: ExchangeAttemptState): ExchangeAttemptState {
  return { ...state, updatedAt: new Date().toISOString() };
}

function saveState(
  state: ExchangeAttemptState,
  onProgress?: RunExchangeParams['onProgress'],
): ExchangeAttemptState {
  const next = touchState(state);
  persistExchangeAttempt(next);
  onProgress?.(next);
  return next;
}

function buildOrderItems(
  state: ExchangeAttemptState,
): Array<{ product_id: string; quantity: number }> {
  return state.replacementLines.map((line) => ({
    product_id: line.productId,
    quantity: line.quantity,
  }));
}

function deriveRestockLeg(state: ExchangeAttemptState): ExchangeAttemptState['restockLeg'] {
  const requested = state.returnLines.filter((line) => line.restockRequested);
  if (requested.length === 0) return 'restock_skipped';
  const allDone = requested.every((line) => line.restockComplete);
  return allDone ? 'restock_complete' : 'restock_pending';
}

/**
 * Run exchange legs in order: refund → replacement → restock.
 * Reuses stored leg ids on resume; no automatic rollback on failure.
 */
export async function runExchange(params: RunExchangeParams): Promise<ExchangeAttemptState> {
  let state = { ...params.attemptState, originalBillId: params.billId };
  const { exchangeAttemptId } = state;

  try {
    // Leg 1 — refund on original bill
    if (state.refundLeg !== 'refund_complete') {
      const refundAmount = totalReturnValue(
        state.returnLines.map((line) => ({
          orderItemId: line.orderItemId,
          lineTotal: line.lineTotal,
          lineQuantity: line.lineQuantity,
          returnQuantity: line.returnQuantity,
          status: line.status,
        })),
      );

      const refundResult = await postBillRefund(
        params.billId,
        {
          amount: refundAmount,
          reason: params.refundReason,
          override_pin: params.overridePin,
          ...(params.refundMethod ? { method: params.refundMethod } : {}),
        },
        { idempotencyKey: refundKey(exchangeAttemptId) },
      );

      state = saveState(
        {
          ...state,
          refundLeg: 'refund_complete',
          refundId: refundResult.refund.id,
          refundAmount,
        },
        params.onProgress,
      );
    }

    // Leg 2 — replacement sale: order → bill → pay exact bill.total
    if (state.replacementLeg !== 'replacement_complete') {
      let orderId = state.replacementOrderId;
      if (!orderId) {
        const { data } = await api.post(
          '/orders',
          {
            type: 'takeaway',
            customer_id: params.customerId ?? undefined,
            items: buildOrderItems(state),
          },
          { headers: { 'Idempotency-Key': orderKey(exchangeAttemptId) } },
        );
        orderId = data.order.id;
        state = saveState({ ...state, replacementOrderId: orderId }, params.onProgress);
      }

      let billId = state.replacementBillId;
      let billTotal = state.replacementPaymentTotal;
      if (!billId) {
        const { data } = await api.post('/bills/generate', { order_id: orderId });
        billId = data.bill.id;
        billTotal = Number(data.bill.total);
        state = saveState(
          { ...state, replacementBillId: billId, replacementPaymentTotal: billTotal },
          params.onProgress,
        );
      }

      if (billTotal == null || !Number.isFinite(billTotal)) {
        throw new Error('Replacement bill total is unavailable');
      }

      await api.post(
        `/bills/${billId}/payments`,
        {
          payments: [{ method: params.paymentMethod, amount: billTotal }],
          customer_id: params.customerId ?? undefined,
        },
        { headers: { 'Idempotency-Key': paymentKey(exchangeAttemptId) } },
      );

      state = saveState(
        {
          ...state,
          replacementLeg: 'replacement_complete',
          replacementOrderId: orderId,
          replacementBillId: billId,
          replacementPaymentTotal: billTotal,
        },
        params.onProgress,
      );
    }

    // Leg 3 — optional restock per returned line (retail only)
    const refundId = state.refundId;
    if (!refundId) {
      throw new Error('Refund id missing after refund leg');
    }

    const returnLines = [...state.returnLines];
    let restockChanged = false;

    for (let i = 0; i < returnLines.length; i += 1) {
      const line = returnLines[i];
      if (!line.restockRequested || line.restockComplete) continue;

      await postRefundRestock(
        refundId,
        { order_item_id: line.orderItemId, quantity: line.returnQuantity },
        { idempotencyKey: restockKey(exchangeAttemptId, line.orderItemId) },
      );

      returnLines[i] = { ...line, restockComplete: true };
      restockChanged = true;
      state = saveState(
        { ...state, returnLines, restockLeg: 'restock_pending' },
        params.onProgress,
      );
    }

    if (restockChanged || state.restockLeg === 'restock_pending') {
      state = saveState(
        { ...state, returnLines, restockLeg: deriveRestockLeg(state) },
        params.onProgress,
      );
    } else if (state.restockLeg !== 'restock_complete' && state.restockLeg !== 'restock_skipped') {
      state = saveState({ ...state, restockLeg: deriveRestockLeg(state) }, params.onProgress);
    }

    return state;
  } catch (err: unknown) {
    const message = extractRefundErrorMessage(err);
    state = saveState({ ...state, lastError: message }, params.onProgress);
    throw err;
  }
}

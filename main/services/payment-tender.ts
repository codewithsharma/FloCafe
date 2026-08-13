/**
 * Payment tender domain boundary (Phase 2.15).
 *
 * Owns: bill tender prepare/apply (FIN-01 gross-outstanding, split allocation,
 * wallet debit, loyalty cashback credit, payment idempotency, shift attribution,
 * payment.received audit). Orchestrates optional restaurant side effects
 * (table free) only when the tables module is enabled.
 *
 * Does NOT own: tax engine, inventory/stock, KDS push semantics, table domain
 * policy, or printing. payment-cash.ts and refund.ts stay separate.
 *
 * No schema migration. No money-math / FIN-01 changes. No API contract changes.
 * Callers keep withTxn around applyPaymentBatch.
 */

import { getDatabase, now, parseRowJson } from '../db';
import { isModuleEnabled } from '../modules';
import { logAuditEvent } from './audit-log';
import { isQualifyingCashPaymentLineCents } from './payment-cash';
import { assertOpenShiftForCashPayment, resolveActiveShiftForTerminal } from './shift';
import { DOMAIN_SPAN, withSpanSync } from '../lib/tracing';

/** Concerns Payment tender is responsible for coordinating / persisting. */
export const PAYMENT_OWNED_CONCERNS: readonly string[] = [
  'bill tender prepare/validate (methods, amounts, FIN-01 gross outstanding)',
  'atomic payment batch apply (payment_details, paid_amount, payment_status)',
  'payment idempotency + transaction_id uniqueness',
  'wallet debit / loyalty cashback credit at settle time',
  'shift_id attribution on first payment + payment.received audit',
];

/**
 * Concerns Payment must NOT implement. Use the named owner instead.
 * Soft-gated call sites (tables free, KDS notify) are orchestration only.
 */
export const PAYMENT_DOES_NOT_OWN: readonly string[] = [
  'tax engine / calculation — use Tax facade',
  'inventory / stock mutations — use Inventory',
  'KDS display push semantics — use KDS (notifyKdsUpdate is a side-effect call site only)',
  'table domain / seating policy — use Tables (free-on-paid is a soft-gated side effect)',
  'receipt / KOT printing — use Printing',
];

export function assertPaymentBoundaryInvariants(): void {
  const mustDelegate = ['tax', 'inventory', 'kds', 'table', 'print'];
  for (const needle of mustDelegate) {
    const hit = PAYMENT_DOES_NOT_OWN.some((s) => s.toLowerCase().includes(needle));
    if (!hit) {
      throw new Error(`Payment boundary invariant: PAYMENT_DOES_NOT_OWN must mention "${needle}"`);
    }
  }
  if (PAYMENT_OWNED_CONCERNS.length === 0) {
    throw new Error('Payment boundary invariant: PAYMENT_OWNED_CONCERNS must be non-empty');
  }
}

export interface PaymentInput {
  method: string;
  payment_method_id?: number;
  amount?: number | string | null;
  transaction_id?: string;
  notes?: string;
}

interface PreparedPayment {
  payment: PaymentInput;
  amountCents: number;
  tenderedCents?: number;
  changeCents?: number;
  amountOmitted?: boolean;
}

const PAYMENT_METHODS = new Set(['cash', 'card', 'wallet']);
const MAX_PAYMENT_LINES = 100;
const MAX_PAYMENT_METADATA_BYTES = 8192;
const LOYALTY_REDEMPTION_RATE = 100;

function paymentDetailsGrossCents(details: unknown): number {
  let lines: unknown[] = [];
  if (Array.isArray(details)) {
    lines = details;
  } else if (typeof details === 'string' && details.trim()) {
    try {
      const parsed = JSON.parse(details);
      lines = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
    } catch {
      lines = [];
    }
  } else if (details && typeof details === 'object') {
    lines = [details];
  }
  return lines.reduce((sum: number, line: any) => {
    const amount = Number(line?.amount);
    if (!Number.isFinite(amount)) return sum;
    return sum + Math.round(amount * 100);
  }, 0);
}

function paymentAmountCents(value: unknown, label = 'Payment amount'): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw Object.assign(new Error(`${label} must be a finite number greater than zero`), {
      statusCode: 400,
    });
  }
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw Object.assign(
      new Error(`${label} must be a finite number greater than zero with at most 2 decimal places`),
      { statusCode: 400 },
    );
  }
  const parsed = Number(text);
  const cents = Math.round(parsed * 100);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isSafeInteger(cents)) {
    throw Object.assign(new Error(`${label} must be a finite number greater than zero`), {
      statusCode: 400,
    });
  }
  return cents;
}

function validatePaymentFields(payment: PaymentInput, index: number): void {
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) {
    throw Object.assign(new Error(`Unsupported payment method at line ${index + 1}`), {
      statusCode: 400,
    });
  }
  if (!payment.method)
    throw Object.assign(new Error('Payment method is required'), { statusCode: 400 });
  if (typeof payment.method !== 'string' || payment.method.length > 60) {
    throw Object.assign(new Error(`Unsupported payment method at line ${index + 1}`), {
      statusCode: 400,
    });
  }
  if (payment.method === 'custom' && !Number.isSafeInteger(Number(payment.payment_method_id))) {
    throw Object.assign(new Error(`Custom payment method is required at line ${index + 1}`), {
      statusCode: 400,
    });
  }
  if (JSON.stringify(payment).length > MAX_PAYMENT_METADATA_BYTES) {
    throw Object.assign(new Error(`Payment metadata at line ${index + 1} is too large`), {
      statusCode: 400,
    });
  }
  for (const [field, maxLength] of [
    ['transaction_id', 256],
    ['notes', 1024],
  ] as const) {
    const value = payment[field];
    if (
      value !== undefined &&
      (typeof value !== 'string' ||
        value.length > maxLength ||
        (field === 'transaction_id' && value.trim() === ''))
    ) {
      throw Object.assign(new Error(`${field} is invalid or too long`), { statusCode: 400 });
    }
  }
  if (payment.amount !== undefined && payment.amount !== null) paymentAmountCents(payment.amount);
}

function paymentTransactionKey(payment: unknown): string | null {
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) return null;
  const candidate = payment as PaymentInput;
  const methodKey =
    candidate.payment_method_id === undefined
      ? candidate.method
      : `custom:${candidate.payment_method_id}`;
  return typeof methodKey === 'string' && typeof candidate.transaction_id === 'string'
    ? JSON.stringify([methodKey, candidate.transaction_id])
    : null;
}

function transactionPaymentMatches(existing: any, candidate: PaymentInput): boolean {
  if (!existing) return false;
  if (existing.method !== candidate.method || existing.transaction_id !== candidate.transaction_id)
    return false;
  if ((existing.notes ?? null) !== (candidate.notes ?? null)) return false;
  const candidateOmitted = candidate.amount === undefined || candidate.amount === null;
  if (
    existing.amount_omitted !== undefined &&
    Boolean(existing.amount_omitted) !== candidateOmitted
  )
    return false;
  if (candidateOmitted) return true;
  const requestedCents = paymentAmountCents(candidate.amount);
  const storedRequested =
    existing.requested_amount ??
    (existing.method === 'cash' && existing.tendered_amount !== undefined
      ? existing.tendered_amount
      : existing.amount);
  return (
    typeof storedRequested === 'number' && Math.round(storedRequested * 100) === requestedCents
  );
}

export function preparePaymentBatch(
  db: ReturnType<typeof getDatabase>,
  billId: string,
  payments: PaymentInput[],
  bodyCustomerId?: string | number,
  allowOmittedAmount = false,
): {
  bill: any;
  prepared: PreparedPayment[];
  existingPayments: any[];
  effectiveCustomerId: string | null;
  idempotentReplay?: boolean;
} {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
  if (!bill) throw Object.assign(new Error('Bill not found'), { statusCode: 404 });
  if (!Array.isArray(payments) || payments.length === 0)
    throw Object.assign(new Error('payments must be a non-empty array'), { statusCode: 400 });
  if (payments.length > MAX_PAYMENT_LINES)
    throw Object.assign(new Error(`A maximum of ${MAX_PAYMENT_LINES} payment lines is allowed`), {
      statusCode: 400,
    });
  let existingPayments: any[] = [];
  if (bill.payment_details) {
    try {
      const parsed = JSON.parse(bill.payment_details);
      existingPayments = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Preserve settlement compatibility with legacy malformed JSON. The new
      // line is still appended in a recoverable JSON array below.
      existingPayments = [];
    }
  }
  payments.forEach(validatePaymentFields);
  const resolvedPayments = payments.map((payment, index) => {
    if (PAYMENT_METHODS.has(payment.method)) return payment;
    const configured =
      payment.method === 'custom'
        ? (db
            .prepare('SELECT id, name FROM payment_methods WHERE id = ? AND is_active = 1')
            .get(payment.payment_method_id) as any)
        : (db
            .prepare(
              'SELECT id, name FROM payment_methods WHERE lower(name) = lower(?) AND is_active = 1',
            )
            .get(payment.method) as any);
    if (!configured)
      throw Object.assign(
        new Error(`Unsupported or inactive custom payment method at line ${index + 1}`),
        { statusCode: 400 },
      );
    return { ...payment, method: configured.name, payment_method_id: Number(configured.id) };
  });
  const requestedCustomerId =
    bodyCustomerId === undefined || bodyCustomerId === null || bodyCustomerId === ''
      ? null
      : String(bodyCustomerId);
  const order = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(bill.order_id) as
    { customer_id?: string | number | null } | undefined;
  const associatedCustomerId = bill.customer_id || order?.customer_id || null;
  if (
    requestedCustomerId &&
    associatedCustomerId &&
    String(associatedCustomerId) !== requestedCustomerId
  ) {
    throw Object.assign(new Error('Payment customer does not match the bill customer'), {
      statusCode: 400,
    });
  }
  const usesWallet = resolvedPayments.some((payment) => payment.method === 'wallet');
  if (usesWallet && !associatedCustomerId) {
    throw Object.assign(new Error('Wallet payment requires a customer associated with the bill'), {
      statusCode: 400,
    });
  }
  const effectiveCustomerId = associatedCustomerId
    ? String(associatedCustomerId)
    : requestedCustomerId;
  if (
    effectiveCustomerId &&
    !db.prepare('SELECT id FROM customers WHERE id = ?').get(effectiveCustomerId)
  ) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 400 });
  }
  const existingTransactionKeys = new Set(
    existingPayments.map(paymentTransactionKey).filter(Boolean),
  );
  const existingTransactionPayments = new Map<string, any>();
  for (const existing of existingPayments) {
    const transactionKey = paymentTransactionKey(existing);
    if (transactionKey) existingTransactionPayments.set(transactionKey, existing);
  }
  for (const payment of resolvedPayments) {
    const transactionKey = paymentTransactionKey(payment);
    if (!transactionKey) continue;
    const candidate = payment as PaymentInput;
    const methodKey =
      candidate.payment_method_id === undefined
        ? candidate.method
        : `custom:${candidate.payment_method_id}`;
    const reference = db
      .prepare(
        'SELECT bill_id FROM payment_transaction_refs WHERE method = ? AND transaction_id = ?',
      )
      .get(methodKey, candidate.transaction_id) as { bill_id: string } | undefined;
    if (reference && String(reference.bill_id) !== String(billId)) {
      throw Object.assign(
        new Error('Payment transaction_id has already been used for another bill'),
        { statusCode: 409 },
      );
    }
    if (reference) existingTransactionKeys.add(transactionKey);
  }
  const requestTransactionKeys = resolvedPayments.map(paymentTransactionKey);
  const transactionMethods = new Map<string, string>();
  for (const payment of resolvedPayments) {
    if (typeof payment.transaction_id !== 'string' || payment.transaction_id.trim() === '')
      continue;
    const methodKey =
      payment.payment_method_id === undefined
        ? payment.method
        : `custom:${payment.payment_method_id}`;
    const previousMethod = transactionMethods.get(payment.transaction_id);
    if (previousMethod && previousMethod !== methodKey) {
      throw Object.assign(
        new Error('A transaction_id cannot be reused across payment methods in one batch'),
        { statusCode: 400 },
      );
    }
    transactionMethods.set(payment.transaction_id, methodKey);
  }
  const replay = requestTransactionKeys.every(
    (key, index) =>
      key !== null &&
      existingTransactionKeys.has(key) &&
      transactionPaymentMatches(existingTransactionPayments.get(key), resolvedPayments[index]),
  );
  if (replay) {
    return { bill, prepared: [], existingPayments, effectiveCustomerId, idempotentReplay: true };
  }
  const seenTransactionKeys = new Set<string>();
  for (const key of requestTransactionKeys) {
    if (key && (seenTransactionKeys.has(key) || existingTransactionKeys.has(key))) {
      throw Object.assign(new Error('Payment transaction_id has already been used for this bill'), {
        statusCode: 409,
      });
    }
    if (key) seenTransactionKeys.add(key);
  }
  if (bill.payment_status === 'refunded') {
    throw Object.assign(
      new Error('Bill is already refunded; create a new bill to collect payment'),
      { statusCode: 400, code: 'BILL_ALREADY_REFUNDED' },
    );
  }
  if (bill.payment_status === 'paid')
    throw Object.assign(new Error('Bill is already paid'), { statusCode: 400 });
  const totalCents = Math.round(Number(bill.total || 0) * 100);
  // FIN-01: collectible outstanding is based on GROSS successful tender
  // (payment_details), never net paid_amount. Refunds reduce net / recon
  // but must not recreate payment capacity.
  // outstanding = bill_total − gross_successful_tender
  const grossCents = Math.max(
    paymentDetailsGrossCents(bill.payment_details),
    paymentDetailsGrossCents(existingPayments),
  );
  const remainingCents = Math.max(0, totalCents - grossCents);
  if (remainingCents <= 0) {
    throw Object.assign(
      new Error('Bill has no outstanding balance; create a new bill to collect payment'),
      { statusCode: 400, code: 'BILL_NO_OUTSTANDING_BALANCE' },
    );
  }
  const raw = resolvedPayments.map((payment) => {
    // Preserve omitted/null compatibility for the legacy single-line contracts.
    // Multi-line batches must state every amount explicitly so allocation is
    // deterministic before any write.
    const supportsOmittedAmount = allowOmittedAmount || payments.length === 1;
    const amountValue =
      supportsOmittedAmount && payment.amount === null ? undefined : payment.amount;
    const amount =
      amountValue === undefined
        ? supportsOmittedAmount
          ? remainingCents
          : undefined
        : paymentAmountCents(amountValue);
    if (amount === undefined)
      throw Object.assign(new Error('Payment amount is required for split payments'), {
        statusCode: 400,
      });
    const normalizedPayment: PaymentInput = {
      method: String(payment.method),
      ...(payment.payment_method_id !== undefined
        ? { payment_method_id: payment.payment_method_id }
        : {}),
    };
    if (payment.transaction_id !== undefined)
      normalizedPayment.transaction_id = payment.transaction_id;
    if (payment.notes !== undefined) normalizedPayment.notes = payment.notes;
    return {
      payment: normalizedPayment,
      method: normalizedPayment.method,
      requestedCents: amount,
      amountOmitted: amountValue === undefined,
    };
  });
  const nonCashCents = raw
    .filter((line) => line.method !== 'cash')
    .reduce((sum, line) => sum + line.requestedCents, 0);
  if (nonCashCents > remainingCents)
    throw Object.assign(new Error('Non-cash payment exceeds the bill balance'), {
      statusCode: 400,
    });
  const cashRequiredCents = remainingCents - nonCashCents;
  // Partial payments remain supported. Cash is allocated up to the amount
  // needed after non-cash lines; a short tender simply leaves a partial bill.
  let cashLeft = cashRequiredCents;
  const prepared: PreparedPayment[] = raw
    .map((line) => {
      if (line.method !== 'cash')
        return {
          payment: line.payment,
          amountCents: line.requestedCents,
          amountOmitted: line.amountOmitted,
        };
      const applied = Math.min(line.requestedCents, cashLeft);
      cashLeft -= applied;
      if (applied === 0 && line.payment.transaction_id) {
        throw Object.assign(new Error('A zero-applied cash line cannot carry a transaction_id'), {
          statusCode: 400,
        });
      }
      return {
        payment: line.payment,
        amountCents: applied,
        tenderedCents: line.requestedCents,
        changeCents: line.requestedCents - applied,
        amountOmitted: line.amountOmitted,
      };
    })
    .filter((line) => line.amountCents > 0);

  if (prepared.some((line) => line.payment.method === 'wallet')) {
    if (!effectiveCustomerId)
      throw Object.assign(new Error('Customer association is required for wallet payment'), {
        statusCode: 400,
      });
    const credits = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE customer_id = ? AND type = 'credit' AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      )
      .get(effectiveCustomerId) as { total: number };
    const debits = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE customer_id = ? AND type = 'debit'`,
      )
      .get(effectiveCustomerId) as { total: number };
    const walletPoints = Math.max(0, Number(credits.total) - Number(debits.total));
    const pointsRequired = prepared
      .filter((line) => line.payment.method === 'wallet')
      .reduce((sum, line) => sum + line.amountCents, 0);
    if (walletPoints < pointsRequired)
      throw Object.assign(
        new Error(
          `Insufficient wallet balance. Available: ${Math.floor(walletPoints / LOYALTY_REDEMPTION_RATE)} (${walletPoints} points), Required: ${pointsRequired / 100}`,
        ),
        { statusCode: 400 },
      );
  }
  return { bill, prepared, existingPayments, effectiveCustomerId };
}

function calculateCashback(
  db: ReturnType<typeof getDatabase>,
  bill: any,
  customerId: string | null,
): number {
  if (!customerId) return 0;
  const enabled = (
    db.prepare(`SELECT value FROM settings WHERE key = 'loyalty_enabled'`).get() as any
  )?.value;
  if (enabled !== 'true' && enabled !== '1') return 0;
  const globalRate = parseFloat(
    (db.prepare(`SELECT value FROM settings WHERE key = 'global_cashback_percent'`).get() as any)
      ?.value || '0',
  );
  const order = db
    .prepare('SELECT subtotal, discount_amount FROM orders WHERE id = ?')
    .get(bill.order_id) as any;
  const items = db
    .prepare(
      `SELECT oi.subtotal, p.cb_percent FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? AND oi.status != 'cancelled'`,
    )
    .all(bill.order_id) as { subtotal: number; cb_percent: number | null }[];
  const fullOrderCashback = items.reduce((sum, item) => {
    const discountShare =
      order?.discount_amount > 0 && order?.subtotal > 0
        ? (order.discount_amount * item.subtotal) / order.subtotal
        : 0;
    const rate = item.cb_percent !== null ? item.cb_percent : globalRate;
    return (
      sum +
      (rate > 0
        ? Math.floor((Math.max(0, item.subtotal - discountShare) * rate) / 100) *
          LOYALTY_REDEMPTION_RATE
        : 0)
    );
  }, 0);
  const splitRatio =
    Number(order?.subtotal || 0) > 0 && bill.split_group_id
      ? Math.min(1, Number(bill.subtotal || 0) / Number(order.subtotal))
      : 1;
  return Math.floor(fullOrderCashback * splitRatio);
}

export function applyPaymentBatch(
  db: ReturnType<typeof getDatabase>,
  billId: string,
  payments: PaymentInput[],
  bodyCustomerId?: string | number,
  allowOmittedAmount = false,
  idempotencyKey?: string | null,
  requestHash?: string,
  idempotencyUserId?: string,
  terminalIdHeader?: string,
): { bill: any; walletDebited: boolean; loyaltyPointsEarned: number } {
  return withSpanSync(
    'payment',
    DOMAIN_SPAN.payment.applyBatch,
    () => {
      if (idempotencyKey && idempotencyUserId) {
        // `legacy` is an append-only compatibility owner for pre-user-scoped
        // records whose original user cannot be recovered. It is only reachable
        // with the exact bill and request hash; new records are always user-bound.
        const prior = db
          .prepare(
            `
      SELECT bill_id, request_hash, response_json
      FROM payment_idempotency
      WHERE (user_id = ? OR user_id = 'legacy') AND idempotency_key = ?
      ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
      LIMIT 1
    `,
          )
          .get(idempotencyUserId, idempotencyKey, idempotencyUserId) as
          { bill_id: string; request_hash: string; response_json: string } | undefined;
        if (prior) {
          if (String(prior.bill_id) !== String(billId) || prior.request_hash !== requestHash) {
            throw Object.assign(
              new Error('Idempotency-Key was already used for a different payment request'),
              { statusCode: 409 },
            );
          }
          try {
            return JSON.parse(prior.response_json);
          } catch {
            throw Object.assign(new Error('Stored payment response is invalid'), {
              statusCode: 500,
            });
          }
        }
      }
      const { bill, prepared, existingPayments, effectiveCustomerId, idempotentReplay } =
        preparePaymentBatch(db, billId, payments, bodyCustomerId, allowOmittedAmount);
      if (idempotentReplay) {
        return {
          bill: parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(billId)),
          walletDebited: false,
          loyaltyPointsEarned: 0,
        };
      }
      if (
        prepared.some((line) =>
          isQualifyingCashPaymentLineCents(line.payment.method, line.amountCents),
        )
      ) {
        assertOpenShiftForCashPayment(terminalIdHeader);
      }
      const totalAppliedCents = prepared.reduce((sum, line) => sum + line.amountCents, 0);
      const oldPaidCents = Math.round(Number(bill.paid_amount || 0) * 100);
      const totalCents = Math.round(Number(bill.total || 0) * 100);
      const newPaidCents = oldPaidCents + totalAppliedCents;
      const newBalanceCents = Math.max(0, totalCents - newPaidCents);
      const paymentStatus = newBalanceCents === 0 ? 'paid' : 'partial';
      const newPayments = prepared.map((line) => ({
        ...line.payment,
        amount: line.amountCents / 100,
        requested_amount: (line.tenderedCents || line.amountCents) / 100,
        amount_omitted: Boolean(line.amountOmitted),
        ...(line.payment.method === 'cash'
          ? {
              tendered_amount: (line.tenderedCents || 0) / 100,
              change_amount: (line.changeCents || 0) / 100,
            }
          : {}),
        timestamp: now(),
      }));
      let walletDebited = false;
      for (const line of prepared) {
        if (line.payment.method !== 'wallet' || line.amountCents <= 0) continue;
        db.prepare(
          `INSERT INTO loyalty_ledger (customer_id, bill_id, type, amount, description, created_at, updated_at) VALUES (?, ?, 'debit', ?, ?, ?, ?)`,
        ).run(
          effectiveCustomerId,
          bill.id,
          line.amountCents,
          `Payment for bill ${bill.bill_number}`,
          now(),
          now(),
        );
        walletDebited = true;
      }
      const allPayments = existingPayments.concat(newPayments);
      const changedAt = now();
      const insertTransactionRef = db.prepare(
        'INSERT INTO payment_transaction_refs (method, transaction_id, bill_id, created_at) VALUES (?, ?, ?, ?)',
      );
      for (const line of prepared) {
        if (line.payment.transaction_id) {
          const methodKey =
            line.payment.payment_method_id === undefined
              ? line.payment.method
              : `custom:${line.payment.payment_method_id}`;
          insertTransactionRef.run(methodKey, line.payment.transaction_id, billId, changedAt);
        }
      }

      // M4-D3 — First payment establishes bill.shift_id attribution.
      // Never overwrite an already populated bills.shift_id (e.g. from prior partial payments).
      if (bill.shift_id === null || bill.shift_id === undefined) {
        const activeShiftId = resolveActiveShiftForTerminal(terminalIdHeader);
        if (activeShiftId !== null) {
          db.prepare('UPDATE bills SET shift_id = ?, updated_at = ? WHERE id = ?').run(
            activeShiftId,
            changedAt,
            billId,
          );
        }
      }

      if (!bill.customer_id && effectiveCustomerId)
        db.prepare('UPDATE bills SET customer_id = ?, updated_at = ? WHERE id = ?').run(
          effectiveCustomerId,
          changedAt,
          billId,
        );
      const previousPaymentStatus = String(bill.payment_status || 'unpaid');
      const previousPaidAmount = Number(bill.paid_amount || 0);
      db.prepare(
        `UPDATE bills SET paid_amount = ?, balance = ?, payment_status = ?, payment_details = ?, paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END, updated_at = ? WHERE id = ?`,
      ).run(
        newPaidCents / 100,
        newBalanceCents / 100,
        paymentStatus,
        JSON.stringify(allPayments),
        paymentStatus,
        paymentStatus === 'paid' ? changedAt : null,
        changedAt,
        billId,
      );
      const updatedBillRow = parseRowJson(
        db.prepare('SELECT * FROM bills WHERE id = ?').get(billId),
      ) as any;
      logAuditEvent({
        actorUserId: idempotencyUserId || null,
        action: 'payment.received',
        entityType: 'bill',
        entityId: billId,
        result: 'success',
        metadata: {
          bill_id: billId,
          order_id: bill.order_id,
          amount_cents: totalAppliedCents,
          payment_methods: prepared.map((line) => line.payment.method),
          shift_id: updatedBillRow?.shift_id ?? bill.shift_id ?? null,
          previous_paid_amount: previousPaidAmount,
          new_paid_amount: newPaidCents / 100,
          previous_payment_status: previousPaymentStatus,
          new_payment_status: paymentStatus,
          timestamp: changedAt,
        },
        context: { terminalId: terminalIdHeader || null },
      });
      let loyaltyPointsEarned = 0;
      if (paymentStatus === 'paid') {
        const unpaidSibling = db
          .prepare(
            `SELECT 1 FROM bills WHERE order_id = ? AND id != ? AND payment_status IN ('unpaid', 'partial') LIMIT 1`,
          )
          .get(bill.order_id, bill.id);
        const orderFullyPaid = !unpaidSibling;
        if (orderFullyPaid) {
          db.prepare(
            "UPDATE orders SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
          ).run(changedAt, changedAt, bill.order_id);
          const order = db
            .prepare('SELECT table_id FROM orders WHERE id = ?')
            .get(bill.order_id) as any;
          // Soft-gate: Restaurant enables tables → identical to pre-2.15.
          // retail-test composition excludes tables → skip free-table side effect.
          if (isModuleEnabled('tables') && order?.table_id) {
            db.prepare("UPDATE tables SET status = 'available', updated_at = ? WHERE id = ?").run(
              changedAt,
              order.table_id,
            );
          }
        }
        const cashback = calculateCashback(db, bill, effectiveCustomerId);
        const alreadyCredited = db
          .prepare(`SELECT id FROM loyalty_ledger WHERE bill_id = ? AND type = 'credit'`)
          .get(bill.id);
        if (cashback > 0 && !alreadyCredited) {
          const walletCents = allPayments
            .filter((p: any) => p.method === 'wallet')
            .reduce((sum: number, p: any) => sum + Math.round(Number(p.amount || 0) * 100), 0);
          const finalCashback = Math.floor(
            cashback * (1 - Math.min(1, walletCents / Math.max(1, totalCents))),
          );
          if (finalCashback > 0) {
            db.prepare(
              `INSERT INTO loyalty_ledger (customer_id, bill_id, type, amount, description, created_at, updated_at) VALUES (?, ?, 'credit', ?, ?, ?, ?)`,
            ).run(
              effectiveCustomerId,
              bill.id,
              finalCashback,
              `Cashback on bill ${bill.bill_number}`,
              changedAt,
              changedAt,
            );
            loyaltyPointsEarned = finalCashback;
          }
        }
      }
      const result = { bill: updatedBillRow, walletDebited, loyaltyPointsEarned };
      if (idempotencyKey && requestHash && idempotencyUserId) {
        db.prepare(
          'INSERT INTO payment_idempotency (user_id, idempotency_key, bill_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          idempotencyUserId,
          idempotencyKey,
          billId,
          requestHash,
          JSON.stringify(result),
          changedAt,
        );
      }
      return result;
    },
    { 'bill.id': String(billId) },
  );
}

/**
 * M6 — Bill payment refunds (money-critical).
 *
 * Known limitations (MVP money path):
 * - Card refunds are financial records only — no payment gateway reversal/chargeback.
 * - Earned loyalty cashback is not clawed back on refund.
 * - Refund receipt printing is best-effort outside this service (separate print API).
 * - createBillRefund does not restock or reopen orders (ADR-009). No inventory restock on the money path.
 * - Optional merchandise restock is a separate API (ADR-011 / refund-restock.ts).
 */

import { getDatabase, now, parseRowJson, verifyPin, withTxn } from '../db';
import { logAuditEvent, type AuditContext } from './audit-log';
import { parseStoredPaymentAmountCents } from './payment-cash';
import type { BillSettlementRow } from './bill-settlement-types';
import {
  assertOpenShiftForCashPayment,
  getActiveShift,
  isShiftsEnabled,
  ShiftServiceError,
} from './shift';

const REFUND_ROLES = new Set(['owner', 'manager', 'cashier']);
const MAX_REASON_LENGTH = 500;
const MAX_METHOD_LENGTH = 60;

export class RefundServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = 'RefundServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface CreateBillRefundInput {
  billId: number | string;
  amount?: number | string | null;
  method?: string | null;
  reason: string;
  actorUserId: string;
  actorRole: string;
  overridePin?: string | null;
  managerId?: string | null;
  terminalId?: string;
  idempotencyKey: string;
  requestHash: string;
  auditContext?: AuditContext | null;
}

export interface RefundRecord {
  id: number;
  bill_id: number;
  order_id: number | null;
  amount: number;
  amount_cents: number;
  method: string;
  original_method: string;
  payment_method_id: number | null;
  reason: string;
  status: string;
  shift_id: number | null;
  approved_by: string;
  created_by: string;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

function parsePaymentDetails(raw: unknown): Array<Record<string, unknown>> {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (line) => line && typeof line === 'object' && !Array.isArray(line),
    ) as Array<Record<string, unknown>>;
  }
  if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
  return [];
}

function sumPaymentDetailsCents(lines: Array<Record<string, unknown>>): number {
  let total = 0;
  for (const line of lines) {
    const cents = parseStoredPaymentAmountCents(line.amount);
    if (cents !== null) total += cents;
  }
  return total;
}

function sumMethodCents(lines: Array<Record<string, unknown>>, method: string): number {
  let total = 0;
  for (const line of lines) {
    if (line.method !== method) continue;
    const cents = parseStoredPaymentAmountCents(line.amount);
    if (cents !== null) total += cents;
  }
  return total;
}

function methodTotals(
  lines: Array<Record<string, unknown>>,
): Map<string, { cents: number; paymentMethodId: number | null }> {
  const totals = new Map<string, { cents: number; paymentMethodId: number | null }>();
  for (const line of lines) {
    if (typeof line.method !== 'string' || !line.method) continue;
    const cents = parseStoredPaymentAmountCents(line.amount);
    if (cents === null) continue;
    const existing = totals.get(line.method);
    const paymentMethodId = Number.isSafeInteger(Number(line.payment_method_id))
      ? Number(line.payment_method_id)
      : null;
    if (existing) {
      existing.cents += cents;
      if (existing.paymentMethodId === null && paymentMethodId !== null) {
        existing.paymentMethodId = paymentMethodId;
      }
    } else {
      totals.set(line.method, { cents, paymentMethodId });
    }
  }
  return totals;
}

function largestTenderMethod(
  totals: Map<string, { cents: number; paymentMethodId: number | null }>,
): string | null {
  let best: string | null = null;
  let bestCents = -1;
  for (const [method, entry] of totals) {
    if (entry.cents > bestCents) {
      bestCents = entry.cents;
      best = method;
    }
  }
  return best;
}

function completedRefundCents(db: ReturnType<typeof getDatabase>, billId: number | string): number {
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount_cents), 0) AS total
    FROM refunds
    WHERE bill_id = ? AND status = 'completed'
  `,
    )
    .get(billId) as { total: number };
  return Number(row.total) || 0;
}

function completedRefundCentsForMethod(
  db: ReturnType<typeof getDatabase>,
  billId: number | string,
  method: string,
): number {
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount_cents), 0) AS total
    FROM refunds
    WHERE bill_id = ? AND status = 'completed' AND method = ?
  `,
    )
    .get(billId, method) as { total: number };
  return Number(row.total) || 0;
}

function parseRefundAmountCents(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new RefundServiceError(
      400,
      'Refund amount must be a finite number greater than zero',
      'REFUND_AMOUNT_INVALID',
    );
  }
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new RefundServiceError(
      400,
      'Refund amount must be a finite number greater than zero with at most 2 decimal places',
      'REFUND_AMOUNT_INVALID',
    );
  }
  const parsed = Number(text);
  const cents = Math.round(parsed * 100);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isSafeInteger(cents) || cents <= 0) {
    throw new RefundServiceError(
      400,
      'Refund amount must be a finite number greater than zero',
      'REFUND_AMOUNT_INVALID',
    );
  }
  return cents;
}

function resolveApprovedBy(
  db: ReturnType<typeof getDatabase>,
  overridePin: string | null | undefined,
  managerId: string | null | undefined,
): string {
  if (overridePin === undefined || overridePin === null || String(overridePin).trim() === '') {
    throw new RefundServiceError(403, 'Manager PIN required for refunds', 'REFUND_PIN_REQUIRED');
  }
  const pin = String(overridePin);
  let user: { id: string } | null = null;
  if (managerId) {
    const candidate = db
      .prepare(
        `SELECT id, pin_hash FROM users
       WHERE id = ? AND pin_hash IS NOT NULL AND role IN ('owner', 'manager') AND is_active = 1`,
      )
      .get(managerId) as { id: string; pin_hash: string } | undefined;
    if (candidate && verifyPin(candidate.pin_hash, pin)) {
      user = candidate;
    }
  }
  if (!user) {
    const managers = db
      .prepare(
        `SELECT id, pin_hash FROM users
       WHERE pin_hash IS NOT NULL AND role IN ('owner', 'manager') AND is_active = 1`,
      )
      .all() as Array<{ id: string; pin_hash: string }>;
    for (const candidate of managers) {
      if (verifyPin(candidate.pin_hash, pin)) {
        user = candidate;
        break;
      }
    }
  }
  if (!user) {
    throw new RefundServiceError(403, 'Invalid manager PIN', 'REFUND_PIN_INVALID');
  }
  return user.id;
}

function derivePaymentStatus(input: {
  newPaidCents: number;
  totalCents: number;
  originalCollectedCents: number;
}): string {
  const { newPaidCents, totalCents, originalCollectedCents } = input;
  if (newPaidCents <= 0) return 'refunded';
  const balanceCents = Math.max(0, totalCents - newPaidCents);
  const wasFullyPaid = originalCollectedCents >= totalCents;
  if (wasFullyPaid) return 'partially_refunded';
  if (balanceCents > 0) return 'partial';
  return 'partially_refunded';
}

function loadIdempotentReplay(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  idempotencyKey: string,
  billId: number | string,
  requestHash: string,
): { refund: RefundRecord; bill: BillSettlementRow } | null {
  const prior = db
    .prepare(
      `
    SELECT bill_id, request_hash, response_json
    FROM refund_idempotency
    WHERE user_id = ? AND idempotency_key = ?
  `,
    )
    .get(userId, idempotencyKey) as
    { bill_id: number; request_hash: string; response_json: string } | undefined;
  if (!prior) return null;
  if (String(prior.bill_id) !== String(billId) || prior.request_hash !== requestHash) {
    throw new RefundServiceError(
      409,
      'Idempotency-Key was already used for a different refund request',
      'REFUND_IDEMPOTENCY_CONFLICT',
    );
  }
  try {
    return JSON.parse(prior.response_json);
  } catch {
    throw new RefundServiceError(500, 'Stored refund response is invalid', 'REFUND_INTERNAL');
  }
}

/**
 * Create a completed refund against a bill's collected payments.
 * Must be called inside or will use withTxn for the mutation path.
 */
export function createBillRefund(input: CreateBillRefundInput): {
  refund: RefundRecord;
  bill: BillSettlementRow;
} {
  if (!REFUND_ROLES.has(String(input.actorRole))) {
    throw new RefundServiceError(403, 'Insufficient permissions', 'REFUND_FORBIDDEN');
  }
  if (!input.idempotencyKey || typeof input.idempotencyKey !== 'string') {
    throw new RefundServiceError(400, 'Idempotency-Key is required', 'REFUND_IDEMPOTENCY_REQUIRED');
  }
  if (!input.requestHash || typeof input.requestHash !== 'string') {
    throw new RefundServiceError(400, 'Refund request hash is required', 'REFUND_INTERNAL');
  }

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) {
    throw new RefundServiceError(400, 'Refund reason is required', 'REFUND_REASON_REQUIRED');
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new RefundServiceError(400, 'Refund reason is too long', 'REFUND_REASON_INVALID');
  }

  const db = getDatabase();

  const replay = loadIdempotentReplay(
    db,
    input.actorUserId,
    input.idempotencyKey,
    input.billId,
    input.requestHash,
  );
  if (replay) return replay;

  const approvedBy = resolveApprovedBy(db, input.overridePin, input.managerId);

  try {
    return withTxn(() => {
      const nestedReplay = loadIdempotentReplay(
        db,
        input.actorUserId,
        input.idempotencyKey,
        input.billId,
        input.requestHash,
      );
      if (nestedReplay) return nestedReplay;

      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(input.billId) as
        | BillSettlementRow
        | undefined;
      if (!bill) {
        throw new RefundServiceError(404, 'Bill not found', 'REFUND_BILL_NOT_FOUND');
      }

      const paymentLines = parsePaymentDetails(bill.payment_details);
      const originalCollectedCents = sumPaymentDetailsCents(paymentLines);
      const priorRefundCents = completedRefundCents(db, bill.id);
      const refundableCents = originalCollectedCents - priorRefundCents;
      if (refundableCents <= 0) {
        throw new RefundServiceError(
          409,
          'Nothing left to refund on this bill',
          'REFUND_NOTHING_TO_REFUND',
        );
      }

      const amountProvided =
        input.amount !== undefined && input.amount !== null && String(input.amount).trim() !== '';
      const amountCents = amountProvided ? parseRefundAmountCents(input.amount) : refundableCents;
      if (amountCents > refundableCents) {
        throw new RefundServiceError(
          409,
          'Refund amount exceeds refundable paid amount',
          'REFUND_EXCEEDS_PAID',
        );
      }

      const totals = methodTotals(paymentLines);
      if (totals.size === 0) {
        throw new RefundServiceError(
          409,
          'Nothing left to refund on this bill',
          'REFUND_NOTHING_TO_REFUND',
        );
      }

      let method: string;
      if (
        input.method !== undefined &&
        input.method !== null &&
        String(input.method).trim() !== ''
      ) {
        if (typeof input.method !== 'string' || input.method.length > MAX_METHOD_LENGTH) {
          throw new RefundServiceError(400, 'Refund method is invalid', 'REFUND_METHOD_INVALID');
        }
        method = input.method;
        if (!totals.has(method)) {
          throw new RefundServiceError(
            400,
            'Refund method must match an existing payment line method',
            'REFUND_METHOD_INVALID',
          );
        }
      } else {
        const defaultMethod = largestTenderMethod(totals);
        if (!defaultMethod) {
          throw new RefundServiceError(400, 'Refund method is invalid', 'REFUND_METHOD_INVALID');
        }
        method = defaultMethod;
      }

      // Card refunds are financial records only — no payment gateway reversal.
      const methodMeta = totals.get(method)!;
      const remainingMethodCents =
        methodMeta.cents - completedRefundCentsForMethod(db, bill.id, method);
      if (amountCents > remainingMethodCents) {
        throw new RefundServiceError(
          409,
          `Refund amount exceeds remaining ${method} tender on this bill`,
          'REFUND_EXCEEDS_METHOD',
        );
      }

      if (method === 'cash') {
        assertOpenShiftForCashPayment(input.terminalId);
      }

      let shiftId: number | null = null;
      if (isShiftsEnabled() && input.terminalId !== undefined) {
        const active = getActiveShift(input.terminalId);
        if (active) shiftId = active.id;
      }

      if (method === 'wallet') {
        if (!bill.customer_id) {
          throw new RefundServiceError(
            400,
            'Wallet refund requires a customer on the bill',
            'REFUND_WALLET_NO_CUSTOMER',
          );
        }
        const walletPaidCents = sumMethodCents(paymentLines, 'wallet');
        const walletRefundedCents = completedRefundCentsForMethod(db, bill.id, 'wallet');
        const walletRemaining = walletPaidCents - walletRefundedCents;
        if (amountCents > walletRemaining) {
          throw new RefundServiceError(
            409,
            'Refund amount exceeds remaining wallet tender on this bill',
            'REFUND_EXCEEDS_METHOD',
          );
        }
      }

      const changedAt = now();
      const newPaidCents = originalCollectedCents - (priorRefundCents + amountCents);
      const totalCents = Math.round(Number(bill.total || 0) * 100);
      const newBalanceCents = Math.max(0, totalCents - newPaidCents);
      const previousStatus = String(bill.payment_status || 'unpaid');
      const paymentStatus = derivePaymentStatus({
        newPaidCents,
        totalCents,
        originalCollectedCents,
      });
      const amount = amountCents / 100;

      const insert = db.prepare(`
        INSERT INTO refunds (
          bill_id, order_id, amount, amount_cents, method, original_method, payment_method_id,
          reason, status, shift_id, approved_by, created_by, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(
        bill.id,
        bill.order_id ?? null,
        amount,
        amountCents,
        method,
        method,
        methodMeta.paymentMethodId,
        reason,
        shiftId,
        approvedBy,
        input.actorUserId,
        input.idempotencyKey,
        changedAt,
        changedAt,
      );
      const refundId = Number(result.lastInsertRowid);

      db.prepare(
        `
        UPDATE bills
        SET paid_amount = ?, balance = ?, payment_status = ?, updated_at = ?
        WHERE id = ?
      `,
      ).run(newPaidCents / 100, newBalanceCents / 100, paymentStatus, changedAt, bill.id);

      if (method === 'wallet') {
        db.prepare(
          `
          INSERT INTO loyalty_ledger (customer_id, bill_id, type, amount, description, created_at, updated_at)
          VALUES (?, ?, 'credit', ?, ?, ?, ?)
        `,
        ).run(
          bill.customer_id,
          bill.id,
          amountCents,
          `Refund for bill ${bill.bill_number}`,
          changedAt,
          changedAt,
        );
      }

      const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(refundId) as RefundRecord;
      const updatedBill = parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(bill.id));

      logAuditEvent({
        actorUserId: input.actorUserId,
        action: 'payment.refunded',
        entityType: 'refund',
        entityId: refundId,
        result: 'success',
        reason,
        metadata: {
          bill_id: bill.id,
          order_id: bill.order_id,
          amount_cents: amountCents,
          method,
          original_method: method,
          shift_id: shiftId,
          pin_approved_by: approvedBy,
          partial: amountCents < refundableCents,
          previous_paid_amount: Number(bill.paid_amount || 0),
          new_paid_amount: newPaidCents / 100,
          previous_payment_status: previousStatus,
          new_payment_status: paymentStatus,
        },
        context: input.auditContext || null,
      });

      const response = { refund, bill: updatedBill };
      db.prepare(
        `
        INSERT INTO refund_idempotency (user_id, idempotency_key, bill_id, request_hash, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(
        input.actorUserId,
        input.idempotencyKey,
        bill.id,
        input.requestHash,
        JSON.stringify(response),
        changedAt,
      );
      return response;
    });
  } catch (error) {
    if (error instanceof RefundServiceError || error instanceof ShiftServiceError) throw error;
    throw error;
  }
}

export function listRefunds(opts: { billId?: number | string | null } = {}): RefundRecord[] {
  const db = getDatabase();
  if (opts.billId !== undefined && opts.billId !== null && String(opts.billId).trim() !== '') {
    return db
      .prepare(`SELECT * FROM refunds WHERE bill_id = ? ORDER BY id ASC`)
      .all(opts.billId) as RefundRecord[];
  }
  return db.prepare(`SELECT * FROM refunds ORDER BY id DESC LIMIT 200`).all() as RefundRecord[];
}

export function sumCashRefundCentsForShift(shiftId: number): { totalCents: number; count: number } {
  const row = getDatabase()
    .prepare(
      `
    SELECT
      COALESCE(SUM(amount_cents), 0) AS total_cents,
      COUNT(*) AS count
    FROM refunds
    WHERE shift_id = ?
      AND status = 'completed'
      AND method = 'cash'
  `,
    )
    .get(shiftId) as { total_cents: number; count: number };
  return {
    totalCents: Number(row.total_cents) || 0,
    count: Number(row.count) || 0,
  };
}

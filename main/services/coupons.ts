/**
 * R11 — Coupons service (local SQLite SoR).
 * Model: exactly one of percent_off (1–100) or amount_cents (>0).
 */

import { randomUUID } from 'crypto';
import { getDatabase, now, withTxn } from '../db';
import { logAuditEvent } from './audit-log';

export class CouponServiceError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'CouponServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface CouponRow {
  id: string;
  code: string;
  percent_off: number | null;
  amount_cents: number | null;
  active: boolean;
  max_uses: number | null;
  uses_count: number;
  created_at: string;
}

export interface CreateCouponInput {
  code: string;
  percent_off?: number | null;
  amount_cents?: number | null;
  max_uses?: number | null;
}

export interface ResolvedCouponDiscount {
  coupon: CouponRow;
  discount_type: 'percentage' | 'amount';
  discount_value: number;
  discount_reason: string;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function mapRow(row: Record<string, unknown>): CouponRow {
  return {
    id: String(row.id),
    code: String(row.code),
    percent_off: row.percent_off == null ? null : Number(row.percent_off),
    amount_cents: row.amount_cents == null ? null : Number(row.amount_cents),
    active: Number(row.active) === 1,
    max_uses: row.max_uses == null ? null : Number(row.max_uses),
    uses_count: Number(row.uses_count ?? 0),
    created_at: String(row.created_at),
  };
}

function requireCoupon(db: ReturnType<typeof getDatabase>, id: string): CouponRow {
  const row = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id) as
    Record<string, unknown> | undefined;
  if (!row) throw new CouponServiceError(404, 'Coupon not found', 'COUPON_NOT_FOUND');
  return mapRow(row);
}

export function createCoupon(input: CreateCouponInput, actorUserId: string | null): CouponRow {
  const code = normalizeCode(input.code);
  const hasPercent = input.percent_off != null;
  const hasAmount = input.amount_cents != null;
  if (hasPercent === hasAmount) {
    throw new CouponServiceError(
      400,
      'Provide exactly one of percent_off (1-100) or amount_cents',
      'COUPON_INVALID_MODEL',
    );
  }
  if (hasPercent) {
    const p = Number(input.percent_off);
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      throw new CouponServiceError(
        400,
        'percent_off must be an integer from 1 to 100',
        'COUPON_INVALID_PERCENT',
      );
    }
  }
  if (hasAmount) {
    const a = Number(input.amount_cents);
    if (!Number.isInteger(a) || a <= 0) {
      throw new CouponServiceError(
        400,
        'amount_cents must be a positive integer',
        'COUPON_INVALID_AMOUNT',
      );
    }
  }
  if (input.max_uses != null) {
    const m = Number(input.max_uses);
    if (!Number.isInteger(m) || m <= 0) {
      throw new CouponServiceError(
        400,
        'max_uses must be a positive integer',
        'COUPON_INVALID_MAX_USES',
      );
    }
  }

  const id = randomUUID();
  const ts = now();

  return withTxn(() => {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE').get(code);
    if (existing) {
      throw new CouponServiceError(409, 'Coupon code already exists', 'COUPON_CODE_EXISTS');
    }

    db.prepare(
      `INSERT INTO coupons (
         id, code, percent_off, amount_cents, active, max_uses, uses_count, created_at
       ) VALUES (?, ?, ?, ?, 1, ?, 0, ?)`,
    ).run(
      id,
      code,
      hasPercent ? Number(input.percent_off) : null,
      hasAmount ? Number(input.amount_cents) : null,
      input.max_uses == null ? null : Number(input.max_uses),
      ts,
    );

    const coupon = requireCoupon(db, id);
    logAuditEvent({
      actorUserId,
      action: 'coupon.created',
      entityType: 'coupon',
      entityId: id,
      result: 'success',
      metadata: {
        code: coupon.code,
        percent_off: coupon.percent_off,
        amount_cents: coupon.amount_cents,
        max_uses: coupon.max_uses,
      },
    });
    return coupon;
  });
}

export function listCoupons(includeInactive = true): CouponRow[] {
  const db = getDatabase();
  const rows = (
    includeInactive
      ? db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()
      : db.prepare('SELECT * FROM coupons WHERE active = 1 ORDER BY created_at DESC').all()
  ) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function deactivateCoupon(id: string, actorUserId: string | null): CouponRow {
  return withTxn(() => {
    const db = getDatabase();
    const coupon = requireCoupon(db, id);
    if (!coupon.active) return coupon;

    db.prepare('UPDATE coupons SET active = 0 WHERE id = ?').run(id);
    const updated = requireCoupon(db, id);
    logAuditEvent({
      actorUserId,
      action: 'coupon.deactivated',
      entityType: 'coupon',
      entityId: id,
      result: 'success',
      metadata: { code: updated.code },
    });
    return updated;
  });
}

/**
 * Resolve an active coupon for apply; does not increment uses yet.
 * Call `consumeCouponUse` inside the same transaction as discount apply.
 */
export function resolveActiveCouponForApply(code: string): ResolvedCouponDiscount {
  const db = getDatabase();
  const normalized = normalizeCode(code);
  const row = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(normalized) as
    Record<string, unknown> | undefined;
  if (!row || Number(row.active) !== 1) {
    throw new CouponServiceError(404, 'Coupon not found or inactive', 'COUPON_NOT_FOUND');
  }
  const coupon = mapRow(row);
  if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) {
    throw new CouponServiceError(409, 'Coupon has reached maximum uses', 'COUPON_MAX_USES');
  }

  if (coupon.percent_off != null) {
    return {
      coupon,
      discount_type: 'percentage',
      discount_value: coupon.percent_off,
      discount_reason: `coupon:${coupon.code}`,
    };
  }
  if (coupon.amount_cents != null) {
    return {
      coupon,
      discount_type: 'amount',
      discount_value: coupon.amount_cents / 100,
      discount_reason: `coupon:${coupon.code}`,
    };
  }
  throw new CouponServiceError(500, 'Coupon has invalid discount model', 'COUPON_INVALID_MODEL');
}

/** Increment uses_count; re-check max_uses under lock. */
export function consumeCouponUse(couponId: string): void {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM coupons WHERE id = ?').get(couponId) as
    Record<string, unknown> | undefined;
  if (!row || Number(row.active) !== 1) {
    throw new CouponServiceError(404, 'Coupon not found or inactive', 'COUPON_NOT_FOUND');
  }
  const maxUses = row.max_uses == null ? null : Number(row.max_uses);
  const uses = Number(row.uses_count ?? 0);
  if (maxUses != null && uses >= maxUses) {
    throw new CouponServiceError(409, 'Coupon has reached maximum uses', 'COUPON_MAX_USES');
  }
  db.prepare('UPDATE coupons SET uses_count = uses_count + 1 WHERE id = ?').run(couponId);
}

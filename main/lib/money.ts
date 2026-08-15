/**
 * Money helpers (P0.3 Phase 1–2).
 *
 * Canonical in-memory unit: integer cents.
 * Phase 2 readers prefer *_cents when present; fall back to REAL major via toCents.
 * REAL columns remain until a future cutover — do not drop them here.
 *
 * Rounding policy (fallback only): Math.round(major * 100).
 * Prefer-cents path never re-rounds an integer cents column.
 */

export type MoneyCents = number;

/** Convert major currency units (REAL/API dollars) to integer cents. */
export function toCents(major: unknown): MoneyCents {
  const n = typeof major === 'number' ? major : Number(major);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error('Money amount must be a finite number'), { statusCode: 400 });
  }
  return Math.round(n * 100);
}

/** Convert integer cents to major units for REAL persistence / display. */
export function fromCents(cents: MoneyCents): number {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw Object.assign(new Error('Cents must be a finite integer'), { statusCode: 400 });
  }
  return cents / 100;
}

/**
 * Prefer cents column when present and integer-finite; else convert REAL major.
 * Fallback uses toCents (explicit rounding). Never silently alters an integer cents value.
 */
export function preferCents(cents: unknown, majorFallback: unknown): MoneyCents {
  if (typeof cents === 'number' && Number.isFinite(cents) && Number.isInteger(cents)) {
    return cents;
  }
  if (cents !== null && cents !== undefined && cents !== '') {
    const n = Number(cents);
    if (Number.isFinite(n) && Number.isInteger(n)) return n;
  }
  return toCents(majorFallback ?? 0);
}

export function sumCents(values: Iterable<MoneyCents>): MoneyCents {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) {
      throw Object.assign(new Error('sumCents requires integer cents'), { statusCode: 400 });
    }
    total += v;
  }
  return total;
}

/** Bill total in cents — prefers total_cents, else REAL total. */
export function billTotalCents(bill: {
  total_cents?: unknown;
  total?: unknown;
}): MoneyCents {
  return preferCents(bill.total_cents, bill.total ?? 0);
}

/** Bill paid amount in cents — prefers paid_amount_cents, else REAL paid_amount. */
export function billPaidCents(bill: {
  paid_amount_cents?: unknown;
  paid_amount?: unknown;
}): MoneyCents {
  return preferCents(bill.paid_amount_cents, bill.paid_amount ?? 0);
}

/** Bill balance in cents — prefers balance_cents, else REAL balance. */
export function billBalanceCents(bill: {
  balance_cents?: unknown;
  balance?: unknown;
}): MoneyCents {
  return preferCents(bill.balance_cents, bill.balance ?? 0);
}

/** Product catalog price in cents. */
export function productPriceCents(product: {
  price_cents?: unknown;
  price?: unknown;
}): MoneyCents {
  return preferCents(product.price_cents, product.price ?? 0);
}

/** Product catalog cost in cents. */
export function productCostCents(product: {
  cost_cents?: unknown;
  cost?: unknown;
}): MoneyCents {
  return preferCents(product.cost_cents, product.cost ?? 0);
}

/** Order total in cents — prefers total_cents, else REAL total. */
export function orderTotalCents(order: {
  total_cents?: unknown;
  total?: unknown;
}): MoneyCents {
  return preferCents(order.total_cents, order.total ?? 0);
}

/**
 * Dual-write pair from a major-unit amount already computed by existing logic.
 * REAL stays the same major value; cents is explicit toCents (documented rounding).
 * Callers must write BOTH columns together.
 */
export function dualFromMajor(major: unknown): { major: number; cents: MoneyCents } {
  const n = typeof major === 'number' ? major : Number(major);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error('Money amount must be a finite number'), { statusCode: 400 });
  }
  return { major: n, cents: toCents(n) };
}

/**
 * Dual-write pair from integer cents (canonical). REAL is fromCents(cents).
 * Prefer when the computation already happened in cents.
 */
export function dualFromCents(cents: MoneyCents): { major: number; cents: MoneyCents } {
  return { major: fromCents(cents), cents };
}

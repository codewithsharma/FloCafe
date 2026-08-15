/**
 * Money helpers (P0.3 Phase 1).
 *
 * Canonical in-memory unit for new purchasing paths and dual-write: integer cents.
 * Legacy SQLite REAL columns remain until dual-write cutover; convert at boundaries.
 *
 * Rounding policy: Math.round(major * 100) — deterministic half-away-from-zero via JS.
 * Do not use floating accumulation across money lines; convert each line first.
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

/** Prefer cents column when present; else convert REAL major. */
export function preferCents(
  cents: unknown,
  majorFallback: unknown,
): MoneyCents {
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

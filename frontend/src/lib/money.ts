/**
 * Deterministic currency input → integer cents (M4-E2).
 * Avoids floating-point persistence at API boundaries.
 */

export type CurrencyParseError = 'empty' | 'invalid' | 'negative';

export type CurrencyParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: CurrencyParseError };

/** Parse a user currency string to integer cents. Supports up to 2 decimal places. */
export function parseCurrencyInputToCents(input: string): CurrencyParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, error: 'invalid' };
  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole < 0) return { ok: false, error: 'invalid' };
  const fraction = fractionPart.padEnd(2, '0').slice(0, 2);
  const cents = whole * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents) || cents < 0) return { ok: false, error: 'negative' };
  return { ok: true, cents };
}

/** Display cents as a fixed 2-decimal currency string for inputs. */
export function formatCentsForInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return '';
  return (cents / 100).toFixed(2);
}

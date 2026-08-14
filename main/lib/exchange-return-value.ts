/**
 * Phase 4.5 — Retail exchange return value (ADR-012 §5.2).
 *
 * Pure functions: per-line return value from order_items.total / quantity.
 * No I/O; safe for main process and frontend via @exchange/return-value.
 */

export const BLOCKED_ITEM_STATUSES = new Set(['voided', 'void_adjustment', 'cancelled']);

export class ExchangeReturnValueError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ExchangeReturnValueError';
    this.code = code;
  }
}

export interface ExchangeReturnLineInput {
  orderItemId: string | number;
  lineTotal: number;
  lineQuantity: number;
  returnQuantity: number;
  status?: string | null;
}

/** Display formatting — matches bills-csv-export `formatMoneyDecimal`. */
export function formatMoneyDecimal(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/** API / calculation rounding — two decimal places as number. */
export function roundMoneyDecimal(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function assertPositiveInteger(value: number, field: string, code: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new ExchangeReturnValueError(`${field} must be a positive integer`, code);
  }
}

export function validateReturnLine(line: ExchangeReturnLineInput): void {
  const orderItemId =
    line.orderItemId === undefined || line.orderItemId === null
      ? ''
      : String(line.orderItemId).trim();
  if (!orderItemId) {
    throw new ExchangeReturnValueError(
      'orderItemId is required',
      'RETURN_VALUE_MISSING_ORDER_ITEM',
    );
  }

  if (!Number.isFinite(line.lineTotal) || line.lineTotal < 0) {
    throw new ExchangeReturnValueError(
      'lineTotal must be a non-negative number',
      'RETURN_VALUE_INVALID_LINE_TOTAL',
    );
  }

  assertPositiveInteger(line.lineQuantity, 'lineQuantity', 'RETURN_VALUE_INVALID_LINE_QUANTITY');
  assertPositiveInteger(
    line.returnQuantity,
    'returnQuantity',
    'RETURN_VALUE_INVALID_RETURN_QUANTITY',
  );

  if (line.returnQuantity > line.lineQuantity) {
    throw new ExchangeReturnValueError(
      'returnQuantity cannot exceed lineQuantity',
      'RETURN_VALUE_RETURN_EXCEEDS_LINE',
    );
  }

  if (line.status && BLOCKED_ITEM_STATUSES.has(String(line.status))) {
    throw new ExchangeReturnValueError(
      'Order item cannot be returned (voided or cancelled)',
      'RETURN_VALUE_BLOCKED_STATUS',
    );
  }
}

export function lineReturnValue(line: ExchangeReturnLineInput): number {
  validateReturnLine(line);
  const unitPrice = line.lineTotal / line.lineQuantity;
  return roundMoneyDecimal(unitPrice * line.returnQuantity);
}

export function totalReturnValue(lines: ExchangeReturnLineInput[]): number {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ExchangeReturnValueError(
      'At least one return line is required',
      'RETURN_VALUE_EMPTY_LINES',
    );
  }
  let sum = 0;
  for (const line of lines) {
    sum += lineReturnValue(line);
  }
  return roundMoneyDecimal(sum);
}

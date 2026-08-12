/**
 * M4-D4 / M5-C — shared cash payment line classification.
 *
 * Uses resolved payment method names stored in payment_details (strict `method === 'cash'`)
 * and applied payment amounts (not tendered_amount).
 */

export function isResolvedCashPaymentMethod(method: unknown): boolean {
  return method === 'cash';
}

/**
 * Parse a stored payment_details amount (decimal dollars) to integer cents.
 * Returns null when the amount is missing, non-numeric, zero, negative, or unsafe.
 */
export function parseStoredPaymentAmountCents(amount: unknown): number | null {
  if (amount === undefined || amount === null) return null;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) return null;
    return cents;
  }
  if (typeof amount === 'string') {
    const text = amount.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const parsed = Number(text);
    const cents = Math.round(parsed * 100);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isSafeInteger(cents) || cents <= 0) return null;
    return cents;
  }
  return null;
}

/** Qualifying stored payment_details line for M5 cash aggregation. */
export function isQualifyingCashPaymentLine(method: unknown, amount: unknown): boolean {
  if (!isResolvedCashPaymentMethod(method)) return false;
  const cents = parseStoredPaymentAmountCents(amount);
  return cents !== null && cents > 0;
}

/** Qualifying prepared payment line for M4-D4 cash gate (amount already in cents). */
export function isQualifyingCashPaymentLineCents(method: unknown, amountCents: number): boolean {
  return isResolvedCashPaymentMethod(method) && Number.isSafeInteger(amountCents) && amountCents > 0;
}

function parsePaymentDetailsLines(paymentDetailsJson: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(paymentDetailsJson);
    if (Array.isArray(parsed)) return parsed.filter((line) => line && typeof line === 'object' && !Array.isArray(line));
    if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
  } catch {
    // Legacy malformed JSON — exclude from aggregation.
  }
  return [];
}

/** Aggregate qualifying cash applied amounts and line count from one bill's payment_details JSON. */
export function aggregateQualifyingCashFromPaymentDetailsJson(
  paymentDetailsJson: string,
): { totalCents: number; count: number } {
  let totalCents = 0;
  let count = 0;
  for (const line of parsePaymentDetailsLines(paymentDetailsJson)) {
    if (!isQualifyingCashPaymentLine(line.method, line.amount)) continue;
    totalCents += parseStoredPaymentAmountCents(line.amount)!;
    count += 1;
  }
  return { totalCents, count };
}

/** Sum qualifying cash applied amounts from one bill's payment_details JSON. */
export function sumQualifyingCashCentsFromPaymentDetailsJson(paymentDetailsJson: string): number {
  return aggregateQualifyingCashFromPaymentDetailsJson(paymentDetailsJson).totalCents;
}

/** Count qualifying cash lines from one bill's payment_details JSON (audit metadata). */
export function countQualifyingCashLinesFromPaymentDetailsJson(paymentDetailsJson: string): number {
  return aggregateQualifyingCashFromPaymentDetailsJson(paymentDetailsJson).count;
}

/** Qualifying stored payment_details line for non-cash aggregation (method !== 'cash', amount > 0). */
export function isQualifyingNonCashPaymentLine(method: unknown, amount: unknown): boolean {
  if (isResolvedCashPaymentMethod(method)) return false;
  const cents = parseStoredPaymentAmountCents(amount);
  return cents !== null && cents > 0;
}

/** Aggregate qualifying non-cash applied amounts from one bill's payment_details JSON. */
export function aggregateQualifyingNonCashFromPaymentDetailsJson(
  paymentDetailsJson: string,
): { totalCents: number } {
  let totalCents = 0;
  for (const line of parsePaymentDetailsLines(paymentDetailsJson)) {
    if (!isQualifyingNonCashPaymentLine(line.method, line.amount)) continue;
    totalCents += parseStoredPaymentAmountCents(line.amount)!;
  }
  return { totalCents };
}

/** Sum qualifying non-cash applied amounts from one bill's payment_details JSON. */
export function sumQualifyingNonCashCentsFromPaymentDetailsJson(paymentDetailsJson: string): number {
  return aggregateQualifyingNonCashFromPaymentDetailsJson(paymentDetailsJson).totalCents;
}

/** Aggregate cash and non-cash applied amounts from one bill's payment_details JSON (single pass). */
export function aggregatePaymentsFromPaymentDetailsJson(
  paymentDetailsJson: string,
): { cashTotalCents: number; cashCount: number; nonCashTotalCents: number } {
  let cashTotalCents = 0;
  let cashCount = 0;
  let nonCashTotalCents = 0;
  for (const line of parsePaymentDetailsLines(paymentDetailsJson)) {
    if (isQualifyingCashPaymentLine(line.method, line.amount)) {
      cashTotalCents += parseStoredPaymentAmountCents(line.amount)!;
      cashCount += 1;
    } else if (isQualifyingNonCashPaymentLine(line.method, line.amount)) {
      nonCashTotalCents += parseStoredPaymentAmountCents(line.amount)!;
    }
  }
  return { cashTotalCents, cashCount, nonCashTotalCents };
}

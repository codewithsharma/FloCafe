/**
 * FIN-01 collectible outstanding from a bill DTO.
 * Collectible = bill_total − gross successful tender (payment_details amounts).
 * Not net balance (total − paid_amount). Refunds do not reopen capacity.
 */

export interface BillCollectibleSource {
  total?: number | null;
  payment_details?: Array<{ amount?: number | null }> | string | null;
}

function parsePaymentDetails(
  raw: BillCollectibleSource['payment_details'],
): Array<{ amount?: number | null }> {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function paymentDetailsGrossCents(
  details: BillCollectibleSource['payment_details'],
): number {
  return parsePaymentDetails(details).reduce((sum, line) => {
    const amount = Number(line?.amount);
    if (!Number.isFinite(amount)) return sum;
    return sum + Math.round(amount * 100);
  }, 0);
}

export function collectibleOutstandingCents(bill: BillCollectibleSource): number {
  const totalCents = Math.round(Number(bill.total || 0) * 100);
  const grossCents = paymentDetailsGrossCents(bill.payment_details);
  return Math.max(0, totalCents - grossCents);
}

export function collectibleOutstanding(bill: BillCollectibleSource): number {
  return collectibleOutstandingCents(bill) / 100;
}

export function hasCollectibleOutstanding(bill: BillCollectibleSource): boolean {
  return collectibleOutstandingCents(bill) > 0;
}

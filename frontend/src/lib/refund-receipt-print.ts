/**
 * Refund receipt printing client (Phase 3.6A).
 * Hardware print is separate from refund accounting — failures must not reverse money.
 */
import api from './api';

export interface RefundPrintResult {
  printed: boolean;
  audited: boolean;
  error?: string;
}

/**
 * Print refund proof via default printer, then audit-log print_type=refund.
 */
export async function printRefundReceipt(
  refundId: number,
  billId: number,
): Promise<RefundPrintResult> {
  try {
    await api.post('/printers/print-refund', { refundId });
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      (err as Error)?.message ||
      'Refund receipt print failed';
    return { printed: false, audited: false, error: message };
  }

  try {
    await api.post(`/bills/${billId}/print`, { print_type: 'refund' });
    return { printed: true, audited: true };
  } catch {
    return { printed: true, audited: false };
  }
}

/** Resolve latest refund for a bill, then print. */
export async function printLatestRefundReceiptForBill(billId: number): Promise<RefundPrintResult> {
  try {
    const { data } = await api.get<{ refunds: Array<{ id: number }> }>('/refunds', {
      params: { bill_id: billId },
    });
    const refunds = data.refunds || [];
    if (refunds.length === 0) {
      return { printed: false, audited: false, error: 'No refund found for this bill' };
    }
    const latest = refunds[refunds.length - 1];
    return printRefundReceipt(latest.id, billId);
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      (err as Error)?.message ||
      'Refund receipt print failed';
    return { printed: false, audited: false, error: message };
  }
}

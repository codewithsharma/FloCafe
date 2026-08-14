/**
 * Refund receipt printing client (Phase 3.6A + 3.6G WebUSB parity).
 * Hardware/WebUSB print is separate from refund accounting — failures must not reverse money.
 */
import api from './api';
import { printerService } from './printer/PrinterService';

export interface RefundPrintResult {
  printed: boolean;
  audited: boolean;
  error?: string;
}

type PrintRefundResponse = {
  success?: boolean;
  webusb?: boolean;
  bytes?: number[];
  refundId?: number;
  billId?: number;
};

/**
 * Print refund proof via default printer (server network/USB) or WebUSB handoff,
 * then audit-log print_type=refund on success.
 */
export async function printRefundReceipt(
  refundId: number,
  billId: number,
): Promise<RefundPrintResult> {
  let printResponse: PrintRefundResponse;
  try {
    const { data } = await api.post<PrintRefundResponse>('/printers/print-refund', { refundId });
    printResponse = data || {};
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      (err as Error)?.message ||
      'Refund receipt print failed';
    return { printed: false, audited: false, error: message };
  }

  if (printResponse.webusb === true) {
    if (!Array.isArray(printResponse.bytes) || printResponse.bytes.length === 0) {
      return {
        printed: false,
        audited: false,
        error: 'WebUSB refund print returned no bytes',
      };
    }
    if (!printerService.isConnected) {
      return {
        printed: false,
        audited: false,
        error: 'Connect the WebUSB printer from the POS toolbar, then retry',
      };
    }
    try {
      await printerService.print(Uint8Array.from(printResponse.bytes));
    } catch (err: unknown) {
      return {
        printed: false,
        audited: false,
        error: err instanceof Error ? err.message : 'WebUSB refund print failed',
      };
    }
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

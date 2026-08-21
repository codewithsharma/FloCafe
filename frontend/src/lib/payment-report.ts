import axios from 'axios';
import api from './api';

export type PaymentReportMethodRow = {
  method: string;
  payment_count: number;
  payments_received: number;
  refund_count: number;
  refunds: number;
  net_payments: number;
};

export type PaymentReportPayload = {
  startDate: string;
  endDate: string;
  payments_received: number;
  payment_line_count: number;
  refunds: number;
  refund_count: number;
  net_payments: number;
  by_method: PaymentReportMethodRow[];
  sales: {
    grossSales: number;
    refunds: number;
    netSales: number;
  };
};

export async function fetchPaymentReport(
  startDate: string,
  endDate: string,
): Promise<PaymentReportPayload> {
  const res = await api.get<{ payments: PaymentReportPayload }>('/reports/payments', {
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.payments;
}

function parseContentDispositionFilename(header: string | undefined): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|"?)([^";\n]+)/i.exec(header);
  if (!match) return null;
  const raw = match[1].replace(/^"|"$/g, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function extractApiErrorMessage(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) return 'Request failed';
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text) as { error?: string };
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
    } catch {
      // fall through
    }
  } else if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: string }).error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return error.message || 'Request failed';
}

export async function downloadPaymentsCsv(startDate: string, endDate: string): Promise<void> {
  try {
    const res = await api.get('/reports/export/payments.csv', {
      params: { start_date: startDate, end_date: endDate },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-payments-${startDate}-to-${endDate}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(await extractApiErrorMessage(error));
  }
}

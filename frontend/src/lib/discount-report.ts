import axios from 'axios';
import api from './api';

export type DiscountReportBreakdownTypeRow = {
  type: string;
  count: number;
  amount: number;
};

export type DiscountReportBreakdownSourceRow = {
  source: string;
  count: number;
  amount: number;
};

export type DiscountReportBreakdownScopeRow = {
  scope: string;
  count: number;
  amount: number;
};

export type DiscountReportPayload = {
  startDate: string;
  endDate: string;
  order_discounts: number;
  item_discounts: number;
  total_discounts: number;
  discounted_bill_count: number;
  average_discount: number;
  merchandise_subtotal: number;
  discounted_merchandise: number;
  by_type: DiscountReportBreakdownTypeRow[];
  by_source: DiscountReportBreakdownSourceRow[];
  by_scope: DiscountReportBreakdownScopeRow[];
  sales: {
    grossSales: number;
    refunds: number;
    netSales: number;
  };
};

export async function fetchDiscountReport(
  startDate: string,
  endDate: string,
): Promise<DiscountReportPayload> {
  const res = await api.get<{ discounts: DiscountReportPayload }>('/reports/discounts', {
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.discounts;
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

export async function downloadDiscountsCsv(startDate: string, endDate: string): Promise<void> {
  try {
    const res = await api.get('/reports/export/discounts.csv', {
      params: { start_date: startDate, end_date: endDate },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-discounts-${startDate}-to-${endDate}.csv`;
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

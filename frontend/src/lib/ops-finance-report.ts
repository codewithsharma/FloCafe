import axios from 'axios';
import api from './api';

export type OpsFinanceCategory = {
  category: string;
  amount_cents: number;
  count: number;
};

export type OpsFinancePayload = {
  startDate: string;
  endDate: string;
  sales: {
    grossSales: number;
    refunds: number;
    netSales: number;
  };
  expenses: {
    posted_total_cents: number;
    posted_count: number;
    by_category: OpsFinanceCategory[];
  };
  net_after_expenses: number;
};

export async function fetchOpsFinance(
  startDate: string,
  endDate: string,
): Promise<OpsFinancePayload> {
  const res = await api.get<{ opsFinance: OpsFinancePayload }>('/reports/ops-finance', {
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.opsFinance;
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

export async function downloadExpensesCsv(startDate: string, endDate: string): Promise<void> {
  try {
    const res = await api.get('/reports/export/expenses.csv', {
      params: { start_date: startDate, end_date: endDate },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-expenses-${startDate}-to-${endDate}.csv`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(await extractApiErrorMessage(error));
  }
}

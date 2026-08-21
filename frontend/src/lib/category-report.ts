import axios from 'axios';
import api from './api';

export type CategoryReportRow = {
  category_id: string | null;
  category_name: string;
  quantity_sold: number;
  merchandise_sales: number;
  item_discounts: number;
  product_count: number;
  share_of_merchandise: number;
};

export type CategoryReportPayload = {
  startDate: string;
  endDate: string;
  attribution: Record<string, string>;
  by_category: CategoryReportRow[];
  totals: {
    category_count: number;
    quantity_sold: number;
    merchandise_sales: number;
    item_discounts: number;
    order_discounts_context: number;
  };
  sales: {
    grossSales: number;
    refunds: number;
    netSales: number;
  };
};

export async function fetchCategoryReport(
  startDate: string,
  endDate: string,
  opts?: { categoryId?: string | null },
): Promise<CategoryReportPayload> {
  const res = await api.get<{ categories: CategoryReportPayload }>('/reports/categories', {
    params: {
      start_date: startDate,
      end_date: endDate,
      ...(opts?.categoryId ? { category_id: opts.categoryId } : {}),
    },
  });
  return res.data.categories;
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

export async function downloadCategoriesCsv(
  startDate: string,
  endDate: string,
  opts?: { categoryId?: string | null },
): Promise<void> {
  try {
    const res = await api.get('/reports/export/categories.csv', {
      params: {
        start_date: startDate,
        end_date: endDate,
        ...(opts?.categoryId ? { category_id: opts.categoryId } : {}),
      },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-categories-${startDate}-to-${endDate}.csv`;
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

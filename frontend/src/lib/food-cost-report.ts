import axios from 'axios';
import api from './api';

export type FoodCostRecipeLine = {
  recipe_id: string;
  recipe_name: string;
  menu_product_id: string;
  consumption_count: number;
  theoretical_cogs_cents: number;
  insufficient_line_count: number;
};

export type FoodCostPayload = {
  startDate: string;
  endDate: string;
  net_sales: number;
  theoretical_cogs_cents: number;
  food_cost_percent: number | null;
  insufficient_line_count: number;
  consumption_count: number;
  by_recipe: FoodCostRecipeLine[];
};

export async function fetchFoodCostReport(
  startDate: string,
  endDate: string,
): Promise<FoodCostPayload> {
  const res = await api.get<{ foodCost: FoodCostPayload }>('/reports/food-cost', {
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.foodCost;
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

/** ROPS-FC-CSV — download theoretical food-cost rollup as CSV. */
export async function downloadFoodCostCsv(startDate: string, endDate: string): Promise<void> {
  try {
    const res = await api.get('/reports/export/food-cost.csv', {
      params: { start_date: startDate, end_date: endDate },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-food-cost-${startDate}-to-${endDate}.csv`;
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

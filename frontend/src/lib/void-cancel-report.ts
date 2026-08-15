import axios from 'axios';
import api from './api';

export type VoidCancelEvent = {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  reason: string | null;
  order_id: string | null;
  product_id: string | null;
  product_name: string | null;
  previous_status: string | null;
};

export type VoidCancelPayload = {
  startDate: string;
  endDate: string;
  total_count: number;
  order_cancelled_count: number;
  item_cancelled_count: number;
  item_voided_count: number;
  by_action: Array<{ action: string; count: number }>;
  events: VoidCancelEvent[];
};

export async function fetchVoidCancelReport(
  startDate: string,
  endDate: string,
): Promise<VoidCancelPayload> {
  const res = await api.get<{ voids: VoidCancelPayload }>('/reports/voids', {
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.voids;
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

export async function downloadVoidsCsv(startDate: string, endDate: string): Promise<void> {
  try {
    const res = await api.get('/reports/export/voids.csv', {
      params: { start_date: startDate, end_date: endDate },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-voids-${startDate}-to-${endDate}.csv`;
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

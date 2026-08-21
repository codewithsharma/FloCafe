import axios from 'axios';
import api from './api';

export type StaffReportRow = {
  staff_id: string;
  staff_name: string;
  role: string;
  orders_created: number;
  sales_from_orders_created: number;
  payments_received_count: number;
  payments_received_amount: number;
  refunds_count: number;
  refunds_amount: number;
  discounts_applied_count: number;
  voids_cancels_count: number;
  shifts_opened: number;
  shifts_closed: number;
};

export type StaffReportPayload = {
  startDate: string;
  endDate: string;
  attribution: Record<string, string>;
  by_staff: StaffReportRow[];
  totals: {
    staff_count: number;
    orders_created: number;
    sales_from_orders_created: number;
    payments_received_count: number;
    payments_received_amount: number;
    refunds_count: number;
    refunds_amount: number;
    discounts_applied_count: number;
    voids_cancels_count: number;
    shifts_opened: number;
    shifts_closed: number;
  };
  sales: {
    grossSales: number;
    refunds: number;
    netSales: number;
  };
};

export async function fetchStaffReport(
  startDate: string,
  endDate: string,
  staffId?: string | null,
): Promise<StaffReportPayload> {
  const res = await api.get<{ staff: StaffReportPayload }>('/reports/staff', {
    params: {
      start_date: startDate,
      end_date: endDate,
      ...(staffId ? { staff_id: staffId } : {}),
    },
  });
  return res.data.staff;
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

export async function downloadStaffCsv(
  startDate: string,
  endDate: string,
  staffId?: string | null,
): Promise<void> {
  try {
    const res = await api.get('/reports/export/staff.csv', {
      params: {
        start_date: startDate,
        end_date: endDate,
        ...(staffId ? { staff_id: staffId } : {}),
      },
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename =
      parseContentDispositionFilename(disposition) ??
      `operavia-staff-${startDate}-to-${endDate}.csv`;
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

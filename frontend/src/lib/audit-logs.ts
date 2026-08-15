import axios from 'axios';
import api from './api';

export type AuditLogRow = {
  id: number;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  result: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  terminal_id: string | null;
  request_id: string | null;
  created_at: string;
};

export type AuditLogFilters = {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_user_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
};

function cleanParams(filters: AuditLogFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filters.action?.trim()) params.action = filters.action.trim();
  if (filters.entity_type?.trim()) params.entity_type = filters.entity_type.trim();
  if (filters.entity_id?.trim()) params.entity_id = filters.entity_id.trim();
  if (filters.actor_user_id?.trim()) params.actor_user_id = filters.actor_user_id.trim();
  if (filters.since?.trim()) params.since = filters.since.trim();
  if (filters.until?.trim()) params.until = filters.until.trim();
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.offset !== undefined) params.offset = filters.offset;
  return params;
}

export async function listAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogRow[]> {
  const res = await api.get<{ audit: AuditLogRow[] }>('/audit-logs', {
    params: cleanParams(filters),
  });
  return res.data.audit ?? [];
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

export async function downloadAuditLogsCsv(filters: AuditLogFilters = {}): Promise<void> {
  try {
    const res = await api.get('/audit-logs/export.csv', {
      params: cleanParams(filters),
      responseType: 'blob',
    });
    const blob = res.data as Blob;
    const disposition = res.headers['content-disposition'] as string | undefined;
    const filename = parseContentDispositionFilename(disposition) ?? 'operavia-audit-logs.csv';
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

export function formatAuditMetadata(meta: Record<string, unknown> | null): string {
  if (!meta) return '';
  try {
    const s = JSON.stringify(meta);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return '';
  }
}

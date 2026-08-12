/**
 * M4-D1 — per-origin POS terminal identity.
 *
 * Identification only. Never used as an authorization credential.
 * Browser POS must not call GET /api/shifts/terminal-id (that is the Electron host id).
 */

export const TERMINAL_ID_STORAGE_KEY = 'flo_terminal_id';
export const TERMINAL_ID_HEADER = 'X-Flo-Terminal-Id';

const MAX_TERMINAL_ID_LENGTH = 128;
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidClientTerminalId(value: string): boolean {
  const terminalId = value.trim();
  if (!terminalId || terminalId.length > MAX_TERMINAL_ID_LENGTH) return false;
  return TERMINAL_ID_PATTERN.test(terminalId);
}

export function getClientTerminalId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(TERMINAL_ID_STORAGE_KEY);
    if (existing && isValidClientTerminalId(existing)) return existing;
    const generated = generateTerminalUuid();
    if (!generated) return null;
    window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export function shouldAttachTerminalId(url?: string, method?: string): boolean {
  if (!url) return false;
  const path = normalizeApiPath(url);
  const verb = (method || 'get').toLowerCase();
  if (verb === 'post' && path === '/orders') return true;
  if (verb === 'post' && /^\/bills\/[^/]+\/payments?$/.test(path)) return true;
  if (verb === 'post' && /^\/bills\/[^/]+\/refund$/.test(path)) return true;
  if (verb === 'get' && path === '/shifts/active') return true;
  if (verb === 'post' && path === '/shifts/open') return true;
  if (verb === 'post' && /^\/shifts\/[^/]+\/close$/.test(path)) return true;
  if (verb === 'get' && /^\/shifts\/[^/]+\/reconciliation-preview$/.test(path)) return true;
  return false;
}

export function applyTerminalIdHeader(config: {
  url?: string;
  method?: string;
  headers?: Record<string, unknown> | { set?: (name: string, value: string) => void; get?: (name: string) => unknown };
}): void {
  if (!shouldAttachTerminalId(config.url, config.method)) return;
  const terminalId = getClientTerminalId();
  if (!terminalId) return;
  const headers = config.headers;
  if (!headers) return;
  if (typeof (headers as { get?: (name: string) => unknown }).get === 'function') {
    const current = (headers as { get: (name: string) => unknown }).get(TERMINAL_ID_HEADER);
    if (current) return;
    (headers as { set?: (name: string, value: string) => void }).set?.(TERMINAL_ID_HEADER, terminalId);
    return;
  }
  const record = headers as Record<string, unknown>;
  if (record[TERMINAL_ID_HEADER] || record['x-flo-terminal-id']) return;
  record[TERMINAL_ID_HEADER] = terminalId;
}

function generateTerminalUuid(): string | null {
  if (typeof globalThis.crypto?.randomUUID !== 'function') return null;
  const generated = globalThis.crypto.randomUUID();
  return UUID_PATTERN.test(generated) ? generated : null;
}

function normalizeApiPath(url: string): string {
  let path = url.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return '';
    }
  }
  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) path = path.slice(0, queryIndex);
  if (path.startsWith('/api/')) path = path.slice(4);
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

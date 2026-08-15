/**
 * M3 — centralized business audit log (append-only).
 *
 * Distinct from application/debug logging and domain-specific tables
 * (print_logs, tax_config_audit). Records WHO/WHAT/WHEN/entity/result/context
 * for accountable restaurant operations.
 *
 * Transaction semantics: call logAuditEvent inside the same withTxn() as the
 * business mutation so audit rows roll back with failed operations.
 */

import { getDatabase, getSettingValue, now } from '../db';

export type AuditResult = 'success' | 'failure';

export interface AuditContext {
  terminalId?: string | null;
  requestId?: string | null;
  clientIp?: string | null;
}

export interface AuditLogInput {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  result?: AuditResult;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: AuditContext | null;
}

const SENSITIVE_KEY_PATTERN =
  /(password|pin|token|secret|authorization|jwt|card|cvv|access_token|refresh_token|api_key|device_secret)/i;
const MAX_ACTION_LENGTH = 128;
const MAX_ENTITY_TYPE_LENGTH = 64;
const MAX_ENTITY_ID_LENGTH = 128;
const MAX_REASON_LENGTH = 512;
const MAX_TERMINAL_ID_LENGTH = 128;
const MAX_REQUEST_ID_LENGTH = 64;
const MAX_METADATA_JSON_BYTES = 4096;
const MAX_STRING_VALUE_LENGTH = 512;
const MAX_METADATA_DEPTH = 4;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (depth > MAX_METADATA_DEPTH) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value, MAX_STRING_VALUE_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeMetadataValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      out[key] = sanitizeMetadataValue(entry, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING_VALUE_LENGTH);
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const sanitized = sanitizeMetadataValue(metadata, 0) as Record<string, unknown>;
  const json = JSON.stringify(sanitized);
  if (Buffer.byteLength(json, 'utf8') > MAX_METADATA_JSON_BYTES) {
    throw new Error('Audit metadata exceeds maximum allowed size');
  }
  return sanitized;
}

function defaultTerminalId(): string | null {
  const posId = getSettingValue('cloud_pos_id');
  return posId ? truncate(posId, MAX_TERMINAL_ID_LENGTH) : null;
}

export function logAuditEvent(input: AuditLogInput): number {
  const action = truncate(String(input.action || '').trim(), MAX_ACTION_LENGTH);
  if (!action) throw new Error('Audit action is required');

  const entityType = input.entityType
    ? truncate(String(input.entityType), MAX_ENTITY_TYPE_LENGTH)
    : null;
  const entityId =
    input.entityId === null || input.entityId === undefined
      ? null
      : truncate(String(input.entityId), MAX_ENTITY_ID_LENGTH);
  const result: AuditResult = input.result === 'failure' ? 'failure' : 'success';
  const reason = input.reason ? truncate(String(input.reason), MAX_REASON_LENGTH) : null;
  const metadata = sanitizeAuditMetadata(input.metadata || null);
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  const context = input.context || {};
  const terminalId =
    context.terminalId !== undefined
      ? context.terminalId
        ? truncate(String(context.terminalId), MAX_TERMINAL_ID_LENGTH)
        : null
      : defaultTerminalId();
  const requestId = context.requestId
    ? truncate(String(context.requestId), MAX_REQUEST_ID_LENGTH)
    : null;
  const clientIp = context.clientIp ? truncate(String(context.clientIp), 64) : null;

  const mergedMetadata = clientIp ? { ...(metadata || {}), client_ip: clientIp } : metadata;

  const resultMetadataJson = mergedMetadata ? JSON.stringify(mergedMetadata) : null;
  if (
    resultMetadataJson &&
    Buffer.byteLength(resultMetadataJson, 'utf8') > MAX_METADATA_JSON_BYTES
  ) {
    throw new Error('Audit metadata exceeds maximum allowed size');
  }

  const info = getDatabase()
    .prepare(
      `
    INSERT INTO audit_logs (
      actor_user_id, action, entity_type, entity_id, result, reason,
      metadata_json, terminal_id, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      input.actorUserId ?? null,
      action,
      entityType,
      entityId,
      result,
      reason,
      resultMetadataJson,
      terminalId,
      requestId,
      now(),
    );

  return Number(info.lastInsertRowid);
}

export interface AuditLogQuery {
  limit?: number;
  offset?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  since?: string;
  /** Inclusive upper bound on `created_at` (ISO / SQLite timestamp string). */
  until?: string;
}

export const AUDIT_CSV_COLUMNS = [
  'id',
  'created_at',
  'actor_user_id',
  'actor_name',
  'action',
  'entity_type',
  'entity_id',
  'result',
  'reason',
  'metadata_json',
  'terminal_id',
  'request_id',
] as const;

export function queryAuditLogs(query: AuditLogQuery = {}): Array<Record<string, unknown>> {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.action) {
    clauses.push('audit.action = ?');
    params.push(query.action);
  }
  if (query.entityType) {
    clauses.push('audit.entity_type = ?');
    params.push(query.entityType);
  }
  if (query.entityId) {
    clauses.push('audit.entity_id = ?');
    params.push(query.entityId);
  }
  if (query.actorUserId) {
    clauses.push('audit.actor_user_id = ?');
    params.push(query.actorUserId);
  }
  if (query.since) {
    clauses.push('audit.created_at >= ?');
    params.push(query.since);
  }
  if (query.until) {
    clauses.push('audit.created_at <= ?');
    params.push(query.until);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const rows = getDatabase()
    .prepare(
      `
    SELECT
      audit.id,
      audit.actor_user_id,
      audit.action,
      audit.entity_type,
      audit.entity_id,
      audit.result,
      audit.reason,
      audit.metadata_json,
      audit.terminal_id,
      audit.request_id,
      audit.created_at,
      user.name AS actor_name
    FROM audit_logs AS audit
    LEFT JOIN users AS user ON user.id = audit.actor_user_id
    ${where}
    ORDER BY audit.id DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    result: row.result,
    reason: row.reason,
    metadata: parseAuditMetadata(row.metadata_json),
    metadata_json:
      typeof row.metadata_json === 'string' && row.metadata_json
        ? row.metadata_json
        : row.metadata_json == null
          ? null
          : String(row.metadata_json),
    terminal_id: row.terminal_id,
    request_id: row.request_id,
    created_at: row.created_at,
  }));
}

/** Sanitize filter summary for `audit.exported` metadata (no secrets). */
export function sanitizeAuditExportFilters(query: AuditLogQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (query.action) out.action = String(query.action);
  if (query.entityType) out.entity_type = String(query.entityType);
  if (query.entityId) out.entity_id = String(query.entityId);
  if (query.actorUserId) out.actor_user_id = String(query.actorUserId);
  if (query.since) out.since = String(query.since);
  if (query.until) out.until = String(query.until);
  if (query.limit !== undefined) out.limit = Number(query.limit);
  if (query.offset !== undefined) out.offset = Number(query.offset);
  return out;
}

function parseAuditMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

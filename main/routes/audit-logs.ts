/**
 * Read-only audit log API — owner/manager visibility.
 * R9 Slice 2: `until` filter + CSV export + `audit.exported`.
 */
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { toCsvRow } from '../lib/csv';
import {
  AUDIT_CSV_COLUMNS,
  logAuditEvent,
  queryAuditLogs,
  sanitizeAuditExportFilters,
  type AuditLogQuery,
} from '../services/audit-log';

const router = Router();

function parseAuditQuery(req: Request): AuditLogQuery {
  return {
    limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
    entityType: typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined,
    entityId: typeof req.query.entity_id === 'string' ? req.query.entity_id : undefined,
    actorUserId: typeof req.query.actor_user_id === 'string' ? req.query.actor_user_id : undefined,
    since: typeof req.query.since === 'string' ? req.query.since : undefined,
    until: typeof req.query.until === 'string' ? req.query.until : undefined,
  };
}

function actorUserId(req: Request): string | null {
  return (req as { user?: { userId?: string } }).user?.userId ?? null;
}

router.get('/', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const audit = queryAuditLogs(parseAuditQuery(req));
    res.json({ audit });
  } catch (error: unknown) {
    console.error('[Audit Logs] Query failed:', error);
    res.status(500).json({ error: 'Could not load audit history' });
  }
});

router.get('/export.csv', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const query = parseAuditQuery(req);
    const audit = queryAuditLogs(query);
    const header = AUDIT_CSV_COLUMNS.join(',');
    const lines = audit.map((row) =>
      toCsvRow(
        AUDIT_CSV_COLUMNS.map((col) => {
          if (col === 'metadata_json') {
            const raw = row.metadata_json;
            if (typeof raw === 'string') return raw;
            if (row.metadata && typeof row.metadata === 'object') {
              return JSON.stringify(row.metadata);
            }
            return '';
          }
          const value = row[col];
          return value === null || value === undefined ? '' : String(value);
        }),
      ),
    );
    const body = [header, ...lines].join('\n') + '\n';

    logAuditEvent({
      actorUserId: actorUserId(req),
      action: 'audit.exported',
      entityType: 'audit_log',
      entityId: 'export',
      result: 'success',
      metadata: {
        format: 'csv',
        row_count: audit.length,
        filters: sanitizeAuditExportFilters(query),
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="operavia-audit-logs.csv"');
    res.status(200).send(body);
  } catch (error: unknown) {
    console.error('[Audit Logs] Export failed:', error);
    res.status(500).json({ error: 'Could not export audit history' });
  }
});

export { router as auditLogRoutes };

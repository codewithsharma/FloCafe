/**
 * Read-only audit log API — owner/manager visibility.
 */
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { queryAuditLogs } from '../services/audit-log';

const router = Router();

router.get('/', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const audit = queryAuditLogs({
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
      offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      entityType: typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined,
      entityId: typeof req.query.entity_id === 'string' ? req.query.entity_id : undefined,
      actorUserId: typeof req.query.actor_user_id === 'string' ? req.query.actor_user_id : undefined,
      since: typeof req.query.since === 'string' ? req.query.since : undefined,
    });
    res.json({ audit });
  } catch (error: unknown) {
    console.error('[Audit Logs] Query failed:', error);
    res.status(500).json({ error: 'Could not load audit history' });
  }
});

export { router as auditLogRoutes };

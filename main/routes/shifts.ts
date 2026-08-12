/**
 * M4-C Shift API — lifecycle only. Does not gate orders or payments.
 */
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { correlationId } from '../errors';
import {
  ShiftServiceError,
  assertShiftsEnabled,
  closeShift,
  forceCloseShift,
  getActiveShift,
  getOrCreateHostTerminalId,
  getShift,
  listShifts,
  openShift,
  parseShiftId,
  readTerminalIdHeaderFromRequest,
} from '../services/shift';

const router = Router();
const SHIFT_OPERATORS = ['owner', 'manager', 'cashier'] as const;
const SHIFT_MANAGERS = ['owner', 'manager'] as const;

function actorFrom(req: Request) {
  const user = (req as Request & { user: { userId: string; role: string } }).user;
  return { userId: String(user.userId), role: String(user.role) };
}

function requestTerminalId(req: Request): string | undefined {
  const bodyId = req.body?.terminal_id;
  if (typeof bodyId === 'string' && bodyId.trim()) return bodyId;
  const headerId = readTerminalIdHeaderFromRequest(req);
  if (typeof headerId === 'string' && headerId.trim()) return headerId;
  const queryId = req.query.terminal_id;
  if (typeof queryId === 'string' && queryId.trim()) return queryId;
  return undefined;
}

function auditContext(req: Request, terminalId?: string) {
  return {
    requestId: correlationId(),
    clientIp: req.ip || req.socket.remoteAddress || null,
    terminalId: terminalId || requestTerminalId(req) || null,
  };
}

function sendShiftError(res: Response, error: unknown): void {
  if (error instanceof ShiftServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[Shifts] Internal error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

router.get('/terminal-id', requireRole(...SHIFT_OPERATORS), (_req: Request, res: Response) => {
  try {
    res.json({ terminal_id: getOrCreateHostTerminalId() });
  } catch (error) {
    sendShiftError(res, error);
  }
});

router.get('/active', requireRole(...SHIFT_OPERATORS), (req: Request, res: Response) => {
  try {
    assertShiftsEnabled();
    const terminalId = requestTerminalId(req);
    if (!terminalId) {
      return res.status(400).json({ error: 'terminal_id is required' });
    }
    res.json({ shift: getActiveShift(terminalId) });
  } catch (error) {
    sendShiftError(res, error);
  }
});

router.get('/', requireRole(...SHIFT_MANAGERS), (req: Request, res: Response) => {
  try {
    const result = listShifts({
      actor: actorFrom(req),
      terminalId: typeof req.query.terminal_id === 'string' ? req.query.terminal_id : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      openedByUserId: typeof req.query.opened_by_user_id === 'string' ? req.query.opened_by_user_id : undefined,
      since: typeof req.query.since === 'string' ? req.query.since : undefined,
      until: typeof req.query.until === 'string' ? req.query.until : undefined,
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
      offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
    });
    res.json(result);
  } catch (error) {
    sendShiftError(res, error);
  }
});

router.post('/open', requireRole(...SHIFT_OPERATORS), (req: Request, res: Response) => {
  try {
    const terminalId = requestTerminalId(req);
    const shift = openShift({
      actor: actorFrom(req),
      terminalId,
      openingFloatCents: req.body?.opening_float_cents,
      openingNote: req.body?.opening_note,
      context: auditContext(req, terminalId),
    });
    res.status(201).json({ shift });
  } catch (error) {
    sendShiftError(res, error);
  }
});

router.get('/:id', requireRole(...SHIFT_MANAGERS), (req: Request, res: Response) => {
  try {
    assertShiftsEnabled();
    const shift = getShift(parseShiftId(req.params.id));
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    res.json({ shift });
  } catch (error) {
    sendShiftError(res, error);
  }
});

router.post('/:id/close', requireRole(...SHIFT_OPERATORS), (req: Request, res: Response) => {
  try {
    const terminalId = requestTerminalId(req);
    const shift = closeShift({
      actor: actorFrom(req),
      shiftId: parseShiftId(req.params.id),
      terminalId,
      countedCashCents: req.body?.counted_cash_cents,
      closingNote: req.body?.closing_note,
      context: auditContext(req, terminalId),
    });
    res.json({ shift });
  } catch (error) {
    sendShiftError(res, error);
  }
});

router.post('/:id/force-close', requireRole(...SHIFT_MANAGERS), (req: Request, res: Response) => {
  try {
    const shift = forceCloseShift({
      actor: actorFrom(req),
      shiftId: parseShiftId(req.params.id),
      reason: req.body?.reason,
      countedCashCents: req.body?.counted_cash_cents,
      closingNote: req.body?.closing_note,
      context: auditContext(req),
    });
    res.json({ shift });
  } catch (error) {
    sendShiftError(res, error);
  }
});

export { router as shiftRoutes };

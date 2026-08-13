/**
 * M6 — Refund HTTP routes.
 * Mounted at /api/bills (POST /:id/refund) and /api/refunds (GET /).
 */
import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody } from '../middleware/validate';
import { correlationId } from '../errors';
import { checkPinRateLimit } from './orders';
import { createBillRefund, listRefunds, RefundServiceError } from '../services/refund';
import { readTerminalIdHeaderFromRequest, ShiftServiceError } from '../services/shift';
import { refundBodySchema } from '../validation/refunds';

const router = Router();
const REFUND_OPERATORS = ['owner', 'manager', 'cashier'] as const;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function refundRequestHash(
  billId: string,
  body: { amount?: unknown; method?: unknown; reason?: unknown },
): string {
  return createHash('sha256')
    .update(
      canonicalize({
        billId,
        amount: body.amount,
        method: body.method,
        reason: body.reason,
      }),
    )
    .digest('hex');
}

function requireIdempotencyKey(req: Request): string {
  const supplied = req.get('Idempotency-Key')?.trim();
  if (!supplied) {
    throw new RefundServiceError(400, 'Idempotency-Key is required', 'REFUND_IDEMPOTENCY_REQUIRED');
  }
  if (supplied.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(supplied)) {
    throw new RefundServiceError(
      400,
      'Idempotency-Key is invalid or too long',
      'REFUND_IDEMPOTENCY_INVALID',
    );
  }
  return supplied;
}

function sendRefundError(res: Response, error: unknown): void {
  if (error instanceof RefundServiceError || error instanceof ShiftServiceError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode && statusCode < 500) {
    res.status(statusCode).json({
      error: (error as Error).message || 'Refund failed',
      code: (error as { code?: string }).code || 'REFUND_FAILED',
    });
    return;
  }
  console.error('[Refunds] Internal error:', error);
  res.status(500).json({ error: 'Internal server error', code: 'REFUND_INTERNAL' });
}

router.post(
  '/:id/refund',
  requireRole(...REFUND_OPERATORS),
  validateBody(refundBodySchema),
  (req: Request, res: Response) => {
    try {
      const user = (req as Request & { user: { userId: string; role: string } }).user;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rateLimitKey = `pin:${clientIp}:bill-refund:${req.params.id}`;
      if (!checkPinRateLimit(rateLimitKey)) {
        return res.status(429).json({
          error: 'Too many PIN attempts. Try again in 15 minutes.',
          code: 'REFUND_PIN_RATE_LIMIT',
        });
      }

      const idempotencyKey = requireIdempotencyKey(req);
      const body = req.body || {};
      const terminalId = readTerminalIdHeaderFromRequest(req);
      const result = createBillRefund({
        billId: req.params.id as string,
        amount: body.amount,
        method: body.method,
        reason: body.reason,
        actorUserId: String(user.userId),
        actorRole: String(user.role),
        overridePin: body.override_pin,
        managerId: body.manager_id || body.user_id || null,
        terminalId,
        idempotencyKey,
        requestHash: refundRequestHash(String(req.params.id), body),
        auditContext: {
          requestId: correlationId(),
          clientIp,
          terminalId: terminalId || null,
        },
      });
      res.json(result);
    } catch (error) {
      sendRefundError(res, error);
    }
  },
);

router.get('/', requireRole(...REFUND_OPERATORS), (req: Request, res: Response) => {
  try {
    const billId = typeof req.query.bill_id === 'string' ? req.query.bill_id : null;
    const refunds = listRefunds({ billId });
    res.json({ refunds });
  } catch (error) {
    sendRefundError(res, error);
  }
});

export const refundRoutes = router;

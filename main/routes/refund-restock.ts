/**
 * Phase 4.2 — Refund restock HTTP routes.
 * Mounted ONLY at /api/refunds (refund id), not under /api/bills.
 */
import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody } from '../middleware/validate';
import { RefundServiceError } from '../services/refund';
import { createRefundRestock } from '../services/refund-restock';
import { refundRestockBodySchema } from '../validation/refund-restock';

const router = Router();
const OPERATORS = ['owner', 'manager', 'cashier'] as const;
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

function restockRequestHash(
  refundId: string,
  body: { order_item_id?: unknown; quantity?: unknown },
): string {
  return createHash('sha256')
    .update(
      canonicalize({
        op: 'refund_restock',
        refundId,
        order_item_id: body.order_item_id,
        quantity: body.quantity,
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

function sendError(res: Response, error: unknown): void {
  if (error instanceof RefundServiceError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  console.error('[RefundRestock] Internal error:', error);
  res.status(500).json({ error: 'Internal server error', code: 'RESTOCK_INTERNAL' });
}

router.post(
  '/:id/restock',
  requireRole(...OPERATORS),
  validateBody(refundRestockBodySchema),
  (req: Request, res: Response) => {
    try {
      const user = (req as Request & { user: { userId: string; role: string } }).user;
      const idempotencyKey = requireIdempotencyKey(req);
      const body = req.body || {};
      const result = createRefundRestock({
        refundId: req.params.id as string,
        orderItemId: body.order_item_id,
        quantity: body.quantity,
        actorUserId: String(user.userId),
        actorRole: String(user.role),
        idempotencyKey,
        requestHash: restockRequestHash(String(req.params.id), body),
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  },
);

export const refundRestockRoutes = router;

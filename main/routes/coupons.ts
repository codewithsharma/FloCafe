/**
 * R11 — Coupons HTTP routes (`/api/coupons/*`).
 * Owner/Manager CRUD only (create + list + deactivate).
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody, validateParams } from '../middleware/validate';
import {
  createCoupon,
  deactivateCoupon,
  listCoupons,
  CouponServiceError,
} from '../services/coupons';
import { couponCreateBodySchema, couponIdParamsSchema } from '../validation/coupons';

const router = Router();

function actorId(req: Request): string | null {
  return (req as { user?: { userId?: string } }).user?.userId ?? null;
}

function mapError(error: unknown, res: Response): boolean {
  if (error instanceof CouponServiceError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
    return true;
  }
  return false;
}

router.get('/', requireRole('owner', 'manager'), (_req, res) => {
  try {
    res.json({ coupons: listCoupons(true) });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] list coupons error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireRole('owner', 'manager'),
  validateBody(couponCreateBodySchema),
  (req, res) => {
    try {
      const coupon = createCoupon(req.body, actorId(req));
      res.status(201).json({ coupon });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] create coupon error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/:id/deactivate',
  requireRole('owner', 'manager'),
  validateParams(couponIdParamsSchema),
  (req, res) => {
    try {
      const coupon = deactivateCoupon(String((req.params as { id: string }).id), actorId(req));
      res.json({ coupon });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] deactivate coupon error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export { router as couponRoutes };

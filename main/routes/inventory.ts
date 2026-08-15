/**
 * Phase 2.12 / R4 — Inventory HTTP routes (`/api/inventory/*`).
 *
 * Movement history (read) + stock counts + ledger reconstruction diagnostic.
 * Manual stock mutations remain on products routes.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody } from '../middleware/validate';
import { getDatabase } from '../db';
import {
  InventoryServiceError,
  listInventoryMovements,
  reconstructQuantityFromLedger,
} from '../services/inventory';
import {
  applyInventoryCount,
  cancelInventoryCount,
  createInventoryCount,
  getInventoryCount,
  listInventoryCounts,
  submitInventoryCount,
  upsertCountLine,
} from '../services/inventory-count';
import {
  inventoryCountCreateBodySchema,
  inventoryCountLineBodySchema,
} from '../validation/inventory';

const router = Router();

function productExists(productId: string): boolean {
  const row = getDatabase()
    .prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL')
    .get(productId) as { id: string } | undefined;
  return Boolean(row);
}

function mapInventoryError(error: unknown, res: Response): boolean {
  if (error instanceof InventoryServiceError) {
    res
      .status(error.statusCode ?? 500)
      .json({ error: error instanceof Error ? error.message : String(error) });
    return true;
  }
  const status = (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    res.status(status).json({ error: (error as Error).message || 'Request failed' });
    return true;
  }
  return false;
}

/**
 * GET /api/inventory/movements?product_id=&limit=&before_id=
 * owner/manager only. Newest → oldest. Bounded limit (default 100, max 500).
 */
router.get('/movements', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const productId = typeof req.query.product_id === 'string' ? req.query.product_id.trim() : '';
    if (!productId) {
      return res.status(400).json({ error: 'product_id is required' });
    }
    if (!productExists(productId)) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const limitRaw = req.query.limit;
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    if (limitRaw !== undefined && (!Number.isFinite(limit) || Number(limit) < 1)) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }

    const beforeRaw = req.query.before_id;
    const beforeId = beforeRaw === undefined || beforeRaw === '' ? undefined : Number(beforeRaw);
    if (
      beforeRaw !== undefined &&
      beforeRaw !== '' &&
      (!Number.isFinite(beforeId) || Number(beforeId) < 1)
    ) {
      return res.status(400).json({ error: 'before_id must be a positive integer' });
    }

    const { movements, nextCursor } = listInventoryMovements({
      productId,
      limit,
      beforeId,
    });

    res.json({
      movements,
      ...(nextCursor !== null && { nextCursor }),
    });
  } catch (error: unknown) {
    if (mapInventoryError(error, res)) return;
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/inventory/products/:id/ledger-check — reconstruction diagnostic */
router.get(
  '/products/:id/ledger-check',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!productExists(productId)) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const result = reconstructQuantityFromLedger(getDatabase(), productId);
      res.json(result);
    } catch (error: unknown) {
      if (mapInventoryError(error, res)) return;
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/counts', requireRole('owner', 'manager'), (_req: Request, res: Response) => {
  try {
    res.json({ counts: listInventoryCounts() });
  } catch (error: unknown) {
    if (mapInventoryError(error, res)) return;
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/counts/:id', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { count, lines } = getInventoryCount(id);
    res.json({ count, lines });
  } catch (error: unknown) {
    if (mapInventoryError(error, res)) return;
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/counts',
  requireRole('owner', 'manager'),
  validateBody(inventoryCountCreateBodySchema),
  (req: Request, res: Response) => {
    try {
      const count = createInventoryCount({
        notes: req.body.notes,
        createdBy: String((req as any).user.userId),
      });
      res.status(201).json({ count });
    } catch (error: unknown) {
      if (mapInventoryError(error, res)) return;
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/counts/:id/lines',
  requireRole('owner', 'manager'),
  validateBody(inventoryCountLineBodySchema),
  (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const line = upsertCountLine({
        countId: id,
        productId: req.body.product_id,
        countedQty: req.body.counted_qty,
      });
      res.json({ line });
    } catch (error: unknown) {
      if (mapInventoryError(error, res)) return;
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/counts/:id/submit',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const count = submitInventoryCount(id);
      res.json({ count });
    } catch (error: unknown) {
      if (mapInventoryError(error, res)) return;
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/counts/:id/apply', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const count = applyInventoryCount({
      countId: id,
      actorUserId: String((req as any).user.userId),
    });
    res.json({ count });
  } catch (error: unknown) {
    if (mapInventoryError(error, res)) return;
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/counts/:id/cancel',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const count = cancelInventoryCount(id);
      res.json({ count });
    } catch (error: unknown) {
      if (mapInventoryError(error, res)) return;
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export const inventoryRoutes = router;

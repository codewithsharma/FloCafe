/**
 * Phase 2.12 — Inventory HTTP routes (`/api/inventory/*`).
 *
 * Read-only movement history. Stock mutations remain on products routes.
 * Ledger queries live in main/services/inventory.ts — not here.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { getDatabase } from '../db';
import {
  InventoryServiceError,
  listInventoryMovements,
} from '../services/inventory';

const router = Router();

function productExists(productId: string): boolean {
  const row = getDatabase().prepare(
    'SELECT id FROM products WHERE id = ? AND deleted_at IS NULL',
  ).get(productId) as { id: string } | undefined;
  return Boolean(row);
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
    const beforeId = beforeRaw === undefined || beforeRaw === ''
      ? undefined
      : Number(beforeRaw);
    if (beforeRaw !== undefined && beforeRaw !== '' && (!Number.isFinite(beforeId) || Number(beforeId) < 1)) {
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
  } catch (error: any) {
    if (error instanceof InventoryServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const inventoryRoutes = router;

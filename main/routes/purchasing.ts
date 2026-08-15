/**
 * R6 — Purchasing HTTP routes (`/api/purchasing/*`).
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody } from '../middleware/validate';
import { InventoryServiceError } from '../services/inventory';
import {
  createPurchaseOrder,
  createSupplier,
  deactivateSupplier,
  getPurchaseOrder,
  getSupplier,
  listPurchaseOrders,
  listReceipts,
  listSupplierProducts,
  listSuppliers,
  PurchasingServiceError,
  receivePurchaseOrder,
  transitionPurchaseOrderStatus,
  updateSupplier,
  upsertSupplierProduct,
  type PurchaseOrderStatus,
} from '../services/purchasing';
import {
  purchaseOrderCreateBodySchema,
  purchaseOrderStatusBodySchema,
  purchaseReceiveBodySchema,
  supplierCreateBodySchema,
  supplierProductBodySchema,
  supplierUpdateBodySchema,
} from '../validation/purchasing';
import { routeParam } from '../lib/route-params';

const router = Router();

function actorId(req: Request): string | null {
  return (req as any).user?.userId ?? (req as any).authUser?.userId ?? null;
}

function mapError(error: unknown, res: Response): boolean {
  if (error instanceof PurchasingServiceError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
    return true;
  }
  if (error instanceof InventoryServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  const status = (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    res.status(status).json({ error: (error as Error).message || 'Request failed' });
    return true;
  }
  return false;
}

function requireIdempotencyKey(req: Request): string {
  const supplied = req.get('Idempotency-Key')?.trim();
  if (!supplied) {
    throw new PurchasingServiceError(
      400,
      'Idempotency-Key is required',
      'PO_RECEIVE_IDEMPOTENCY_REQUIRED',
    );
  }
  if (supplied.length > 128) {
    throw new PurchasingServiceError(400, 'Idempotency-Key is invalid or too long');
  }
  return supplied;
}

router.get('/suppliers', requireRole('owner', 'manager', 'chef'), (_req, res) => {
  try {
    res.json({ suppliers: listSuppliers() });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] list suppliers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/suppliers',
  requireRole('owner', 'manager'),
  validateBody(supplierCreateBodySchema),
  (req, res) => {
    try {
      const supplier = createSupplier(req.body, actorId(req));
      res.status(201).json({ supplier });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] create supplier error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/suppliers/:id', requireRole('owner', 'manager', 'chef'), (req, res) => {
  try {
    res.json({ supplier: getSupplier(routeParam(req.params.id)) });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] get supplier error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch(
  '/suppliers/:id',
  requireRole('owner', 'manager'),
  validateBody(supplierUpdateBodySchema),
  (req, res) => {
    try {
      const supplier = updateSupplier(routeParam(req.params.id), req.body, actorId(req));
      res.json({ supplier });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] update supplier error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/suppliers/:id/deactivate', requireRole('owner', 'manager'), (req, res) => {
  try {
    const supplier = deactivateSupplier(routeParam(req.params.id), actorId(req));
    res.json({ supplier });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] deactivate supplier error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/suppliers/:id/products', requireRole('owner', 'manager', 'chef'), (req, res) => {
  try {
    res.json({ mappings: listSupplierProducts(routeParam(req.params.id)) });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] list supplier products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/suppliers/:id/products',
  requireRole('owner', 'manager'),
  validateBody(supplierProductBodySchema),
  (req, res) => {
    try {
      const mapping = upsertSupplierProduct(routeParam(req.params.id), req.body, actorId(req));
      res.status(201).json({ mapping });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] upsert supplier product error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/purchase-orders', requireRole('owner', 'manager', 'chef'), (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const supplierId =
      typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;
    res.json({ purchase_orders: listPurchaseOrders({ status, supplierId }) });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] list POs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/purchase-orders',
  requireRole('owner', 'manager'),
  validateBody(purchaseOrderCreateBodySchema),
  (req, res) => {
    try {
      const result = createPurchaseOrder(req.body, actorId(req));
      res.status(201).json(result);
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] create PO error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/purchase-orders/:id', requireRole('owner', 'manager', 'chef'), (req, res) => {
  try {
    res.json(getPurchaseOrder(routeParam(req.params.id)));
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] get PO error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/purchase-orders/:id/receipts', requireRole('owner', 'manager', 'chef'), (req, res) => {
  try {
    res.json({ receipts: listReceipts(routeParam(req.params.id)) });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] list receipts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/purchase-orders/:id/status',
  requireRole('owner', 'manager'),
  validateBody(purchaseOrderStatusBodySchema),
  (req, res) => {
    try {
      const result = transitionPurchaseOrderStatus(
        routeParam(req.params.id),
        req.body.status as PurchaseOrderStatus,
        actorId(req),
      );
      res.json(result);
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] PO status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/purchase-orders/:id/receive',
  requireRole('owner', 'manager'),
  validateBody(purchaseReceiveBodySchema),
  (req, res) => {
    try {
      const actor = actorId(req);
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const idempotencyKey = requireIdempotencyKey(req);
      const result = receivePurchaseOrder({
        purchaseOrderId: routeParam(req.params.id),
        lines: req.body.lines,
        notes: req.body.notes,
        actorUserId: actor,
        idempotencyKey,
      });
      res.json(result);
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] PO receive error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export const purchasingRoutes = router;

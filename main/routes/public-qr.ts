/**
 * R10 — Public guest QR ordering API (no staff JWT).
 */
import { Router, Request, Response } from 'express';
import { getDatabase } from '../db';
import { requireRole } from '../middleware/security';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { z } from 'zod';
import { routeParam } from '../lib/route-params';
import {
  createQrGuestOrder,
  ensureTableQrToken,
  getQrOrderStatus,
  getQrSession,
  listQrMenu,
  messageFromError,
  rotateTableQrToken,
  statusFromError,
} from '../services/qr-ordering';

const tokenQuerySchema = z.object({
  token: z.string().min(16).max(128),
});

const createBodySchema = z.object({
  token: z.string().min(16).max(128),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        quantity: z.number().positive().finite(),
        special_instructions: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(50),
  guest_count: z.number().int().min(1).max(99).optional().nullable(),
  special_instructions: z.string().max(1000).optional().nullable(),
});

const tableIdParamsSchema = z.object({
  id: z.string().min(1),
});

const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

export function publicQrRoutes(): Router {
  const router = Router();

  router.get('/session', validateQuery(tokenQuerySchema), (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const session = getQrSession(db, String(req.query.token));
      res.json(session);
    } catch (err: unknown) {
      res.status(statusFromError(err)).json({ error: messageFromError(err) });
    }
  });

  router.get('/menu', validateQuery(tokenQuerySchema), (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const items = listQrMenu(db, String(req.query.token));
      res.json({ items, pay_at_counter: true });
    } catch (err: unknown) {
      res.status(statusFromError(err)).json({ error: messageFromError(err) });
    }
  });

  router.post('/orders', validateBody(createBodySchema), (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const body = req.body as z.infer<typeof createBodySchema>;
      const result = createQrGuestOrder(db, {
        token: body.token,
        items: body.items,
        guest_count: body.guest_count,
        special_instructions: body.special_instructions,
        clientIp: req.ip || req.socket.remoteAddress || null,
      });
      res.status(201).json({
        order: Object.assign({}, result.order, { items: result.orderItems }),
        pay_at_counter: true,
        message: 'Order placed. Please pay at the counter.',
      });
    } catch (err: unknown) {
      const status = statusFromError(err);
      const payload: Record<string, unknown> = { error: messageFromError(err) };
      if ((err as { code?: string }).code) payload.code = (err as { code?: string }).code;
      res.status(status >= 400 && status < 600 ? status : 500).json(payload);
    }
  });

  router.get(
    '/orders/:orderId',
    validateParams(orderIdParamsSchema),
    validateQuery(tokenQuerySchema),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const status = getQrOrderStatus(
          db,
          String(req.query.token),
          routeParam(req.params.orderId),
        );
        res.json(status);
      } catch (err: unknown) {
        res.status(statusFromError(err)).json({ error: messageFromError(err) });
      }
    },
  );

  return router;
}

/** Staff table QR helpers mounted under /api/tables */
export function tableQrStaffRoutes(): Router {
  const router = Router();

  router.get(
    '/:id/qr',
    requireRole('owner', 'manager'),
    validateParams(tableIdParamsSchema),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const tableId = routeParam(req.params.id);
        const token = ensureTableQrToken(db, tableId);
        res.json({
          table_id: tableId,
          token,
          guest_path: `/qr/?t=${encodeURIComponent(token)}`,
          pay_at_counter: true,
        });
      } catch (err: unknown) {
        res.status(statusFromError(err)).json({ error: messageFromError(err) });
      }
    },
  );

  router.post(
    '/:id/qr-token/rotate',
    requireRole('owner', 'manager'),
    validateParams(tableIdParamsSchema),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const actor = (req as any).user?.userId ?? null;
        const tableId = routeParam(req.params.id);
        const token = rotateTableQrToken(db, tableId, actor);
        res.json({
          table_id: tableId,
          token,
          guest_path: `/qr/?t=${encodeURIComponent(token)}`,
          pay_at_counter: true,
        });
      } catch (err: unknown) {
        res.status(statusFromError(err)).json({ error: messageFromError(err) });
      }
    },
  );

  return router;
}

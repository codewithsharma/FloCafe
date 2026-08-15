import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import {
  getDatabase,
  generateOrderNumber,
  now,
  parseItemJson,
  parseRowJson,
  withTxn,
  verifyPin,
  getSettingValue,
  insertOrderItemAddons,
  attachEffectiveAddons,
  utcDayBounds,
  utcTodayDate,
} from '../../db';
import {
  applyPayableRounding,
  calculateConfiguredChargeTaxes,
  calculateItemTax,
  combineItemAndChargeTaxes,
  getActiveCountryPack,
  getConfiguredChargeTaxCategories,
  invertTaxBreakdown,
  invertTaxSnapshot,
  scaleItemTaxAfterOrderDiscount,
} from '../../services/tax';
import {
  assertStockAvailable,
  decrementTrackedStock,
  restoreTrackedStock,
} from '../../services/inventory';
import {
  consumeRecipeForOrderItem,
  reverseRecipeConsumptionForOrder,
  reverseRecipeConsumptionForOrderItem,
} from '../../services/recipe-consumption';
import { notifyKdsUpdate, notifyOrderUpdated } from '../../services/kds';
import { isModuleEnabled } from '../../modules';
import { cloudSync } from '../../services/cloud-sync';
import { logAuditEvent } from '../../services/audit-log';
import { correlationId } from '../../errors';
import { validateOrderNotes, validateItemNotes } from '../orders-validation';
import { requireRole } from '../../middleware/security';
import { validateBody } from '../../middleware/validate';
import {
  assertTableCanOpen,
  freeTableIfModule,
  markTableOccupiedCas,
  TableServiceError,
} from '../../services/tables';
import { DOMAIN_SPAN, withSpan } from '../../lib/tracing';
import { addOrderItemsBodySchema, createOrderBodySchema, orderDiscountBodySchema, orderStatusBodySchema } from '../../validation/orders';
import { readTerminalIdHeaderFromRequest, resolveActiveShiftForOrder } from '../../services/shift';
import { orderHasSuccessfulTender } from '../../services/payment-tender';
// Phase 2.14 — Order ownership facade (markers; routes remain the HTTP surface).
import { ORDER_OWNED_CONCERNS } from '../../services/order';
void ORDER_OWNED_CONCERNS;

import {
  orderIdempotencyKey,
  checkPinRateLimit,
  syncCustomerTagCounts,
  validateItemAddonGroupLimits,
  lookupOrderIdempotencyReplay,
  storeOrderIdempotency,
  batchHydrateOrders,
} from '../orders-shared';

export { checkPinRateLimit } from '../orders-shared';


export function registerListRoutes(router: Router): void {
  router.get(
    '/',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        const db = getDatabase();
        const wheres: string[] = [];
        const params: any[] = [];

        if (req.query.status) {
          const statuses = (req.query.status as string).split(',');
          if (statuses.length === 1) {
            wheres.push('status = ?');
            params.push(statuses[0]);
          } else {
            wheres.push(`status IN (${statuses.map(() => '?').join(',')})`);
            params.push(...statuses);
          }
        }
        if (req.query.type) {
          wheres.push('type = ?');
          params.push(req.query.type);
        }
        // #208: `today` is the UTC day, as a range filter (was UTC date() that
        // wrapped the column and blocked `idx_orders_created_at`). `start_date` /
        // `end_date` add a range filter so the UI can actually load older pages
        // — combined with the cursor, this is what gives us real pagination
        // instead of "latest 50 forever".
        if (req.query.today && req.query.today !== '0' && req.query.today !== 'false') {
          const [s, e] = utcDayBounds(utcTodayDate());
          wheres.push('created_at >= ? AND created_at < ?');
          params.push(s, e);
        } else {
          const startDate =
            typeof req.query.start_date === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.query.start_date)
              ? req.query.start_date
              : null;
          const endDate =
            typeof req.query.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.end_date)
              ? req.query.end_date
              : null;
          if (startDate) {
            wheres.push('created_at >= ?');
            params.push(utcDayBounds(startDate)[0]);
          }
          if (endDate) {
            wheres.push('created_at < ?');
            params.push(utcDayBounds(endDate)[1]);
          }
        }
        if (req.query.table_id) {
          wheres.push('table_id = ?');
          params.push(req.query.table_id);
        }
        if (user.role === 'waiter') {
          wheres.push('user_id = ?');
          params.push(user.userId);
        }
        // Cursor pagination: `before` / `after` are ORDER BY keys (created_at),
        // composed with `id` to break ties when many orders share a second.
        if (typeof req.query.before_id === 'string' && /^\d+$/.test(req.query.before_id)) {
          const oid = parseInt(req.query.before_id, 10);
          const ref = db.prepare('SELECT created_at FROM orders WHERE id = ?').get(oid) as
            { created_at: string } | undefined;
          if (ref) {
            wheres.push('(created_at, id) < (?, ?)');
            params.push(ref.created_at, oid);
          }
        }

        const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
        // #208: cap page size even when clients omit per_page (the original
        // "unbounded" default made GET /orders on the tables page load the entire
        // active-order history with the N+1 below).
        const requestedPerPage = req.query.per_page
          ? parseInt(req.query.per_page as string, 10)
          : NaN;
        const perPage =
          Number.isInteger(requestedPerPage) && requestedPerPage > 0
            ? Math.min(requestedPerPage, 500)
            : 50;
        const perPagePlusOne = perPage + 1;

        const orders = db
          .prepare(
            `
        SELECT * FROM orders
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
          )
          .all(...params, perPagePlusOne) as any[];

        const hasMore = orders.length > perPage;
        const pageOrders = hasMore ? orders.slice(0, perPage) : orders;
        const nextCursor = hasMore ? pageOrders[pageOrders.length - 1].id : null;

        // #208: replace the per-order N+1 (5 queries × N) with one IN() per
        // relation, then assemble. Measured ~300+ queries per poll → ~6.
        const ordersWithRelations = batchHydrateOrders(db, pageOrders);

        res.json({
          orders: ordersWithRelations,
          ...(nextCursor !== null && { nextCursor }),
        });
      } catch (error: any) {
        console.error('[API] Internal error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  /**
   * Batch the relations (items+addons, table, customer, bill+loyalty) for a
   * page of orders into 5 IN() queries instead of N per-order prepared calls.
   * Used by GET /orders and kept here so the orders route owns its own data
   * shape. #208
   */
  router.get(
    '/:id',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        const db = getDatabase();
        const order = parseRowJson(
          db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id),
        );
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (user.role === 'waiter' && (order as any).user_id !== user.userId) {
          return res.status(403).json({ error: 'Waiters can only view their own orders' });
        }

        // #208: collapse the per-order N+1 (5 queries: items/addons/table/customer/bill/loyalty)
        // into the same batchHydrateOrders used by the list endpoint. Previously
        // 6 prepared calls per single detail click.
        const [hydrated] = batchHydrateOrders(db, [order]);
        res.json({ order: hydrated });
      } catch (error: any) {
        console.error('[API] Internal error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );
}

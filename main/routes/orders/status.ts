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


export function registerStatusRoutes(router: Router): void {
  router.patch(
    '/:id/status',
    requireRole('owner', 'manager', 'cashier', 'chef', 'waiter'),
    validateBody(orderStatusBodySchema),
    (req: Request, res: Response) => {
      try {
        const { status, reason, override_pin, free_table } = req.body;

        // reason is optional for cancellation

        const db = getDatabase();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        const authUser = (req as any).user;
        if (
          authUser?.role === 'waiter' &&
          String((order as any).user_id) !== String(authUser.userId)
        ) {
          return res.status(403).json({ error: 'Waiters can only modify their own orders' });
        }

        const currentStatus = (order as any).status as string;
        if (currentStatus !== status) {
          if (currentStatus === 'cancelled' || currentStatus === 'completed') {
            return res.status(409).json({
              error: `Illegal status transition from ${currentStatus} to ${status}`,
              code: 'ILLEGAL_STATUS_TRANSITION',
            });
          }
        }

        let cancelIdempotencyKey: string | null = null;
        let cancelRequestHash: string | null = null;
        let cancelIdempotencyUserId: string | null = null;
        if (status === 'cancelled') {
          try {
            cancelIdempotencyKey = orderIdempotencyKey(req);
          } catch (err: any) {
            return res.status(err.statusCode || 400).json({ error: err.message });
          }
          if (cancelIdempotencyKey) {
            cancelIdempotencyUserId = String(authUser.userId);
            cancelRequestHash = createHash('sha256')
              .update(
                JSON.stringify({
                  op: 'cancel',
                  orderId: req.params.id,
                  body: req.body,
                }),
              )
              .digest('hex');
            try {
              const prior = lookupOrderIdempotencyReplay(
                db,
                cancelIdempotencyUserId,
                cancelIdempotencyKey,
                cancelRequestHash,
              );
              if (prior.replay) {
                return res.status(200).json({ ...prior.response, idempotent_replay: true });
              }
            } catch (err: any) {
              return res
                .status(err.statusCode || 500)
                .json({ error: err.statusCode ? err.message : 'Internal server error' });
            }
          }
        }

        if (
          status === 'cancelled' &&
          (order as any).status !== 'cancelled' &&
          orderHasSuccessfulTender(db, req.params.id as string)
        ) {
          return res.status(409).json({
            error: 'Cannot cancel an order with successful tender; refund the bill instead',
            code: 'ORDER_HAS_SUCCESSFUL_TENDER',
          });
        }

        // Override validation: cancelling an order in preparing+ status (or with items in preparing+) requires manager PIN
        const statusOrder = ['pending', 'preparing', 'ready', 'served', 'completed'];
        const currentStatusIndex = statusOrder.indexOf((order as any).status);
        const hasItemsInProgress =
          db
            .prepare(
              `
        SELECT 1 FROM order_items 
        WHERE order_id = ? AND status IN ('preparing', 'ready', 'served', 'completed') 
        LIMIT 1
      `,
            )
            .get(req.params.id) !== undefined;
        const requiresOverride =
          (currentStatusIndex > 0 || hasItemsInProgress || authUser?.role === 'chef') &&
          status === 'cancelled';

        if (requiresOverride) {
          if (!override_pin) {
            return res
              .status(400)
              .json({ error: 'Manager PIN required to cancel order in progress' });
          }

          // Rate limit PIN attempts per IP
          const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
          const rateLimitKey = `pin:${clientIp}:${req.params.id}`;
          if (!checkPinRateLimit(rateLimitKey)) {
            return res.status(429).json({ error: 'Too many PIN attempts. Try again in 15 minutes.' });
          }

          // Validate PIN against active owner/manager accounts only
          const user = db
            .prepare(
              "SELECT * FROM users WHERE is_active = 1 AND pin_hash IS NOT NULL AND role IN ('owner', 'manager')",
            )
            .all()
            .find((u: any) => verifyPin(u.pin_hash, override_pin));

          if (!user) {
            return res.status(403).json({ error: 'Invalid manager PIN' });
          }
        }

        const nowStr = now();

        const { updatedOrder, orderItems, table } = withTxn(() => {
          switch (status) {
            case 'preparing':
              db.prepare(
                'UPDATE orders SET status = ?, cooking_started_at = ?, updated_at = ? WHERE id = ?',
              ).run(status, nowStr, nowStr, req.params.id);
              break;

            case 'ready':
              db.prepare(
                'UPDATE orders SET status = ?, ready_at = ?, updated_at = ? WHERE id = ?',
              ).run(status, nowStr, nowStr, req.params.id);
              break;

            case 'served':
              db.prepare(
                'UPDATE orders SET status = ?, served_at = ?, updated_at = ? WHERE id = ?',
              ).run(status, nowStr, nowStr, req.params.id);
              break;

            case 'completed':
              db.prepare(
                'UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
              ).run(status, nowStr, nowStr, req.params.id);
              db.prepare(
                `
              UPDATE order_items SET status = 'served', updated_at = ?
              WHERE order_id = ? AND status IN ('pending', 'preparing', 'ready')
            `,
              ).run(nowStr, req.params.id);
              if (isModuleEnabled('tables') && (order as any).table_id) {
                freeTableIfModule(db, (order as any).table_id, nowStr);
              }
              break;

            case 'cancelled': {
              // H4: re-read under the txn lock so concurrent cancels cannot double-restock.
              const locked = db
                .prepare('SELECT status FROM orders WHERE id = ?')
                .get(req.params.id) as { status: string } | undefined;
              if (!locked || locked.status === 'cancelled') {
                break;
              }
              const items = db
                .prepare('SELECT * FROM order_items WHERE order_id = ?')
                .all(req.params.id) as any[];
              for (const item of items) {
                if (item.status === 'voided' || item.status === 'void_adjustment') continue;
                const product = db
                  .prepare('SELECT * FROM products WHERE id = ?')
                  .get(item.product_id) as any;
                restoreTrackedStock(db, product, item.quantity, nowStr, {
                  referenceType: 'order',
                  referenceId: req.params.id as string,
                  reason: 'order_cancelled',
                });
                reverseRecipeConsumptionForOrderItem(db, {
                  orderItemId: Number(item.id),
                  actorUserId: authUser?.userId ?? null,
                  reason: 'order_cancelled',
                });
              }
              reverseRecipeConsumptionForOrder(db, {
                orderId: String(req.params.id),
                actorUserId: authUser?.userId ?? null,
                reason: 'order_cancelled',
              });
              db.prepare(
                'UPDATE orders SET status = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?',
              ).run(status, nowStr, reason, nowStr, req.params.id);
              // Only free table if explicitly requested (default: true for backward compatibility)
              if (isModuleEnabled('tables') && (order as any).table_id && free_table !== false) {
                freeTableIfModule(db, (order as any).table_id, nowStr);
              }
              logAuditEvent({
                actorUserId: authUser?.userId ?? null,
                action: 'order.cancelled',
                entityType: 'order',
                entityId: String(req.params.id),
                result: 'success',
                reason: reason || null,
                metadata: {
                  previous_status: (order as any).status,
                  reason: reason || null,
                },
                context: {
                  requestId: correlationId(),
                  clientIp: req.ip || req.socket.remoteAddress || null,
                },
              });
              break;
            }
          }

          const updatedOrder = parseRowJson(
            db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id),
          ) as any;
          const orderItems = attachEffectiveAddons(
            db,
            db
              .prepare('SELECT * FROM order_items WHERE order_id = ?')
              .all(req.params.id)
              .map(parseItemJson) as any[],
          );
          const tableRow2 = updatedOrder.table_id
            ? (db.prepare('SELECT * FROM tables WHERE id = ?').get(updatedOrder.table_id) as any)
            : null;
          const table = tableRow2 ? { ...tableRow2, name: tableRow2.number } : null;
          return { updatedOrder, orderItems, table };
        });

        cloudSync.recordOrderChanged(req.params.id as string, `order.${status}`);
        if (isModuleEnabled('kds')) notifyKdsUpdate();

        const response = {
          order: Object.assign({}, updatedOrder, { items: orderItems, table }),
        };
        if (
          status === 'cancelled' &&
          cancelIdempotencyKey &&
          cancelRequestHash &&
          cancelIdempotencyUserId
        ) {
          storeOrderIdempotency(
            db,
            cancelIdempotencyUserId,
            cancelIdempotencyKey,
            cancelRequestHash,
            response,
          );
        }
        res.json(response);
      } catch (error: any) {
        console.error('[API] Internal error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );
}

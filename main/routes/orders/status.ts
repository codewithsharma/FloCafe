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
import type { StockTrackedProduct } from '../../services/inventory';
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
import {
  addOrderItemsBodySchema,
  createOrderBodySchema,
  orderDiscountBodySchema,
  orderStatusBodySchema,
} from '../../validation/orders';
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
  getAuthUser,
  errorMessage,
  errorStatus,
  itemsForAddons,
  type OrderRow,
  type OrderItemRow,
} from '../orders-shared';
import { routeParam } from '../../lib/route-params';

export { checkPinRateLimit } from '../orders-shared';

export function registerStatusRoutes(router: Router): void {
  router.patch(
    '/:id/status',
    requireRole('owner', 'manager', 'cashier', 'chef', 'waiter'),
    validateBody(orderStatusBodySchema),
    (req: Request, res: Response) => {
      try {
        const {
          status,
          reason,
          override_pin,
          free_table,
          expected_status: expectedStatusRaw,
        } = req.body;
        const expectedStatus =
          expectedStatusRaw === undefined || expectedStatusRaw === null
            ? undefined
            : String(expectedStatusRaw);

        // reason is optional for cancellation

        const db = getDatabase();
        const orderId = routeParam(req.params.id);
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
          OrderRow | undefined;
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        const authUser = getAuthUser(req);
        if (authUser?.role === 'waiter' && String(order.user_id) !== String(authUser.userId)) {
          return res.status(403).json({ error: 'Waiters can only modify their own orders' });
        }

        const currentStatus = order.status as string;
        if (currentStatus !== status) {
          if (currentStatus === 'cancelled' || currentStatus === 'completed') {
            return res.status(409).json({
              error: `Illegal status transition from ${currentStatus} to ${status}`,
              code: 'ILLEGAL_STATUS_TRANSITION',
            });
          }
        }

        const statusLifecycle = ['pending', 'preparing', 'ready', 'served', 'completed'] as const;
        const orderStatusConflict = () => ({
          error: 'Order status changed; refresh and try again',
          code: 'ORDER_STATUS_CONFLICT',
        });

        let cancelIdempotencyKey: string | null = null;
        let cancelRequestHash: string | null = null;
        let cancelIdempotencyUserId: string | null = null;
        if (status === 'cancelled') {
          try {
            cancelIdempotencyKey = orderIdempotencyKey(req);
          } catch (err: unknown) {
            return res.status(errorStatus(err) || 400).json({ error: errorMessage(err) });
          }
          if (cancelIdempotencyKey) {
            if (!authUser) return res.status(401).json({ error: 'Authentication required' });
            cancelIdempotencyUserId = String(authUser.userId);
            cancelRequestHash = createHash('sha256')
              .update(
                JSON.stringify({
                  op: 'cancel',
                  orderId,
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
            } catch (err: unknown) {
              return res
                .status(errorStatus(err) || 500)
                .json({ error: errorStatus(err) ? errorMessage(err) : 'Internal server error' });
            }
          }
        }

        if (
          status === 'cancelled' &&
          order.status !== 'cancelled' &&
          orderHasSuccessfulTender(db, orderId)
        ) {
          return res.status(409).json({
            error: 'Cannot cancel an order with successful tender; refund the bill instead',
            code: 'ORDER_HAS_SUCCESSFUL_TENDER',
          });
        }

        // Override validation: cancelling an order in preparing+ status (or with items in preparing+) requires manager PIN
        const statusOrder = ['pending', 'preparing', 'ready', 'served', 'completed'];
        const currentStatusIndex = statusOrder.indexOf(order.status ?? '');
        const hasItemsInProgress =
          db
            .prepare(
              `
        SELECT 1 FROM order_items 
        WHERE order_id = ? AND status IN ('preparing', 'ready', 'served', 'completed') 
        LIMIT 1
      `,
            )
            .get(orderId) !== undefined;
        const requiresOverride =
          (currentStatusIndex > 0 || hasItemsInProgress || authUser?.role === 'chef') &&
          status === 'cancelled';

        let pinApproverId: string | null = null;
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
            return res
              .status(429)
              .json({ error: 'Too many PIN attempts. Try again in 15 minutes.' });
          }

          // Validate PIN against active owner/manager accounts only
          const pinUser = db
            .prepare(
              "SELECT * FROM users WHERE is_active = 1 AND pin_hash IS NOT NULL AND role IN ('owner', 'manager')",
            )
            .all()
            .find((u: any) => verifyPin(u.pin_hash, override_pin));

          if (!pinUser) {
            // P15: failure audit — no PIN material in metadata.
            logAuditEvent({
              actorUserId: authUser?.userId ?? null,
              action: 'order.cancel_pin_failed',
              entityType: 'order',
              entityId: orderId,
              result: 'failure',
              reason: 'invalid_manager_pin',
              metadata: { status: order.status },
              context: {
                requestId: correlationId(),
                clientIp: req.ip || req.socket.remoteAddress || null,
              },
            });
            return res.status(403).json({ error: 'Invalid manager PIN' });
          }
          pinApproverId = String((pinUser as { id: string | number }).id);
        }

        const nowStr = now();

        type StatusTxnOk = {
          ok: true;
          updatedOrder: any;
          orderItems: ReturnType<typeof attachEffectiveAddons>;
          table: { name?: unknown } | null;
        };
        type StatusTxnConflict = {
          ok: false;
          conflict: 'ORDER_STATUS_CONFLICT' | 'ILLEGAL_STATUS_TRANSITION';
          from?: string;
          to?: string;
        };

        const txnResult = withTxn((): StatusTxnOk | StatusTxnConflict => {
          // P14: re-read under txn; CAS / monotonicity so stale clients cannot overwrite newer state.
          const locked = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as
            { status: string } | undefined;
          if (!locked) {
            return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
          }

          if (locked.status === status) {
            if (expectedStatus !== undefined && expectedStatus !== locked.status) {
              return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
            }
            // Idempotent: already at target — no side effects / no false re-audit.
            const updatedOrder = parseRowJson(
              db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId),
            ) as any;
            const orderItems = attachEffectiveAddons(
              db,
              itemsForAddons(
                db
                  .prepare('SELECT * FROM order_items WHERE order_id = ?')
                  .all(orderId)
                  .map(parseItemJson) as OrderItemRow[],
              ),
            );
            const tableRow2 = updatedOrder.table_id
              ? (db.prepare('SELECT * FROM tables WHERE id = ?').get(updatedOrder.table_id) as
                  OrderRow | undefined)
              : null;
            const table = tableRow2 ? { ...tableRow2, name: tableRow2.number } : null;
            return { ok: true, updatedOrder, orderItems, table };
          } else if (locked.status === 'cancelled' || locked.status === 'completed') {
            return {
              ok: false,
              conflict: 'ILLEGAL_STATUS_TRANSITION',
              from: locked.status,
              to: status,
            };
          } else if (expectedStatus !== undefined) {
            if (expectedStatus !== locked.status) {
              return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
            }
          } else if (status !== 'cancelled') {
            const fromIdx = statusLifecycle.indexOf(
              locked.status as (typeof statusLifecycle)[number],
            );
            const toIdx = statusLifecycle.indexOf(status as (typeof statusLifecycle)[number]);
            if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
              return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
            }
          }

          const casPredicate = expectedStatus !== undefined ? expectedStatus : locked.status;
          const runCasUpdate = (sql: string, params: unknown[]): boolean => {
            const result = db.prepare(sql).run(...params);
            return result.changes === 1;
          };

          switch (status) {
            case 'preparing':
              if (
                !runCasUpdate(
                  'UPDATE orders SET status = ?, cooking_started_at = ?, updated_at = ? WHERE id = ? AND status = ?',
                  [status, nowStr, nowStr, orderId, casPredicate],
                )
              ) {
                return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
              }
              break;

            case 'ready':
              if (
                !runCasUpdate(
                  'UPDATE orders SET status = ?, ready_at = ?, updated_at = ? WHERE id = ? AND status = ?',
                  [status, nowStr, nowStr, orderId, casPredicate],
                )
              ) {
                return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
              }
              break;

            case 'served':
              if (
                !runCasUpdate(
                  'UPDATE orders SET status = ?, served_at = ?, updated_at = ? WHERE id = ? AND status = ?',
                  [status, nowStr, nowStr, orderId, casPredicate],
                )
              ) {
                return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
              }
              break;

            case 'completed':
              if (
                !runCasUpdate(
                  'UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = ?',
                  [status, nowStr, nowStr, orderId, casPredicate],
                )
              ) {
                return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
              }
              db.prepare(
                `
              UPDATE order_items SET status = 'served', updated_at = ?
              WHERE order_id = ? AND status IN ('pending', 'preparing', 'ready')
            `,
              ).run(nowStr, orderId);
              if (isModuleEnabled('tables') && order.table_id) {
                freeTableIfModule(db, String(order.table_id), nowStr);
              }
              break;

            case 'cancelled': {
              // H4: re-read under the txn lock so concurrent cancels cannot double-restock.
              if (locked.status === 'cancelled') {
                break;
              }
              if (expectedStatus !== undefined && expectedStatus !== locked.status) {
                return { ok: false, conflict: 'ORDER_STATUS_CONFLICT' };
              }
              const items = db
                .prepare('SELECT * FROM order_items WHERE order_id = ?')
                .all(orderId) as OrderItemRow[];
              for (const item of items) {
                if (item.status === 'voided' || item.status === 'void_adjustment') continue;
                const product = db
                  .prepare('SELECT * FROM products WHERE id = ?')
                  .get(item.product_id) as OrderRow | undefined;
                restoreTrackedStock(
                  db,
                  product as StockTrackedProduct | undefined,
                  item.quantity ?? 0,
                  nowStr,
                  {
                    referenceType: 'order',
                    referenceId: orderId,
                    reason: 'order_cancelled',
                  },
                );
                reverseRecipeConsumptionForOrderItem(db, {
                  orderItemId: Number(item.id),
                  actorUserId: authUser?.userId ?? null,
                  reason: 'order_cancelled',
                });
              }
              reverseRecipeConsumptionForOrder(db, {
                orderId,
                actorUserId: authUser?.userId ?? null,
                reason: 'order_cancelled',
              });
              const cancelUpdate = db
                .prepare(
                  'UPDATE orders SET status = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ? AND status = ?',
                )
                .run(status, nowStr, reason, nowStr, orderId, locked.status);
              if (cancelUpdate.changes !== 1) {
                // Roll back restock via withTxn abort.
                throw Object.assign(new Error('ORDER_STATUS_CONFLICT'), {
                  statusCode: 409,
                  code: 'ORDER_STATUS_CONFLICT',
                });
              }
              // Only free table if explicitly requested (default: true for backward compatibility)
              if (isModuleEnabled('tables') && order.table_id && free_table !== false) {
                freeTableIfModule(db, String(order.table_id), nowStr);
              }
              logAuditEvent({
                actorUserId: authUser?.userId ?? null,
                action: 'order.cancelled',
                entityType: 'order',
                entityId: orderId,
                result: 'success',
                reason: reason || null,
                metadata: {
                  previous_status: locked.status,
                  reason: reason || null,
                  ...(pinApproverId ? { pin_approved_by: pinApproverId } : {}),
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
            db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId),
          ) as any;
          const orderItems = attachEffectiveAddons(
            db,
            itemsForAddons(
              db
                .prepare('SELECT * FROM order_items WHERE order_id = ?')
                .all(orderId)
                .map(parseItemJson) as OrderItemRow[],
            ),
          );
          const tableRow2 = updatedOrder.table_id
            ? (db.prepare('SELECT * FROM tables WHERE id = ?').get(updatedOrder.table_id) as
                OrderRow | undefined)
            : null;
          const table = tableRow2 ? { ...tableRow2, name: tableRow2.number } : null;
          return { ok: true, updatedOrder, orderItems, table };
        });

        if (!txnResult.ok) {
          if (txnResult.conflict === 'ILLEGAL_STATUS_TRANSITION') {
            return res.status(409).json({
              error: `Illegal status transition from ${txnResult.from} to ${txnResult.to}`,
              code: 'ILLEGAL_STATUS_TRANSITION',
            });
          }
          return res.status(409).json(orderStatusConflict());
        }

        const { updatedOrder, orderItems, table } = txnResult;

        cloudSync.recordOrderChanged(orderId, `order.${status}`);
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
      } catch (error: unknown) {
        const err = error as { statusCode?: number; code?: string; message?: string };
        if (err?.statusCode === 409 || err?.code === 'ORDER_STATUS_CONFLICT') {
          return res.status(409).json({
            error: 'Order status changed; refresh and try again',
            code: 'ORDER_STATUS_CONFLICT',
          });
        }
        console.error('[API] Internal error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );
}

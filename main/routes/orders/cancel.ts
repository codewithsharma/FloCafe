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


export function registerCancelRoutes(router: Router): void {
  router.patch(
    '/:orderId/items/:itemId/cancel',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    async (req, res) => {
      try {
        await withSpan('order', DOMAIN_SPAN.order.cancelItem, async () => {
          const { orderId, itemId } = req.params;
          const { override_pin } = req.body;

          // requireAuth (main/server.ts) already verified the token and attached
          // the user's current DB role to req.user — use that, not the JWT claim.
          const userRole = (req as any).user?.role;
          if (!userRole) return res.status(403).json({ error: 'Authentication required' });

          const db = getDatabase();
          const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
          if (!order) {
            return res.status(404).json({ error: 'Order not found' });
          }
          if (userRole === 'waiter' && String(order.user_id) !== String((req as any).user.userId)) {
            return res.status(403).json({ error: 'Waiters can only modify their own orders' });
          }

          if (orderHasSuccessfulTender(db, orderId as string)) {
            return res.status(409).json({
              error:
                'Cannot cancel an item on an order with successful tender; refund the bill instead',
              code: 'ORDER_HAS_SUCCESSFUL_TENDER',
            });
          }

          const item = db
            .prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
            .get(itemId, orderId) as any;
          if (!item) {
            return res.status(404).json({ error: 'Item not found in this order' });
          }

          // H4: duplicate cancel/void retries are no-ops (lost-response safe).
          if (item.status === 'cancelled' || item.status === 'voided') {
            const items = db
              .prepare('SELECT * FROM order_items WHERE order_id = ?')
              .all(orderId)
              .map(parseItemJson) as any[];
            return res.json({ order: { ...order, items }, already_cancelled: true });
          }

          // #150: an item the kitchen has already started on (preparing/ready)
          // can't be silently deleted like a pending one — the ingredients are
          // already consumed. Voiding it instead requires a manager PIN, mirrors
          // the whole-order-cancel override pattern below (routes/orders.ts
          // ~L580-609), and leaves a negative bill line so the removal stays
          // visible on the bill rather than the item just vanishing.
          const isInProgressVoid = ['preparing', 'ready'].includes(item.status);
          const isPrivilegedRole = ['owner', 'manager'].includes(userRole);
          const canUseOverride = ['cashier', 'waiter'].includes(userRole) && isInProgressVoid;
          let pinApproverId: string | null = null;
          if (!isPrivilegedRole && !canUseOverride) {
            return res.status(403).json({ error: 'Only owner or manager can cancel this item' });
          }
          if (isInProgressVoid) {
            if (!override_pin) {
              return res
                .status(400)
                .json({ error: 'Manager PIN required to void an item already in progress' });
            }

            const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
            const rateLimitKey = `pin:${clientIp}:item-void:${itemId}`;
            if (!checkPinRateLimit(rateLimitKey)) {
              return res
                .status(429)
                .json({ error: 'Too many PIN attempts. Try again in 15 minutes.' });
            }

            const managerId = req.body.manager_id || req.body.user_id;
            let pinUser: any = null;
            if (managerId) {
              const candidate = db
                .prepare(
                  "SELECT * FROM users WHERE id = ? AND pin_hash IS NOT NULL AND role IN ('owner', 'manager') AND is_active = 1",
                )
                .get(managerId) as any;
              if (candidate && verifyPin(candidate.pin_hash, override_pin)) {
                pinUser = candidate;
              }
            }
            if (!pinUser) {
              const managers = db
                .prepare(
                  "SELECT * FROM users WHERE pin_hash IS NOT NULL AND role IN ('owner', 'manager') AND is_active = 1",
                )
                .all() as any[];
              for (const u of managers) {
                if (verifyPin(u.pin_hash, override_pin)) {
                  pinUser = u;
                  break;
                }
              }
            }
            if (!pinUser) {
              return res.status(403).json({ error: 'Invalid manager PIN' });
            }
            pinApproverId = pinUser.id;
          }

          const auditContext = {
            requestId: correlationId(),
            clientIp: req.ip || req.socket.remoteAddress || null,
          };
          const actorUserId = (req as any).user?.userId ?? null;

          // BUG #17 FIX: Wrap cancel + total recalc in transaction
          const result = withTxn(() => {
            if (isInProgressVoid) {
              // Leave the original line alone (it's a true record of what was
              // ordered and prepared) and add a mirrored negative line instead of
              // deleting anything — the bill total nets to the refund/comp
              // automatically via the recalc below, same as a plain cancel would,
              // but both lines stay on the bill permanently.
              db.prepare(
                `
            INSERT INTO order_items (
              order_id, product_id, product_name, product_sku, unit_price, quantity,
              subtotal, tax_amount, tax_breakdown, tax_snapshot, tax_type, discount_amount, total,
              variant_selection, modifier_selection, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'void_adjustment', ?, ?)
          `,
              ).run(
                orderId,
                item.product_id,
                `Void: ${item.product_name}`,
                item.product_sku,
                -item.unit_price,
                item.quantity,
                -item.subtotal,
                -(item.tax_amount || 0),
                invertTaxBreakdown(item.tax_breakdown),
                invertTaxSnapshot(item.tax_snapshot),
                item.tax_type,
                -(item.discount_amount || 0),
                -item.total,
                item.variant_selection,
                item.modifier_selection,
                now(),
                now(),
              );
              // #150 Q1-Q4 decision: mark 'voided', not 'cancelled' — a distinct,
              // terminal status. Item stage-change endpoints (routes/kds.ts,
              // routes/order-items.ts, kds-server.ts) reject any further
              // transition once status is 'voided', and inventory is
              // deliberately left alone: it was already deducted when the item
              // was added, and voiding an already-prepared item must not restock it.
              db.prepare(
                "UPDATE order_items SET status = 'voided', voided_at = ?, updated_at = ? WHERE id = ?",
              ).run(now(), now(), itemId);
            } else {
              // Soft delete - mark as cancelled
              db.prepare(
                "UPDATE order_items SET status = 'cancelled', updated_at = ? WHERE id = ?",
              ).run(now(), itemId);
            }

            // Recalculate order totals excluding cancelled items
            const activeItems = db
              .prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'")
              .all(orderId) as any[];
            let subtotal = 0;
            let totalTax = 0;
            let exclusiveTax = 0;
            const allTaxBreakdowns: any[] = [];
            const allTaxSnapshots: (string | null)[] = [];
            for (const i of activeItems) {
              subtotal += i.subtotal || 0;
              totalTax += i.tax_amount || 0;
              if (i.tax_type !== 'inclusive') {
                exclusiveTax += i.tax_amount || 0;
              }
              if (i.tax_breakdown) {
                try {
                  const breakdown = JSON.parse(i.tax_breakdown);
                  if (Array.isArray(breakdown)) allTaxBreakdowns.push(breakdown);
                } catch {}
              }
              allTaxSnapshots.push(i.tax_snapshot || null);
            }
            // BUG #13 FIX: Preserve order-level discount (scale percentage proportionally)
            const existingDiscountAmount = order.discount_amount || 0;
            let newDiscountAmount = existingDiscountAmount;
            if (existingDiscountAmount > 0 && order.subtotal > 0) {
              if (order.discount_type === 'percentage') {
                const pct = order.discount_value || 0;
                newDiscountAmount = Math.round(((subtotal * pct) / 100) * 100) / 100;
              }
              // amount type: keep same value
            }

            const discountedSubtotal = Math.max(0, subtotal - newDiscountAmount);
            const scaledTax = scaleItemTaxAfterOrderDiscount({
              itemTaxAmount: totalTax,
              itemExclusiveTaxAmount: exclusiveTax,
              discountAmount: newDiscountAmount,
              subtotal,
            });
            const newTaxAmount = scaledTax.taxAmount;
            const newExclusiveTax = scaledTax.exclusiveTaxAmount;
            const taxRatio = scaledTax.taxRatio;
            const tenantInfo = {
              country: getSettingValue('country') || 'IN',
              business_type: getSettingValue('business_type') || 'restaurant',
              state_code: getSettingValue('state_code') || '',
              taxes_enabled: getSettingValue('taxes_enabled') === 'true',
            };
            const customer = order.customer_id
              ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id) as any)
              : null;
            const chargeTaxes = calculateConfiguredChargeTaxes(
              tenantInfo,
              {
                ...order,
                service_charge: 0,
              },
              customer,
            );
            const taxRollup = combineItemAndChargeTaxes({
              itemTaxAmount: newTaxAmount,
              itemExclusiveTaxAmount: newExclusiveTax,
              itemBreakdowns: allTaxBreakdowns,
              itemSnapshots: allTaxSnapshots,
              itemTaxRatio: taxRatio,
              chargeTaxes,
            });

            // BUG #5 FIX: Correct round-off formula; BUG #24 FIX: include delivery_charge (was missing, causing total mismatch with bill generation)
            const preRoundTotal =
              discountedSubtotal +
              taxRollup.exclusiveTaxAmount +
              (order.delivery_charge || 0) +
              (order.packaging_charge || 0);
            const roundOff = 0;
            const total = Number(preRoundTotal.toFixed(2));

            // #132 FIX: cancelling the last active item leaves nothing to serve or
            // bill — treat it as the whole order being cancelled, the same way the
            // explicit order-level cancel (routes/orders.ts) does: free the table,
            // restore tracked inventory, and stamp cancelled_at/cancellation_reason.
            // Without this the order silently stayed "active" with zero items,
            // cluttering the Active list and permanently holding its table.
            const remainingToServe = db
              .prepare(
                `
            SELECT 1 FROM order_items
            WHERE order_id = ?
              AND status NOT IN ('cancelled', 'voided', 'void_adjustment')
            LIMIT 1
          `,
              )
              .get(orderId);
            const orderCancelled = remainingToServe === undefined && order.status !== 'cancelled';

            if (orderCancelled) {
              const allItems = db
                .prepare('SELECT * FROM order_items WHERE order_id = ?')
                .all(orderId) as any[];
              for (const i of allItems) {
                if (i.status === 'voided' || i.status === 'void_adjustment') continue;
                const product = db
                  .prepare('SELECT * FROM products WHERE id = ?')
                  .get(i.product_id) as any;
                restoreTrackedStock(db, product, i.quantity, now(), {
                  referenceType: 'order',
                  referenceId: orderId,
                  reason: 'all_items_cancelled',
                });
                reverseRecipeConsumptionForOrderItem(db, {
                  orderItemId: Number(i.id),
                  actorUserId: (req as any).user?.userId ?? null,
                  reason: 'all_items_cancelled',
                });
              }
              reverseRecipeConsumptionForOrder(db, {
                orderId: String(orderId),
                actorUserId: (req as any).user?.userId ?? null,
                reason: 'all_items_cancelled',
              });
              db.prepare(
                `
            UPDATE orders SET subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, total = ?, round_off = ?,
              status = 'cancelled', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?
          `,
              ).run(
                subtotal,
                taxRollup.taxAmount,
                JSON.stringify(taxRollup.breakdowns),
                taxRollup.snapshotJson,
                newDiscountAmount,
                total,
                roundOff,
                now(),
                'All items cancelled',
                now(),
                orderId,
              );
              if (isModuleEnabled('tables') && order.table_id) {
                freeTableIfModule(db, order.table_id, now());
              }
            } else {
              db.prepare(
                `
            UPDATE orders SET subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?
          `,
              ).run(
                subtotal,
                taxRollup.taxAmount,
                JSON.stringify(taxRollup.breakdowns),
                taxRollup.snapshotJson,
                newDiscountAmount,
                total,
                roundOff,
                now(),
                orderId,
              );
            }

            // Sync bill if it exists (open unpaid/partial only — never rewrite refunded bills)
            const existingBill = db
              .prepare(
                "SELECT * FROM bills WHERE order_id = ? AND payment_status IN ('unpaid', 'partial')",
              )
              .get(orderId) as any;
            if (existingBill) {
              const pack = getActiveCountryPack(tenantInfo.country);
              const { total: billTotal, adjustment: billRoundOff } = applyPayableRounding(
                total,
                pack,
              );
              const newBillBalance = Math.max(0, billTotal - (existingBill.paid_amount || 0));
              db.prepare(
                `UPDATE bills SET total = ?, balance = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, round_off = ?, updated_at = ? WHERE id = ?`,
              ).run(
                billTotal,
                newBillBalance,
                taxRollup.taxAmount,
                JSON.stringify(taxRollup.breakdowns),
                taxRollup.snapshotJson,
                newDiscountAmount,
                billRoundOff,
                now(),
                existingBill.id,
              );
            }

            const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
            const items = attachEffectiveAddons(
              db,
              db
                .prepare('SELECT * FROM order_items WHERE order_id = ?')
                .all(orderId)
                .map(parseItemJson) as any[],
            );

            logAuditEvent({
              actorUserId,
              action: isInProgressVoid
                ? 'order.item_voided'
                : orderCancelled
                  ? 'order.cancelled'
                  : 'order.item_cancelled',
              entityType: 'order_item',
              entityId: itemId,
              result: 'success',
              metadata: {
                order_id: orderId,
                product_id: item.product_id,
                product_name: item.product_name,
                previous_status: item.status,
                order_cancelled: orderCancelled,
                ...(pinApproverId ? { pin_approved_by: pinApproverId } : {}),
              },
              context: auditContext,
            });

            return { updatedOrder, items, orderCancelled };
          });

          cloudSync.recordOrderChanged(
            orderId,
            result.orderCancelled
              ? 'order.cancelled'
              : isInProgressVoid
                ? 'order.item_voided'
                : 'order.item_cancelled',
          );
          if (isModuleEnabled('kds')) notifyKdsUpdate();
          res.json({ order: { ...result.updatedOrder, items: result.items } });
        });
      } catch (error: any) {
        console.error('[Orders] Cancel item error:', error);
        console.error('[API] Internal error:', error);
        res
          .status(error.statusCode || 500)
          .json({ error: error.statusCode ? error.message : 'Internal server error' });
      }
    },
  );

  // Restore cancelled order item (relocated from index.ts — Phase 2.14; paths identical under /api/orders)
  router.patch('/:orderId/items/:itemId/restore', requireRole('owner', 'manager'), (req, res) => {
    try {
      const { orderId, itemId } = req.params;

      // requireAuth (main/server.ts) already verified the token and attached
      // the user's current DB role to req.user — use that, not the JWT claim.
      const userRole = (req as any).user?.role;
      if (!userRole || !['owner', 'manager'].includes(userRole)) {
        return res.status(403).json({ error: 'Only owner or manager can restore items' });
      }

      const db = getDatabase();
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const item = db
        .prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
        .get(itemId, orderId) as any;
      if (!item) {
        return res.status(404).json({ error: 'Item not found in this order' });
      }

      if (item.status !== 'cancelled') {
        return res.status(409).json({
          error: 'Only cancelled items can be restored',
          code: 'ITEM_STATUS_CONFLICT',
        });
      }

      if (['completed', 'cancelled'].includes(order.status)) {
        return res
          .status(400)
          .json({ error: 'Cannot restore items on completed or cancelled orders' });
      }
      if (orderHasSuccessfulTender(db, orderId as string)) {
        return res.status(409).json({
          error: 'Cannot restore items on an order with successful tender; refund the bill instead',
          code: 'ORDER_HAS_SUCCESSFUL_TENDER',
        });
      }

      // BUG #17 FIX: Wrap restore + total recalc in transaction
      const result = withTxn(() => {
        // H4: re-check under lock so a concurrent restore/cancel cannot stale-write.
        const locked = db
          .prepare('SELECT status FROM order_items WHERE id = ? AND order_id = ?')
          .get(itemId, orderId) as { status: string } | undefined;
        if (!locked || locked.status !== 'cancelled') {
          throw Object.assign(new Error('Only cancelled items can be restored'), {
            statusCode: 409,
            code: 'ITEM_STATUS_CONFLICT',
          });
        }
        // Restore - mark as pending
        db.prepare("UPDATE order_items SET status = 'pending', updated_at = ? WHERE id = ?").run(
          now(),
          itemId,
        );

        // Recalculate order totals
        const activeItems = db
          .prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'")
          .all(orderId) as any[];
        let subtotal = 0;
        let totalTax = 0;
        let exclusiveTax = 0;
        const allTaxBreakdowns: any[] = [];
        const allTaxSnapshots: (string | null)[] = [];
        for (const i of activeItems) {
          subtotal += i.subtotal || 0;
          totalTax += i.tax_amount || 0;
          if (i.tax_type !== 'inclusive') {
            exclusiveTax += i.tax_amount || 0;
          }
          if (i.tax_breakdown) {
            try {
              const breakdown = JSON.parse(i.tax_breakdown);
              if (Array.isArray(breakdown)) allTaxBreakdowns.push(breakdown);
            } catch {}
          }
          allTaxSnapshots.push(i.tax_snapshot || null);
        }
        // BUG #13 FIX: Preserve order-level discount (scale percentage proportionally)
        const existingDiscountAmount = order.discount_amount || 0;
        let newDiscountAmount = existingDiscountAmount;
        if (existingDiscountAmount > 0 && order.subtotal > 0) {
          if (order.discount_type === 'percentage') {
            const pct = order.discount_value || 0;
            newDiscountAmount = Math.round(((subtotal * pct) / 100) * 100) / 100;
          }
          // amount type: keep same value
        }

        const discountedSubtotal = Math.max(0, subtotal - newDiscountAmount);
        const scaledTax = scaleItemTaxAfterOrderDiscount({
          itemTaxAmount: totalTax,
          itemExclusiveTaxAmount: exclusiveTax,
          discountAmount: newDiscountAmount,
          subtotal,
        });
        const newTaxAmount = scaledTax.taxAmount;
        const newExclusiveTax = scaledTax.exclusiveTaxAmount;
        const taxRatio = scaledTax.taxRatio;
        const tenantInfo = {
          country: getSettingValue('country') || 'IN',
          business_type: getSettingValue('business_type') || 'restaurant',
          state_code: getSettingValue('state_code') || '',
          taxes_enabled: getSettingValue('taxes_enabled') === 'true',
        };
        const customer = order.customer_id
          ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id) as any)
          : null;
        const chargeTaxes = calculateConfiguredChargeTaxes(
          tenantInfo,
          {
            ...order,
            service_charge: 0,
          },
          customer,
        );
        const taxRollup = combineItemAndChargeTaxes({
          itemTaxAmount: newTaxAmount,
          itemExclusiveTaxAmount: newExclusiveTax,
          itemBreakdowns: allTaxBreakdowns,
          itemSnapshots: allTaxSnapshots,
          itemTaxRatio: taxRatio,
          chargeTaxes,
        });

        // BUG #5 FIX: Correct round-off formula; BUG #24 FIX: include delivery_charge (was missing, causing total mismatch with bill generation)
        const preRoundTotal =
          discountedSubtotal +
          taxRollup.exclusiveTaxAmount +
          (order.delivery_charge || 0) +
          (order.packaging_charge || 0);
        const roundOff = 0;
        const total = Number(preRoundTotal.toFixed(2));

        db.prepare(
          `
          UPDATE orders SET subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, total = ?, round_off = ?, updated_at = ? WHERE id = ?
        `,
        ).run(
          subtotal,
          taxRollup.taxAmount,
          JSON.stringify(taxRollup.breakdowns),
          taxRollup.snapshotJson,
          newDiscountAmount,
          total,
          roundOff,
          now(),
          orderId,
        );

        // Sync bill if it exists (open unpaid/partial only — never rewrite refunded bills)
        const existingBill = db
          .prepare(
            "SELECT * FROM bills WHERE order_id = ? AND payment_status IN ('unpaid', 'partial')",
          )
          .get(orderId) as any;
        if (existingBill) {
          const pack = getActiveCountryPack(tenantInfo.country);
          const { total: billTotal, adjustment: billRoundOff } = applyPayableRounding(total, pack);
          const newBillBalance = Math.max(0, billTotal - (existingBill.paid_amount || 0));
          db.prepare(
            `UPDATE bills SET total = ?, balance = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, round_off = ?, updated_at = ? WHERE id = ?`,
          ).run(
            billTotal,
            newBillBalance,
            taxRollup.taxAmount,
            JSON.stringify(taxRollup.breakdowns),
            taxRollup.snapshotJson,
            newDiscountAmount,
            billRoundOff,
            now(),
            existingBill.id,
          );
        }

        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
        const items = attachEffectiveAddons(
          db,
          db
            .prepare('SELECT * FROM order_items WHERE order_id = ?')
            .all(orderId)
            .map(parseItemJson) as any[],
        );
        return { updatedOrder, items };
      });

      cloudSync.recordOrderChanged(orderId, 'order.item_restored');
      if (isModuleEnabled('kds')) notifyKdsUpdate();
      res.json({ order: { ...result.updatedOrder, items: result.items } });
    } catch (error: any) {
      console.error('[Orders] Restore item error:', error);
      console.error('[API] Internal error:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Internal server error',
        ...(error.code ? { code: error.code } : {}),
      });
    }
  });
}

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

export { checkPinRateLimit } from '../orders-shared';

export function registerMutateRoutes(router: Router): void {
  router.patch('/:id/customer', requireRole('owner', 'manager'), (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as
        OrderRow | undefined;
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const { customer_id } = req.body;

      // Validate customer exists if providing one
      if (customer_id) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }
      }

      const nowStr = now();
      const updatedOrder = withTxn(() => {
        db.prepare('UPDATE orders SET customer_id = ?, updated_at = ? WHERE id = ?').run(
          customer_id || null,
          nowStr,
          req.params.id,
        );

        // Keep every open (unpaid/partial) guest check attached to the same customer.
        db.prepare(
          "UPDATE bills SET customer_id = ?, updated_at = ? WHERE order_id = ? AND payment_status IN ('unpaid', 'partial')",
        ).run(customer_id || null, nowStr, req.params.id);

        return parseRowJson(
          db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id),
        ) as any;
      });

      const customer = updatedOrder.customer_id
        ? db.prepare('SELECT * FROM customers WHERE id = ?').get(updatedOrder.customer_id)
        : null;

      cloudSync.recordOrderChanged(req.params.id as string, 'order.updated');
      notifyOrderUpdated();

      res.json({ order: { ...updatedOrder, customer } });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch(
    '/:id/convert-to-takeaway',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const nowStr = now();

        withTxn(() => {
          const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as
            OrderRow | undefined;
          if (!order) {
            throw Object.assign(new Error('Order not found'), { statusCode: 404 });
          }
          if (order.type !== 'dine_in') {
            throw Object.assign(new Error('Only dine-in orders can be converted to takeaway'), {
              statusCode: 400,
            });
          }
          if (['completed', 'cancelled'].includes(order.status ?? '')) {
            throw Object.assign(new Error('Cannot convert a completed or cancelled order'), {
              statusCode: 400,
            });
          }
          if (
            db
              .prepare(
                'SELECT 1 FROM bills WHERE order_id = ? AND split_group_id IS NOT NULL LIMIT 1',
              )
              .get(req.params.id)
          ) {
            throw Object.assign(
              new Error('A split dine-in check cannot be converted to takeaway'),
              {
                statusCode: 409,
              },
            );
          }

          db.prepare(
            "UPDATE orders SET type = 'takeaway', table_id = NULL, updated_at = ? WHERE id = ?",
          ).run(nowStr, req.params.id);

          if (isModuleEnabled('tables') && order.table_id) {
            freeTableIfModule(db, String(order.table_id), nowStr);
          }
          return order.table_id;
        });

        const updatedOrder = parseRowJson(
          db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id),
        ) as any;
        const orderItems = attachEffectiveAddons(
          db,
          itemsForAddons(
            db
              .prepare('SELECT * FROM order_items WHERE order_id = ?')
              .all(req.params.id)
              .map(parseItemJson) as OrderItemRow[],
          ),
        );

        cloudSync.recordOrderChanged(req.params.id as string, 'order.type_changed');
        if (isModuleEnabled('kds')) notifyKdsUpdate();

        res.json({ order: Object.assign({}, updatedOrder, { items: orderItems, table: null }) });
      } catch (error: unknown) {
        console.error('[API] Internal error:', error);
        res
          .status(errorStatus(error) || 500)
          .json({ error: errorStatus(error) ? errorMessage(error) : 'Internal server error' });
      }
    },
  );
}

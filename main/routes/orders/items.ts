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
import { assertProductOrderable } from '../../services/product-availability';
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
import { dualFromMajor, productPriceCents, fromCents, billPaidCents } from '../../lib/money';
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
  asTaxProduct,
  asTaxCustomer,
  itemsForAddons,
  type OrderRow,
  type OrderItemRow,
} from '../orders-shared';

export { checkPinRateLimit } from '../orders-shared';

export function registerItemsRoutes(router: Router): void {
  router.post(
    '/:id/items',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    validateBody(addOrderItemsBodySchema),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        if (
          db
            .prepare(
              'SELECT 1 FROM bills WHERE order_id = ? AND split_group_id IS NOT NULL LIMIT 1',
            )
            .get(req.params.id)
        ) {
          return res
            .status(409)
            .json({ error: 'Items cannot be changed after a check has been split' });
        }
        const body = req.body || {};
        const { items, special_instructions } = body;
        const idempotencyKey = orderIdempotencyKey(req);
        const authUser = getAuthUser(req);
        if (!authUser) return res.status(401).json({ error: 'Authentication required' });
        const idempotencyUserId = String(authUser.userId);
        const requestHash = idempotencyKey
          ? createHash('sha256')
              .update(JSON.stringify({ order_id: req.params.id, items, special_instructions }))
              .digest('hex')
          : null;
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as
          OrderRow | undefined;
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        if (authUser.role === 'waiter' && order.user_id !== authUser.userId) {
          return res.status(403).json({ error: 'Waiters can only modify their own orders' });
        }

        try {
          for (const item of items) {
            validateItemNotes(db, item.special_instructions);
            validateItemAddonGroupLimits(db, item.product_id, item.addons);
          }
          if (special_instructions !== undefined) {
            validateOrderNotes(db, special_instructions);
          }
        } catch (err: unknown) {
          return res.status(400).json({ error: errorMessage(err) });
        }

        // Get settings
        const settings: Record<string, string> = {};
        db.prepare('SELECT key, value FROM settings')
          .all()
          .forEach((row: any) => {
            settings[row.key] = row.value;
          });

        const tenantInfo = {
          country: settings.country || 'IN',
          business_type: settings.business_type || 'restaurant',
          state_code: settings.state_code || '',
          taxes_enabled: settings.taxes_enabled === 'true',
        };

        const result = withTxn(() => {
          // Re-fetch and re-validate under the transaction lock: another request (e.g. a
          // cashier completing/cancelling the order) can race the checks above, which run
          // before this lock is acquired (#175).
          const currentOrder = db
            .prepare('SELECT * FROM orders WHERE id = ?')
            .get(req.params.id) as OrderRow | undefined;
          if (!currentOrder) {
            throw Object.assign(new Error('Order not found'), { statusCode: 404 });
          }
          if (idempotencyKey) {
            const prior = db
              .prepare(
                `
            SELECT request_hash, response_json
            FROM order_idempotency
            WHERE (user_id = ? OR user_id = 'legacy') AND idempotency_key = ?
            ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
            LIMIT 1
          `,
              )
              .get(idempotencyUserId, idempotencyKey, idempotencyUserId) as
              { request_hash: string; response_json: string } | undefined;
            if (prior) {
              if (prior.request_hash !== requestHash)
                throw Object.assign(
                  new Error('Idempotency-Key was already used for a different order request'),
                  { statusCode: 409 },
                );
              try {
                return { replayResponse: JSON.parse(prior.response_json) };
              } catch {
                throw Object.assign(new Error('Stored order response is invalid'), {
                  statusCode: 500,
                });
              }
            }
          }
          if (['completed', 'cancelled'].includes(currentOrder.status ?? '')) {
            throw Object.assign(new Error('Cannot add items to a completed or cancelled order'), {
              statusCode: 400,
            });
          }

          const customer = currentOrder.customer_id
            ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(currentOrder.customer_id) as
                OrderRow | undefined)
            : null;

          const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity,
            subtotal, tax_amount, tax_breakdown, tax_snapshot, tax_type, discount_amount, total,
            unit_price_cents, subtotal_cents, tax_amount_cents, discount_amount_cents, total_cents,
            variant_selection,
            modifier_selection, special_instructions, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `);

          for (const item of items) {
            const product = db
              .prepare('SELECT * FROM products WHERE id = ?')
              .get(item.product_id) as OrderRow | undefined;
            if (!product) {
              throw new Error(`Product ${item.product_id} not found`);
            }
            assertProductOrderable(product as { name?: string; is_active?: number });
            assertStockAvailable(product as StockTrackedProduct, item.quantity);

            const unitPrice = fromCents(
              productPriceCents(product as { price_cents?: unknown; price?: unknown }),
            );
            const quantity = item.quantity;
            // item.discount_amount is intentionally ignored here — discounts are only
            // applied through the dedicated PATCH discount endpoints, which enforce
            // discount_mode/max_percentage/max_amount/approval (vuln-0002).
            const itemDiscount = 0;

            // Validate quantity and price
            if (!quantity || quantity <= 0 || !Number.isFinite(quantity)) {
              throw new Error(`Invalid quantity for ${product.name}: must be a positive number`);
            }
            if (unitPrice < 0 || !Number.isFinite(unitPrice)) {
              throw new Error(`Invalid price for ${product.name}: must be a non-negative number`);
            }

            let itemSubtotal = unitPrice * quantity;
            if (item.addons && Array.isArray(item.addons)) {
              for (const addon of item.addons) {
                if (!addon) continue;
                if (addon.quantity !== undefined) {
                  if (
                    typeof addon.quantity !== 'number' ||
                    !Number.isInteger(addon.quantity) ||
                    addon.quantity <= 0
                  ) {
                    throw new Error(
                      `Invalid add-on quantity for ${addon.name || 'addon'}: must be a positive integer`,
                    );
                  }
                }
                const addonQty = addon.quantity || 1;
                itemSubtotal += (addon.price || 0) * addonQty * quantity;
              }
            }
            itemSubtotal = Math.max(0, itemSubtotal - itemDiscount);

            const taxResult = calculateItemTax(
              tenantInfo,
              asTaxProduct(product),
              itemSubtotal,
              asTaxCustomer(customer),
            );
            const itemTotal =
              itemSubtotal + (taxResult.tax_type === 'inclusive' ? 0 : taxResult.tax_amount);
            const itemTaxSnapshotJson = taxResult.tax_snapshot
              ? JSON.stringify(taxResult.tax_snapshot)
              : null;

            const itemCreatedAt = now();
            const unitDual = dualFromMajor(unitPrice);
            const subDual = dualFromMajor(itemSubtotal);
            const taxDual = dualFromMajor(taxResult.tax_amount);
            const discountDual = dualFromMajor(itemDiscount);
            const totalDual = dualFromMajor(itemTotal);
            const insertItemResult = insertItem.run(
              req.params.id,
              product.id,
              product.name,
              product.sku,
              unitDual.major,
              quantity,
              subDual.major,
              taxDual.major,
              JSON.stringify(taxResult.tax_breakdown),
              itemTaxSnapshotJson,
              taxResult.tax_type,
              discountDual.major,
              totalDual.major,
              unitDual.cents,
              subDual.cents,
              taxDual.cents,
              discountDual.cents,
              totalDual.cents,
              JSON.stringify(item.variant_selection || null),
              JSON.stringify(item.modifier_selection || null),
              item.special_instructions || null,
              itemCreatedAt,
              itemCreatedAt,
            );
            insertOrderItemAddons(db, insertItemResult.lastInsertRowid, item.addons, itemCreatedAt);

            decrementTrackedStock(db, product as StockTrackedProduct, quantity, now(), {
              referenceType: 'order',
              referenceId: req.params.id as string,
            });
            consumeRecipeForOrderItem(db, {
              orderId: String(req.params.id),
              orderItemId: Number(insertItemResult.lastInsertRowid),
              menuProductId: String(product.id),
              portions: quantity,
              actorUserId: authUser?.userId ?? null,
            });
          }

          // BUG #3 FIX: Filter out cancelled items from total recalculation
          const activeItems = db
            .prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'")
            .all(req.params.id) as OrderItemRow[];
          let subtotal = 0;
          let totalTax = 0;
          let exclusiveTax = 0;
          const allTaxBreakdowns: unknown[] = [];
          const allTaxSnapshots: (string | null)[] = [];
          for (const item of activeItems) {
            subtotal += item.subtotal ?? 0;
            totalTax += item.tax_amount ?? 0;
            if (item.tax_type !== 'inclusive') {
              exclusiveTax += item.tax_amount ?? 0;
            }
            if (item.tax_breakdown) {
              try {
                const breakdown = JSON.parse(item.tax_breakdown);
                if (Array.isArray(breakdown)) allTaxBreakdowns.push(breakdown);
              } catch {}
            }
            allTaxSnapshots.push(item.tax_snapshot || null);
          }

          // BUG #12 FIX: Preserve order-level discount (scale percentage proportionally)
          const existingDiscountAmount = currentOrder.discount_amount || 0;
          let newDiscountAmount = existingDiscountAmount;
          if (existingDiscountAmount > 0 && (currentOrder.subtotal ?? 0) > 0) {
            if (currentOrder.discount_type === 'percentage') {
              const pct = currentOrder.discount_value || 0;
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

          const chargeTaxes = calculateConfiguredChargeTaxes(
            tenantInfo,
            {
              ...currentOrder,
              service_charge: 0,
            },
            asTaxCustomer(customer),
          );
          const taxRollup = combineItemAndChargeTaxes({
            itemTaxAmount: newTaxAmount,
            itemExclusiveTaxAmount: newExclusiveTax,
            itemBreakdowns: allTaxBreakdowns,
            itemSnapshots: allTaxSnapshots,
            itemTaxRatio: taxRatio,
            chargeTaxes,
          });
          const preRoundTotal =
            discountedSubtotal +
            taxRollup.exclusiveTaxAmount +
            (currentOrder.delivery_charge || 0) +
            (currentOrder.packaging_charge || 0);
          const total = Number(preRoundTotal.toFixed(2));
          const roundOff = 0;

          // Update order totals and optionally update order-level notes
          if (special_instructions !== undefined) {
            {
              const subD = dualFromMajor(subtotal);
              const taxD = dualFromMajor(taxRollup.taxAmount);
              const discD = dualFromMajor(newDiscountAmount);
              const totD = dualFromMajor(total);
              db.prepare(
                `
            UPDATE orders SET subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, total = ?, round_off = ?, special_instructions = ?,
              subtotal_cents = ?, tax_amount_cents = ?, discount_amount_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?
          `,
              ).run(
                subD.major,
                taxD.major,
                JSON.stringify(taxRollup.breakdowns),
                taxRollup.snapshotJson,
                discD.major,
                totD.major,
                roundOff,
                special_instructions || null,
                subD.cents,
                taxD.cents,
                discD.cents,
                totD.cents,
                now(),
                req.params.id,
              );
            }
          } else {
            {
              const subD = dualFromMajor(subtotal);
              const taxD = dualFromMajor(taxRollup.taxAmount);
              const discD = dualFromMajor(newDiscountAmount);
              const totD = dualFromMajor(total);
              db.prepare(
                `
            UPDATE orders SET subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, total = ?, round_off = ?,
              subtotal_cents = ?, tax_amount_cents = ?, discount_amount_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?
          `,
              ).run(
                subD.major,
                taxD.major,
                JSON.stringify(taxRollup.breakdowns),
                taxRollup.snapshotJson,
                discD.major,
                totD.major,
                roundOff,
                subD.cents,
                taxD.cents,
                discD.cents,
                totD.cents,
                now(),
                req.params.id,
              );
            }
          }

          // BUG #4 FIX: Sync bill if it exists (add-items didn't update the bill)
          const existingBill = db
            .prepare(
              "SELECT * FROM bills WHERE order_id = ? AND payment_status IN ('unpaid', 'partial')",
            )
            .get(req.params.id) as OrderRow | undefined;
          if (existingBill) {
            const pack = getActiveCountryPack(tenantInfo.country);
            const { total: billTotal, adjustment: billRoundOff } = applyPayableRounding(
              total,
              pack,
            );
            const newBillBalance = Math.max(
              0,
              billTotal -
                fromCents(
                  billPaidCents(
                    existingBill as { paid_amount_cents?: unknown; paid_amount?: unknown },
                  ),
                ),
            );
            {
              const totD = dualFromMajor(billTotal);
              const balD = dualFromMajor(newBillBalance);
              const taxD = dualFromMajor(taxRollup.taxAmount);
              const discD = dualFromMajor(newDiscountAmount);
              db.prepare(
                `UPDATE bills SET total = ?, balance = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, discount_amount = ?, round_off = ?,
                total_cents = ?, balance_cents = ?, tax_amount_cents = ?, discount_amount_cents = ?, updated_at = ? WHERE id = ?`,
              ).run(
                totD.major,
                balD.major,
                taxD.major,
                JSON.stringify(taxRollup.breakdowns),
                taxRollup.snapshotJson,
                discD.major,
                billRoundOff,
                totD.cents,
                balD.cents,
                taxD.cents,
                discD.cents,
                now(),
                existingBill.id,
              );
            }
          }

          const updatedOrder = parseRowJson(
            db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id),
          ) as any;
          const updatedItems = attachEffectiveAddons(
            db,
            itemsForAddons(
              db
                .prepare('SELECT * FROM order_items WHERE order_id = ?')
                .all(req.params.id)
                .map(parseItemJson) as OrderItemRow[],
            ),
          );
          const response = { order: Object.assign({}, updatedOrder, { items: updatedItems }) };
          if (idempotencyKey && requestHash) {
            db.prepare(
              'INSERT INTO order_idempotency (user_id, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
            ).run(idempotencyUserId, idempotencyKey, requestHash, JSON.stringify(response), now());
          }
          return { updatedOrder, updatedItems, replayResponse: null };
        });

        if (result.replayResponse) return res.json(result.replayResponse);
        cloudSync.recordOrderChanged(req.params.id as string, 'order.updated');
        if (isModuleEnabled('kds')) notifyKdsUpdate();

        res.json({ order: Object.assign({}, result.updatedOrder, { items: result.updatedItems }) });
      } catch (error: unknown) {
        if (!(
          errorStatus(error) !== undefined &&
          errorStatus(error)! >= 400 &&
          errorStatus(error)! < 500
        )) {
          console.error('[API] Internal error:', error);
        }
        res
          .status(errorStatus(error) || 500)
          .json({ error: errorStatus(error) ? errorMessage(error) : 'Internal server error' });
      }
    },
  );
}

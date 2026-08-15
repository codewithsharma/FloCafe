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
import { dualFromMajor, billPaidCents, fromCents } from '../../lib/money';
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
  type OrderRow,
  type OrderItemRow,
} from '../orders-shared';
import { applyOrderLevelDiscount, OrderDiscountError } from '../../services/order-discount';
import {
  resolveActiveCouponForApply,
  consumeCouponUse,
  CouponServiceError,
} from '../../services/coupons';
import { applyCouponBodySchema } from '../../validation/coupons';

export { checkPinRateLimit } from '../orders-shared';

export function registerDiscountRoutes(router: Router): void {
  router.patch(
    '/:id/discount',
    requireRole('owner', 'manager'),
    validateBody(orderDiscountBodySchema),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as
          OrderRow | undefined;
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        let discountIdempotencyKey: string | null = null;
        let discountRequestHash: string | null = null;
        let discountIdempotencyUserId: string | null = null;
        try {
          discountIdempotencyKey = orderIdempotencyKey(req);
        } catch (err: unknown) {
          return res.status(errorStatus(err) || 400).json({ error: errorMessage(err) });
        }
        if (discountIdempotencyKey) {
          const authUser = getAuthUser(req);
          if (!authUser) return res.status(401).json({ error: 'Authentication required' });
          discountIdempotencyUserId = String(authUser.userId);
          discountRequestHash = createHash('sha256')
            .update(
              JSON.stringify({
                op: 'discount',
                orderId: req.params.id,
                body: req.body,
              }),
            )
            .digest('hex');
          try {
            const prior = lookupOrderIdempotencyReplay(
              db,
              discountIdempotencyUserId,
              discountIdempotencyKey,
              discountRequestHash,
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

        if (
          db
            .prepare(
              'SELECT 1 FROM bills WHERE order_id = ? AND split_group_id IS NOT NULL LIMIT 1',
            )
            .get(req.params.id)
        ) {
          return res
            .status(409)
            .json({ error: 'Discounts cannot be changed after a check has been split' });
        }

        if (orderHasSuccessfulTender(db, req.params.id as string)) {
          return res.status(409).json({
            error: 'Cannot change discount after successful tender; refund the bill instead',
            code: 'ORDER_HAS_SUCCESSFUL_TENDER',
          });
        }

        // Cannot apply discount to completed or cancelled orders
        if (['completed', 'cancelled'].includes(order.status ?? '')) {
          return res
            .status(400)
            .json({ error: 'Cannot apply discount to a completed or cancelled order' });
        }

        const { discount_type, discount_value, discount_reason } = req.body || {};

        // Validate discount_type
        if (
          discount_value !== 0 &&
          (!discount_type || !['percentage', 'amount'].includes(discount_type))
        ) {
          return res.status(400).json({ error: 'discount_type must be "percentage" or "amount"' });
        }

        // Validate discount_value is a non-negative finite number
        if (
          discount_value === undefined ||
          discount_value === null ||
          typeof discount_value !== 'number' ||
          discount_value < 0 ||
          !Number.isFinite(discount_value)
        ) {
          return res.status(400).json({ error: 'discount_value must be a non-negative number' });
        }

        // Check if approval is required
        if (discount_value > 0) {
          const requiresApproval = getSettingValue('discount_requires_approval') === 'true';
          if (requiresApproval) {
            const { override_pin } = req.body || {};
            if (!override_pin) {
              return res
                .status(403)
                .json({ error: 'Manager PIN required for discounts', requiresApproval: true });
            }
            const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
            const rateLimitKey = `pin:${clientIp}:discount`;
            if (!checkPinRateLimit(rateLimitKey)) {
              return res
                .status(429)
                .json({ error: 'Too many PIN attempts. Try again in 15 minutes.' });
            }
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
        }

        // Check discount mode
        if (discount_value > 0) {
          const discountMode = getSettingValue('discount_mode') || 'percentage';
          if (discountMode === 'flat' && discount_type === 'percentage') {
            return res.status(400).json({ error: 'Percentage discounts are disabled' });
          }
          if (discountMode === 'percentage' && discount_type === 'amount') {
            return res.status(400).json({ error: 'Flat amount discounts are disabled' });
          }
        }

        // Check against limits from settings (0 = no limit)
        if (discount_value > 0) {
          if (discount_type === 'percentage') {
            const maxPercentage = parseFloat(getSettingValue('discount_max_percentage') || '25');
            if (maxPercentage > 0 && discount_value > maxPercentage) {
              return res
                .status(400)
                .json({ error: `discount_value exceeds maximum percentage of ${maxPercentage}` });
            }
          } else if (discount_type === 'amount') {
            const maxAmount = parseFloat(getSettingValue('discount_max_amount') || '0');
            if (maxAmount > 0 && discount_value > maxAmount) {
              return res
                .status(400)
                .json({ error: `discount_value exceeds maximum amount of ${maxAmount}` });
            }
          }
        }

        let result: Record<string, unknown>;
        try {
          result = applyOrderLevelDiscount({
            orderId: String(req.params.id),
            discount_type: discount_value > 0 ? discount_type : null,
            discount_value: discount_value ?? 0,
            discount_reason: discount_value > 0 ? discount_reason || null : null,
            actorUserId: getAuthUser(req)?.userId ?? null,
            requestId: correlationId(),
            clientIp: req.ip || req.socket.remoteAddress || null,
          });
        } catch (err: unknown) {
          if (err instanceof OrderDiscountError) {
            return res
              .status(err.statusCode)
              .json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
          }
          throw err;
        }

        notifyOrderUpdated();
        const response = { order: result };
        if (discountIdempotencyKey && discountRequestHash && discountIdempotencyUserId) {
          storeOrderIdempotency(
            db,
            discountIdempotencyUserId,
            discountIdempotencyKey,
            discountRequestHash,
            response,
          );
        }
        res.json(response);
      } catch (error: unknown) {
        console.error('[API] Internal error:', error);
        res
          .status(errorStatus(error) || 500)
          .json({ error: errorStatus(error) ? errorMessage(error) : 'Internal server error' });
      }
    },
  );

  // R11 — apply coupon code through shared order discount path
  router.post(
    '/:id/apply-coupon',
    requireRole('owner', 'manager', 'cashier'),
    validateBody(applyCouponBodySchema),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const orderId = String(req.params.id);
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
          OrderRow | undefined;
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        let idempotencyKey: string | null = null;
        let requestHash: string | null = null;
        let idempotencyUserId: string | null = null;
        try {
          idempotencyKey = orderIdempotencyKey(req);
        } catch (err: unknown) {
          return res.status(errorStatus(err) || 400).json({ error: errorMessage(err) });
        }
        if (idempotencyKey) {
          const authUser = getAuthUser(req);
          if (!authUser) return res.status(401).json({ error: 'Authentication required' });
          idempotencyUserId = String(authUser.userId);
          requestHash = createHash('sha256')
            .update(
              JSON.stringify({
                op: 'apply-coupon',
                orderId,
                body: {
                  code: String(req.body.code || '')
                    .trim()
                    .toUpperCase(),
                },
              }),
            )
            .digest('hex');
          try {
            const prior = lookupOrderIdempotencyReplay(
              db,
              idempotencyUserId,
              idempotencyKey,
              requestHash,
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

        if (
          db
            .prepare(
              'SELECT 1 FROM bills WHERE order_id = ? AND split_group_id IS NOT NULL LIMIT 1',
            )
            .get(orderId)
        ) {
          return res
            .status(409)
            .json({ error: 'Discounts cannot be changed after a check has been split' });
        }

        if (orderHasSuccessfulTender(db, orderId)) {
          return res.status(409).json({
            error: 'Cannot change discount after successful tender; refund the bill instead',
            code: 'ORDER_HAS_SUCCESSFUL_TENDER',
          });
        }

        if (['completed', 'cancelled'].includes(order.status ?? '')) {
          return res
            .status(400)
            .json({ error: 'Cannot apply discount to a completed or cancelled order' });
        }

        let resolved;
        try {
          resolved = resolveActiveCouponForApply(String(req.body.code));
        } catch (err: unknown) {
          if (err instanceof CouponServiceError) {
            return res.status(err.statusCode).json({
              error: err.message,
              ...(err.code ? { code: err.code } : {}),
            });
          }
          throw err;
        }

        let result: Record<string, unknown>;
        try {
          result = applyOrderLevelDiscount({
            orderId,
            discount_type: resolved.discount_type,
            discount_value: resolved.discount_value,
            discount_reason: resolved.discount_reason,
            actorUserId: getAuthUser(req)?.userId ?? null,
            auditMetadata: {
              coupon_code: resolved.coupon.code,
              coupon_id: resolved.coupon.id,
            },
            requestId: correlationId(),
            clientIp: req.ip || req.socket.remoteAddress || null,
            beforeCommit: () => consumeCouponUse(resolved.coupon.id),
          });
        } catch (err: unknown) {
          if (err instanceof CouponServiceError || err instanceof OrderDiscountError) {
            return res.status(err.statusCode).json({
              error: err.message,
              ...(err.code ? { code: err.code } : {}),
            });
          }
          throw err;
        }

        notifyOrderUpdated();
        const response = { order: result, coupon: resolved.coupon };
        if (idempotencyKey && requestHash && idempotencyUserId) {
          storeOrderIdempotency(db, idempotencyUserId, idempotencyKey, requestHash, response);
        }
        res.json(response);
      } catch (error: unknown) {
        console.error('[API] apply-coupon error:', error);
        res
          .status(errorStatus(error) || 500)
          .json({ error: errorStatus(error) ? errorMessage(error) : 'Internal server error' });
      }
    },
  );

  router.patch(
    '/:id/items/:itemId/discount',
    requireRole('owner', 'manager'),
    (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as
          OrderRow | undefined;
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (
          db
            .prepare(
              'SELECT 1 FROM bills WHERE order_id = ? AND split_group_id IS NOT NULL LIMIT 1',
            )
            .get(req.params.id)
        ) {
          return res
            .status(409)
            .json({ error: 'Discounts cannot be changed after a check has been split' });
        }

        if (orderHasSuccessfulTender(db, req.params.id as string)) {
          return res.status(409).json({
            error: 'Cannot change discount after successful tender; refund the bill instead',
            code: 'ORDER_HAS_SUCCESSFUL_TENDER',
          });
        }

        // Cannot apply discount to completed or cancelled orders
        if (['completed', 'cancelled'].includes(order.status ?? '')) {
          return res
            .status(400)
            .json({ error: 'Cannot apply discount to a completed or cancelled order' });
        }

        const item = db
          .prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
          .get(req.params.itemId, req.params.id) as OrderItemRow | undefined;
        if (!item) {
          return res.status(404).json({ error: 'Item not found' });
        }

        const { discount_type, discount_value } = req.body;

        // Validate discount_type
        if (!discount_type || !['percentage', 'amount'].includes(discount_type)) {
          return res.status(400).json({ error: 'discount_type must be "percentage" or "amount"' });
        }

        // Validate discount_value is a positive number
        if (
          discount_value === undefined ||
          discount_value === null ||
          typeof discount_value !== 'number' ||
          discount_value <= 0
        ) {
          return res.status(400).json({ error: 'discount_value must be a positive number' });
        }

        // Check if approval is required
        const requiresApproval = getSettingValue('discount_requires_approval') === 'true';
        if (requiresApproval) {
          const { override_pin } = req.body;
          if (!override_pin) {
            return res
              .status(403)
              .json({ error: 'Manager PIN required for discounts', requiresApproval: true });
          }
          const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
          const rateLimitKey = `pin:${clientIp}:item-discount`;
          if (!checkPinRateLimit(rateLimitKey)) {
            return res
              .status(429)
              .json({ error: 'Too many PIN attempts. Try again in 15 minutes.' });
          }
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

        // Check discount mode
        const discountMode = getSettingValue('discount_mode') || 'percentage';
        if (discountMode === 'flat' && discount_type === 'percentage') {
          return res.status(400).json({ error: 'Percentage discounts are disabled' });
        }
        if (discountMode === 'percentage' && discount_type === 'amount') {
          return res.status(400).json({ error: 'Flat amount discounts are disabled' });
        }

        // BUG #14 FIX: Check item-level discount against max settings (0 = no limit)
        if (discount_type === 'percentage') {
          const maxPercentage = parseFloat(getSettingValue('discount_max_percentage') || '25');
          if (maxPercentage > 0 && discount_value > maxPercentage) {
            return res
              .status(400)
              .json({ error: `discount_value exceeds maximum percentage of ${maxPercentage}` });
          }
        } else if (discount_type === 'amount') {
          const maxAmount = parseFloat(getSettingValue('discount_max_amount') || '0');
          if (maxAmount > 0 && discount_value > maxAmount) {
            return res
              .status(400)
              .json({ error: `discount_value exceeds maximum amount of ${maxAmount}` });
          }
        }

        // Calculate item discount amount (include addon prices)
        const addonRows = db
          .prepare('SELECT price, quantity FROM order_item_addons WHERE order_item_id = ?')
          .all(item.id) as { price: number; quantity?: number }[];
        const addonTotal = addonRows.reduce(
          (sum, addon) => sum + (addon.price || 0) * (addon.quantity || 1) * (item.quantity ?? 0),
          0,
        );
        const itemBaseTotal = (item.unit_price ?? 0) * (item.quantity ?? 0) + addonTotal;

        let discountAmount: number;
        if (discount_type === 'percentage') {
          discountAmount = (itemBaseTotal * discount_value) / 100;
        } else {
          discountAmount = Math.min(discount_value, itemBaseTotal);
        }
        discountAmount = Math.round(discountAmount * 100) / 100;

        // Recalculate item subtotal after discount
        const newSubtotal = Math.max(0, itemBaseTotal - discountAmount);

        // Recalculate tax on discounted subtotal
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as
          OrderRow | undefined;
        const customer = order.customer_id
          ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id) as
              OrderRow | undefined)
          : null;
        const settings = db
          .prepare(
            "SELECT * FROM settings WHERE key IN ('country', 'business_type', 'state_code', 'taxes_enabled')",
          )
          .all() as { key: string; value: string }[];
        const settingsMap = Object.fromEntries(settings.map((s: any) => [s.key, s.value]));
        const tenantInfo = {
          country: settingsMap.country || 'IN',
          business_type: settingsMap.business_type || 'restaurant',
          state_code: settingsMap.state_code || '',
          taxes_enabled: settingsMap.taxes_enabled === 'true',
        };
        const taxResult = calculateItemTax(
          tenantInfo,
          asTaxProduct(product!),
          newSubtotal,
          asTaxCustomer(customer),
        );
        const newTaxAmount = taxResult.tax_amount;
        const newTaxBreakdown = taxResult.tax_breakdown;
        const newTaxSnapshotJson = taxResult.tax_snapshot
          ? JSON.stringify(taxResult.tax_snapshot)
          : null;

        const newTotal = newSubtotal + (taxResult.tax_type === 'inclusive' ? 0 : newTaxAmount);

        const updatedItem = withTxn(() => {
          // Update item with recalculated tax
          {
            const discD = dualFromMajor(discountAmount);
            const subD = dualFromMajor(newSubtotal);
            const taxD = dualFromMajor(newTaxAmount);
            const totD = dualFromMajor(newTotal);
            db.prepare(
              `
          UPDATE order_items SET discount_amount = ?,
            subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, tax_type = ?,
            total = ?, discount_amount_cents = ?, subtotal_cents = ?, tax_amount_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?
        `,
            ).run(
              discD.major,
              subD.major,
              taxD.major,
              JSON.stringify(newTaxBreakdown),
              newTaxSnapshotJson,
              taxResult.tax_type,
              totD.major,
              discD.cents,
              subD.cents,
              taxD.cents,
              totD.cents,
              now(),
              req.params.itemId,
            );
          }

          // Update order totals (preserve existing order-level discount)
          // Note: status != 'cancelled' — a cancelled item's tax must not re-enter
          // the order total here, same filter every other recompute site in this
          // file already uses (BUG #3 FIX above, index.ts cancel/restore below).
          const allItems = db
            .prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'")
            .all(req.params.id) as OrderItemRow[];
          let orderSubtotal = 0;
          let orderTax = 0;
          let exclusiveOrderTax = 0;
          const allTaxBreakdowns: unknown[] = [];
          const allTaxSnapshots: (string | null)[] = [];
          for (const i of allItems) {
            orderSubtotal += i.subtotal ?? 0;
            orderTax += i.tax_amount ?? 0;
            if (i.tax_type !== 'inclusive') {
              exclusiveOrderTax += i.tax_amount ?? 0;
            }
            if (i.tax_breakdown) {
              try {
                const breakdown = JSON.parse(i.tax_breakdown);
                if (Array.isArray(breakdown)) allTaxBreakdowns.push(breakdown);
              } catch {}
            }
            allTaxSnapshots.push(i.tax_snapshot || null);
          }

          // Recalculate order-level discount proportionally on new subtotal
          const existingDiscountAmount = order.discount_amount || 0;
          let newOrderDiscount = existingDiscountAmount;
          if (existingDiscountAmount > 0 && (order.subtotal ?? 0) > 0) {
            // Scale discount proportionally to new subtotal
            newOrderDiscount =
              Math.round(existingDiscountAmount * (orderSubtotal / (order.subtotal ?? 0)) * 100) /
              100;
          }

          // Recalculate tax on discounted subtotal
          const discountedSubtotal = Math.max(0, orderSubtotal - newOrderDiscount);
          const scaledOrderTax = scaleItemTaxAfterOrderDiscount({
            itemTaxAmount: orderTax,
            itemExclusiveTaxAmount: exclusiveOrderTax,
            discountAmount: newOrderDiscount,
            subtotal: orderSubtotal,
          });
          const newOrderTax = scaledOrderTax.taxAmount;
          const newExclusiveOrderTax = scaledOrderTax.exclusiveTaxAmount;
          const taxRatio = scaledOrderTax.taxRatio;

          const chargeTaxes = calculateConfiguredChargeTaxes(
            tenantInfo,
            {
              ...order,
              service_charge: 0,
            },
            asTaxCustomer(customer),
          );
          const taxRollup = combineItemAndChargeTaxes({
            itemTaxAmount: newOrderTax,
            itemExclusiveTaxAmount: newExclusiveOrderTax,
            itemBreakdowns: allTaxBreakdowns,
            itemSnapshots: allTaxSnapshots,
            itemTaxRatio: taxRatio,
            chargeTaxes,
          });
          const preRoundTotal =
            discountedSubtotal +
            taxRollup.exclusiveTaxAmount +
            (order.packaging_charge || 0) +
            (order.delivery_charge || 0);
          const orderTotal = Number(preRoundTotal.toFixed(2));
          const roundOff = 0;

          {
            const subD = dualFromMajor(orderSubtotal);
            const taxD = dualFromMajor(taxRollup.taxAmount);
            const discD = dualFromMajor(newOrderDiscount);
            const totD = dualFromMajor(orderTotal);
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

          // BUG #15 FIX: Sync item-level discount to bill
          const existingBill = db
            .prepare(
              "SELECT * FROM bills WHERE order_id = ? AND payment_status IN ('unpaid', 'partial')",
            )
            .get(req.params.id) as OrderRow | undefined;
          if (existingBill) {
            const pack = getActiveCountryPack(tenantInfo.country);
            const { total: billTotal, adjustment: billRoundOff } = applyPayableRounding(
              orderTotal,
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
              const discD = dualFromMajor(newOrderDiscount);
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

          return db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.itemId) as
            OrderItemRow | undefined;
        });

        if (!updatedItem) {
          return res.status(404).json({ error: 'Item not found' });
        }

        logAuditEvent({
          actorUserId: getAuthUser(req)?.userId ?? null,
          action: 'order.item_discount_applied',
          entityType: 'order',
          entityId: String(req.params.id),
          result: 'success',
          metadata: {
            item_id: updatedItem.id ?? req.params.itemId,
            discount_type,
            discount_value,
            discount_amount: updatedItem.discount_amount ?? discountAmount,
          },
          context: {
            requestId: correlationId(),
            clientIp: req.ip || req.socket.remoteAddress || null,
          },
        });

        res.json({ item: updatedItem });
      } catch (error: unknown) {
        console.error('[API] Internal error:', error);
        res
          .status(errorStatus(error) || 500)
          .json({ error: errorStatus(error) ? errorMessage(error) : 'Internal server error' });
      }
    },
  );
}

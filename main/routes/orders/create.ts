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
import { dualFromMajor, productPriceCents, fromCents } from '../../lib/money';
// Phase 2.14 — Order ownership facade (markers; routes remain the HTTP surface).
import { ORDER_OWNED_CONCERNS } from '../../services/order';
void ORDER_OWNED_CONCERNS;

import {
  requireOrderIdempotencyKey,
  hashOrderIdempotencyPayload,
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

export function registerCreateRoutes(router: Router): void {
  router.post(
    '/',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    validateBody(createOrderBodySchema),
    async (req: Request, res: Response) => {
      try {
        await withSpan('order', DOMAIN_SPAN.order.create, async () => {
          const body = req.body || {};
          const {
            table_id,
            customer_id,
            type,
            guest_count,
            special_instructions,
            packaging_charge,
            delivery_charge,
            items,
          } = body;
          const idempotencyKey = requireOrderIdempotencyKey(req);
          const authUser = getAuthUser(req);
          if (!authUser) return res.status(401).json({ error: 'Authentication required' });
          const idempotencyUserId = String(authUser.userId);
          const requestHash = hashOrderIdempotencyPayload(body);
          // Always the authenticated caller, never client-supplied — trusting a
          // client-sent user_id would let staff spoof order attribution, and the
          // frontend has in fact never sent one, so every order got user_id=NULL.
          // That silently broke waiters' own order visibility (GET /orders scopes
          // waiters to `user_id = <their id>`, which NULL can never match) and any
          // per-staff sales attribution.
          const authenticatedUserId = authUser.userId;
          const terminalIdHeader = readTerminalIdHeaderFromRequest(req);

          const db = getDatabase();

          try {
            validateOrderNotes(db, special_instructions);
            for (const item of items) {
              validateItemNotes(db, item.special_instructions);
              validateItemAddonGroupLimits(db, item.product_id, item.addons);
            }
          } catch (err: unknown) {
            return res.status(400).json({ error: errorMessage(err) });
          }
          const result = withTxn(() => {
            // Preserve exact replay for pre-user-scoped records whose creator is
            // unavailable. New records never use the `legacy` compatibility owner.
            const prior = lookupOrderIdempotencyReplay(
              db,
              idempotencyUserId,
              idempotencyKey,
              requestHash,
            );
            if (prior.replay) {
              return {
                order: prior.response.order,
                orderItems: prior.response.order?.items || [],
                idempotentReplay: true,
              };
            }

            // Resolve operational shift association for the request terminal
            const shiftId = resolveActiveShiftForOrder(terminalIdHeader);

            // R2: refuse second dine-in on occupied table before insert
            if (isModuleEnabled('tables') && table_id && type === 'dine_in') {
              assertTableCanOpen(db, table_id);
            }

            // Generate order number inside transaction to prevent race conditions
            const orderNumber = generateOrderNumber();

            // Get settings for tax calculation
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
            const chargeCategories = getConfiguredChargeTaxCategories(tenantInfo.country);
            const chargeContext = {
              packaging_charge: packaging_charge || 0,
              delivery_charge: delivery_charge || 0,
              service_charge: 0,
              packaging_tax_category_id: chargeCategories.packaging?.categoryId || null,
              delivery_tax_category_id: chargeCategories.delivery?.categoryId || null,
              service_charge_tax_category_id: chargeCategories.service_charge?.categoryId || null,
            };

            const packagingDual = dualFromMajor(packaging_charge || 0);
            const deliveryDual = dualFromMajor(delivery_charge || 0);
            const orderResult = db
              .prepare(
                `
          INSERT INTO orders (order_number, table_id, customer_id, user_id, type, guest_count, special_instructions,
            packaging_charge, delivery_charge, packaging_charge_cents, delivery_charge_cents,
            packaging_tax_category_id, delivery_tax_category_id,
            service_charge_tax_category_id, status, shift_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `,
              )
              .run(
                orderNumber,
                table_id || null,
                customer_id || null,
                authenticatedUserId,
                type,
                guest_count || null,
                special_instructions || null,
                packagingDual.major,
                deliveryDual.major,
                packagingDual.cents,
                deliveryDual.cents,
                chargeContext.packaging_tax_category_id,
                chargeContext.delivery_tax_category_id,
                chargeContext.service_charge_tax_category_id,
                shiftId,
                now(),
                now(),
              );

            const orderId = orderResult.lastInsertRowid;

            let subtotal = 0;
            let totalTax = 0;
            let exclusiveTax = 0;
            const allTaxBreakdowns: unknown[] = [];
            const allTaxSnapshots: (string | null)[] = [];
            const customer = customer_id
              ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id) as
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

              totalTax += taxResult.tax_amount;
              if (taxResult.tax_type !== 'inclusive') {
                exclusiveTax += taxResult.tax_amount;
              }
              if (taxResult.tax_breakdown) {
                allTaxBreakdowns.push(taxResult.tax_breakdown);
              }
              const itemTaxSnapshotJson = taxResult.tax_snapshot
                ? JSON.stringify(taxResult.tax_snapshot)
                : null;
              allTaxSnapshots.push(itemTaxSnapshotJson);

              const itemTotal =
                itemSubtotal + (taxResult.tax_type === 'inclusive' ? 0 : taxResult.tax_amount);
              subtotal += itemSubtotal;

              const itemCreatedAt = now();
              const unitDual = dualFromMajor(unitPrice);
              const subDual = dualFromMajor(itemSubtotal);
              const taxDual = dualFromMajor(taxResult.tax_amount);
              const discountDual = dualFromMajor(itemDiscount);
              const totalDual = dualFromMajor(itemTotal);
              const insertItemResult = insertItem.run(
                orderId,
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
              insertOrderItemAddons(
                db,
                insertItemResult.lastInsertRowid,
                item.addons,
                itemCreatedAt,
              );

              // Inventory boundary: reserve stock at order create (inside withTxn).
              decrementTrackedStock(db, product as StockTrackedProduct, quantity, now(), {
                referenceType: 'order',
                referenceId: orderId,
              });
              // R5: BOM ingredient consumption (idempotent per order_item_id).
              consumeRecipeForOrderItem(db, {
                orderId: String(orderId),
                orderItemId: Number(insertItemResult.lastInsertRowid),
                menuProductId: String(product.id),
                portions: quantity,
                actorUserId: authenticatedUserId ?? null,
              });
            }

            const chargeTaxes = calculateConfiguredChargeTaxes(
              tenantInfo,
              chargeContext,
              asTaxCustomer(customer),
            );
            const taxRollup = combineItemAndChargeTaxes({
              itemTaxAmount: totalTax,
              itemExclusiveTaxAmount: exclusiveTax,
              itemBreakdowns: allTaxBreakdowns,
              itemSnapshots: allTaxSnapshots,
              itemTaxRatio: 1,
              chargeTaxes,
            });
            const preRoundTotal =
              subtotal +
              taxRollup.exclusiveTaxAmount +
              (delivery_charge || 0) +
              (packaging_charge || 0);
            const total = Number(preRoundTotal.toFixed(2));
            const roundOff = 0;
            const subDual = dualFromMajor(subtotal);
            const taxAmtDual = dualFromMajor(taxRollup.taxAmount);
            const totalDual = dualFromMajor(total);

            db.prepare(
              `
          UPDATE orders SET subtotal = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, total = ?,
            round_off = ?, subtotal_cents = ?, tax_amount_cents = ?, total_cents = ?,
            discount_amount_cents = COALESCE(discount_amount_cents, 0), updated_at = ? WHERE id = ?
        `,
            ).run(
              subDual.major,
              taxAmtDual.major,
              JSON.stringify(taxRollup.breakdowns),
              taxRollup.snapshotJson,
              totalDual.major,
              roundOff,
              subDual.cents,
              taxAmtDual.cents,
              totalDual.cents,
              now(),
              orderId,
            );

            // Phase 2.17 / R2 — soft-gate restaurant table occupy with CAS after insert.
            if (isModuleEnabled('tables') && table_id && type === 'dine_in') {
              markTableOccupiedCas(db, table_id, now());
            }

            const order = parseRowJson(
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
            const response = { order: Object.assign({}, order, { items: orderItems }) };
            storeOrderIdempotency(db, idempotencyUserId, idempotencyKey, requestHash, response);
            logAuditEvent({
              actorUserId: authenticatedUserId ?? null,
              action: 'order.created',
              entityType: 'order',
              entityId: String(order.id),
              result: 'success',
              metadata: {
                type: order.type,
                item_count: Array.isArray(items) ? items.length : orderItems.length,
              },
              context: {
                requestId: correlationId(),
                clientIp: req.ip || req.socket.remoteAddress || null,
              },
            });
            return { order, orderItems, idempotentReplay: false };
          });

          if (!result.idempotentReplay) {
            if (isModuleEnabled('kds')) notifyKdsUpdate();
            cloudSync.recordOrderChanged(result.order.id, 'order.created');

            if (customer_id) {
              try {
                syncCustomerTagCounts(db, customer_id, items);
              } catch (err) {
                console.error('[Orders] Tag sync failed:', err);
              }
            }
          }

          res
            .status(result.idempotentReplay ? 200 : 201)
            .json({ order: Object.assign({}, result.order, { items: result.orderItems }) });
        });
      } catch (error: unknown) {
        console.error('[Orders] Create error:', error);
        if (!(
          errorStatus(error) !== undefined &&
          errorStatus(error)! >= 400 &&
          errorStatus(error)! < 500
        )) {
          console.error('[API] Internal error:', error);
        }
        const payload: Record<string, unknown> = {
          error: errorStatus(error) ? errorMessage(error) : 'Internal server error',
        };
        if (error instanceof TableServiceError || (error as { code?: string }).code) {
          payload.code = (error as { code?: string }).code;
        }
        res.status(errorStatus(error) || 500).json(payload);
      }
    },
  );
}

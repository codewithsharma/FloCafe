/**
 * Shared order-level discount application (R1 discount path + R11 coupons).
 */

import { getDatabase, now, parseRowJson, withTxn, getSettingValue } from '../db';
import {
  applyPayableRounding,
  calculateConfiguredChargeTaxes,
  combineItemAndChargeTaxes,
  getActiveCountryPack,
  scaleItemTaxAfterOrderDiscount,
} from './tax';
import { logAuditEvent } from './audit-log';
import { dualFromMajor, billPaidCents, fromCents } from '../lib/money';

type OrderRow = Record<string, unknown> & {
  id?: string;
  status?: string | null;
  subtotal?: number | null;
  customer_id?: string | null;
  packaging_charge?: number | null;
  delivery_charge?: number | null;
  service_charge?: number | null;
};

type OrderItemRow = Record<string, unknown> & {
  tax_amount?: number | null;
  tax_type?: string | null;
  tax_breakdown?: string | null;
  tax_snapshot?: string | null;
};

export class OrderDiscountError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'OrderDiscountError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface ApplyOrderDiscountParams {
  orderId: string;
  discount_type: 'percentage' | 'amount' | null;
  discount_value: number;
  discount_reason: string | null;
  actorUserId: string | null;
  auditMetadata?: Record<string, unknown>;
  requestId?: string | null;
  clientIp?: string | null;
  /** Optional hook run inside the same transaction (e.g. coupon uses_count). */
  beforeCommit?: () => void;
}

function asTaxCustomer(customer: unknown): Parameters<typeof calculateConfiguredChargeTaxes>[2] {
  return customer as Parameters<typeof calculateConfiguredChargeTaxes>[2];
}

/**
 * Apply or clear an order-level discount and sync unpaid bill totals.
 * Caller must enforce post-tender / split / status guards before calling.
 */
export function applyOrderLevelDiscount(params: ApplyOrderDiscountParams): Record<string, unknown> {
  const {
    orderId,
    discount_type,
    discount_value,
    discount_reason,
    actorUserId,
    auditMetadata,
    requestId,
    clientIp,
    beforeCommit,
  } = params;

  if (
    discount_value === undefined ||
    discount_value === null ||
    typeof discount_value !== 'number' ||
    discount_value < 0 ||
    !Number.isFinite(discount_value)
  ) {
    throw new OrderDiscountError(400, 'discount_value must be a non-negative number');
  }
  if (
    discount_value !== 0 &&
    (!discount_type || !['percentage', 'amount'].includes(discount_type))
  ) {
    throw new OrderDiscountError(400, 'discount_type must be "percentage" or "amount"');
  }

  const tenantInfo = {
    country: getSettingValue('country') || 'IN',
    business_type: getSettingValue('business_type') || 'restaurant',
    state_code: getSettingValue('state_code') || '',
    taxes_enabled: getSettingValue('taxes_enabled') === 'true',
  };

  return withTxn(() => {
    const db = getDatabase();
    const currentOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      OrderRow | undefined;
    if (!currentOrder) {
      throw new OrderDiscountError(404, 'Order not found');
    }
    if (['completed', 'cancelled'].includes(currentOrder.status ?? '')) {
      throw new OrderDiscountError(400, 'Cannot apply discount to a completed or cancelled order');
    }

    if (beforeCommit) beforeCommit();

    const customer = currentOrder.customer_id
      ? db.prepare('SELECT * FROM customers WHERE id = ?').get(currentOrder.customer_id)
      : null;

    let discountAmount = 0;
    if (discount_value > 0) {
      if (discount_type === 'percentage') {
        discountAmount = ((currentOrder.subtotal ?? 0) * discount_value) / 100;
      } else {
        discountAmount = Math.min(discount_value, currentOrder.subtotal ?? 0);
      }
      discountAmount = Math.round(discountAmount * 100) / 100;
    }

    const activeItems = db
      .prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'")
      .all(orderId) as OrderItemRow[];
    let freshTax = 0;
    let exclusiveTax = 0;
    const allTaxBreakdowns: unknown[] = [];
    const allTaxSnapshots: (string | null)[] = [];
    for (const item of activeItems) {
      freshTax += item.tax_amount || 0;
      if (item.tax_type !== 'inclusive') {
        exclusiveTax += item.tax_amount || 0;
      }
      if (item.tax_breakdown) {
        try {
          const breakdown = JSON.parse(item.tax_breakdown);
          if (Array.isArray(breakdown)) allTaxBreakdowns.push(breakdown);
        } catch {
          /* ignore */
        }
      }
      allTaxSnapshots.push(item.tax_snapshot || null);
    }

    let newTaxAmount = freshTax;
    let newExclusiveTax = exclusiveTax;
    let taxRatio = 1;
    if (discountAmount > 0 && (currentOrder.subtotal ?? 0) > 0) {
      const scaled = scaleItemTaxAfterOrderDiscount({
        itemTaxAmount: freshTax,
        itemExclusiveTaxAmount: exclusiveTax,
        discountAmount,
        subtotal: currentOrder.subtotal ?? 0,
      });
      newTaxAmount = scaled.taxAmount;
      newExclusiveTax = scaled.exclusiveTaxAmount;
      taxRatio = scaled.taxRatio;
    }

    const discountedSubtotal = Math.max(0, (currentOrder.subtotal ?? 0) - discountAmount);
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
      (currentOrder.packaging_charge || 0) +
      (currentOrder.delivery_charge || 0);
    const newTotal = Number(preRoundTotal.toFixed(2));
    const roundOff = 0;

    {
      const discD = dualFromMajor(discountAmount);
      const taxD = dualFromMajor(taxRollup.taxAmount);
      const totD = dualFromMajor(newTotal);
      db.prepare(
        `
          UPDATE orders SET discount_amount = ?, discount_type = ?, discount_value = ?,
            discount_reason = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, total = ?, round_off = ?,
            discount_amount_cents = ?, tax_amount_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?
        `,
      ).run(
        discD.major,
        discount_value > 0 ? discount_type : null,
        discount_value > 0 ? discount_value : null,
        discount_value > 0 ? discount_reason || null : null,
        taxD.major,
        JSON.stringify(taxRollup.breakdowns),
        taxRollup.snapshotJson,
        totD.major,
        roundOff,
        discD.cents,
        taxD.cents,
        totD.cents,
        now(),
        orderId,
      );
    }

    const existingBill = db
      .prepare('SELECT * FROM bills WHERE order_id = ? AND payment_status != ?')
      .get(orderId, 'paid') as OrderRow | undefined;
    if (existingBill) {
      const pack = getActiveCountryPack(tenantInfo.country);
      const { total: billTotal, adjustment: billRoundOff } = applyPayableRounding(newTotal, pack);
      const newBillBalance = Math.max(
        0,
        billTotal -
          fromCents(
            billPaidCents(existingBill as { paid_amount_cents?: unknown; paid_amount?: unknown }),
          ),
      );
      {
        const discD = dualFromMajor(discountAmount);
        const taxD = dualFromMajor(taxRollup.taxAmount);
        const totD = dualFromMajor(billTotal);
        const balD = dualFromMajor(newBillBalance);
        db.prepare(
          `
            UPDATE bills SET discount_amount = ?, discount_type = ?, discount_value = ?,
              discount_reason = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?, total = ?, balance = ?, round_off = ?,
              discount_amount_cents = ?, tax_amount_cents = ?, total_cents = ?, balance_cents = ?, updated_at = ?
            WHERE id = ?
          `,
        ).run(
          discD.major,
          discount_value > 0 ? discount_type : null,
          discount_value > 0 ? discount_value : null,
          discount_value > 0 ? discount_reason || null : null,
          taxD.major,
          JSON.stringify(taxRollup.breakdowns),
          taxRollup.snapshotJson,
          totD.major,
          balD.major,
          billRoundOff,
          discD.cents,
          taxD.cents,
          totD.cents,
          balD.cents,
          now(),
          existingBill.id,
        );
      }
    }

    const updatedOrder = parseRowJson(
      db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId),
    ) as Record<string, unknown>;

    logAuditEvent({
      actorUserId,
      action: 'order.discount_applied',
      entityType: 'order',
      entityId: String(orderId),
      result: 'success',
      reason: discount_value > 0 ? discount_reason || null : null,
      metadata: {
        discount_type: discount_value > 0 ? discount_type : null,
        discount_value: discount_value > 0 ? discount_value : 0,
        discount_amount: updatedOrder.discount_amount || 0,
        cleared: !(discount_value > 0),
        ...(auditMetadata || {}),
      },
      context: {
        requestId: requestId ?? null,
        clientIp: clientIp ?? null,
      },
    });

    return updatedOrder;
  });
}

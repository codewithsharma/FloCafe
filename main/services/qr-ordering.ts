/**
 * R10 — Guest table QR ordering (pay-at-counter; no gateway).
 */
import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import {
  generateOrderNumber,
  getSettingValue,
  insertOrderItemAddons,
  attachEffectiveAddons,
  now,
  parseItemJson,
  parseRowJson,
  withTxn,
} from '../db';
import {
  calculateConfiguredChargeTaxes,
  calculateItemTax,
  combineItemAndChargeTaxes,
  getConfiguredChargeTaxCategories,
} from './tax';
import { assertStockAvailable, decrementTrackedStock, type StockTrackedProduct } from './inventory';
import { consumeRecipeForOrderItem } from './recipe-consumption';
import { assertTableCanOpen, markTableOccupiedCas, TableServiceError } from './tables';
import { isModuleEnabled } from '../modules';
import { dualFromMajor, fromCents, productPriceCents } from '../lib/money';
import { logAuditEvent } from './audit-log';
import { notifyKdsUpdate } from './kds';
import { cloudSync } from './cloud-sync';
import { correlationId } from '../errors';

export const QR_GUEST_USER_ID = 'usr-system-qr-guest';

export type QrMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_id: string | null;
  category_name: string | null;
};

export type QrSession = {
  table_id: string;
  table_number: string;
  cafe_name: string;
  pay_at_counter: true;
};

export function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

export function ensureTableQrToken(db: Database.Database, tableId: string): string {
  const row = db.prepare('SELECT qr_token FROM tables WHERE id = ?').get(tableId) as
    { qr_token: string | null } | undefined;
  if (!row) {
    throw Object.assign(new Error('Table not found'), { status: 404 });
  }
  if (row.qr_token) return row.qr_token;
  const token = generateQrToken();
  db.prepare('UPDATE tables SET qr_token = ?, updated_at = ? WHERE id = ?').run(
    token,
    now(),
    tableId,
  );
  return token;
}

export function rotateTableQrToken(
  db: Database.Database,
  tableId: string,
  actorUserId: string | null,
): string {
  const exists = db.prepare('SELECT id FROM tables WHERE id = ?').get(tableId);
  if (!exists) {
    throw Object.assign(new Error('Table not found'), { status: 404 });
  }
  const token = generateQrToken();
  db.prepare('UPDATE tables SET qr_token = ?, updated_at = ? WHERE id = ?').run(
    token,
    now(),
    tableId,
  );
  logAuditEvent({
    actorUserId,
    action: 'table.qr_token_rotated',
    entityType: 'table',
    entityId: tableId,
    result: 'success',
    metadata: {},
    context: { requestId: correlationId() },
  });
  return token;
}

export function resolveTableByQrToken(
  db: Database.Database,
  token: string,
): { id: string; number: string } {
  if (!token || typeof token !== 'string' || token.length < 16) {
    throw Object.assign(new Error('Invalid QR token'), { status: 401 });
  }
  const row = db
    .prepare(
      `SELECT id, number FROM tables
       WHERE qr_token = ? AND COALESCE(is_active, 1) = 1`,
    )
    .get(token) as { id: string; number: string } | undefined;
  if (!row) {
    throw Object.assign(new Error('QR token not found or revoked'), { status: 401 });
  }
  return row;
}

export function getQrSession(db: Database.Database, token: string): QrSession {
  const table = resolveTableByQrToken(db, token);
  const cafeName = getSettingValue('business_name') || getSettingValue('cafe_name') || 'Café';
  return {
    table_id: table.id,
    table_number: table.number,
    cafe_name: cafeName,
    pay_at_counter: true,
  };
}

export function listQrMenu(db: Database.Database, token: string): QrMenuItem[] {
  resolveTableByQrToken(db, token);
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.price, p.category_id, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL
         AND p.is_active = 1
         AND (c.id IS NULL OR c.is_active = 1)
       ORDER BY c.name COLLATE NOCASE, p.name COLLATE NOCASE`,
    )
    .all() as Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    category_id: string | null;
    category_name: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    price: Number(r.price) || 0,
    category_id: r.category_id,
    category_name: r.category_name,
  }));
}

type GuestItem = {
  product_id: string;
  quantity: number;
  special_instructions?: string;
};

function asTaxProduct(product: Record<string, unknown>) {
  return product as any;
}

export function createQrGuestOrder(
  db: Database.Database,
  input: {
    token: string;
    items: GuestItem[];
    guest_count?: number | null;
    special_instructions?: string | null;
    clientIp?: string | null;
  },
): { order: Record<string, unknown>; orderItems: unknown[] } {
  const table = resolveTableByQrToken(db, input.token);
  if (!Array.isArray(input.items) || input.items.length < 1) {
    throw Object.assign(new Error('At least one item is required'), { status: 400 });
  }
  for (const item of input.items) {
    if (
      !item.product_id ||
      !item.quantity ||
      item.quantity <= 0 ||
      !Number.isFinite(item.quantity)
    ) {
      throw Object.assign(new Error('Invalid item quantity'), { status: 400 });
    }
  }

  const result = withTxn(() => {
    if (isModuleEnabled('tables')) {
      assertTableCanOpen(db, table.id);
    }

    const orderNumber = generateOrderNumber();
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
      packaging_charge: 0,
      delivery_charge: 0,
      service_charge: 0,
      packaging_tax_category_id: chargeCategories.packaging?.categoryId || null,
      delivery_tax_category_id: chargeCategories.delivery?.categoryId || null,
      service_charge_tax_category_id: chargeCategories.service_charge?.categoryId || null,
    };

    const ts = now();
    const packagingDual = dualFromMajor(0);
    const deliveryDual = dualFromMajor(0);
    const orderResult = db
      .prepare(
        `
      INSERT INTO orders (order_number, table_id, customer_id, user_id, type, guest_count, special_instructions,
        packaging_charge, delivery_charge, packaging_charge_cents, delivery_charge_cents,
        packaging_tax_category_id, delivery_tax_category_id,
        service_charge_tax_category_id, status, shift_id, created_at, updated_at)
      VALUES (?, ?, NULL, ?, 'dine_in', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
    `,
      )
      .run(
        orderNumber,
        table.id,
        QR_GUEST_USER_ID,
        input.guest_count || null,
        input.special_instructions || null,
        packagingDual.major,
        deliveryDual.major,
        packagingDual.cents,
        deliveryDual.cents,
        chargeContext.packaging_tax_category_id,
        chargeContext.delivery_tax_category_id,
        chargeContext.service_charge_tax_category_id,
        ts,
        ts,
      );

    const orderId = orderResult.lastInsertRowid;
    let subtotal = 0;
    let totalTax = 0;
    let exclusiveTax = 0;
    const allTaxBreakdowns: unknown[] = [];
    const allTaxSnapshots: (string | null)[] = [];

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity,
        subtotal, tax_amount, tax_breakdown, tax_snapshot, tax_type, discount_amount, total,
        unit_price_cents, subtotal_cents, tax_amount_cents, discount_amount_cents, total_cents,
        variant_selection,
        modifier_selection, special_instructions, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    for (const item of input.items) {
      const product = db
        .prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL')
        .get(item.product_id) as Record<string, unknown> | undefined;
      if (!product || Number(product.is_active) !== 1) {
        throw Object.assign(new Error(`Product unavailable: ${item.product_id}`), { status: 400 });
      }
      assertStockAvailable(product as unknown as StockTrackedProduct, item.quantity);

      const unitPrice = fromCents(
        productPriceCents(product as { price_cents?: unknown; price?: unknown }),
      );
      const quantity = item.quantity;
      const itemSubtotal = Math.max(0, unitPrice * quantity);
      const taxResult = calculateItemTax(tenantInfo, asTaxProduct(product), itemSubtotal, null);
      totalTax += taxResult.tax_amount;
      if (taxResult.tax_type !== 'inclusive') exclusiveTax += taxResult.tax_amount;
      if (taxResult.tax_breakdown) allTaxBreakdowns.push(taxResult.tax_breakdown);
      const itemTaxSnapshotJson = taxResult.tax_snapshot
        ? JSON.stringify(taxResult.tax_snapshot)
        : null;
      allTaxSnapshots.push(itemTaxSnapshotJson);
      const itemTotal =
        itemSubtotal + (taxResult.tax_type === 'inclusive' ? 0 : taxResult.tax_amount);
      subtotal += itemSubtotal;

      const unitDual = dualFromMajor(unitPrice);
      const subDual = dualFromMajor(itemSubtotal);
      const taxDual = dualFromMajor(taxResult.tax_amount);
      const discountDual = dualFromMajor(0);
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
        JSON.stringify(null),
        JSON.stringify(null),
        item.special_instructions || null,
        ts,
        ts,
      );
      insertOrderItemAddons(db, insertItemResult.lastInsertRowid, undefined, ts);
      decrementTrackedStock(db, product as unknown as StockTrackedProduct, quantity, ts, {
        referenceType: 'order',
        referenceId: orderId,
      });
      consumeRecipeForOrderItem(db, {
        orderId: String(orderId),
        orderItemId: Number(insertItemResult.lastInsertRowid),
        menuProductId: String(product.id),
        portions: quantity,
        actorUserId: QR_GUEST_USER_ID,
      });
    }

    const chargeTaxes = calculateConfiguredChargeTaxes(tenantInfo, chargeContext, null);
    const taxRollup = combineItemAndChargeTaxes({
      itemTaxAmount: totalTax,
      itemExclusiveTaxAmount: exclusiveTax,
      itemBreakdowns: allTaxBreakdowns,
      itemSnapshots: allTaxSnapshots,
      itemTaxRatio: 1,
      chargeTaxes,
    });
    const preRoundTotal = subtotal + taxRollup.exclusiveTaxAmount;
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
      ts,
      orderId,
    );

    if (isModuleEnabled('tables')) {
      markTableOccupiedCas(db, table.id, ts);
    }

    const order = parseRowJson(
      db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId),
    ) as Record<string, unknown>;
    const orderItems = attachEffectiveAddons(
      db,
      db
        .prepare('SELECT * FROM order_items WHERE order_id = ?')
        .all(orderId)
        .map(parseItemJson) as any[],
    );
    return { order, orderItems };
  });

  if (isModuleEnabled('kds')) notifyKdsUpdate();
  cloudSync.recordOrderChanged(result.order.id as string | number, 'order.created');
  logAuditEvent({
    actorUserId: QR_GUEST_USER_ID,
    action: 'order.created',
    entityType: 'order',
    entityId: String(result.order.id),
    result: 'success',
    metadata: {
      type: 'dine_in',
      source: 'qr_guest',
      table_id: table.id,
      item_count: input.items.length,
      pay_at_counter: true,
    },
    context: {
      requestId: correlationId(),
      clientIp: input.clientIp || null,
    },
  });

  return result;
}

export function getQrOrderStatus(
  db: Database.Database,
  token: string,
  orderId: string | number,
): { id: number; status: string; table_id: string; total: number; pay_at_counter: true } {
  const table = resolveTableByQrToken(db, token);
  const order = db
    .prepare(`SELECT id, status, table_id, total FROM orders WHERE id = ? AND table_id = ?`)
    .get(orderId, table.id) as
    { id: number; status: string; table_id: string; total: number } | undefined;
  if (!order) {
    throw Object.assign(new Error('Order not found'), { status: 404 });
  }
  return { ...order, pay_at_counter: true };
}

export function statusFromError(err: unknown): number {
  if (err instanceof TableServiceError) return err.statusCode || 409;
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') return status;
  return 500;
}

export function messageFromError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Internal server error';
}

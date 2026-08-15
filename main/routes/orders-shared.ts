/**
 * R4.1 — shared helpers for order routes (behavior unchanged).
 */
import { Request } from 'express';

export type AuthUser = { userId: string; role: string; email?: string };
export type AuthenticatedRequest = Request & { user?: AuthUser };

export interface OrderRow {
  id: string | number;
  user_id?: string | number | null;
  status?: string | null;
  type?: string | null;
  table_id?: string | number | null;
  customer_id?: string | number | null;
  discount_type?: string | null;
  discount_amount?: number | null;
  discount_value?: number | null;
  subtotal?: number | null;
  subtotal_cents?: number | null;
  tax_amount?: number | null;
  tax_amount_cents?: number | null;
  total?: number | null;
  total_cents?: number | null;
  [key: string]: unknown;
}

export interface OrderItemRow {
  id: number | string;
  order_id?: string | number;
  product_id?: string | number;
  unit_price?: number | null;
  unit_price_cents?: number | null;
  quantity?: number | null;
  subtotal?: number | null;
  subtotal_cents?: number | null;
  tax_amount?: number | null;
  tax_amount_cents?: number | null;
  discount_amount?: number | null;
  total?: number | null;
  total_cents?: number | null;
  status?: string | null;
  tax_breakdown?: string | null;
  [key: string]: unknown;
}

export function getAuthUser(req: Request): AuthUser | undefined {
  return (req as AuthenticatedRequest).user;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorStatus(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown })?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

import {
  getDatabase,
  now,
  parseItemJson,
  parseRowJson,
  attachEffectiveAddons,
} from '../db';

const MAX_ORDER_IDEMPOTENCY_KEY_LENGTH = 128;

export function orderIdempotencyKey(req: Request): string | null {
  const supplied = req.get('Idempotency-Key')?.trim();
  if (!supplied) return null;
  if (supplied.length > MAX_ORDER_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(supplied)) {
    throw Object.assign(new Error('Idempotency-Key is invalid or too long'), { statusCode: 400 });
  }
  return supplied;
}

// Rate limiting for PIN validation (simple in-memory)
const pinAttempts = new Map<string, { count: number; resetAt: number }>();
const PIN_MAX_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkPinRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = pinAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    pinAttempts.set(key, { count: 1, resetAt: now + PIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= PIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export function syncCustomerTagCounts(
  db: { prepare: (sql: string) => { get: (...a: unknown[]) => unknown; run: (...a: unknown[]) => unknown } },
  customerId: string,
  items: { product_id: string; quantity: number }[],
) {
  const row = db.prepare('SELECT tag_counts FROM customers WHERE id = ?').get(customerId) as { tag_counts?: string | null } | undefined;
  if (!row) return;
  let counts: Record<string, number> = {};
  try {
    counts = row.tag_counts ? JSON.parse(row.tag_counts) : {};
  } catch {
    counts = {};
  }
  for (const item of items) {
    const product = db
      .prepare('SELECT tags FROM products WHERE id = ?')
      .get(item.product_id) as any;
    if (!product?.tags) continue;
    let tags: string[] = [];
    try {
      tags = JSON.parse(product.tags);
    } catch {
      continue;
    }
    for (const tag of tags) {
      if (tag && typeof tag === 'string') counts[tag] = (counts[tag] || 0) + (item.quantity || 1);
    }
  }
  db.prepare('UPDATE customers SET tag_counts = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(counts),
    now(),
    customerId,
  );
}

export function validateItemAddonGroupLimits(
  db: ReturnType<typeof getDatabase>,
  productId: string,
  addons: any[] | null | undefined,
): void {
  const addonList = Array.isArray(addons) ? addons : [];

  for (const addon of addonList) {
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
  }

  const groupSelections = new Map<string, { totalQty: number; hasMultiQty: boolean }>();

  for (const addon of addonList) {
    if (!addon) continue;
    let groupId: string | null = addon.addon_group_id || null;
    if (!groupId && addon.id) {
      const dbAddon = db.prepare('SELECT addon_group_id FROM addons WHERE id = ?').get(addon.id) as
        { addon_group_id: string } | undefined;
      if (dbAddon) groupId = dbAddon.addon_group_id;
    }

    if (groupId) {
      const qty = Math.max(1, Math.floor(addon.quantity || 1));
      const current = groupSelections.get(groupId) || { totalQty: 0, hasMultiQty: false };
      groupSelections.set(groupId, {
        totalQty: current.totalQty + qty,
        hasMultiQty: current.hasMultiQty || qty > 1,
      });
    }
  }

  for (const [groupId, selection] of groupSelections.entries()) {
    const group = db
      .prepare('SELECT * FROM addon_groups WHERE id = ? AND is_active = 1')
      .get(groupId) as any;
    if (!group) continue;

    if (!group.allow_multiple_quantities && selection.hasMultiQty) {
      throw new Error(`Add-on group "${group.name}" does not allow multiple quantities`);
    }

    if (
      group.max_selection !== null &&
      group.max_selection !== undefined &&
      selection.totalQty > group.max_selection
    ) {
      throw new Error(
        `Total add-on quantity for group "${group.name}" exceeds maximum allowed (${group.max_selection})`,
      );
    }

    if (group.min_selection && selection.totalQty < group.min_selection) {
      throw new Error(
        `Selection for group "${group.name}" requires at least ${group.min_selection} item(s)`,
      );
    }
  }

  const requiredGroups = db
    .prepare(
      `
      SELECT ag.*
      FROM addon_groups ag
      INNER JOIN addon_group_product agp ON agp.addon_group_id = ag.id
      WHERE agp.product_id = ?
        AND ag.is_active = 1
        AND (ag.is_required = 1 OR COALESCE(ag.min_selection, 0) > 0)
    `,
    )
    .all(productId) as any[];

  for (const group of requiredGroups) {
    const totalQty = groupSelections.get(group.id)?.totalQty || 0;
    const minRequired = Math.max(group.is_required ? 1 : 0, Number(group.min_selection) || 0);
    if (totalQty < minRequired) {
      throw new Error(
        group.is_required
          ? `Add-on group "${group.name}" is required`
          : `Selection for group "${group.name}" requires at least ${minRequired} item(s)`,
      );
    }
  }
}

export function lookupOrderIdempotencyReplay(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  idempotencyKey: string,
  requestHash: string,
): { replay: true; response: any } | { replay: false } {
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
    .get(userId, idempotencyKey, userId) as
    { request_hash: string; response_json: string } | undefined;
  if (!prior) return { replay: false };
  if (prior.request_hash !== requestHash) {
    throw Object.assign(new Error('Idempotency-Key was already used for a different request'), {
      statusCode: 409,
    });
  }
  try {
    return { replay: true, response: JSON.parse(prior.response_json) };
  } catch {
    throw Object.assign(new Error('Stored order response is invalid'), { statusCode: 500 });
  }
}

export function storeOrderIdempotency(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  response: unknown,
): void {
  db.prepare(
    'INSERT INTO order_idempotency (user_id, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(userId, idempotencyKey, requestHash, JSON.stringify(response), now());
}


export function batchHydrateOrders(db: ReturnType<typeof getDatabase>, orders: any[]) {
  if (orders.length === 0) return [];
  // Normalize JSON text columns (tax_breakdown/tax_snapshot on orders and
  // items) so the list endpoint matches GET /orders/:id. parseRowJson is
  // idempotent, so the /:id path passing an already-parsed row is fine.
  const parsedOrders = orders.map(parseRowJson);
  const ids = parsedOrders.map((o) => o.id);
  const tableIds = Array.from(new Set(parsedOrders.map((o: any) => o.table_id).filter(Boolean)));
  const customerIds = Array.from(
    new Set(parsedOrders.map((o: any) => o.customer_id).filter(Boolean)),
  );

  const orderIdsCsv = `(${ids.map(() => '?').join(',')})`;
  const itemsRows = db
    .prepare(`SELECT * FROM order_items WHERE order_id IN ${orderIdsCsv} ORDER BY order_id, id`)
    .all(...ids)
    .map(parseItemJson);
  // #208: a single call to attachEffectiveAddons batches all addons across
  // all items into one IN() query against order_item_addons. Re-group the
  // result back by order_id for the per-order payload below.
  const itemsWithAddons = attachEffectiveAddons(db, itemsRows as any[]);
  const itemsByOrder = new Map<number, any[]>();
  for (const it of itemsWithAddons) {
    const list = itemsByOrder.get(it.order_id) || [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  const tablesById = new Map<string, any>();
  if (tableIds.length > 0) {
    const ph = tableIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM tables WHERE id IN (${ph})`).all(...tableIds) as any[];
    for (const t of rows) tablesById.set(t.id, t);
  }
  const customersById = new Map<string, any>();
  if (customerIds.length > 0) {
    const ph = customerIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM customers WHERE id IN (${ph})`).all(...customerIds);
    for (const c of rows as any[]) customersById.set(c.id, parseRowJson(c));
  }
  const billsByOrderId = new Map<number, any[]>();
  const billsById = new Map<number, any>();
  const billRows = db
    .prepare(`SELECT * FROM bills WHERE order_id IN ${orderIdsCsv}`)
    .all(...ids) as any[];
  for (const b of billRows) {
    const parsed = parseRowJson(b);
    const siblings = billsByOrderId.get(parsed.order_id) || [];
    siblings.push(parsed);
    billsByOrderId.set(parsed.order_id, siblings);
    billsById.set(parsed.id, parsed);
  }
  const ledgerByBillId = new Map<number, number>();
  if (billsById.size > 0) {
    const billIds = Array.from(billsById.keys());
    const ph = billIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT bill_id, COALESCE(SUM(amount),0) as total FROM loyalty_ledger WHERE bill_id IN (${ph}) AND type = 'credit' GROUP BY bill_id`,
      )
      .all(...billIds) as { bill_id: number; total: number }[];
    for (const r of rows) ledgerByBillId.set(r.bill_id, r.total);
  }

  return parsedOrders.map((order) => {
    const itemList = itemsByOrder.get(order.id) || [];
    const tableRow = order.table_id ? tablesById.get(order.table_id) : null;
    const table = tableRow ? { ...tableRow, name: tableRow.number } : null;
    const customer = order.customer_id ? customersById.get(order.customer_id) : null;
    const bills = billsByOrderId.get(order.id) || [];
    for (const billRow of bills) {
      if (billRow.customer_id) billRow.points_earned = ledgerByBillId.get(billRow.id) || 0;
    }
    const bill = bills.find((row) => row.payment_status !== 'paid') || bills[0] || null;
    return { ...order, items: itemList, table, customer, bill, bills };
  });
}


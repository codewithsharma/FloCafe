/**
 * R7 Customer & CRM OS — Customer 360, preferences, metrics.
 * Orders remain SoR; money uses prefer-cents readers. No second customer model.
 */

import type Database from 'better-sqlite3';
import { getDatabase, getSettingValue, now } from '../db';
import { preferCents, sumCents } from '../lib/money';
import {
  explainSegments,
  loadCrmSegmentRules,
  type CrmSegmentRules,
  type ExplainedSegment,
} from './customer-segments';

type Db = Database.Database;

function getWalletBalancePoints(db: Db, customerId: string): number {
  const credits = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE customer_id = ? AND type = 'credit'`,
    )
    .get(customerId) as { total: number };
  const debits = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE customer_id = ? AND type = 'debit'`,
    )
    .get(customerId) as { total: number };
  return Math.max(0, Number(credits.total || 0) - Number(debits.total || 0));
}

export class CustomerCrmError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface OrderMoneyRow {
  id: number | string;
  order_number?: string;
  type?: string | null;
  status?: string | null;
  total?: unknown;
  total_cents?: unknown;
  created_at?: string | null;
  cancelled_at?: string | null;
}

function orderTotalCents(row: OrderMoneyRow): number {
  return preferCents(row.total_cents, row.total ?? 0);
}

function daysBetween(isoLater: string, isoEarlier: string): number {
  const a = Date.parse(isoLater.replace(' ', 'T') + 'Z');
  const b = Date.parse(isoEarlier.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((a - b) / (24 * 60 * 60 * 1000)));
}

function parseTagCounts(raw: unknown): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, number>;
  }
  try {
    const v = JSON.parse(String(raw));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function getCustomerOrderStats(db: Db, customerId: string) {
  const orders = db
    .prepare(
      `
    SELECT id, order_number, type, status, total, total_cents, created_at, cancelled_at
    FROM orders
    WHERE customer_id = ?
    ORDER BY created_at ASC
  `,
    )
    .all(customerId) as OrderMoneyRow[];

  const nonCancelled = orders.filter((o) => String(o.status || '') !== 'cancelled');
  const cancelled = orders.filter((o) => String(o.status || '') === 'cancelled');
  const spendCents = sumCents(nonCancelled.map(orderTotalCents));
  const orderCount = nonCancelled.length;
  const avgCents = orderCount > 0 ? Math.round(spendCents / orderCount) : 0;

  const typeCounts = new Map<string, number>();
  for (const o of nonCancelled) {
    const t = String(o.type || 'unknown');
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  let preferredType: string | null = null;
  let preferredCount = 0;
  for (const [t, c] of typeCounts) {
    if (c > preferredCount) {
      preferredType = t;
      preferredCount = c;
    }
  }

  const first = orders[0] || null;
  const latest = orders.length ? orders[orders.length - 1] : null;
  const ts = now();
  const daysSinceLast = latest?.created_at ? daysBetween(ts, latest.created_at) : null;

  return {
    orders,
    nonCancelled,
    cancelledCount: cancelled.length,
    orderCount,
    totalSpendCents: spendCents,
    averageOrderCents: avgCents,
    firstOrder: first,
    latestOrder: latest,
    preferredOrderType: preferredType,
    daysSinceLastOrder: daysSinceLast,
  };
}

export function getCustomerRefundedCents(db: Db, customerId: string): number {
  // refunds.amount_cents preferred; join via bills.customer_id
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(COALESCE(r.amount_cents, CAST(ROUND(COALESCE(r.amount, 0) * 100) AS INTEGER))), 0) AS cents
    FROM refunds r
    INNER JOIN bills b ON b.id = r.bill_id
    WHERE b.customer_id = ? AND r.status = 'completed'
  `,
    )
    .get(customerId) as { cents: number } | undefined;
  return Number(row?.cents || 0);
}

export function getOrdersInWindow(db: Db, customerId: string, windowDays: number): number {
  const row = db
    .prepare(
      `
    SELECT COUNT(*) AS c FROM orders
    WHERE customer_id = ?
      AND status != 'cancelled'
      AND created_at >= datetime('now', ?)
  `,
    )
    .get(customerId, `-${Math.max(1, windowDays)} days`) as { c: number };
  return Number(row?.c || 0);
}

export function derivePreferences(db: Db, customerId: string, preferredOrderType: string | null) {
  const customer = db.prepare('SELECT tag_counts FROM customers WHERE id = ?').get(customerId) as
    { tag_counts?: unknown } | undefined;
  const tagCounts = parseTagCounts(customer?.tag_counts);

  const favoriteTags = Object.entries(tagCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count: Number(count) }));

  const itemRows = db
    .prepare(
      `
    SELECT oi.product_id AS product_id, oi.product_name AS product_name,
      SUM(oi.quantity) AS qty
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_id = ? AND o.status != 'cancelled' AND oi.status != 'cancelled'
    GROUP BY oi.product_id, oi.product_name
    ORDER BY qty DESC
    LIMIT 8
  `,
    )
    .all(customerId) as Array<{ product_id: string; product_name: string; qty: number }>;

  const categoryRows = db
    .prepare(
      `
    SELECT p.category_id AS category_id, COALESCE(cat.name, p.category_id) AS category_name,
      SUM(oi.quantity) AS qty
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    INNER JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE o.customer_id = ? AND o.status != 'cancelled' AND oi.status != 'cancelled'
      AND p.category_id IS NOT NULL
    GROUP BY p.category_id, category_name
    ORDER BY qty DESC
    LIMIT 8
  `,
    )
    .all(customerId) as Array<{ category_id: string; category_name: string; qty: number }>;

  return {
    preferred_order_type: preferredOrderType,
    favorite_items: itemRows.map((r) => ({
      product_id: r.product_id,
      name: r.product_name,
      quantity: Number(r.qty),
    })),
    favorite_categories: categoryRows.map((r) => ({
      category_id: r.category_id,
      name: r.category_name,
      quantity: Number(r.qty),
    })),
    tag_counts: tagCounts,
    top_tags: favoriteTags,
  };
}

export function listCustomerNotes(db: Db, customerId: string, includeDeleted = false) {
  if (includeDeleted) {
    return db
      .prepare(
        `SELECT * FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`,
      )
      .all(customerId);
  }
  return db
    .prepare(
      `SELECT * FROM customer_notes WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
    )
    .all(customerId);
}

export function buildCustomer360(customerId: string, opts?: { recentLimit?: number }) {
  const db = getDatabase();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as
    Record<string, unknown> | undefined;
  if (!customer) {
    throw new CustomerCrmError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
  }

  const rules = loadCrmSegmentRules();
  const stats = getCustomerOrderStats(db, customerId);
  const refundedCents = getCustomerRefundedCents(db, customerId);
  const ordersInWindow = getOrdersInWindow(db, customerId, rules.frequent_window_days);
  const segments = explainSegments(
    {
      orderCount: stats.orderCount,
      cancelledCount: stats.cancelledCount,
      totalSpendCents: stats.totalSpendCents,
      ordersInWindow,
      daysSinceLastOrder: stats.daysSinceLastOrder,
      isActive: Number(customer.is_active) === 1,
    },
    rules,
  );

  const recentLimit = opts?.recentLimit ?? 20;
  const recentOrders = [...stats.orders].reverse().slice(0, recentLimit);
  const preferences = derivePreferences(db, customerId, stats.preferredOrderType);
  const notes = listCustomerNotes(db, customerId);
  const walletBalance = getWalletBalancePoints(db, customerId);
  const loyaltyHistory = db
    .prepare(`SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`)
    .all(customerId);

  const frequency =
    stats.orderCount <= 1 || !stats.firstOrder?.created_at || !stats.latestOrder?.created_at
      ? null
      : {
          orders: stats.orderCount,
          span_days: Math.max(
            1,
            daysBetween(stats.latestOrder.created_at, stats.firstOrder.created_at),
          ),
          orders_per_30_days:
            Math.round(
              (stats.orderCount /
                Math.max(
                  1,
                  daysBetween(stats.latestOrder.created_at, stats.firstOrder.created_at),
                )) *
                30 *
                100,
            ) / 100,
        };

  return {
    profile: {
      ...customer,
      tag_counts: parseTagCounts(customer.tag_counts),
      status: Number(customer.is_active) === 1 ? 'active' : 'archived',
    },
    orders: {
      total_orders: stats.orderCount,
      cancelled_orders: stats.cancelledCount,
      first_order: stats.firstOrder,
      latest_order: stats.latestOrder,
      preferred_order_type: stats.preferredOrderType,
      recent_orders: recentOrders,
      frequency,
      orders_in_window: ordersInWindow,
      window_days: rules.frequent_window_days,
    },
    spending: {
      total_spend_cents: stats.totalSpendCents,
      average_order_cents: stats.averageOrderCents,
      refunded_cents: refundedCents,
      net_spend_cents: Math.max(0, stats.totalSpendCents - refundedCents),
    },
    preferences,
    loyalty: {
      enabled: getSettingValue('loyalty_enabled') === 'true',
      balance_points: walletBalance,
      recent_ledger: loyaltyHistory,
    },
    notes,
    segments,
    segment_rules: rules,
    activity: buildActivityTimeline(db, customerId, recentOrders, loyaltyHistory, notes),
  };
}

function buildActivityTimeline(
  _db: Db,
  _customerId: string,
  recentOrders: OrderMoneyRow[],
  loyaltyHistory: unknown[],
  notes: unknown[],
) {
  const events: Array<{ at: string; kind: string; summary: string; ref?: unknown }> = [];
  for (const o of recentOrders.slice(0, 15)) {
    events.push({
      at: String(o.created_at || ''),
      kind: 'order',
      summary: `Order ${o.order_number || o.id} (${o.status})`,
      ref: { order_id: o.id },
    });
  }
  for (const row of loyaltyHistory.slice(0, 10) as Array<Record<string, unknown>>) {
    events.push({
      at: String(row.created_at || ''),
      kind: 'loyalty',
      summary: `${row.type} ${row.amount} pts`,
      ref: { ledger_id: row.id },
    });
  }
  for (const n of notes.slice(0, 10) as Array<Record<string, unknown>>) {
    events.push({
      at: String(n.created_at || ''),
      kind: 'note',
      summary: 'Customer note',
      ref: { note_id: n.id },
    });
  }
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return events.slice(0, 40);
}

export function getCrmMetrics(opts?: { topLimit?: number }) {
  const db = getDatabase();
  const rules = loadCrmSegmentRules();
  const topLimit = opts?.topLimit ?? 10;

  const totals = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total_customers,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_customers,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS archived_customers
    FROM customers
  `,
    )
    .get() as {
    total_customers: number;
    active_customers: number;
    archived_customers: number;
  };

  const customers = db.prepare(`SELECT id, is_active, created_at FROM customers`).all() as Array<{
    id: string;
    is_active: number;
    created_at: string;
  }>;

  let newCustomers = 0;
  let returningCustomers = 0;
  let inactiveCustomers = 0;
  let highValueCustomers = 0;
  let customerRevenueCents = 0;
  const spenders: Array<{ customer_id: string; spend_cents: number; order_count: number }> = [];

  for (const c of customers) {
    const stats = getCustomerOrderStats(db, c.id);
    const ordersInWindow = getOrdersInWindow(db, c.id, rules.frequent_window_days);
    const segs = explainSegments(
      {
        orderCount: stats.orderCount,
        cancelledCount: stats.cancelledCount,
        totalSpendCents: stats.totalSpendCents,
        ordersInWindow,
        daysSinceLastOrder: stats.daysSinceLastOrder,
        isActive: Number(c.is_active) === 1,
      },
      rules,
    );
    if (segs.some((s) => s.id === 'new')) newCustomers += 1;
    if (segs.some((s) => s.id === 'returning')) returningCustomers += 1;
    if (segs.some((s) => s.id === 'inactive')) inactiveCustomers += 1;
    if (segs.some((s) => s.id === 'high_value')) highValueCustomers += 1;
    customerRevenueCents += stats.totalSpendCents;
    if (stats.totalSpendCents > 0) {
      spenders.push({
        customer_id: c.id,
        spend_cents: stats.totalSpendCents,
        order_count: stats.orderCount,
      });
    }
  }

  spenders.sort((a, b) => b.spend_cents - a.spend_cents);
  const top = spenders.slice(0, topLimit).map((s) => {
    const profile = db
      .prepare('SELECT id, name, phone, email FROM customers WHERE id = ?')
      .get(s.customer_id);
    return { ...s, customer: profile };
  });

  const active = Number(totals.active_customers || 0);
  return {
    total_customers: Number(totals.total_customers || 0),
    active_customers: active,
    archived_customers: Number(totals.archived_customers || 0),
    new_customers: newCustomers,
    returning_customers: returningCustomers,
    inactive_customers: inactiveCustomers,
    high_value_customers: highValueCustomers,
    customer_revenue_cents: customerRevenueCents,
    average_customer_spend_cents: active > 0 ? Math.round(customerRevenueCents / active) : 0,
    top_customers: top,
    segment_rules: rules as CrmSegmentRules,
  };
}

export function customerMatchesSegment(
  customerId: string,
  segmentId: string,
  rules?: CrmSegmentRules,
): boolean {
  const db = getDatabase();
  const customer = db.prepare('SELECT is_active FROM customers WHERE id = ?').get(customerId) as
    { is_active: number } | undefined;
  if (!customer) return false;
  const r = rules || loadCrmSegmentRules();
  const stats = getCustomerOrderStats(db, customerId);
  const ordersInWindow = getOrdersInWindow(db, customerId, r.frequent_window_days);
  const segs = explainSegments(
    {
      orderCount: stats.orderCount,
      cancelledCount: stats.cancelledCount,
      totalSpendCents: stats.totalSpendCents,
      ordersInWindow,
      daysSinceLastOrder: stats.daysSinceLastOrder,
      isActive: Number(customer.is_active) === 1,
    },
    r,
  );
  return segs.some((s: ExplainedSegment) => s.id === segmentId);
}

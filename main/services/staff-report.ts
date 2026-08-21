/**
 * RPT-STAFF — Staff performance / activity report (no schema change).
 *
 * Attribution model (persisted only — do not invent cashier/waiter sales):
 *   orders_created              → orders.user_id (creator; exclude cancelled + QR guest)
 *   sales_from_orders_created   → settled bill.total joined to orders.user_id
 *                                 (creator attribution — NOT cashier/waiter)
 *   payments_received_*         → audit_logs payment.received actor_user_id + metadata.amount_cents
 *   refunds_*                   → refunds.created_by (completed)
 *   discounts_applied_count     → audit order.discount_applied + order.item_discount_applied
 *   voids_cancels_count         → audit order.cancelled | item_cancelled | item_voided
 *   shifts_opened / closed      → shifts.opened_by_user_id / closed_by_user_id
 *
 * Unsupported (intentionally omitted): attendance, tips, commissions, waiter-attributed
 * sales, payment_details cashier (no actor column).
 */
import type Database from 'better-sqlite3';
import { utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { queryDaySalesSemantics, type DaySalesSemantics } from './day-sales-semantics';
import { VOID_CANCEL_ACTIONS } from './void-cancel-report';

export const QR_GUEST_USER_ID = 'usr-system-qr-guest';

const SETTLED_BILL_SQL = `
  (
    b.payment_status IN ('paid', 'partially_refunded', 'refunded')
    OR (
      b.payment_status = 'partial'
      AND ROUND(b.total * 100) <= COALESCE((
        SELECT SUM(
          CASE
            WHEN typeof(json_extract(je.value, '$.amount')) IN ('integer', 'real')
              THEN ROUND(json_extract(je.value, '$.amount') * 100)
            ELSE 0
          END
        )
        FROM json_each(CASE
          WHEN json_valid(b.payment_details) AND json_type(b.payment_details) = 'array'
            THEN b.payment_details
          WHEN json_valid(b.payment_details)
            THEN json_array(b.payment_details)
          ELSE '[]'
        END) je
        WHERE json_type(je.value) = 'object'
      ), 0)
    )
  )
`;

export type StaffReportAttribution = {
  orders_created: string;
  sales_from_orders_created: string;
  payments_received: string;
  refunds: string;
  discounts_applied: string;
  voids_cancels: string;
  shifts: string;
};

export const STAFF_REPORT_ATTRIBUTION: StaffReportAttribution = {
  orders_created: 'orders.user_id (order creator; excludes cancelled and QR guest)',
  sales_from_orders_created:
    'settled bills.total via orders.user_id — creator attribution, not cashier or waiter',
  payments_received: 'audit_logs action=payment.received actor_user_id + metadata.amount_cents',
  refunds: 'refunds.created_by where status=completed',
  discounts_applied: 'audit_logs order.discount_applied + order.item_discount_applied',
  voids_cancels: 'audit_logs order.cancelled | order.item_cancelled | order.item_voided',
  shifts: 'shifts.opened_by_user_id / closed_by_user_id',
};

export type StaffReportRow = {
  staff_id: string;
  staff_name: string;
  role: string;
  orders_created: number;
  sales_from_orders_created: number;
  payments_received_count: number;
  payments_received_amount: number;
  refunds_count: number;
  refunds_amount: number;
  discounts_applied_count: number;
  voids_cancels_count: number;
  shifts_opened: number;
  shifts_closed: number;
};

export type StaffReport = {
  startDate: string;
  endDate: string;
  attribution: StaffReportAttribution;
  by_staff: StaffReportRow[];
  totals: {
    staff_count: number;
    orders_created: number;
    sales_from_orders_created: number;
    payments_received_count: number;
    payments_received_amount: number;
    refunds_count: number;
    refunds_amount: number;
    discounts_applied_count: number;
    voids_cancels_count: number;
    shifts_opened: number;
    shifts_closed: number;
  };
  sales: DaySalesSemantics;
};

export const STAFF_CSV_HEADERS = [
  'start_date',
  'end_date',
  'staff_id',
  'staff_name',
  'role',
  'orders_created',
  'sales_from_orders_created',
  'payments_received_count',
  'payments_received_amount',
  'refunds_count',
  'refunds_amount',
  'discounts_applied_count',
  'voids_cancels_count',
  'shifts_opened',
  'shifts_closed',
] as const;

export type StaffCsvHeader = (typeof STAFF_CSV_HEADERS)[number];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type Acc = {
  orders_created: number;
  sales_from_orders_created: number;
  payments_received_count: number;
  payments_received_amount: number;
  refunds_count: number;
  refunds_amount: number;
  discounts_applied_count: number;
  voids_cancels_count: number;
  shifts_opened: number;
  shifts_closed: number;
};

function emptyAcc(): Acc {
  return {
    orders_created: 0,
    sales_from_orders_created: 0,
    payments_received_count: 0,
    payments_received_amount: 0,
    refunds_count: 0,
    refunds_amount: 0,
    discounts_applied_count: 0,
    voids_cancels_count: 0,
    shifts_opened: 0,
    shifts_closed: 0,
  };
}

function ensure(map: Map<string, Acc>, userId: string | null | undefined): Acc | null {
  if (!userId || userId === QR_GUEST_USER_ID) return null;
  let acc = map.get(userId);
  if (!acc) {
    acc = emptyAcc();
    map.set(userId, acc);
  }
  return acc;
}

function parseAmountCents(metadataJson: unknown): number {
  if (metadataJson == null) return 0;
  let meta: Record<string, unknown> = {};
  if (typeof metadataJson === 'string' && metadataJson.trim()) {
    try {
      const parsed = JSON.parse(metadataJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      return 0;
    }
  } else if (typeof metadataJson === 'object' && !Array.isArray(metadataJson)) {
    meta = metadataJson as Record<string, unknown>;
  }
  const cents = meta.amount_cents;
  if (typeof cents === 'number' && Number.isFinite(cents)) return cents;
  if (typeof cents === 'string' && cents.trim() && Number.isFinite(Number(cents))) {
    return Number(cents);
  }
  return 0;
}

export type QueryStaffReportOptions = {
  /** Optional filter to a single staff user id. Unknown id → empty by_staff. */
  staffId?: string | null;
};

/**
 * Composed staff activity report for a UTC calendar inclusive start/end date pair.
 */
export function queryStaffReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
  options: QueryStaffReportOptions = {},
): StaffReport {
  const [windowStart, windowEnd] = [utcDayBounds(startDate)[0], utcDayBounds(endDate)[1]];
  const staffFilter = options.staffId ? String(options.staffId) : null;
  const accByUser = new Map<string, Acc>();

  // Orders created
  const orderRows = db
    .prepare(
      `
    SELECT user_id AS staff_id, COUNT(*) AS cnt
    FROM orders
    WHERE created_at >= ? AND created_at < ?
      AND user_id IS NOT NULL
      AND user_id != ?
      AND status != 'cancelled'
      ${staffFilter ? 'AND user_id = ?' : ''}
    GROUP BY user_id
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; cnt: number }>;
  for (const row of orderRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) acc.orders_created += Number(row.cnt || 0);
  }

  // Settled sales attributed to order creator
  const salesRows = db
    .prepare(
      `
    SELECT o.user_id AS staff_id,
      COALESCE(SUM(COALESCE(b.total_cents, CAST(ROUND(COALESCE(b.total, 0) * 100) AS INTEGER))) / 100.0, 0) AS total
    FROM bills b
    INNER JOIN orders o ON o.id = b.order_id
    WHERE b.created_at >= ? AND b.created_at < ?
      AND o.user_id IS NOT NULL
      AND o.user_id != ?
      AND ${SETTLED_BILL_SQL}
      ${staffFilter ? 'AND o.user_id = ?' : ''}
    GROUP BY o.user_id
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; total: number }>;
  for (const row of salesRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) acc.sales_from_orders_created += Number(row.total || 0);
  }

  // Payments received (audit)
  const payRows = db
    .prepare(
      `
    SELECT actor_user_id AS staff_id, metadata_json
    FROM audit_logs
    WHERE created_at >= ? AND created_at < ?
      AND action = 'payment.received'
      AND result = 'success'
      AND actor_user_id IS NOT NULL
      AND actor_user_id != ?
      ${staffFilter ? 'AND actor_user_id = ?' : ''}
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; metadata_json: string | null }>;
  for (const row of payRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (!acc) continue;
    acc.payments_received_count += 1;
    acc.payments_received_amount += parseAmountCents(row.metadata_json) / 100;
  }

  // Refunds
  const refundRows = db
    .prepare(
      `
    SELECT created_by AS staff_id, COUNT(*) AS cnt,
      COALESCE(SUM(amount_cents), 0) / 100.0 AS total
    FROM refunds
    WHERE created_at >= ? AND created_at < ?
      AND status = 'completed'
      AND created_by IS NOT NULL
      AND created_by != ?
      ${staffFilter ? 'AND created_by = ?' : ''}
    GROUP BY created_by
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; cnt: number; total: number }>;
  for (const row of refundRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) {
      acc.refunds_count += Number(row.cnt || 0);
      acc.refunds_amount += Number(row.total || 0);
    }
  }

  // Discounts applied
  const discRows = db
    .prepare(
      `
    SELECT actor_user_id AS staff_id, COUNT(*) AS cnt
    FROM audit_logs
    WHERE created_at >= ? AND created_at < ?
      AND action IN ('order.discount_applied', 'order.item_discount_applied')
      AND result = 'success'
      AND actor_user_id IS NOT NULL
      AND actor_user_id != ?
      ${staffFilter ? 'AND actor_user_id = ?' : ''}
    GROUP BY actor_user_id
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; cnt: number }>;
  for (const row of discRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) acc.discounts_applied_count += Number(row.cnt || 0);
  }

  // Voids / cancels
  const voidPlaceholders = VOID_CANCEL_ACTIONS.map(() => '?').join(',');
  const voidRows = db
    .prepare(
      `
    SELECT actor_user_id AS staff_id, COUNT(*) AS cnt
    FROM audit_logs
    WHERE created_at >= ? AND created_at < ?
      AND action IN (${voidPlaceholders})
      AND result = 'success'
      AND actor_user_id IS NOT NULL
      AND actor_user_id != ?
      ${staffFilter ? 'AND actor_user_id = ?' : ''}
    GROUP BY actor_user_id
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, ...VOID_CANCEL_ACTIONS, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, ...VOID_CANCEL_ACTIONS, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; cnt: number }>;
  for (const row of voidRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) acc.voids_cancels_count += Number(row.cnt || 0);
  }

  // Shifts opened
  const openRows = db
    .prepare(
      `
    SELECT opened_by_user_id AS staff_id, COUNT(*) AS cnt
    FROM shifts
    WHERE opened_at >= ? AND opened_at < ?
      AND opened_by_user_id IS NOT NULL
      AND opened_by_user_id != ?
      ${staffFilter ? 'AND opened_by_user_id = ?' : ''}
    GROUP BY opened_by_user_id
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; cnt: number }>;
  for (const row of openRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) acc.shifts_opened += Number(row.cnt || 0);
  }

  // Shifts closed
  const closeRows = db
    .prepare(
      `
    SELECT closed_by_user_id AS staff_id, COUNT(*) AS cnt
    FROM shifts
    WHERE closed_at IS NOT NULL
      AND closed_at >= ? AND closed_at < ?
      AND closed_by_user_id IS NOT NULL
      AND closed_by_user_id != ?
      ${staffFilter ? 'AND closed_by_user_id = ?' : ''}
    GROUP BY closed_by_user_id
  `,
    )
    .all(
      ...(staffFilter
        ? [windowStart, windowEnd, QR_GUEST_USER_ID, staffFilter]
        : [windowStart, windowEnd, QR_GUEST_USER_ID]),
    ) as Array<{ staff_id: string; cnt: number }>;
  for (const row of closeRows) {
    const acc = ensure(accByUser, row.staff_id);
    if (acc) acc.shifts_closed += Number(row.cnt || 0);
  }

  // If staff filter requested but no activity, return empty (do not invent zeros for unknown users)
  const userIds = [...accByUser.keys()];
  const userMeta = new Map<string, { name: string; role: string }>();
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    const users = db
      .prepare(`SELECT id, name, role FROM users WHERE id IN (${placeholders})`)
      .all(...userIds) as Array<{ id: string; name: string; role: string }>;
    for (const u of users) {
      userMeta.set(u.id, { name: String(u.name || u.id), role: String(u.role || 'unknown') });
    }
  }

  const by_staff: StaffReportRow[] = userIds
    .map((id) => {
      const acc = accByUser.get(id)!;
      const meta = userMeta.get(id) || { name: id, role: 'unknown' };
      return {
        staff_id: id,
        staff_name: meta.name,
        role: meta.role,
        orders_created: acc.orders_created,
        sales_from_orders_created: roundMoney(acc.sales_from_orders_created),
        payments_received_count: acc.payments_received_count,
        payments_received_amount: roundMoney(acc.payments_received_amount),
        refunds_count: acc.refunds_count,
        refunds_amount: roundMoney(acc.refunds_amount),
        discounts_applied_count: acc.discounts_applied_count,
        voids_cancels_count: acc.voids_cancels_count,
        shifts_opened: acc.shifts_opened,
        shifts_closed: acc.shifts_closed,
      };
    })
    .sort(
      (a, b) =>
        b.sales_from_orders_created - a.sales_from_orders_created ||
        b.orders_created - a.orders_created ||
        a.staff_name.localeCompare(b.staff_name),
    );

  const totals = {
    staff_count: by_staff.length,
    orders_created: by_staff.reduce((s, r) => s + r.orders_created, 0),
    sales_from_orders_created: roundMoney(
      by_staff.reduce((s, r) => s + r.sales_from_orders_created, 0),
    ),
    payments_received_count: by_staff.reduce((s, r) => s + r.payments_received_count, 0),
    payments_received_amount: roundMoney(
      by_staff.reduce((s, r) => s + r.payments_received_amount, 0),
    ),
    refunds_count: by_staff.reduce((s, r) => s + r.refunds_count, 0),
    refunds_amount: roundMoney(by_staff.reduce((s, r) => s + r.refunds_amount, 0)),
    discounts_applied_count: by_staff.reduce((s, r) => s + r.discounts_applied_count, 0),
    voids_cancels_count: by_staff.reduce((s, r) => s + r.voids_cancels_count, 0),
    shifts_opened: by_staff.reduce((s, r) => s + r.shifts_opened, 0),
    shifts_closed: by_staff.reduce((s, r) => s + r.shifts_closed, 0),
  };

  const sales = queryDaySalesSemantics(db, windowStart, windowEnd);

  return {
    startDate,
    endDate,
    attribution: STAFF_REPORT_ATTRIBUTION,
    by_staff,
    totals,
    sales: {
      grossSales: Number(sales.grossSales || 0),
      refunds: Number(sales.refunds || 0),
      netSales: Number(sales.netSales || 0),
    },
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function staffReportToCsv(report: StaffReport): string {
  const lines = [toCsvRow([...STAFF_CSV_HEADERS])];
  for (const row of report.by_staff) {
    const cells: Record<StaffCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      role: row.role,
      orders_created: row.orders_created,
      sales_from_orders_created: row.sales_from_orders_created,
      payments_received_count: row.payments_received_count,
      payments_received_amount: row.payments_received_amount,
      refunds_count: row.refunds_count,
      refunds_amount: row.refunds_amount,
      discounts_applied_count: row.discounts_applied_count,
      voids_cancels_count: row.voids_cancels_count,
      shifts_opened: row.shifts_opened,
      shifts_closed: row.shifts_closed,
    };
    lines.push(toCsvRow(STAFF_CSV_HEADERS.map((h) => csvCell(cells[h]))));
  }
  if (report.by_staff.length > 0) {
    const totals: Record<StaffCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      staff_id: '__total__',
      staff_name: '',
      role: '',
      orders_created: report.totals.orders_created,
      sales_from_orders_created: report.totals.sales_from_orders_created,
      payments_received_count: report.totals.payments_received_count,
      payments_received_amount: report.totals.payments_received_amount,
      refunds_count: report.totals.refunds_count,
      refunds_amount: report.totals.refunds_amount,
      discounts_applied_count: report.totals.discounts_applied_count,
      voids_cancels_count: report.totals.voids_cancels_count,
      shifts_opened: report.totals.shifts_opened,
      shifts_closed: report.totals.shifts_closed,
    };
    lines.push(toCsvRow(STAFF_CSV_HEADERS.map((h) => csvCell(totals[h]))));
  }
  return lines.join('\n') + '\n';
}

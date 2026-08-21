import { Router, Request, Response } from 'express';
import { getDatabase, getSettingValue, parseDbTimestamp, utcDayBounds, utcTodayDate } from '../db';
import { requireRole } from '../middleware/security';
import {
  queryTaxComponentsReport,
  taxComponentsReportToCsv,
} from '../services/tax-components-report';
import { DayCloseServiceError, closeBusinessDay, getDayClose } from '../services/day-close';
import { formatDayCloseZPlainText } from '../services/day-close-z-text';
import { queryDaySalesSemantics } from '../services/day-sales-semantics';
import {
  expensesReportToCsv,
  listPostedExpensesForCsv,
  queryOpsFinanceReport,
} from '../services/ops-finance-report';
import { queryFoodCostReport } from '../services/food-cost-report';
import { queryVoidCancelReport, voidCancelReportToCsv } from '../services/void-cancel-report';
import {
  paymentReportToCsv,
  queryPaymentReport,
  queryPaymentsReceivedByMethod,
} from '../services/payment-report';
import { discountReportToCsv, queryDiscountReport } from '../services/discount-report';
import { queryStaffReport, staffReportToCsv } from '../services/staff-report';
import { productReportToCsv, queryProductReport } from '../services/product-report';
import { logAuditEvent } from '../services/audit-log';
import { correlationId } from '../errors';
import { toCsvRow } from '../lib/csv';
import {
  BILLS_CSV_HEADERS,
  BillsCsvExportError,
  listBillsForCsvExport,
  validateBillsCsvDateRange,
} from '../services/bills-csv-export';

function money2(n: number): number {
  return Math.round(n * 100) / 100;
}

function catalogValuationLine(row: {
  id: string;
  sku: string | null;
  name: string;
  stock_quantity: number | null;
  cost: number | null;
}) {
  const unitCost = Number(row.cost) || 0;
  const onHandQty = Number(row.stock_quantity) || 0;
  return {
    product_id: row.id,
    sku: row.sku || '',
    name: row.name,
    on_hand_qty: onHandQty,
    unit_cost: unitCost,
    extended_cost: money2(unitCost * onHandQty),
    zero_cost: unitCost === 0,
  };
}

const router = Router();

const DAY_CLOSE_ROLES = ['owner', 'manager'] as const;

function dayCloseActorFrom(req: Request): { userId: string; role: string } {
  const user = (req as Request & { user: { userId: string; role: string } }).user;
  return { userId: String(user.userId), role: String(user.role) };
}

function dayCloseAuditContext(req: Request) {
  return {
    requestId: correlationId(),
    clientIp: req.ip || req.socket.remoteAddress || null,
    terminalId: null,
  };
}

function sendDayCloseError(res: Response, error: unknown): void {
  if (error instanceof DayCloseServiceError) {
    res
      .status(error.statusCode ?? 500)
      .json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
  console.error('[DayClose] Internal error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

router.post('/day-close', requireRole(...DAY_CLOSE_ROLES), (req: Request, res: Response) => {
  try {
    const result = closeBusinessDay({
      actor: dayCloseActorFrom(req),
      businessDate: req.body?.business_date,
      context: dayCloseAuditContext(req),
    });
    res.status(201).json(result);
  } catch (error) {
    sendDayCloseError(res, error);
  }
});

router.get('/day-close/:date', requireRole(...DAY_CLOSE_ROLES), (req: Request, res: Response) => {
  try {
    const date = String(req.params.date || '');
    const dayClose = getDayClose(date);
    if (!dayClose) {
      return res.status(404).json({ error: 'Day close not found' });
    }
    let summary: unknown;
    try {
      summary = JSON.parse(dayClose.summary_json);
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.json({ day_close: dayClose, summary });
  } catch (error) {
    sendDayCloseError(res, error);
  }
});

router.get(
  '/day-close/:date/export/z.txt',
  requireRole(...DAY_CLOSE_ROLES),
  (req: Request, res: Response) => {
    try {
      const date = String(req.params.date || '');
      const dayClose = getDayClose(date);
      if (!dayClose) {
        return res.status(404).json({ error: 'Day close not found' });
      }
      let summary: Parameters<typeof formatDayCloseZPlainText>[0];
      try {
        summary = JSON.parse(dayClose.summary_json);
      } catch {
        return res.status(500).json({ error: 'Day close summary is unreadable' });
      }

      const businessName =
        getSettingValue('business_name') || getSettingValue('store_name') || undefined;
      const text = formatDayCloseZPlainText(summary, {
        businessName: businessName || undefined,
        closedAt: dayClose.created_at,
      });

      logAuditEvent({
        actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
        action: 'day_close.z_downloaded',
        entityType: 'day_close',
        entityId: dayClose.id,
        result: 'success',
        metadata: {
          format: 'txt',
          business_date: dayClose.business_date,
        },
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="day-close-z-${dayClose.business_date}.txt"`,
      );
      res.status(200).send(text);
    } catch (error) {
      sendDayCloseError(res, error);
    }
  },
);

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function reportDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

/**
 * Buckets order timestamps into local hour-of-day (0-23) and local
 * day-of-week (0=Sunday..6=Saturday), using the tenant's configured
 * timezone rather than server/UTC time — otherwise "busiest hour" would
 * reflect UTC, not when the restaurant is actually busy. SQLite has no
 * IANA timezone support (only fixed offsets), so this bucketing happens
 * in JS via Intl instead of in SQL.
 */
function bucketByLocalHourAndWeekday(
  timestamps: string[],
  timeZone: string,
): { hourCounts: number[]; dayCounts: number[] } {
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' });

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);

  for (const ts of timestamps) {
    const d = parseDbTimestamp(ts);
    if (isNaN(d.getTime())) continue;
    const hour = parseInt(hourFmt.format(d), 10);
    if (hour >= 0 && hour <= 23) hourCounts[hour]++;
    const dayIdx = WEEKDAY_NAMES.indexOf(weekdayFmt.format(d));
    if (dayIdx >= 0) dayCounts[dayIdx]++;
  }

  return { hourCounts, dayCounts };
}

/**
 * @deprecated Prefer queryPaymentsReceivedByMethod from payment-report service.
 * Kept as a thin wrapper so daily-stats / summary / sales keep identical call sites.
 */
function paymentMethodBreakdown(
  db: ReturnType<typeof getDatabase>,
  startDate: string,
  endDate = startDate,
  paidOnly = false,
) {
  return queryPaymentsReceivedByMethod(db, startDate, endDate, paidOnly);
}

/** Day-window sales truth: Gross / Refunds / Net — owned by day-sales-semantics service. */
function daySalesSemantics(
  db: ReturnType<typeof getDatabase>,
  start: string,
  end: string,
): { grossSales: number; refunds: number; netSales: number } {
  return queryDaySalesSemantics(db, start, end);
}

/** argmax/argmin over counts, restricted to indices where include(count) is true. Returns null if nothing qualifies. */
function pickExtreme(
  counts: number[],
  mode: 'max' | 'min',
  include: (count: number) => boolean,
): { index: number; count: number } | null {
  let best: { index: number; count: number } | null = null;
  counts.forEach((count, index) => {
    if (!include(count)) return;
    if (!best || (mode === 'max' ? count > best.count : count < best.count)) {
      best = { index, count };
    }
  });
  return best;
}

router.get('/daily-stats', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const [start, end] = utcDayBounds(today);
    const salesToday = db
      .prepare(
        `
      SELECT COALESCE(SUM(paid_amount), 0) AS sales
      FROM bills WHERE created_at >= ? AND created_at < ?
    `,
      )
      .get(start, end) as { sales: number };
    const { grossSales, refunds, netSales } = daySalesSemantics(db, start, end);
    const paymentMethodsToday = paymentMethodBreakdown(db, today) as { total: number }[];

    const runningOrders = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'preparing')
    `,
      )
      .get() as { count: number };

    const pendingOrders = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM orders WHERE status = 'pending'
    `,
      )
      .get() as { count: number };

    const tablesOccupied = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM tables WHERE status = 'occupied'
    `,
      )
      .get() as { count: number };

    res.json({
      // `sales` remains SUM(paid_amount) across all bills (legacy net collected).
      sales: salesToday.sales,
      grossSales,
      refunds,
      netSales,
      runningOrders: runningOrders.count,
      pendingOrders: pendingOrders.count,
      tablesOccupied: tablesOccupied.count,
      // Payments Received (gross tender by method) — not Net Sales.
      paymentMethods: paymentMethodsToday,
    });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/summary', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // #208: an explicit date param is a UTC `YYYY-MM-DD`; resolve to the
    // half-open UTC range. `reportDate` validates the param shape.
    const date = reportDate(req.query.date, utcTodayDate());
    const [start, end] = utcDayBounds(date);

    const ordersToday = db
      .prepare(
        `
      SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM orders WHERE created_at >= ? AND created_at < ?
    `,
      )
      .get(start, end) as { count: number; total: number };

    const billsToday = db
      .prepare(
        `
      SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total,
        COALESCE(SUM(paid_amount), 0) as collected
      FROM bills WHERE created_at >= ? AND created_at < ?
    `,
      )
      .get(start, end) as { count: number; total: number; collected: number };
    const { grossSales, refunds, netSales } = daySalesSemantics(db, start, end);
    const paymentMethodsToday = paymentMethodBreakdown(db, date);

    const customersToday = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM customers WHERE created_at >= ? AND created_at < ?
    `,
      )
      .get(start, end) as { count: number };

    const ordersByStatus = db
      .prepare(
        `
      SELECT status, COUNT(*) as count FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status
    `,
      )
      .all(start, end);

    res.json({
      summary: {
        date,
        orders: { count: ordersToday.count, total: ordersToday.total },
        bills: {
          count: billsToday.count,
          total: billsToday.total,
          // Legacy: all-bills SUM(paid_amount). Prefer netSales for settled truth.
          collected: billsToday.collected,
          grossSales,
          refunds,
          netSales,
        },
        customers: { new: customersToday.count },
        ordersByStatus,
        // Payments Received (gross tender by method).
        paymentMethods: paymentMethodsToday,
      },
    });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dynamic tax-component report for receipt/report consumers. Components are
// derived item by item so mixed legacy + categorized bills cannot double-count
// the categorized portion already present in the bill-level tax_breakdown.
router.get('/tax-components', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }

    const report = queryTaxComponentsReport(db, startDate, endDate);
    res.json({
      taxComponents: {
        startDate: report.startDate,
        endDate: report.endDate,
        billCount: report.billCount,
        taxAmount: report.taxAmount,
        components: report.components,
      },
    });
  } catch (error: unknown) {
    console.error('[API] Tax component report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/export/tax-components.csv',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const today = utcTodayDate();
      const startDate = reportDate(req.query.start_date, today);
      const endDate = reportDate(req.query.end_date, today);
      if (startDate > endDate) {
        return res.status(400).json({ error: 'start_date must be on or before end_date' });
      }

      const report = queryTaxComponentsReport(db, startDate, endDate);
      const csv = taxComponentsReportToCsv(report);

      logAuditEvent({
        actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
        action: 'tax.exported',
        entityType: 'tax_report',
        entityId: `${startDate}_${endDate}`,
        result: 'success',
        metadata: {
          format: 'csv',
          start_date: startDate,
          end_date: endDate,
          row_count: report.components.length,
          bill_count: report.billCount,
          report_tax_amount: report.taxAmount,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="operavia-tax-components-${startDate}-to-${endDate}.csv"`,
      );
      res.status(200).send(csv);
    } catch (error: unknown) {
      console.error('[API] Tax components CSV export failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/ops-finance', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const report = queryOpsFinanceReport(db, startDate, endDate);
    res.json({ opsFinance: report });
  } catch (error: unknown) {
    console.error('[API] Ops finance report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/export/expenses.csv',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const today = utcTodayDate();
      const startDate = reportDate(req.query.start_date, today);
      const endDate = reportDate(req.query.end_date, today);
      if (startDate > endDate) {
        return res.status(400).json({ error: 'start_date must be on or before end_date' });
      }

      const rows = listPostedExpensesForCsv(db, startDate, endDate);
      const csv = expensesReportToCsv(startDate, endDate, rows);

      logAuditEvent({
        actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
        action: 'expense.exported',
        entityType: 'expense_report',
        entityId: `${startDate}_${endDate}`,
        result: 'success',
        metadata: {
          format: 'csv',
          start_date: startDate,
          end_date: endDate,
          row_count: rows.length,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="operavia-expenses-${startDate}-to-${endDate}.csv"`,
      );
      res.status(200).send(csv);
    } catch (error: unknown) {
      console.error('[API] Expenses CSV export failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/food-cost', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const report = queryFoodCostReport(db, startDate, endDate);
    res.json({ foodCost: report });
  } catch (error: unknown) {
    console.error('[API] Food-cost report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// R12 — Void / Cancel report from audit_logs (no schema change).
router.get('/voids', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const report = queryVoidCancelReport(db, startDate, endDate);
    res.json({ voids: report });
  } catch (error: unknown) {
    console.error('[API] Void/cancel report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/export/voids.csv', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }

    const report = queryVoidCancelReport(db, startDate, endDate);
    const csv = voidCancelReportToCsv(report);

    logAuditEvent({
      actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
      action: 'report.voids_exported',
      entityType: 'void_report',
      entityId: `${startDate}_${endDate}`,
      result: 'success',
      metadata: {
        format: 'csv',
        start_date: startDate,
        end_date: endDate,
        row_count: report.events.length,
        total_count: report.total_count,
        order_cancelled_count: report.order_cancelled_count,
        item_cancelled_count: report.item_cancelled_count,
        item_voided_count: report.item_voided_count,
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="operavia-voids-${startDate}-to-${endDate}.csv"`,
    );
    res.status(200).send(csv);
  } catch (error: unknown) {
    console.error('[API] Voids CSV export failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RPT-PAY — Payment report (gross tender + refunds by method; no schema change).
router.get('/payments', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const report = queryPaymentReport(db, startDate, endDate);
    res.json({ payments: report });
  } catch (error: unknown) {
    console.error('[API] Payment report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/export/payments.csv',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const today = utcTodayDate();
      const startDate = reportDate(req.query.start_date, today);
      const endDate = reportDate(req.query.end_date, today);
      if (startDate > endDate) {
        return res.status(400).json({ error: 'start_date must be on or before end_date' });
      }

      const report = queryPaymentReport(db, startDate, endDate);
      const csv = paymentReportToCsv(report);

      logAuditEvent({
        actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
        action: 'report.payments_exported',
        entityType: 'payment_report',
        entityId: `${startDate}_${endDate}`,
        result: 'success',
        metadata: {
          format: 'csv',
          start_date: startDate,
          end_date: endDate,
          row_count: report.by_method.length,
          payment_line_count: report.payment_line_count,
          payments_received: report.payments_received,
          refunds: report.refunds,
          net_payments: report.net_payments,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="operavia-payments-${startDate}-to-${endDate}.csv"`,
      );
      res.status(200).send(csv);
    } catch (error: unknown) {
      console.error('[API] Payments CSV export failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// RPT-DISC — Discount report (applied order + item discounts on settled bills; no schema change).
router.get('/discounts', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const report = queryDiscountReport(db, startDate, endDate);
    res.json({ discounts: report });
  } catch (error: unknown) {
    console.error('[API] Discount report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/export/discounts.csv',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const today = utcTodayDate();
      const startDate = reportDate(req.query.start_date, today);
      const endDate = reportDate(req.query.end_date, today);
      if (startDate > endDate) {
        return res.status(400).json({ error: 'start_date must be on or before end_date' });
      }

      const report = queryDiscountReport(db, startDate, endDate);
      const csv = discountReportToCsv(report);

      logAuditEvent({
        actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
        action: 'report.discounts_exported',
        entityType: 'discount_report',
        entityId: `${startDate}_${endDate}`,
        result: 'success',
        metadata: {
          format: 'csv',
          start_date: startDate,
          end_date: endDate,
          discounted_bill_count: report.discounted_bill_count,
          total_discounts: report.total_discounts,
          order_discounts: report.order_discounts,
          item_discounts: report.item_discounts,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="operavia-discounts-${startDate}-to-${endDate}.csv"`,
      );
      res.status(200).send(csv);
    } catch (error: unknown) {
      console.error('[API] Discounts CSV export failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// RPT-STAFF — Staff performance / activity (persisted attribution only; no schema change).
router.get('/staff', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const staffIdRaw = req.query.staff_id;
    const staffId = typeof staffIdRaw === 'string' && staffIdRaw.trim() ? staffIdRaw.trim() : null;
    const report = queryStaffReport(db, startDate, endDate, { staffId });
    res.json({ staff: report });
  } catch (error: unknown) {
    console.error('[API] Staff report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/export/staff.csv', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const staffIdRaw = req.query.staff_id;
    const staffId = typeof staffIdRaw === 'string' && staffIdRaw.trim() ? staffIdRaw.trim() : null;
    const report = queryStaffReport(db, startDate, endDate, { staffId });
    const csv = staffReportToCsv(report);

    logAuditEvent({
      actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
      action: 'report.staff_exported',
      entityType: 'staff_report',
      entityId: `${startDate}_${endDate}`,
      result: 'success',
      metadata: {
        format: 'csv',
        start_date: startDate,
        end_date: endDate,
        staff_id: staffId,
        staff_count: report.totals.staff_count,
        orders_created: report.totals.orders_created,
        sales_from_orders_created: report.totals.sales_from_orders_created,
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="operavia-staff-${startDate}-to-${endDate}.csv"`,
    );
    res.status(200).send(csv);
  } catch (error: unknown) {
    console.error('[API] Staff CSV export failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RPT-PRODUCT — Product performance (settled order_items merchandise; no schema change).
router.get('/products', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const categoryIdRaw = req.query.category_id;
    const categoryId =
      typeof categoryIdRaw === 'string' && categoryIdRaw.trim() ? categoryIdRaw.trim() : null;
    const productIdRaw = req.query.product_id;
    const productId =
      typeof productIdRaw === 'string' && productIdRaw.trim() ? productIdRaw.trim() : null;
    const sortRaw = req.query.sort;
    const sort =
      sortRaw === 'quantity_sold' || sortRaw === 'product_name' || sortRaw === 'merchandise_sales'
        ? sortRaw
        : 'merchandise_sales';
    const report = queryProductReport(db, startDate, endDate, { categoryId, productId, sort });
    res.json({ products: report });
  } catch (error: unknown) {
    console.error('[API] Product report failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/export/products.csv',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const today = utcTodayDate();
      const startDate = reportDate(req.query.start_date, today);
      const endDate = reportDate(req.query.end_date, today);
      if (startDate > endDate) {
        return res.status(400).json({ error: 'start_date must be on or before end_date' });
      }
      const categoryIdRaw = req.query.category_id;
      const categoryId =
        typeof categoryIdRaw === 'string' && categoryIdRaw.trim() ? categoryIdRaw.trim() : null;
      const report = queryProductReport(db, startDate, endDate, { categoryId });
      const csv = productReportToCsv(report);

      logAuditEvent({
        actorUserId: (req as { user?: { userId?: string } }).user?.userId ?? null,
        action: 'report.products_exported',
        entityType: 'product_report',
        entityId: `${startDate}_${endDate}`,
        result: 'success',
        metadata: {
          format: 'csv',
          start_date: startDate,
          end_date: endDate,
          category_id: categoryId,
          product_count: report.totals.product_count,
          merchandise_sales: report.totals.merchandise_sales,
          quantity_sold: report.totals.quantity_sold,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="operavia-products-${startDate}-to-${endDate}.csv"`,
      );
      res.status(200).send(csv);
    } catch (error: unknown) {
      console.error('[API] Products CSV export failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/sales', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    // #208: half-open UTC ranges so the orders/bills indexes apply instead
    // of `date(...)` on every row. All day boundaries are UTC.
    const windowStart = utcDayBounds(startDate)[0];
    const windowEnd = utcDayBounds(endDate)[1];

    // Daily series bucketed by UTC day (substr of the stored UTC timestamp) —
    // same labels the previous `date(created_at)` produced, at index cost.
    const dailySales = db
      .prepare(
        `
      SELECT substr(created_at, 1, 10) as date, COUNT(*) as orders, SUM(total) as sales
      FROM orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date
    `,
      )
      .all(windowStart, windowEnd);

    const byPaymentMethod = paymentMethodBreakdown(db, startDate, endDate, true) as {
      method: string;
      count: number;
      total: number;
    }[];

    const byOrderType = db
      .prepare(
        `
      SELECT type, COUNT(*) as count, SUM(total) as total
      FROM orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY type
    `,
      )
      .all(windowStart, windowEnd);

    res.json({
      sales: {
        startDate,
        endDate,
        dailySales,
        byPaymentMethod,
        byOrderType,
      },
    });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topProducts', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const today = utcTodayDate();
    const startDate = reportDate(req.query.start_date, today);
    const endDate = reportDate(req.query.end_date, today);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date must be on or before end_date' });
    }
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 10;
    const windowStart = utcDayBounds(startDate)[0];
    const windowEnd = utcDayBounds(endDate)[1];

    const topProducts = db
      .prepare(
        `
      SELECT oi.product_id, oi.product_name,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.subtotal) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= ? AND o.created_at < ?
      GROUP BY oi.product_id
      ORDER BY total_quantity DESC
      LIMIT ?
    `,
      )
      .all(windowStart, windowEnd, limit);

    res.json({ topProducts });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/recentOrders', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;
    const date = req.query.date === undefined ? undefined : reportDate(req.query.date, '');
    if (req.query.date !== undefined && !date) {
      return res.status(400).json({ error: 'date must use YYYY-MM-DD format' });
    }

    // Without a date, "most recent overall" (dashboard live view). With one,
    // scoped to that day — lets the dashboard show a past day's orders
    // instead of always the latest regardless of which date is selected.
    // #208: range filter hits idx_orders_created_at instead of full scan.
    const params: any[] = [];
    let where = '';
    if (date) {
      const [s, e] = utcDayBounds(date);
      where = 'WHERE o.created_at >= ? AND o.created_at < ?';
      params.push(s, e);
    }

    const recentOrders = db
      .prepare(
        `
      SELECT o.*, t.number as table_name, c.name as customer_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN customers c ON o.customer_id = c.id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ?
    `,
      )
      .all(...params, limit);

    // #208: batch all items in one IN() query instead of per-order N+1.
    const orderIds = recentOrders.map((o: any) => o.id);
    const itemsByOrder = new Map<number, any[]>();
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const items = db
        .prepare(
          `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id, id`,
        )
        .all(...orderIds);
      for (const item of items as any[]) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
    }
    const ordersWithItems = recentOrders.map((order: any) => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
    }));

    res.json({ recentOrders: ordersWithItems });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tables', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const [start, end] = utcDayBounds(utcTodayDate());

    const tableStats = db
      .prepare(
        `
      SELECT t.*,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total), 0) as total_revenue,
        MAX(o.created_at) as last_order_at
      FROM tables t
      LEFT JOIN orders o ON t.id = o.table_id
        AND o.created_at >= ? AND o.created_at < ?
      GROUP BY t.id
    `,
      )
      .all(start, end);

    const tableUtilization = db
      .prepare(
        `
      SELECT
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
        SUM(CASE WHEN status = 'cleaning' THEN 1 ELSE 0 END) as cleaning,
        COUNT(*) as total
      FROM tables
    `,
      )
      .get();

    res.json({
      tableStats,
      tableUtilization,
    });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /insights — dashboard metrics beyond today's snapshot ──────────────
// AOV, top staff, top categories, busiest/idlest hour & day-of-week, and
// average kitchen prep time, aggregated over a trailing window (default 30
// days) so hour/day patterns reflect a consistent trend rather than one day.
router.get('/insights', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
    // #208: "N days back" in UTC, with the UTC day range so the window
    // filters on the index. Day boundaries are UTC; the tenant timezone only
    // drives the hour/day-of-week bucketing below.
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const timeZone = getSettingValue('timezone') || 'Asia/Kolkata';
    const [windowStart] = utcDayBounds(startDate);

    // AOV — same revenue basis ("paid bills") as the existing daily-stats tile.
    const revenue = db
      .prepare(
        `
      SELECT COUNT(*) as billCount, COALESCE(SUM(paid_amount), 0) as total
      FROM bills
      WHERE payment_status = 'paid' AND paid_at >= ?
    `,
      )
      .get(windowStart) as { billCount: number; total: number };
    const aov = revenue.billCount > 0 ? revenue.total / revenue.billCount : 0;

    // Kitchen velocity — substitutes for "best cook", which isn't derivable:
    // order_items has no per-chef attribution (marking an item ready doesn't
    // record who did it), so there's no data to rank individual cooks by.
    // Average prep time is the closest real signal for kitchen performance.
    const prepTime = db
      .prepare(
        `
      SELECT AVG((julianday(ready_at) - julianday(cooking_started_at)) * 24 * 60) as avgMinutes,
        COUNT(*) as sampleSize
      FROM orders
      WHERE cooking_started_at IS NOT NULL AND ready_at IS NOT NULL
        AND created_at >= ? AND status != 'cancelled'
    `,
      )
      .get(windowStart) as { avgMinutes: number | null; sampleSize: number };

    // Top staff by revenue — covers whoever creates orders (owner/manager/
    // cashier/waiter, per POST /orders' own role gate), i.e. "best cashier".
    const topStaff = db
      .prepare(
        `
      SELECT u.id as user_id, u.name, u.role,
        COALESCE(SUM(o.total), 0) as revenue,
        COUNT(o.id) as orderCount
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.created_at >= ? AND o.status != 'cancelled'
      GROUP BY u.id
      ORDER BY revenue DESC
      LIMIT 5
    `,
      )
      .all(windowStart);

    // Top categories by revenue.
    const topCategories = db
      .prepare(
        `
      SELECT c.id as category_id, COALESCE(c.name, 'Uncategorized') as name,
        COALESCE(SUM(oi.quantity), 0) as quantity,
        COALESCE(SUM(oi.subtotal), 0) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE o.created_at >= ? AND oi.status != 'cancelled'
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 5
    `,
      )
      .all(windowStart);

    // Busiest/idlest hour & day-of-week, bucketed in the tenant's local timezone.
    const orderTimestamps = (
      db
        .prepare(`SELECT created_at FROM orders WHERE created_at >= ? AND status != 'cancelled'`)
        .all(windowStart) as { created_at: string }[]
    ).map((r) => r.created_at);

    const { hourCounts, dayCounts } = bucketByLocalHourAndWeekday(orderTimestamps, timeZone);

    // Hours with zero orders are excluded from busiest/idlest — almost
    // certainly "closed overnight" rather than a meaningful idle signal,
    // and would otherwise trivially always "win" idlest hour.
    const busiestHour = pickExtreme(hourCounts, 'max', (c) => c > 0);
    const idlestHour = pickExtreme(hourCounts, 'min', (c) => c > 0);

    // Day-of-week zero counts ARE kept — "closed Mondays" is a real,
    // useful signal, unlike an overnight hour with no foot traffic.
    const busiestDay = pickExtreme(dayCounts, 'max', () => true);
    const idlestDay = pickExtreme(dayCounts, 'min', () => true);

    res.json({
      windowDays: days,
      aov,
      ordersAnalyzed: orderTimestamps.length,
      avgPrepTimeMinutes:
        prepTime.sampleSize > 0 && prepTime.avgMinutes !== null
          ? Math.round(prepTime.avgMinutes)
          : null,
      topStaff,
      topCategories,
      busiestHour: busiestHour ? { hour: busiestHour.index, orderCount: busiestHour.count } : null,
      idlestHour: idlestHour ? { hour: idlestHour.index, orderCount: idlestHour.count } : null,
      busiestDayOfWeek: busiestDay
        ? { dayIndex: busiestDay.index, orderCount: busiestDay.count }
        : null,
      idlestDayOfWeek: idlestDay
        ? { dayIndex: idlestDay.index, orderCount: idlestDay.count }
        : null,
    });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/inventory-valuation',
  requireRole('owner', 'manager'),
  (_req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          `SELECT id, sku, name, stock_quantity, cost
           FROM products
           WHERE deleted_at IS NULL AND track_inventory = 1
           ORDER BY name COLLATE NOCASE, id`,
        )
        .all() as Array<{
        id: string;
        sku: string | null;
        name: string;
        stock_quantity: number | null;
        cost: number | null;
      }>;
      const lines = rows.map(catalogValuationLine);
      const totals = {
        on_hand_qty: money2(lines.reduce((sum, line) => sum + line.on_hand_qty, 0)),
        extended_cost: money2(lines.reduce((sum, line) => sum + line.extended_cost, 0)),
        line_count: lines.length,
        zero_cost_count: lines.filter((line) => line.zero_cost).length,
      };
      res.json({
        currency: String(getSettingValue('currency') || 'INR').toUpperCase(),
        as_of: new Date().toISOString(),
        lines,
        totals,
      });
    } catch (error: unknown) {
      console.error('[API] Inventory valuation failed:', error);
      res.status(500).json({ error: 'Internal error' });
    }
  },
);

router.get('/export/bills.csv', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const startRaw = req.query.start_date;
    const endRaw = req.query.end_date;
    if (typeof startRaw !== 'string') {
      throw new BillsCsvExportError('start_date is required');
    }
    if (typeof endRaw !== 'string') {
      throw new BillsCsvExportError('end_date is required');
    }
    const { startDate, endDate } = validateBillsCsvDateRange(startRaw, endRaw);

    const db = getDatabase();
    const rows = listBillsForCsvExport(db, startDate, endDate);
    const lines = [
      toCsvRow([...BILLS_CSV_HEADERS]),
      ...rows.map((row) => toCsvRow(BILLS_CSV_HEADERS.map((header) => row[header]))),
    ];
    const csv = lines.join('\n') + '\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="operavia-sales-${startDate}-to-${endDate}.csv"`,
    );
    res.send(csv);
  } catch (error: unknown) {
    if (error instanceof BillsCsvExportError) {
      return res
        .status(error.statusCode ?? 500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
    console.error('[API] Bills CSV export failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const reportRoutes = router;

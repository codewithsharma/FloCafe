/**
 * R13 — Durable print job outbox (bill print failure + one manual retry).
 * Pattern mirrors cloud_sync_outbox: failed work is recorded, never silently dropped.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, now, attachEffectiveAddons, parseItemJson } from '../db';
import { printReceiptDetailed } from '../printers/thermal';
import { printReceipt as logSaleReceiptPrint } from './receipt';

export type PrintJobStatus = 'pending' | 'failed' | 'done' | 'cancelled';

export type PrintJobRow = {
  id: string;
  status: PrintJobStatus;
  attempts: number;
  max_attempts: number;
  job_type: string;
  bill_id: number | null;
  order_id: number | null;
  payload_json: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export class PrintQueueError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const DEFAULT_MAX_ATTEMPTS = 2;

type BillPrintPayload = {
  useUnicode?: boolean;
  isReprint?: boolean;
};

function shapeJob(row: PrintJobRow): PrintJobRow {
  return {
    id: row.id,
    status: row.status,
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    job_type: row.job_type,
    bill_id: row.bill_id == null ? null : Number(row.bill_id),
    order_id: row.order_id == null ? null : Number(row.order_id),
    payload_json: row.payload_json,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

function parsePayload(raw: string | null): BillPrintPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as BillPrintPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getEffectiveOrderItems(
  db: ReturnType<typeof getDatabase>,
  orderId: string | number,
): any[] {
  return attachEffectiveAddons(
    db,
    (db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]).map(
      parseItemJson,
    ),
  );
}

function loadBusinessContext(db: ReturnType<typeof getDatabase>, bill: any, order: any) {
  let items: any[] = getEffectiveOrderItems(db, bill.order_id);
  const allocations = db
    .prepare('SELECT order_item_id, quantity FROM bill_items WHERE bill_id = ?')
    .all(bill.id) as any[];
  if (allocations.length > 0) {
    const byItem = new Map(
      allocations.map((row) => [Number(row.order_item_id), Number(row.quantity)]),
    );
    items = items
      .filter((item) => byItem.has(Number(item.id)))
      .map((item) => {
        const quantity = byItem.get(Number(item.id))!;
        const ratio = quantity / Number(item.quantity);
        return {
          ...item,
          quantity,
          subtotal: Number((Number(item.subtotal) * ratio).toFixed(2)),
          tax_amount: Number((Number(item.tax_amount || 0) * ratio).toFixed(2)),
          total: Number((Number(item.total) * ratio).toFixed(2)),
        };
      });
  }
  order.items = items;

  if (order.table_id) {
    const table: any = db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id);
    if (table) {
      order.table = { name: table.number };
    }
  }

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const settings: Record<string, string> = Object.fromEntries(
    settingsRows.map((r) => [r.key, r.value]),
  );

  let customer: any = null;
  let pointsEarned = 0;
  let pointsRedeemed = 0;
  let pointsBalance: number | null = null;
  if (bill.customer_id) {
    customer = db
      .prepare('SELECT name, phone, country_code FROM customers WHERE id = ?')
      .get(bill.customer_id);

    const earned = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE bill_id = ? AND type = 'credit'`,
      )
      .get(bill.id) as { total: number };
    pointsEarned = earned.total;

    const redeemed = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE bill_id = ? AND type = 'debit'`,
      )
      .get(bill.id) as { total: number };
    pointsRedeemed = redeemed.total;

    if (settings.loyalty_enabled === 'true') {
      const credits = db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE customer_id = ? AND type = 'credit' AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        )
        .get(bill.customer_id) as { total: number };
      const debits = db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger WHERE customer_id = ? AND type = 'debit'`,
        )
        .get(bill.customer_id) as { total: number };
      pointsBalance = Math.max(0, credits.total - debits.total);
    }
  }

  const business = {
    name: settings.business_name || '',
    address: settings.business_address || '',
    phone: settings.business_phone || '',
    taxRegistrationNumber: settings.tax_registration_number || '',
    currency_symbol: settings.currency_symbol || '₹',
    country: settings.country || 'IN',
    instagram_handle: settings.instagram_handle || '',
    customer_name: customer?.name || '',
    customer_phone: customer?.phone
      ? customer.country_code && !customer.phone.startsWith(customer.country_code)
        ? `${customer.country_code} ${customer.phone}`
        : customer.phone
      : '',
    points_earned: pointsEarned,
    points_redeemed: pointsRedeemed,
    points_balance: pointsBalance,
    trim_decimals: settings.printer_trim_decimals === 'true',
    show_name: settings.bill_show_name !== 'false',
    show_address: settings.bill_show_address !== 'false',
    show_phone: settings.bill_show_phone !== 'false',
    show_tax_id: settings.bill_show_tax_id === 'true',
    show_tax_breakdown: settings.bill_show_tax_breakdown !== 'false',
    show_customer_name: settings.bill_show_customer_name !== 'false',
    show_customer_phone: settings.bill_show_customer_phone !== 'false',
    show_table_number: settings.bill_show_table_number !== 'false',
    footer_note: settings.bill_footer_message || '',
  };

  return { business, billTemplate: settings.bill_template || 'classic' };
}

/**
 * Record a failed (or pending) bill print so operators can retry — never silent-drop.
 */
export function enqueueBillPrintFailure(input: {
  billId: number;
  orderId?: number | null;
  lastError: string;
  payload?: BillPrintPayload;
  status?: 'pending' | 'failed';
  maxAttempts?: number;
}): PrintJobRow {
  const db = getDatabase();
  const ts = now();
  const id = uuidv4();
  const status = input.status || 'failed';
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const payloadJson = JSON.stringify(input.payload || {});

  db.prepare(
    `INSERT INTO print_jobs
      (id, status, attempts, max_attempts, job_type, bill_id, order_id, payload_json, last_error, created_at, updated_at, completed_at)
     VALUES (?, ?, 1, ?, 'bill', ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    status,
    maxAttempts,
    input.billId,
    input.orderId ?? null,
    payloadJson,
    input.lastError.slice(0, 500),
    ts,
    ts,
  );

  return shapeJob(db.prepare(`SELECT * FROM print_jobs WHERE id = ?`).get(id) as PrintJobRow);
}

/** Owner/Manager list of open print jobs (pending + failed). */
export function listOpenPrintJobs(): PrintJobRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM print_jobs
       WHERE status IN ('pending', 'failed')
       ORDER BY created_at DESC`,
    )
    .all() as PrintJobRow[];
  return rows.map(shapeJob);
}

export function getPrintJob(id: string): PrintJobRow | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM print_jobs WHERE id = ?`).get(id) as
    PrintJobRow | undefined;
  return row ? shapeJob(row) : null;
}

function markJobDone(id: string, attempts: number): PrintJobRow {
  const db = getDatabase();
  const ts = now();
  db.prepare(
    `UPDATE print_jobs
     SET status = 'done', attempts = ?, last_error = NULL, updated_at = ?, completed_at = ?
     WHERE id = ?`,
  ).run(attempts, ts, ts, id);
  return getPrintJob(id)!;
}

function markJobFailed(id: string, attempts: number, lastError: string): PrintJobRow {
  const db = getDatabase();
  const ts = now();
  db.prepare(
    `UPDATE print_jobs
     SET status = 'failed', attempts = ?, last_error = ?, updated_at = ?, completed_at = NULL
     WHERE id = ?`,
  ).run(attempts, lastError.slice(0, 500), ts, id);
  return getPrintJob(id)!;
}

async function attemptBillPrint(
  billId: number,
  payload: BillPrintPayload,
): Promise<{ ok: true; effectiveIsReprint: boolean } | { ok: false; detail: string }> {
  const db = getDatabase();
  const printer = db.prepare('SELECT id FROM printers WHERE is_default = 1').get();
  if (!printer) {
    return { ok: false, detail: 'No default printer configured' };
  }

  const bill: any = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  if (!bill) {
    return { ok: false, detail: 'Bill not found' };
  }

  const order: any = db.prepare('SELECT * FROM orders WHERE id = ?').get(bill.order_id);
  if (!order) {
    return { ok: false, detail: 'Order not found' };
  }

  const { business, billTemplate } = loadBusinessContext(db, bill, order);

  const priorPrint = db
    .prepare(
      `SELECT 1 FROM print_logs WHERE bill_id = ? AND print_type IN ('receipt', 'reprint') LIMIT 1`,
    )
    .get(bill.id);
  const forceReprint = !!bill.printed_at || !!priorPrint;
  const effectiveIsReprint = Boolean(payload.isReprint) || forceReprint;

  const result = await printReceiptDetailed(
    order,
    bill,
    business,
    billTemplate,
    Boolean(payload.useUnicode),
    effectiveIsReprint,
  );

  if (!result.ok) {
    return {
      ok: false,
      detail: result.detail || result.code || 'Print failed',
    };
  }
  return { ok: true, effectiveIsReprint };
}

/**
 * Reattempt a pending/failed bill print once (bounded by max_attempts).
 * Success writes print_logs and marks the job done.
 *
 * Concurrency: claims failed → pending before hardware I/O so a second
 * concurrent retry gets PRINT_JOB_BUSY (or reclaims stale pending after 60s).
 */
export async function retryPrintJob(jobId: string, actorUserId: string): Promise<PrintJobRow> {
  const claimed = claimJobForRetry(jobId);
  const payload = parsePayload(claimed.payload_json);
  const nextAttempts = claimed.attempts + 1;

  try {
    const outcome = await attemptBillPrint(claimed.bill_id!, payload);

    if (!outcome.ok) {
      return markJobFailed(claimed.id, nextAttempts, outcome.detail);
    }

    const printType = outcome.effectiveIsReprint ? 'reprint' : 'receipt';
    await logSaleReceiptPrint(claimed.bill_id!, actorUserId, printType);
    return markJobDone(claimed.id, nextAttempts);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Print retry failed';
    return markJobFailed(claimed.id, nextAttempts, detail);
  }
}

const STALE_PENDING_MS = 60_000;

/**
 * Atomically claim a retryable job. Uses status=pending as in-flight lease.
 */
export function claimJobForRetry(jobId: string): PrintJobRow {
  const db = getDatabase();
  const ts = now();

  const claimFailed = db
    .prepare(
      `UPDATE print_jobs
       SET status = 'pending', updated_at = ?
       WHERE id = ?
         AND status = 'failed'
         AND attempts < max_attempts
         AND job_type = 'bill'
         AND bill_id IS NOT NULL`,
    )
    .run(ts, jobId);

  if (claimFailed.changes === 1) {
    return getPrintJob(jobId)!;
  }

  const job = getPrintJob(jobId);
  if (!job) {
    throw new PrintQueueError(404, 'PRINT_JOB_NOT_FOUND', 'Print job not found');
  }
  if (job.status === 'done' || job.status === 'cancelled') {
    throw new PrintQueueError(409, 'PRINT_JOB_NOT_RETRYABLE', 'Print job is not retryable');
  }
  if (job.attempts >= job.max_attempts) {
    throw new PrintQueueError(409, 'PRINT_JOB_MAX_ATTEMPTS', 'Print job has no retries remaining');
  }
  if (job.job_type !== 'bill' || job.bill_id == null) {
    throw new PrintQueueError(400, 'PRINT_JOB_UNSUPPORTED', 'Only bill print jobs are supported');
  }

  if (job.status === 'pending') {
    const updatedMs = Date.parse(job.updated_at.replace(' ', 'T') + 'Z');
    const age = Number.isFinite(updatedMs) ? Date.now() - updatedMs : 0;
    if (age < STALE_PENDING_MS) {
      throw new PrintQueueError(409, 'PRINT_JOB_BUSY', 'Print job retry already in progress');
    }
    // Stale pending (crashed mid-retry) — reclaim
    db.prepare(`UPDATE print_jobs SET updated_at = ? WHERE id = ? AND status = 'pending'`).run(
      ts,
      jobId,
    );
    return getPrintJob(jobId)!;
  }

  throw new PrintQueueError(409, 'PRINT_JOB_NOT_RETRYABLE', 'Print job is not retryable');
}

export type PrintHealthOverall = 'healthy' | 'degraded' | 'error' | 'unknown';

export type PrintHealthJobView = {
  id: string;
  job_type: string;
  status: PrintJobStatus;
  bill_id: number | null;
  order_id: number | null;
  attempts: number;
  max_attempts: number;
  retries_remaining: number;
  retryable: boolean;
  exhausted: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  has_prior_print_log: boolean;
};

export type PrintHealthReport = {
  overall: PrintHealthOverall;
  semantics: {
    healthy: string;
    degraded: string;
    error: string;
    unknown: string;
  };
  default_printer: {
    present: boolean;
    id: string | null;
    name: string | null;
    connection_type: string | null;
  };
  queue: {
    open_count: number;
    pending_count: number;
    failed_count: number;
    retryable_count: number;
    exhausted_count: number;
    oldest_open_at: string | null;
  };
  jobs: PrintHealthJobView[];
};

export const PRINT_HEALTH_SEMANTICS = {
  healthy:
    'No open print jobs and a default printer is configured. Does not claim live hardware ACK.',
  degraded:
    'Open retryable print jobs (failed/pending with attempts remaining) and/or no default printer while queue is empty.',
  error:
    'One or more open jobs are exhausted (attempts >= max_attempts), or open jobs exist with no default printer.',
  unknown: 'Reserved; unused when queue and printer config can be read.',
} as const;

function sanitizeError(raw: string | null): string | null {
  if (!raw) return null;
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.slice(0, 240);
}

/**
 * Derived printer/queue health from print_jobs + default printer config.
 * No hardware heartbeat — OS detect remains a separate endpoint.
 */
export function getPrintHealth(): PrintHealthReport {
  const db = getDatabase();
  const open = listOpenPrintJobs();

  const defaultRow = db
    .prepare(`SELECT id, name, connection_type FROM printers WHERE is_default = 1 LIMIT 1`)
    .get() as { id: string; name: string; connection_type: string } | undefined;

  const billIds = [...new Set(open.map((j) => j.bill_id).filter((id): id is number => id != null))];
  const billsWithLog = new Set<number>();
  if (billIds.length > 0) {
    const placeholders = billIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT DISTINCT bill_id FROM print_logs
         WHERE bill_id IN (${placeholders})
           AND print_type IN ('receipt', 'reprint')`,
      )
      .all(...billIds) as Array<{ bill_id: number }>;
    for (const r of rows) billsWithLog.add(Number(r.bill_id));
  }

  const jobs: PrintHealthJobView[] = open.map((j) => {
    const retries_remaining = Math.max(0, j.max_attempts - j.attempts);
    const exhausted = j.attempts >= j.max_attempts;
    const retryable =
      !exhausted &&
      (j.status === 'failed' || j.status === 'pending') &&
      j.job_type === 'bill' &&
      j.bill_id != null;
    return {
      id: j.id,
      job_type: j.job_type,
      status: j.status,
      bill_id: j.bill_id,
      order_id: j.order_id,
      attempts: j.attempts,
      max_attempts: j.max_attempts,
      retries_remaining,
      retryable,
      exhausted,
      last_error: sanitizeError(j.last_error),
      created_at: j.created_at,
      updated_at: j.updated_at,
      completed_at: j.completed_at,
      has_prior_print_log: j.bill_id != null && billsWithLog.has(j.bill_id),
    };
  });

  const pending_count = jobs.filter((j) => j.status === 'pending').length;
  const failed_count = jobs.filter((j) => j.status === 'failed').length;
  const exhausted_count = jobs.filter((j) => j.exhausted).length;
  const retryable_count = jobs.filter((j) => j.retryable && !j.exhausted).length;
  const oldest_open_at =
    open.length === 0
      ? null
      : open.reduce(
          (oldest, j) => (j.created_at < oldest ? j.created_at : oldest),
          open[0].created_at,
        );

  const defaultPresent = !!defaultRow;
  let overall: PrintHealthOverall = 'healthy';
  if (open.length === 0 && defaultPresent) {
    overall = 'healthy';
  } else if (exhausted_count > 0 || (open.length > 0 && !defaultPresent)) {
    overall = 'error';
  } else if (open.length > 0 || !defaultPresent) {
    overall = 'degraded';
  } else {
    overall = 'unknown';
  }

  return {
    overall,
    semantics: { ...PRINT_HEALTH_SEMANTICS },
    default_printer: {
      present: defaultPresent,
      id: defaultRow?.id ?? null,
      name: defaultRow?.name ?? null,
      connection_type: defaultRow?.connection_type ?? null,
    },
    queue: {
      open_count: open.length,
      pending_count,
      failed_count,
      retryable_count,
      exhausted_count,
      oldest_open_at,
    },
    jobs,
  };
}

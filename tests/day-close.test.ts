/**
 * M5-G — Day close migration, service, API, timezone bounds, audit.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/day-close.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-day-close-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => '3.0.5-test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'day-close-test-secret';

const bcrypt = require('bcryptjs');
const {
  initDatabase,
  getDatabase,
  closeDatabase,
  now,
  upsertSettings,
  businessDateInTimezone,
  localDayBoundsUtc,
} = require('../main/db');
const {
  DayCloseServiceError,
  closeBusinessDay,
  getDayClose,
} = require('../main/services/day-close');
const { openShift, closeShift, forceCloseShift } = require('../main/services/shift');
const auditLog = require('../main/services/audit-log');
const { registerRoutes } = require('../main/routes');
const { getJWTSecret } = require('../main/routes/auth');

function seedUser(id: string, role = 'cashier'): string {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, role, `${id}@test.local`, bcrypt.hashSync('DayClosePass1', 10), role, now(), now());
  return id;
}

function actor(userId: string, role: string) {
  return { userId, role };
}

function uniqueTerminal(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function insertClosedShift(opts: {
  terminalId: string;
  userId: string;
  closedAt: string;
  openingFloatCents?: number;
  expectedCashCents?: number | null;
  countedCashCents?: number | null;
  varianceCents?: number | null;
}): number {
  const db = getDatabase();
  const t = now();
  const info = db.prepare(`
    INSERT INTO shifts (
      terminal_id, status, opened_by_user_id, closed_by_user_id,
      opening_float_cents, counted_cash_cents, expected_cash_cents, variance_cents,
      opened_at, closed_at, created_at, updated_at
    ) VALUES (?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.terminalId,
    opts.userId,
    opts.userId,
    opts.openingFloatCents ?? 10000,
    opts.countedCashCents === undefined ? 15000 : opts.countedCashCents,
    opts.expectedCashCents === undefined ? 15000 : opts.expectedCashCents,
    opts.varianceCents === undefined ? 0 : opts.varianceCents,
    opts.closedAt,
    opts.closedAt,
    t,
    t,
  );
  return Number(info.lastInsertRowid);
}

function insertBillForShift(shiftId: number, paymentDetails: unknown): number {
  const db = getDatabase();
  const t = now();
  const orderInfo = db.prepare(`
    INSERT INTO orders (order_number, status, subtotal, total, shift_id, created_at, updated_at)
    VALUES (?, 'pending', 100, 100, ?, ?, ?)
  `).run(`ORD-${randomUUID()}`, shiftId, t, t);
  const orderId = Number(orderInfo.lastInsertRowid);
  const billInfo = db.prepare(`
    INSERT INTO bills (
      bill_number, order_id, total, paid_amount, balance, payment_status,
      payment_details, shift_id, created_at, updated_at
    ) VALUES (?, ?, 100, 100, 0, 'paid', ?, ?, ?, ?)
  `).run(
    `BILL-${randomUUID()}`,
    orderId,
    JSON.stringify(paymentDetails),
    shiftId,
    t,
    t,
  );
  return Number(billInfo.lastInsertRowid);
}

function insertRefundForShift(opts: {
  shiftId: number;
  billId: number;
  orderId?: number | null;
  amountCents: number;
  method: string;
  userId: string;
}): number {
  const db = getDatabase();
  const t = now();
  const amount = opts.amountCents / 100;
  const info = db.prepare(`
    INSERT INTO refunds (
      bill_id, order_id, amount, amount_cents, method, original_method,
      reason, status, shift_id, approved_by, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
  `).run(
    opts.billId,
    opts.orderId ?? null,
    amount,
    opts.amountCents,
    opts.method,
    opts.method,
    'day-close refund fixture',
    opts.shiftId,
    opts.userId,
    opts.userId,
    t,
    t,
  );
  return Number(info.lastInsertRowid);
}

function countDayCloses(): number {
  return (getDatabase().prepare('SELECT COUNT(*) AS count FROM day_closes').get() as { count: number }).count;
}

function countAudits(action: string): number {
  return (getDatabase().prepare(
    'SELECT COUNT(*) AS count FROM audit_logs WHERE action = ?',
  ).get(action) as { count: number }).count;
}

function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign({ userId, role }, getJWTSecret(), { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function listen(app: express.Express): Promise<import('http').Server> {
  return await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(
  baseUrl: string,
  pathname: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function main(): Promise<void> {
  initDatabase();
  const db = getDatabase();

  // 1. Fresh install reaches latest schema with day_closes
  assert.equal(db.pragma('user_version', { simple: true }), 83);
  assert.ok(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'day_closes'`).get(),
    'day_closes table exists',
  );
  const cols = (db.prepare(`PRAGMA table_info(day_closes)`).all() as { name: string }[]).map((c) => c.name);
  for (const col of ['id', 'business_date', 'closed_by_user_id', 'summary_json', 'created_at']) {
    assert.ok(cols.includes(col), `day_closes.${col}`);
  }
  console.log('   ✓ migration reaches tip schema; user_version 83');

  // Timezone helpers
  {
    const kolkataDate = businessDateInTimezone('Asia/Kolkata', new Date('2026-08-11T19:00:00.000Z'));
    assert.equal(kolkataDate, '2026-08-12'); // 00:30 IST next day
    const [startK, endK] = localDayBoundsUtc('2026-08-12', 'Asia/Kolkata');
    assert.equal(startK, '2026-08-11 18:30:00');
    assert.equal(endK, '2026-08-12 18:30:00');

    // America/New_York spring-forward day (DST)
    const [nyStart, nyEnd] = localDayBoundsUtc('2026-03-08', 'America/New_York');
    assert.equal(nyStart, '2026-03-08 05:00:00'); // EST UTC-5 before spring forward at 2am
    assert.equal(nyEnd, '2026-03-09 04:00:00'); // EDT UTC-4 after spring forward
    console.log('   ✓ businessDateInTimezone + localDayBoundsUtc (Kolkata + NY DST)');
  }

  const ownerId = seedUser(`owner-${randomUUID()}`, 'owner');
  const managerId = seedUser(`manager-${randomUUID()}`, 'manager');
  const cashierId = seedUser(`cashier-${randomUUID()}`, 'cashier');
  upsertSettings({ timezone: 'Asia/Kolkata', shifts_enabled: 'true' });

  // 2. close business day with one closed shift — persists summary
  {
    const businessDate = '2026-08-10';
    const shiftId = insertClosedShift({
      terminalId: uniqueTerminal('dc-one'),
      userId: cashierId,
      closedAt: '2026-08-10 10:00:00', // within Kolkata day 2026-08-10 (UTC 04:30–28:30 → 18:30 prev–18:30)
      openingFloatCents: 5000,
      expectedCashCents: 7500,
      countedCashCents: 7400,
      varianceCents: -100,
    });
    // Fix closed_at to land inside local day: 2026-08-10 10:00 IST = 2026-08-10 04:30 UTC
    getDatabase().prepare(`UPDATE shifts SET closed_at = ?, opened_at = ? WHERE id = ?`).run(
      '2026-08-10 04:30:00',
      '2026-08-10 04:00:00',
      shiftId,
    );
    insertBillForShift(shiftId, [{ method: 'cash', amount: '25.00' }]);

    const result = closeBusinessDay({
      actor: actor(managerId, 'manager'),
      businessDate,
    });
    assert.equal(result.summary.business_date, businessDate);
    assert.equal(result.summary.timezone, 'Asia/Kolkata');
    assert.equal(result.summary.shift_count, 1);
    assert.equal(result.summary.opening_float_cents_total, 5000);
    assert.equal(result.summary.expected_cash_cents_total, 7500);
    assert.equal(result.summary.counted_cash_cents_total, 7400);
    assert.equal(result.summary.variance_cents_total, -100);
    assert.equal(result.summary.cash_payment_total_cents, 2500);
    assert.equal(result.summary.cash_payment_count, 1);
    assert.equal(result.summary.cash_refund_total_cents, 0, 'no refunds → cash refunds 0');
    assert.equal(result.summary.cash_refund_count, 0);
    assert.equal(result.summary.net_cash_movement_cents, 2500, 'net cash = cash in');
    assert.equal(result.summary.shifts[0].expected_cash_cents, 7500);
    assert.equal(result.summary.shifts[0].cash_refund_total_cents, 0);
    assert.equal(result.day_close.business_date, businessDate);
    const stored = getDayClose(businessDate);
    assert.ok(stored);
    assert.equal(JSON.parse(stored!.summary_json).expected_cash_cents_total, 7500);
    console.log('   ✓ close with one closed shift persists summary');
  }

  // 3. multiple shifts / terminals aggregated
  {
    const businessDate = '2026-08-09';
    const a = insertClosedShift({
      terminalId: uniqueTerminal('dc-a'),
      userId: cashierId,
      closedAt: '2026-08-09 05:00:00',
      openingFloatCents: 1000,
      expectedCashCents: 2000,
      countedCashCents: 2100,
      varianceCents: 100,
    });
    const b = insertClosedShift({
      terminalId: uniqueTerminal('dc-b'),
      userId: cashierId,
      closedAt: '2026-08-09 06:00:00',
      openingFloatCents: 3000,
      expectedCashCents: 4000,
      countedCashCents: 3900,
      varianceCents: -100,
    });
    insertBillForShift(a, [{ method: 'cash', amount: 10 }]);
    insertBillForShift(b, [{ method: 'cash', amount: 10 }, { method: 'card', amount: 5 }]);

    const result = closeBusinessDay({
      actor: actor(ownerId, 'owner'),
      businessDate,
    });
    assert.equal(result.summary.shift_count, 2);
    assert.equal(result.summary.opening_float_cents_total, 4000);
    assert.equal(result.summary.expected_cash_cents_total, 6000);
    assert.equal(result.summary.counted_cash_cents_total, 6000);
    assert.equal(result.summary.variance_cents_total, 0);
    assert.equal(result.summary.cash_payment_total_cents, 2000);
    assert.equal(result.summary.cash_payment_count, 2);
    assert.equal(result.summary.cash_refund_total_cents, 0);
    assert.equal(result.summary.net_cash_movement_cents, 2000);
    console.log('   ✓ multiple shifts/terminals aggregated');
  }

  // 4. open shifts → warning true, still succeeds
  {
    upsertSettings({ shifts_enabled: 'true' });
    const openTerm = uniqueTerminal('dc-open');
    openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: openTerm,
      openingFloatCents: 100,
    });
    const businessDate = '2026-08-08';
    insertClosedShift({
      terminalId: uniqueTerminal('dc-warn'),
      userId: cashierId,
      closedAt: '2026-08-08 05:00:00',
      openingFloatCents: 500,
      expectedCashCents: 500,
      countedCashCents: 500,
      varianceCents: 0,
    });
    const result = closeBusinessDay({
      actor: actor(managerId, 'manager'),
      businessDate,
    });
    assert.equal(result.summary.open_shifts_warning, true);
    assert.ok(result.summary.open_shift_count >= 1);
    console.log('   ✓ open shifts → warning true, close succeeds');
  }

  // 5. duplicate POST → 409, single row
  {
    const businessDate = '2026-08-10';
    assert.equal(countDayCloses() >= 1, true);
    const before = countDayCloses();
    try {
      closeBusinessDay({ actor: actor(ownerId, 'owner'), businessDate });
      assert.fail('duplicate close should throw');
    } catch (error) {
      assert.ok(error instanceof DayCloseServiceError);
      assert.equal((error as InstanceType<typeof DayCloseServiceError>).statusCode, 409);
      assert.equal((error as InstanceType<typeof DayCloseServiceError>).code, 'DAY_CLOSE_EXISTS');
    }
    assert.equal(countDayCloses(), before);
    console.log('   ✓ duplicate close → 409, single row');
  }

  // 6. GET returns snapshot
  {
    const stored = getDayClose('2026-08-10');
    assert.ok(stored);
    const summary = JSON.parse(stored!.summary_json);
    assert.equal(summary.business_date, '2026-08-10');
    assert.equal(summary.shift_count, 1);
    console.log('   ✓ GET snapshot via getDayClose');
  }

  // 7. unauthorized cashier → 403 (service + HTTP)
  {
    try {
      closeBusinessDay({ actor: actor(cashierId, 'cashier'), businessDate: '2026-08-07' });
      assert.fail('cashier should be forbidden');
    } catch (error) {
      assert.ok(error instanceof DayCloseServiceError);
      assert.equal((error as InstanceType<typeof DayCloseServiceError>).statusCode, 403);
    }
  }

  // 8. timezone: closed_at just before/after local midnight
  {
    const businessDate = '2026-08-06';
    // Local midnight IST 2026-08-06 = 2026-08-05 18:30:00 UTC
    // Just before: 2026-08-05 18:29:59 → previous day
    insertClosedShift({
      terminalId: uniqueTerminal('dc-before'),
      userId: cashierId,
      closedAt: '2026-08-05 18:29:59',
      openingFloatCents: 111,
      expectedCashCents: 111,
      countedCashCents: 111,
      varianceCents: 0,
    });
    // Just after midnight: 2026-08-05 18:30:00 → in businessDate
    insertClosedShift({
      terminalId: uniqueTerminal('dc-after'),
      userId: cashierId,
      closedAt: '2026-08-05 18:30:00',
      openingFloatCents: 222,
      expectedCashCents: 222,
      countedCashCents: 222,
      varianceCents: 0,
    });
    // End exclusive: 2026-08-06 18:30:00 → next day
    insertClosedShift({
      terminalId: uniqueTerminal('dc-end'),
      userId: cashierId,
      closedAt: '2026-08-06 18:30:00',
      openingFloatCents: 333,
      expectedCashCents: 333,
      countedCashCents: 333,
      varianceCents: 0,
    });
    const result = closeBusinessDay({
      actor: actor(managerId, 'manager'),
      businessDate,
    });
    assert.equal(result.summary.shift_count, 1);
    assert.equal(result.summary.opening_float_cents_total, 222);
    console.log('   ✓ closed_at near local midnight lands in correct business date');
  }

  // 9. empty day allowed
  {
    const result = closeBusinessDay({
      actor: actor(ownerId, 'owner'),
      businessDate: '2026-08-01',
    });
    assert.equal(result.summary.shift_count, 0);
    assert.deepEqual(result.summary.shifts, []);
    assert.equal(result.summary.cash_payment_total_cents, 0);
    assert.equal(result.summary.cash_refund_total_cents, 0);
    assert.equal(result.summary.net_cash_movement_cents, 0);
    console.log('   ✓ empty day allowed');
  }

  // 10. audit day.closed once; audit failure rolls back insert
  {
    const businessDate = '2026-07-31';
    const auditsBefore = countAudits('day.closed');
    closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
    assert.equal(countAudits('day.closed'), auditsBefore + 1);

    const beforeDup = countAudits('day.closed');
    try {
      closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
      assert.fail('expected 409');
    } catch (error) {
      assert.equal((error as InstanceType<typeof DayCloseServiceError>).statusCode, 409);
    }
    assert.equal(countAudits('day.closed'), beforeDup, 'no duplicate audit on 409');

    const failDate = '2026-07-30';
    const originalLog = auditLog.logAuditEvent;
    auditLog.logAuditEvent = () => {
      throw new Error('forced audit failure');
    };
    try {
      closeBusinessDay({ actor: actor(ownerId, 'owner'), businessDate: failDate });
      assert.fail('should throw');
    } catch (error) {
      assert.equal((error as Error).message, 'forced audit failure');
    } finally {
      auditLog.logAuditEvent = originalLog;
    }
    assert.equal(getDayClose(failDate), null, 'failed audit rolls back insert');
    assert.equal(countAudits('day.closed'), beforeDup);
    console.log('   ✓ audit day.closed once; failure rolls back; no audit on 409');
  }

  // 11. uses persisted expected/variance (not recomputed differently from shifts columns)
  {
    const businessDate = '2026-07-29';
    const shiftId = insertClosedShift({
      terminalId: uniqueTerminal('dc-persist'),
      userId: cashierId,
      closedAt: '2026-07-29 05:00:00',
      openingFloatCents: 1000,
      expectedCashCents: 9999, // deliberately != opening + cash
      countedCashCents: 9000,
      varianceCents: -999,
    });
    insertBillForShift(shiftId, [{ method: 'cash', amount: 50 }]); // would imply expected 6000 if recomputed
    const result = closeBusinessDay({
      actor: actor(managerId, 'manager'),
      businessDate,
    });
    assert.equal(result.summary.expected_cash_cents_total, 9999);
    assert.equal(result.summary.variance_cents_total, -999);
    assert.equal(result.summary.shifts[0].expected_cash_cents, 9999);
    assert.equal(result.summary.cash_payment_total_cents, 5000, 'cash still recomputed from bills');
    assert.equal(result.summary.cash_refund_total_cents, 0);
    assert.equal(result.summary.net_cash_movement_cents, 5000);
    console.log('   ✓ uses persisted expected/variance columns');
  }

  // 12b–21. Cash refunds in day-close summary (reuse shift payment summary; no second formula)
  {
    const { getShiftPaymentSummary, computeExpectedCashCents } = require('../main/services/shift');

    // 12b. Day close with cash refund (Cash In 1000, Refund 300, Net 700)
    {
      const businessDate = '2026-07-26';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-cash-ref'),
        userId: cashierId,
        closedAt: '2026-07-26 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 700,
        countedCashCents: 700,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({
        shiftId,
        billId,
        amountCents: 300,
        method: 'cash',
        userId: managerId,
      });
      const result = closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
      assert.equal(result.summary.cash_payment_total_cents, 1000, 'Cash In ₹10.00');
      assert.equal(result.summary.cash_refund_total_cents, 300, 'Cash Refunds ₹3.00');
      assert.equal(result.summary.cash_refund_count, 1);
      assert.equal(result.summary.net_cash_movement_cents, 700, 'Net Cash ₹7.00');
      assert.equal(result.summary.shifts[0].cash_payment_total_cents, 1000);
      assert.equal(result.summary.shifts[0].cash_refund_total_cents, 300);
      assert.equal(result.summary.shifts[0].net_cash_movement_cents, 700);
      console.log('   ✓ day close with cash refund: In 1000 − Refund 300 = Net 700');
    }

    // 13. Multiple cash refunds
    {
      const businessDate = '2026-07-25';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-multi-ref'),
        userId: cashierId,
        closedAt: '2026-07-25 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 400,
        countedCashCents: 400,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({ shiftId, billId, amountCents: 200, method: 'cash', userId: managerId });
      insertRefundForShift({ shiftId, billId, amountCents: 400, method: 'cash', userId: managerId });
      const result = closeBusinessDay({ actor: actor(ownerId, 'owner'), businessDate });
      assert.equal(result.summary.cash_payment_total_cents, 1000);
      assert.equal(result.summary.cash_refund_total_cents, 600);
      assert.equal(result.summary.cash_refund_count, 2);
      assert.equal(result.summary.net_cash_movement_cents, 400);
      console.log('   ✓ day close with multiple cash refunds');
    }

    // 14. Card refund does not reduce cash
    {
      const businessDate = '2026-07-24';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-card-ref'),
        userId: cashierId,
        closedAt: '2026-07-24 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 1000,
        countedCashCents: 1000,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({ shiftId, billId, amountCents: 300, method: 'card', userId: managerId });
      const result = closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
      assert.equal(result.summary.cash_payment_total_cents, 1000);
      assert.equal(result.summary.cash_refund_total_cents, 0, 'card refund → Cash Refund = 0');
      assert.equal(result.summary.net_cash_movement_cents, 1000);
      console.log('   ✓ card refund does not reduce day-close cash');
    }

    // 15. Wallet refund does not reduce cash
    {
      const businessDate = '2026-07-23';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-wallet-ref'),
        userId: cashierId,
        closedAt: '2026-07-23 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 1000,
        countedCashCents: 1000,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({ shiftId, billId, amountCents: 500, method: 'wallet', userId: managerId });
      const result = closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
      assert.equal(result.summary.cash_refund_total_cents, 0);
      assert.equal(result.summary.net_cash_movement_cents, 1000);
      console.log('   ✓ wallet refund does not reduce day-close cash');
    }

    // 16. Mixed cash + card refunds
    {
      const businessDate = '2026-07-22';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-mixed-ref'),
        userId: cashierId,
        closedAt: '2026-07-22 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 700,
        countedCashCents: 700,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({ shiftId, billId, amountCents: 300, method: 'cash', userId: managerId });
      insertRefundForShift({ shiftId, billId, amountCents: 200, method: 'card', userId: managerId });
      const result = closeBusinessDay({ actor: actor(ownerId, 'owner'), businessDate });
      assert.equal(result.summary.cash_refund_total_cents, 300);
      assert.equal(result.summary.cash_refund_count, 1);
      assert.equal(result.summary.net_cash_movement_cents, 700);
      console.log('   ✓ mixed cash/card refunds: only cash counts');
    }

    // 17–18. Late refund on new open shift; closed shift expected immutable
    {
      upsertSettings({ shifts_enabled: 'true', require_open_shift_for_cash: 'false' });
      const termA = uniqueTerminal('dc-late-a');
      const termB = uniqueTerminal('dc-late-b');
      const shiftA = openShift({
        actor: actor(cashierId, 'cashier'),
        terminalId: termA,
        openingFloatCents: 0,
      });
      const billId = insertBillForShift(shiftA.id, [{ method: 'cash', amount: 10 }]);
      const expectedBeforeClose = computeExpectedCashCents(shiftA.id);
      assert.equal(expectedBeforeClose, 1000);
      closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shiftA.id,
        terminalId: termA,
        countedCashCents: 1000,
      });
      const closedA = getDatabase().prepare(
        'SELECT expected_cash_cents, status FROM shifts WHERE id = ?',
      ).get(shiftA.id) as { expected_cash_cents: number; status: string };
      assert.equal(closedA.status, 'closed');
      assert.equal(closedA.expected_cash_cents, 1000);

      const shiftB = openShift({
        actor: actor(cashierId, 'cashier'),
        terminalId: termB,
        openingFloatCents: 0,
      });
      // Late cash refund attributed to current open shift B (M6 rule), not A.
      insertRefundForShift({
        shiftId: shiftB.id,
        billId,
        amountCents: 300,
        method: 'cash',
        userId: managerId,
      });
      const aAfterLate = getDatabase().prepare(
        'SELECT expected_cash_cents FROM shifts WHERE id = ?',
      ).get(shiftA.id) as { expected_cash_cents: number };
      assert.equal(aAfterLate.expected_cash_cents, 1000, 'closed shift expected unchanged');

      closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shiftB.id,
        terminalId: termB,
        countedCashCents: null,
      });
      const closedB = getDatabase().prepare(
        'SELECT expected_cash_cents FROM shifts WHERE id = ?',
      ).get(shiftB.id) as { expected_cash_cents: number };
      assert.equal(closedB.expected_cash_cents, -300);

      // Force both into the same business-date window for day close.
      const businessDate = '2026-07-21';
      getDatabase().prepare(`UPDATE shifts SET closed_at = ?, opened_at = ? WHERE id = ?`).run(
        '2026-07-21 05:00:00', '2026-07-21 04:00:00', shiftA.id,
      );
      getDatabase().prepare(`UPDATE shifts SET closed_at = ?, opened_at = ? WHERE id = ?`).run(
        '2026-07-21 06:00:00', '2026-07-21 05:30:00', shiftB.id,
      );

      const result = closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
      assert.equal(result.summary.shift_count, 2);
      assert.equal(result.summary.cash_payment_total_cents, 1000, 'cash in from shift A');
      assert.equal(result.summary.cash_refund_total_cents, 300, 'late refund on shift B');
      assert.equal(result.summary.net_cash_movement_cents, 700);
      assert.equal(result.summary.expected_cash_cents_total, 1000 + (-300), 'persisted expected sum');
      const shiftASummary = result.summary.shifts.find((s: { id: number }) => s.id === shiftA.id);
      assert.equal(shiftASummary.expected_cash_cents, 1000, 'day close keeps closed A expected');
      console.log('   ✓ late refund on new shift; closed shift expected immutable');
    }

    // 19. Day-close totals equal shift-level getShiftPaymentSummary sums
    {
      const businessDate = '2026-07-20';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-eq'),
        userId: cashierId,
        closedAt: '2026-07-20 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 700,
        countedCashCents: 700,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({ shiftId, billId, amountCents: 300, method: 'cash', userId: managerId });
      const shiftSum = getShiftPaymentSummary(shiftId);
      const result = closeBusinessDay({ actor: actor(ownerId, 'owner'), businessDate });
      assert.equal(result.summary.cash_payment_total_cents, shiftSum.cash_payment_total_cents);
      assert.equal(result.summary.cash_refund_total_cents, shiftSum.cash_refund_total_cents);
      assert.equal(
        result.summary.net_cash_movement_cents,
        shiftSum.cash_payment_total_cents - shiftSum.cash_refund_total_cents,
      );
      console.log('   ✓ day-close totals equal shift-level payment summary');
    }

    // 20. Refund cannot be counted twice
    {
      const businessDate = '2026-07-19';
      const shiftId = insertClosedShift({
        terminalId: uniqueTerminal('dc-once'),
        userId: cashierId,
        closedAt: '2026-07-19 05:00:00',
        openingFloatCents: 0,
        expectedCashCents: 700,
        countedCashCents: 700,
        varianceCents: 0,
      });
      const billId = insertBillForShift(shiftId, [{ method: 'cash', amount: 10 }]);
      insertRefundForShift({ shiftId, billId, amountCents: 300, method: 'cash', userId: managerId });
      const result = closeBusinessDay({ actor: actor(managerId, 'manager'), businessDate });
      assert.equal(result.summary.cash_refund_count, 1);
      assert.equal(result.summary.cash_refund_total_cents, 300);
      const refundRows = (getDatabase().prepare(
        `SELECT COUNT(*) AS c FROM refunds WHERE shift_id = ? AND method = 'cash' AND status = 'completed'`,
      ).get(shiftId) as { c: number }).c;
      assert.equal(refundRows, 1);
      assert.equal(result.summary.cash_refund_total_cents, 300, 'not double-counted');
      console.log('   ✓ refund counted once in day close');
    }
  }

  // 12. shifts_enabled=false still allows day close for manager
  {
    upsertSettings({ shifts_enabled: 'false' });
    const result = closeBusinessDay({
      actor: actor(managerId, 'manager'),
      businessDate: '2026-07-28',
    });
    assert.equal(result.summary.business_date, '2026-07-28');
    upsertSettings({ shifts_enabled: 'true' });
    console.log('   ✓ shifts_enabled=false still allows day close');
  }

  // HTTP: unauthorized cashier 403 + happy path GET/POST
  {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      const header = req.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        const decoded = jwt.verify(header.slice(7), getJWTSecret()) as any;
        req.user = { userId: decoded.userId, role: decoded.role };
      }
      next();
    });
    registerRoutes(app);
    const server = await listen(app);
    const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

    const denied = await request(baseUrl, '/api/reports/day-close', {
      method: 'POST',
      headers: authHeader(cashierId, 'cashier'),
      body: JSON.stringify({ business_date: '2026-07-27' }),
    });
    assert.equal(denied.status, 403);
    assert.equal(/UNIQUE|SQLITE|constraint/i.test(JSON.stringify(denied.data)), false);

    const created = await request(baseUrl, '/api/reports/day-close', {
      method: 'POST',
      headers: authHeader(managerId, 'manager'),
      body: JSON.stringify({ business_date: '2026-07-27' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.summary.business_date, '2026-07-27');

    const got = await request(baseUrl, '/api/reports/day-close/2026-07-27', {
      headers: authHeader(ownerId, 'owner'),
    });
    assert.equal(got.status, 200);
    assert.equal(got.data.summary.business_date, '2026-07-27');
    assert.equal(got.data.day_close.business_date, '2026-07-27');

    const missing = await request(baseUrl, '/api/reports/day-close/2099-01-01', {
      headers: authHeader(ownerId, 'owner'),
    });
    assert.equal(missing.status, 404);

    const dup = await request(baseUrl, '/api/reports/day-close', {
      method: 'POST',
      headers: authHeader(ownerId, 'owner'),
      body: JSON.stringify({ business_date: '2026-07-27' }),
    });
    assert.equal(dup.status, 409);
    assert.equal(/UNIQUE|SQLITE|constraint/i.test(JSON.stringify(dup.data)), false);

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('   ✓ HTTP day-close: 403 cashier, 201/200/404/409');
  }

  closeDatabase();
  console.log('\nAll day-close tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

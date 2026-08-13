/**
 * M6 — Refund workflow integration tests.
 *
 * Scenarios: full/partial refund, already-refunded, idempotency, invalid amount,
 * unauthorized, after shift close, cash recon impact, audit, bill state consistency,
 * transactional failure safety, idempotency conflict, card refund cash-neutral,
 * concurrent over-refund protection, PIN required for managers.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/integration-refunds.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-refunds-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'refund-integration-test-secret';

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory, seedProduct,
  api, assert, assertEqual, getResults, closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');

let refundRoutes: any;
try {
  ({ refundRoutes } = require('../main/routes/refunds'));
} catch (err: any) {
  console.error('RED: main/routes/refunds.ts is missing — M6 not implemented yet.');
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}

const { openShift, closeShift, computeExpectedCashCents } = require('../main/services/shift');
const { upsertSettings } = require('../main/db');

function seedCashierUser(db: any): { userId: string; authHeader: Record<string, string> } {
  const { getJWTSecret } = require('../main/routes/auth');
  const userId = 'cashier-refund-001';
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, 'Test Cashier', 'cashier@test.local', passwordHash, 'cashier', 1, now(), now());
  const token = jwt.sign(
    { userId, email: 'cashier@test.local', role: 'cashier' },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { userId, authHeader: { Authorization: `Bearer ${token}` } };
}

async function createPaidBill(
  baseUrl: string,
  authHeader: Record<string, string>,
  opts: { productId: string; method?: string; terminalId?: string },
): Promise<{ orderId: string; billId: number; total: number; paidAmount: number }> {
  const headers = { ...authHeader } as Record<string, string>;
  if (opts.terminalId) headers['X-Flo-Terminal-Id'] = opts.terminalId;

  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: opts.productId, quantity: 1 }] },
    headers,
  });
  assertEqual(order.status, 201, 'order created');
  const orderId = order.data.order.id;
  const total = order.data.order.total;

  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: orderId },
    headers: authHeader,
  });
  assertEqual(bill.status, 201, 'bill created');
  const billId = bill.data.bill.id;

  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    body: { method: opts.method || 'cash', amount: total },
    headers,
  });
  assertEqual(pay.status, 200, 'payment accepted');
  assertEqual(pay.data.bill.payment_status, 'paid', 'bill paid');

  return { orderId, billId, total, paidAmount: pay.data.bill.paid_amount };
}

async function main() {
  console.log('M6 Integration Test: Refunds');
  console.log('='.repeat(60));

  const db = initTestDb();
  seedOwnerUser(db);
  const { userId: managerId, authHeader: managerAuth } = seedManagerUser(db);
  const { authHeader: cashierAuth } = seedCashierUser(db);
  seedCategory(db, 'cat-ref', 'Refund Menu');
  seedProduct(db, 'prod-ref-1', 'cat-ref', 'Refund Latte', 100);

  // POST /api/bills/:id/refund lives on refundRoutes (mounted at /api/bills).
  // GET /api/refunds can share the same router when implemented.
  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);

  const { baseUrl, server } = await startServer(app);
  const terminalId = 'refund-terminal-test-1';

  try {
    // ── 1. Full refund ─────────────────────────────────────────────────
    console.log('\n─── 1. Full refund ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: {
          method: 'cash',
          reason: 'Full refund test',
          override_pin: '1234',
          manager_id: managerId,
        },
        headers: {
          ...managerAuth,
          'Idempotency-Key': `full-${paid.billId}`,
        },
      });
      assertEqual(refund.status, 200, 'full refund returns 200');
      assertEqual(refund.data.bill.payment_status, 'refunded', 'bill status refunded');
      assertEqual(Number(refund.data.bill.paid_amount), 0, 'paid_amount is 0 after full refund');
      assert(refund.data.refund && Number(refund.data.refund.amount) === Number(paid.total), 'refund amount equals paid total');
    }

    // ── 2. Partial refund ──────────────────────────────────────────────
    console.log('\n─── 2. Partial refund ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const partial = Math.round(paid.total * 0.4 * 100) / 100;
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: {
          amount: partial,
          method: 'cash',
          reason: 'Partial refund test',
          override_pin: '1234',
        },
        headers: {
          ...managerAuth,
          'Idempotency-Key': `partial-${paid.billId}`,
        },
      });
      assertEqual(refund.status, 200, 'partial refund returns 200');
      assertEqual(refund.data.bill.payment_status, 'partially_refunded', 'status partially_refunded');
      const expectedPaid = Math.round((paid.total - partial) * 100) / 100;
      assertEqual(Number(refund.data.bill.paid_amount), expectedPaid, `paid_amount = ${expectedPaid}`);
    }

    // ── 3. Already-refunded payment ────────────────────────────────────
    console.log('\n─── 3. Already-refunded payment ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const first = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'First full', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `already-1-${paid.billId}` },
      });
      assertEqual(first.status, 200, 'first full refund ok');
      const second = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'Second full', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `already-2-${paid.billId}` },
      });
      assert(second.status === 409 || second.status === 400, 'second refund rejected');
      assertEqual(second.data.code, 'REFUND_NOTHING_TO_REFUND', 'nothing-to-refund code');
      assertEqual(Number(second.data.bill?.paid_amount ?? 0), 0, 'paid_amount remains 0');
    }

    // ── 4. Duplicate refund request (idempotency) ──────────────────────
    console.log('\n─── 4. Duplicate refund request ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const key = `dup-${paid.billId}`;
      const body = {
        amount: 10,
        method: 'cash',
        reason: 'Idempotent partial',
        override_pin: '1234',
      };
      const r1 = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body,
        headers: { ...managerAuth, 'Idempotency-Key': key },
      });
      assertEqual(r1.status, 200, 'first idempotent refund ok');
      const r2 = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body,
        headers: { ...managerAuth, 'Idempotency-Key': key },
      });
      assertEqual(r2.status, 200, 'replay returns 200');
      assertEqual(r2.data.refund.id, r1.data.refund.id, 'replay returns same refund id');
      const rows = db.prepare('SELECT COUNT(*) AS c FROM refunds WHERE bill_id = ?').get(String(paid.billId)) as { c: number };
      assertEqual(rows.c, 1, 'only one refund row persisted');
    }

    // ── 5. Invalid refund amount ───────────────────────────────────────
    console.log('\n─── 5. Invalid refund amount ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const zero = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: 0, method: 'cash', reason: 'zero', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `inv-0-${paid.billId}` },
      });
      assertEqual(zero.status, 400, 'amount 0 rejected');
      assertEqual(zero.data.code, 'REFUND_AMOUNT_INVALID', 'invalid amount code');

      const over = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: paid.total + 50, method: 'cash', reason: 'over', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `inv-over-${paid.billId}` },
      });
      assert(over.status === 400 || over.status === 409, 'over-refund rejected');
      assertEqual(over.data.code, 'REFUND_EXCEEDS_PAID', 'exceeds paid code');
    }

    // ── 6. Unauthorized refund ─────────────────────────────────────────
    console.log('\n─── 6. Unauthorized refund ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const noPin = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'cashier no pin' },
        headers: { ...cashierAuth, 'Idempotency-Key': `unauth-nopin-${paid.billId}` },
      });
      assert(noPin.status === 400 || noPin.status === 403, 'cashier without PIN rejected');
      assertEqual(noPin.data.code, 'REFUND_PIN_REQUIRED', 'pin required code');

      const badPin = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'bad pin', override_pin: '9999' },
        headers: { ...cashierAuth, 'Idempotency-Key': `unauth-badpin-${paid.billId}` },
      });
      assertEqual(badPin.status, 403, 'bad PIN rejected');
      assertEqual(badPin.data.code, 'REFUND_PIN_INVALID', 'invalid pin code');

      const managerNoPin = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'manager no pin' },
        headers: { ...managerAuth, 'Idempotency-Key': `unauth-mgr-nopin-${paid.billId}` },
      });
      assertEqual(managerNoPin.status, 403, 'manager without PIN rejected');
      assertEqual(managerNoPin.data.code, 'REFUND_PIN_REQUIRED', 'manager pin required');
    }

    // ── 7. Refund after shift close ────────────────────────────────────
    console.log('\n─── 7. Refund after shift close ───');
    {
      upsertSettings({
        shifts_enabled: 'true',
        require_open_shift_for_cash: 'true',
        terminal_id: terminalId,
      });
      const shift1 = openShift({
        actor: { userId: managerId, role: 'manager' },
        terminalId,
        openingFloatCents: 10000,
      });
      const paid = await createPaidBill(baseUrl, managerAuth, {
        productId: 'prod-ref-1',
        method: 'cash',
        terminalId,
      });
      closeShift({
        actor: { userId: managerId, role: 'manager' },
        shiftId: shift1.id,
        terminalId,
        countedCashCents: null,
      });
      const closedExpected = db.prepare('SELECT expected_cash_cents FROM shifts WHERE id = ?').get(shift1.id) as {
        expected_cash_cents: number;
      };

      const shift2 = openShift({
        actor: { userId: managerId, role: 'manager' },
        terminalId,
        openingFloatCents: 5000,
      });
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'After close', override_pin: '1234' },
        headers: {
          ...managerAuth,
          'Idempotency-Key': `after-close-${paid.billId}`,
          'X-Flo-Terminal-Id': terminalId,
        },
      });
      assertEqual(refund.status, 200, 'refund after prior shift close ok');
      assertEqual(refund.data.refund.shift_id, shift2.id, 'refund attributed to current open shift');
      const stillClosed = db.prepare('SELECT expected_cash_cents FROM shifts WHERE id = ?').get(shift1.id) as {
        expected_cash_cents: number;
      };
      assertEqual(
        stillClosed.expected_cash_cents,
        closedExpected.expected_cash_cents,
        'closed shift expected_cash unchanged',
      );
      closeShift({
        actor: { userId: managerId, role: 'manager' },
        shiftId: shift2.id,
        terminalId,
        countedCashCents: null,
      });
      upsertSettings({ shifts_enabled: 'false', require_open_shift_for_cash: 'false' });
    }

    // ── 8. Cash reconciliation impact ──────────────────────────────────
    console.log('\n─── 8. Cash reconciliation impact ───');
    {
      upsertSettings({
        shifts_enabled: 'true',
        require_open_shift_for_cash: 'true',
        terminal_id: terminalId,
      });
      const shift = openShift({
        actor: { userId: managerId, role: 'manager' },
        terminalId,
        openingFloatCents: 0,
      });
      const paid = await createPaidBill(baseUrl, managerAuth, {
        productId: 'prod-ref-1',
        method: 'cash',
        terminalId,
      });
      const before = computeExpectedCashCents(shift.id);
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: paid.total, method: 'cash', reason: 'Recon', override_pin: '1234' },
        headers: {
          ...managerAuth,
          'Idempotency-Key': `recon-${paid.billId}`,
          'X-Flo-Terminal-Id': terminalId,
        },
      });
      assertEqual(refund.status, 200, 'recon refund ok');
      const after = computeExpectedCashCents(shift.id);
      const refundCents = Math.round(Number(paid.total) * 100);
      assertEqual(after, before - refundCents, 'expected cash decreases by cash refund cents');
      closeShift({
        actor: { userId: managerId, role: 'manager' },
        shiftId: shift.id,
        terminalId,
        countedCashCents: after,
      });
      upsertSettings({ shifts_enabled: 'false', require_open_shift_for_cash: 'false' });
    }

    // ── 9. Audit record creation ───────────────────────────────────────
    console.log('\n─── 9. Audit record creation ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'Audit me', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `audit-${paid.billId}` },
      });
      assertEqual(refund.status, 200, 'audit refund ok');
      const audit = db.prepare(
        `SELECT action, entity_type, reason FROM audit_logs WHERE action = 'payment.refunded' ORDER BY id DESC LIMIT 1`,
      ).get() as { action: string; entity_type: string; reason: string } | undefined;
      assert(!!audit, 'payment.refunded audit row exists');
      assertEqual(audit!.action, 'payment.refunded', 'audit action');
      assertEqual(audit!.reason, 'Audit me', 'audit reason stored');
    }

    // ── 10. Payment / order state consistency ──────────────────────────
    console.log('\n─── 10. Payment/order state consistency ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const orderBefore = db.prepare('SELECT status, total FROM orders WHERE id = ?').get(paid.orderId) as {
        status: string;
        total: number;
      };
      await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'State check', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `state-${paid.billId}` },
      });
      const orderAfter = db.prepare('SELECT status, total FROM orders WHERE id = ?').get(paid.orderId) as {
        status: string;
        total: number;
      };
      const billAfter = db.prepare('SELECT paid_amount, payment_status, total FROM bills WHERE id = ?').get(paid.billId) as {
        paid_amount: number;
        payment_status: string;
        total: number;
      };
      assertEqual(orderAfter.status, orderBefore.status, 'order status unchanged by refund');
      assertEqual(Number(orderAfter.total), Number(orderBefore.total), 'order total unchanged');
      assertEqual(Number(billAfter.total), Number(paid.total), 'bill total unchanged');
      assertEqual(Number(billAfter.paid_amount), 0, 'bill paid_amount zero');
      assertEqual(billAfter.payment_status, 'refunded', 'bill refunded');
    }

    // ── 11. Failure during refund processing (missing reason) ──────────
    console.log('\n─── 11. Failure during refund processing ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const failed = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `fail-${paid.billId}` },
      });
      assertEqual(failed.status, 400, 'missing reason rejected');
      assertEqual(failed.data.code, 'REFUND_REASON_REQUIRED', 'reason required code');
      const bill = db.prepare('SELECT paid_amount, payment_status FROM bills WHERE id = ?').get(paid.billId) as {
        paid_amount: number;
        payment_status: string;
      };
      assertEqual(bill.payment_status, 'paid', 'bill remains paid after failed refund');
      assertEqual(Number(bill.paid_amount), Number(paid.paidAmount), 'paid_amount unchanged after failure');
      const count = db.prepare('SELECT COUNT(*) AS c FROM refunds WHERE bill_id = ?').get(String(paid.billId)) as { c: number };
      assertEqual(count.c, 0, 'no refund row after failed attempt');
    }

    // ── 12. Idempotency conflict (same key, different body) ────────────
    console.log('\n─── 12. Idempotency conflict ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const key = `conflict-${paid.billId}`;
      const first = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: 10, method: 'cash', reason: 'First body', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': key },
      });
      assertEqual(first.status, 200, 'first refund ok');
      const conflict = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: 20, method: 'cash', reason: 'Different body', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': key },
      });
      assertEqual(conflict.status, 409, 'idempotency conflict returns 409');
      assertEqual(conflict.data.code, 'REFUND_IDEMPOTENCY_CONFLICT', 'idempotency conflict code');
      const rows = db.prepare('SELECT COUNT(*) AS c FROM refunds WHERE bill_id = ?').get(String(paid.billId)) as { c: number };
      assertEqual(rows.c, 1, 'conflict does not create second refund');
    }

    // ── 13. Card refund does not change expected cash ──────────────────
    console.log('\n─── 13. Card refund cash-neutral ───');
    {
      upsertSettings({
        shifts_enabled: 'true',
        require_open_shift_for_cash: 'false',
        terminal_id: terminalId,
      });
      const shift = openShift({
        actor: { userId: managerId, role: 'manager' },
        terminalId,
        openingFloatCents: 2500,
      });
      const paid = await createPaidBill(baseUrl, managerAuth, {
        productId: 'prod-ref-1',
        method: 'card',
        terminalId,
      });
      const before = computeExpectedCashCents(shift.id);
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'card', reason: 'Card record only', override_pin: '1234' },
        headers: {
          ...managerAuth,
          'Idempotency-Key': `card-${paid.billId}`,
          'X-Flo-Terminal-Id': terminalId,
        },
      });
      assertEqual(refund.status, 200, 'card refund ok');
      assertEqual(refund.data.bill.payment_status, 'refunded', 'card bill refunded');
      const after = computeExpectedCashCents(shift.id);
      assertEqual(after, before, 'expected cash unchanged after card refund');
      closeShift({
        actor: { userId: managerId, role: 'manager' },
        shiftId: shift.id,
        terminalId,
        countedCashCents: null,
      });
      upsertSettings({ shifts_enabled: 'false', require_open_shift_for_cash: 'false' });
    }

    // ── 14. Concurrent over-refund protection ──────────────────────────
    console.log('\n─── 14. Concurrent over-refund protection ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const half = Math.round(Number(paid.total) * 50) / 100;
      const halfPlusOne = Math.round((half + 0.01) * 100) / 100;
      const [a, b] = await Promise.all([
        api(baseUrl, `/api/bills/${paid.billId}/refund`, {
          method: 'POST',
          body: { amount: half, method: 'cash', reason: 'Concurrent A', override_pin: '1234' },
          headers: { ...managerAuth, 'Idempotency-Key': `conc-a-${paid.billId}` },
        }),
        api(baseUrl, `/api/bills/${paid.billId}/refund`, {
          method: 'POST',
          body: { amount: halfPlusOne, method: 'cash', reason: 'Concurrent B', override_pin: '1234' },
          headers: { ...managerAuth, 'Idempotency-Key': `conc-b-${paid.billId}` },
        }),
      ]);
      const statuses = [a.status, b.status].sort();
      assert(statuses.includes(200), 'at least one concurrent refund succeeds');
      const refunded = db.prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refunds WHERE bill_id = ? AND status = 'completed'`,
      ).get(String(paid.billId)) as { total: number };
      const paidCents = Math.round(Number(paid.total) * 100);
      assert(Number(refunded.total) <= paidCents, 'total refunded cents never exceeds paid');
      assert(Number(refunded.total) > 0, 'some refund applied');
    }

    // ── 15. P0.1 Reject re-payment after full refund ───────────────────
    console.log('\n─── 15. P0.1 Reject payment on refunded bill ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { method: 'cash', reason: 'Full refund before re-pay test', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `p01-full-${paid.billId}` },
      });
      assertEqual(refund.status, 200, 'full refund ok');
      assertEqual(refund.data.bill.payment_status, 'refunded', 'status refunded');
      const repay = await api(baseUrl, `/api/bills/${paid.billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: paid.total },
        headers: managerAuth,
      });
      assertEqual(repay.status, 400, 're-payment rejected');
      assertEqual(repay.data.code, 'BILL_ALREADY_REFUNDED', 'stable code BILL_ALREADY_REFUNDED');
    }

    // ── 16. P0.1 No re-collect of refund gap on partially_refunded ─────
    console.log('\n─── 16. P0.1 Reject refund-gap re-payment ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const partialAmount = Math.round(Number(paid.total) * 30) / 100;
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: partialAmount, method: 'cash', reason: 'Partial refund gap test', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `p01-partial-${paid.billId}` },
      });
      assertEqual(refund.status, 200, 'partial refund ok');
      assertEqual(refund.data.bill.payment_status, 'partially_refunded', 'status partially_refunded');
      const repay = await api(baseUrl, `/api/bills/${paid.billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: partialAmount },
        headers: managerAuth,
      });
      assertEqual(repay.status, 400, 'refund-gap payment rejected');
      assertEqual(repay.data.code, 'BILL_NO_OUTSTANDING_BALANCE', 'code BILL_NO_OUTSTANDING_BALANCE');
    }

    // ── 17. P0.1 Unpaid/partial still accepts payment ──────────────────
    console.log('\n─── 17. P0.1 Partial pay then complete ───');
    {
      const order = await api(baseUrl, '/api/orders', {
        method: 'POST',
        body: { type: 'takeaway', items: [{ product_id: 'prod-ref-1', quantity: 1 }] },
        headers: managerAuth,
      });
      assertEqual(order.status, 201, 'order created');
      const total = Number(order.data.order.total);
      const bill = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: order.data.order.id },
        headers: managerAuth,
      });
      assertEqual(bill.status, 201, 'bill created');
      const billId = bill.data.bill.id;
      const firstHalf = Math.round((total / 2) * 100) / 100;
      const pay1 = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: firstHalf },
        headers: managerAuth,
      });
      assertEqual(pay1.status, 200, 'partial payment accepted');
      assertEqual(pay1.data.bill.payment_status, 'partial', 'status partial');
      const pay2 = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'card', amount: Math.round((total - firstHalf) * 100) / 100 },
        headers: managerAuth,
      });
      assertEqual(pay2.status, 200, 'remaining payment accepted');
      assertEqual(pay2.data.bill.payment_status, 'paid', 'status paid');
    }

    // ── 18. P0.3 payment.received audit on success ─────────────────────
    console.log('\n─── 18. P0.3 payment.received audit ───');
    {
      const order = await api(baseUrl, '/api/orders', {
        method: 'POST',
        body: { type: 'takeaway', items: [{ product_id: 'prod-ref-1', quantity: 1 }] },
        headers: managerAuth,
      });
      const bill = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: order.data.order.id },
        headers: managerAuth,
      });
      const billId = bill.data.bill.id;
      const total = Number(bill.data.bill.total);
      const beforeCount = (db.prepare(
        `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.received' AND entity_id = ?`,
      ).get(String(billId)) as { c: number }).c;
      const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: total },
        headers: managerAuth,
      });
      assertEqual(pay.status, 200, 'payment ok for audit');
      const row = db.prepare(
        `SELECT action, metadata_json FROM audit_logs WHERE action = 'payment.received' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
      ).get(String(billId)) as { action: string; metadata_json: string } | undefined;
      assert(!!row, 'payment.received audit row exists');
      const meta = JSON.parse(row!.metadata_json);
      assertEqual(meta.amount_cents, Math.round(total * 100), 'audit amount_cents matches');
      assertEqual(meta.new_payment_status, 'paid', 'audit new status paid');
      assertEqual(meta.previous_payment_status, 'unpaid', 'audit previous status unpaid');
      const afterCount = (db.prepare(
        `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.received' AND entity_id = ?`,
      ).get(String(billId)) as { c: number }).c;
      assertEqual(afterCount, beforeCount + 1, 'exactly one new payment.received audit');
    }

    // ── 19. FIN-01 Partial pay + partial refund must not recreate collectible ─
    // Canonical: outstanding = total − gross tender; refunds never reopen capacity.
    console.log('\n─── 19. FIN-01 Partial pay → refund → repay caps at gross remaining ───');
    {
      seedProduct(db, 'prod-fin01', 'cat-ref', 'FIN-01 Meal', 1000);
      const order = await api(baseUrl, '/api/orders', {
        method: 'POST',
        body: { type: 'takeaway', items: [{ product_id: 'prod-fin01', quantity: 1 }] },
        headers: managerAuth,
      });
      assertEqual(order.status, 201, 'FIN-01 order created');
      assertEqual(Number(order.data.order.total), 1000, 'bill total ₹1000');
      const bill = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: order.data.order.id },
        headers: managerAuth,
      });
      assertEqual(bill.status, 201, 'FIN-01 bill created');
      const billId = bill.data.bill.id;

      const pay1 = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: 600 },
        headers: managerAuth,
      });
      assertEqual(pay1.status, 200, 'partial ₹600 payment accepted');
      assertEqual(pay1.data.bill.payment_status, 'partial', 'status partial after first pay');

      const refund = await api(baseUrl, `/api/bills/${billId}/refund`, {
        method: 'POST',
        body: { amount: 200, method: 'cash', reason: 'FIN-01 partial refund', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `fin01-refund-${billId}` },
      });
      assertEqual(refund.status, 200, 'partial ₹200 refund accepted');
      assertEqual(Number(refund.data.bill.paid_amount), 400, 'net paid_amount = ₹400');

      const billRow = db.prepare('SELECT payment_details, paid_amount, total FROM bills WHERE id = ?').get(String(billId)) as {
        payment_details: string;
        paid_amount: number;
        total: number;
      };
      const details = JSON.parse(billRow.payment_details);
      const grossTender = (Array.isArray(details) ? details : [details]).reduce(
        (sum: number, line: any) => sum + Math.round(Number(line.amount) * 100),
        0,
      ) / 100;
      assertEqual(grossTender, 600, 'gross tender = ₹600');
      const refundedCents = (db.prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refunds WHERE bill_id = ? AND status = 'completed'`,
      ).get(String(billId)) as { total: number }).total;
      assertEqual(refundedCents, 20000, 'completed refunds = ₹200');
      assertEqual(Number(billRow.paid_amount), 400, 'net paid = ₹400');

      const over = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'card', amount: 401 },
        headers: managerAuth,
      });
      assertEqual(over.status, 400, '₹401 beyond gross remaining must fail');

      const idemKey = `fin01-repay-${billId}`;
      const repay = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: 400 },
        headers: { ...managerAuth, 'Idempotency-Key': idemKey },
      });
      assertEqual(repay.status, 200, '₹400 remaining collectible must succeed');

      const after = db.prepare('SELECT payment_details, paid_amount FROM bills WHERE id = ?').get(String(billId)) as {
        payment_details: string;
        paid_amount: number;
      };
      const afterDetails = JSON.parse(after.payment_details);
      const finalGross = (Array.isArray(afterDetails) ? afterDetails : [afterDetails]).reduce(
        (sum: number, line: any) => sum + Math.round(Number(line.amount) * 100),
        0,
      ) / 100;
      assertEqual(finalGross, 1000, 'final gross tender = ₹1000');
      assertEqual(Number(after.paid_amount), 800, 'final net paid = ₹800');
      assert(finalGross <= Number(billRow.total) + 0.001, 'no over-collection vs bill total');

      const refundCount = (db.prepare(
        `SELECT COUNT(*) AS c FROM refunds WHERE bill_id = ? AND status = 'completed'`,
      ).get(String(billId)) as { c: number }).c;
      assertEqual(refundCount, 1, 'refund records unchanged (still one completed refund)');
      assertEqual(
        (db.prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refunds WHERE bill_id = ? AND status = 'completed'`,
        ).get(String(billId)) as { total: number }).total,
        20000,
        'refund amount unchanged',
      );

      const replay = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: 400 },
        headers: { ...managerAuth, 'Idempotency-Key': idemKey },
      });
      assertEqual(replay.status, 200, 'idempotent repay replay succeeds');
      assertEqual(Number(replay.data.bill.paid_amount), 800, 'idempotent replay does not double-collect');

      const payAudits = (db.prepare(
        `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.received' AND entity_id = ?`,
      ).get(String(billId)) as { c: number }).c;
      assertEqual(payAudits, 2, 'payment.received audits for first pay + repay (not replay)');
      const refundAudit = db.prepare(
        `SELECT action FROM audit_logs WHERE action = 'payment.refunded' AND json_extract(metadata_json, '$.bill_id') = ? LIMIT 1`,
      ).get(billId) as { action: string } | undefined;
      assert(!!refundAudit, 'payment.refunded audit retained');
    }

    // ── 20. FIN-01 regression: full tender + refund still blocks repay ─
    console.log('\n─── 20. FIN-01 regression full tender refund gap blocked ───');
    {
      const paid = await createPaidBill(baseUrl, managerAuth, { productId: 'prod-ref-1', method: 'cash' });
      const partialAmount = Math.round(Number(paid.total) * 30) / 100;
      const refund = await api(baseUrl, `/api/bills/${paid.billId}/refund`, {
        method: 'POST',
        body: { amount: partialAmount, method: 'cash', reason: 'FIN-01 full-tender gap', override_pin: '1234' },
        headers: { ...managerAuth, 'Idempotency-Key': `fin01-full-${paid.billId}` },
      });
      assertEqual(refund.status, 200, 'partial refund on full tender ok');
      const repay = await api(baseUrl, `/api/bills/${paid.billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: partialAmount },
        headers: managerAuth,
      });
      assertEqual(repay.status, 400, 'full-tender refund gap still blocked');
      assertEqual(repay.data.code, 'BILL_NO_OUTSTANDING_BALANCE', 'stable BILL_NO_OUTSTANDING_BALANCE');
    }

    // ── 21. FIN-01 regression: partial pay without refund unchanged ────
    console.log('\n─── 21. FIN-01 regression partial pay without refund ───');
    {
      const order = await api(baseUrl, '/api/orders', {
        method: 'POST',
        body: { type: 'takeaway', items: [{ product_id: 'prod-ref-1', quantity: 1 }] },
        headers: managerAuth,
      });
      const total = Number(order.data.order.total);
      const bill = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: order.data.order.id },
        headers: managerAuth,
      });
      const billId = bill.data.bill.id;
      const firstHalf = Math.round((total / 2) * 100) / 100;
      const pay1 = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: firstHalf },
        headers: managerAuth,
      });
      assertEqual(pay1.status, 200, 'partial without refund still accepted');
      const pay2 = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'card', amount: Math.round((total - firstHalf) * 100) / 100 },
        headers: managerAuth,
      });
      assertEqual(pay2.status, 200, 'remaining without refund still accepted');
      assertEqual(pay2.data.bill.payment_status, 'paid', 'fully paid without refund');
    }
  } finally {
    server.close();
    closeDatabase();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('All refund integration tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

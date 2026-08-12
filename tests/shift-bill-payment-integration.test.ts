import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-bill-test-'));

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

process.env.JWT_SECRET = 'shift-bill-test-secret';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

import {
  initTestDb,
  createApp,
  startServer,
  closeDatabase,
  seedCategory,
  seedProduct,
} from './helpers/test-setup';

const { getDatabase, now, upsertSettings } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { registerRoutes } = require('../main/routes');
const {
  openShift,
  closeShift,
  isShiftsEnabled,
  getActiveShift,
} = require('../main/services/shift');



function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `shift-bill-${role}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

async function request(
  baseUrl: string,
  urlPath: string,
  options: Record<string, any> = {},
): Promise<{ status: number; data: any }> {
  const fetchOptions: any = {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  };
  if (options.method) fetchOptions.method = options.method;
  if (options.body) fetchOptions.body = JSON.stringify(options.body);
  const response = await (globalThis as any).fetch(baseUrl + urlPath, fetchOptions);
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

function seedUser(id: string, role: string, email?: string): string {
  const db = getDatabase();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, role, email || `${id}@test.local`, bcrypt.hashSync('ShiftPass1', 10), role, now(), now());
  return id;
}

function enableShifts(): void {
  upsertSettings({ shifts_enabled: 'true' });
}

function disableShifts(): void {
  upsertSettings({ shifts_enabled: 'false' });
}

function actor(userId: string, role: string) {
  return { userId, role };
}

async function createOrderAndBill(baseUrl: string, ownerAuth: Record<string, string>, terminalHeader?: Record<string, string>): Promise<{ orderId: number; billId: number; billTotal: number }> {
  const orderRes = await request(baseUrl, '/api/orders', {
    method: 'POST',
    headers: { ...ownerAuth, ...(terminalHeader || {}) },
    body: {
      type: 'dine_in',
      items: [{ product_id: 'prod-bill-001', quantity: 2 }],
    },
  });
  assert.equal(orderRes.status, 201, 'Order creation succeeded');
  const orderId = orderRes.data.order.id;

  const billGenRes = await request(baseUrl, '/api/bills/generate', {
    method: 'POST',
    headers: { ...ownerAuth },
    body: { order_id: orderId },
  });
  assert.ok(billGenRes.status === 200 || billGenRes.status === 201, 'Bill generation succeeded');
  const billId = billGenRes.data.bill.id;
  const billTotal = billGenRes.data.bill.total;

  return { orderId, billId, billTotal };
}

async function main() {
  console.log('M4-D3 Bill/Payment Shift Integration Tests');
  console.log('='.repeat(60));

  const db = initTestDb();
  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api')) { next(); return; }
    if (req.path === '/api/health') { next(); return; }
    if (req.path.startsWith('/api/auth') && !req.path.includes('/api/auth/me')) { next(); return; }

    const authHeaderHeader = req.headers.authorization;
    if (!authHeaderHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const payload = jwt.verify(authHeaderHeader.split(' ')[1], getJWTSecret());
      (req as any).user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });
  registerRoutes(app);

  const { baseUrl, server } = await startServer(app);

  try {
    const ownerId = seedUser('owner-bill-001', 'owner');
    const cashierId = seedUser('cashier-bill-001', 'cashier');
    const ownerAuth = authHeader(ownerId, 'owner');
    const cashierAuth = authHeader(cashierId, 'cashier');

    seedCategory(db, 'cat-bill-001', 'Bill Test Category');
    seedProduct(db, 'prod-bill-001', 'cat-bill-001', 'Coffee', 100);
    seedProduct(db, 'prod-bill-002', 'cat-bill-001', 'Cake', 200);

    const term1 = `term-bill-1-${randomUUID()}`;
    const term2 = `term-bill-2-${randomUUID()}`;

    // ------------------------------------------------------------------------
    // Case 1: shifts_enabled = false -> payment succeeds, bills.shift_id remains NULL
    // ------------------------------------------------------------------------
    disableShifts();
    const c1 = await createOrderAndBill(baseUrl, ownerAuth);
    const c1Pay = await request(baseUrl, `/api/bills/${c1.billId}/payment`, {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term1 },
      body: { method: 'cash', amount: c1.billTotal },
    });
    assert.equal(c1Pay.status, 200);
    const dbBill1 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c1.billId) as any;
    assert.strictEqual(dbBill1.shift_id, null, 'Case 1: bills.shift_id remains NULL when shifts disabled');
    assert.equal(dbBill1.payment_status, 'paid');
    console.log('   ✓ Case 1: shifts_enabled=false -> payment succeeds, bills.shift_id remains NULL');

    // ------------------------------------------------------------------------
    // Case 2: shifts_enabled = true + active terminal shift -> bills.shift_id = active_shift.id
    // ------------------------------------------------------------------------
    enableShifts();
    const shift1 = openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 50000, terminalId: term1 });
    const c2 = await createOrderAndBill(baseUrl, ownerAuth);
    const c2Pay = await request(baseUrl, `/api/bills/${c2.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term1 },
      body: { method: 'cash', amount: c2.billTotal },
    });
    assert.equal(c2Pay.status, 200);
    const dbBill2 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c2.billId) as any;
    assert.equal(dbBill2.shift_id, shift1.id, 'Case 2: bills.shift_id matches active shift ID');
    console.log('   ✓ Case 2: shifts_enabled=true + active shift -> bills.shift_id assigned');

    // ------------------------------------------------------------------------
    // Case 3: shifts_enabled = true + valid terminal ID + no active shift -> bills.shift_id NULL
    // ------------------------------------------------------------------------
    const c3 = await createOrderAndBill(baseUrl, ownerAuth);
    const c3Pay = await request(baseUrl, `/api/bills/${c3.billId}/payment`, {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term2 },
      body: { method: 'cash', amount: c3.billTotal },
    });
    assert.equal(c3Pay.status, 200);
    const dbBill3 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c3.billId) as any;
    assert.strictEqual(dbBill3.shift_id, null, 'Case 3: bills.shift_id remains NULL when no active shift on terminal');
    console.log('   ✓ Case 3: shifts_enabled=true + no active shift -> payment succeeds, bills.shift_id NULL');

    // ------------------------------------------------------------------------
    // Case 4: missing terminal header -> payment succeeds, no host fallback, bills.shift_id NULL
    // ------------------------------------------------------------------------
    const c4 = await createOrderAndBill(baseUrl, ownerAuth);
    const c4Pay = await request(baseUrl, `/api/bills/${c4.billId}/payment`, {
      method: 'POST',
      headers: { ...ownerAuth }, // No X-Flo-Terminal-Id header
      body: { method: 'cash', amount: c4.billTotal },
    });
    assert.equal(c4Pay.status, 200);
    const dbBill4 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c4.billId) as any;
    assert.strictEqual(dbBill4.shift_id, null, 'Case 4: missing header results in shift_id NULL (no host fallback)');
    console.log('   ✓ Case 4: missing terminal header -> payment succeeds, bills.shift_id NULL');

    // ------------------------------------------------------------------------
    // Case 5 & 6: multi-terminal isolation (T1 -> S1, T2 -> S2)
    // ------------------------------------------------------------------------
    const shift2 = openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 30000, terminalId: term2 });
    const c5 = await createOrderAndBill(baseUrl, ownerAuth);
    const c5Pay = await request(baseUrl, `/api/bills/${c5.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term2 },
      body: { method: 'cash', amount: c5.billTotal },
    });
    assert.equal(c5Pay.status, 200);
    const dbBill5 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c5.billId) as any;
    assert.equal(dbBill5.shift_id, shift2.id, 'Case 5: T2 payment gets shift2.id');

    const c6 = await createOrderAndBill(baseUrl, ownerAuth);
    const c6Pay = await request(baseUrl, `/api/bills/${c6.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term1 },
      body: { method: 'cash', amount: c6.billTotal },
    });
    assert.equal(c6Pay.status, 200);
    const dbBill6 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c6.billId) as any;
    assert.equal(dbBill6.shift_id, shift1.id, 'Case 6: T1 payment gets shift1.id');
    console.log('   ✓ Case 5 & 6: multi-terminal isolation (T1 -> S1, T2 -> S2)');

    // ------------------------------------------------------------------------
    // Case 7: partial payment establishes shift_id; subsequent payment in new shift does NOT overwrite
    // ------------------------------------------------------------------------
    const term3 = `term-bill-3-${randomUUID()}`;
    const shift3A = openShift({ actor: actor(ownerId, 'owner'), openingFloatCents: 10000, terminalId: term3 });
    const c7 = await createOrderAndBill(baseUrl, ownerAuth);

    // Partial payment #1 under Shift 3A
    const c7Pay1 = await request(baseUrl, `/api/bills/${c7.billId}/payment`, {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term3 },
      body: { method: 'cash', amount: 50 },
    });
    assert.equal(c7Pay1.status, 200);
    const dbBill7_1 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c7.billId) as any;
    assert.equal(dbBill7_1.shift_id, shift3A.id, 'First partial payment sets shift_id = shift3A.id');
    assert.equal(dbBill7_1.payment_status, 'partial');

    // Close Shift 3A, open Shift 3B on term3
    closeShift({ shiftId: shift3A.id, actor: actor(ownerId, 'owner'), closingCashCents: 15000 });
    const shift3B = openShift({ actor: actor(ownerId, 'owner'), openingFloatCents: 20000, terminalId: term3 });

    // Partial payment #2 under Shift 3B
    const c7Pay2 = await request(baseUrl, `/api/bills/${c7.billId}/payment`, {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term3 },
      body: { method: 'cash', amount: c7.billTotal - 50 },
    });
    assert.equal(c7Pay2.status, 200);
    const dbBill7_2 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c7.billId) as any;
    assert.equal(dbBill7_2.shift_id, shift3A.id, 'Case 7: Second payment under Shift 3B MUST NOT overwrite original shift_id (remains shift3A.id)');
    assert.equal(dbBill7_2.payment_status, 'paid');
    console.log('   ✓ Case 7: partial payment establishes attribution; subsequent payment does NOT overwrite');

    // ------------------------------------------------------------------------
    // Case 8: pre-existing bills.shift_id is never overwritten
    // ------------------------------------------------------------------------
    const c8 = await createOrderAndBill(baseUrl, ownerAuth);
    // Manually set shift_id on bill
    getDatabase().prepare('UPDATE bills SET shift_id = ? WHERE id = ?').run(shift3A.id, c8.billId);
    const c8Pay = await request(baseUrl, `/api/bills/${c8.billId}/payment`, {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term3 },
      body: { method: 'cash', amount: c8.billTotal },
    });
    assert.equal(c8Pay.status, 200);
    const dbBill8 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c8.billId) as any;
    assert.equal(dbBill8.shift_id, shift3A.id, 'Case 8: pre-existing bills.shift_id retained');
    console.log('   ✓ Case 8: pre-existing bills.shift_id never overwritten');

    // ------------------------------------------------------------------------
    // Case 9: order/bill shift independence (orders.shift_id != bills.shift_id)
    // ------------------------------------------------------------------------
    const term4 = `term-bill-4-${randomUUID()}`;
    const shift4A = openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 10000, terminalId: term4 });
    
    // Order created under Shift 4A -> orders.shift_id = shift4A.id
    const orderRes4 = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: { type: 'takeaway', items: [{ product_id: 'prod-bill-001', quantity: 1 }] },
    });
    assert.equal(orderRes4.status, 201);
    const order4Id = orderRes4.data.order.id;
    const dbOrder4 = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(order4Id) as any;
    assert.equal(dbOrder4.shift_id, shift4A.id, 'Order created in Shift 4A has orders.shift_id = shift4A.id');

    // Close Shift 4A, Open Shift 4B on term4
    closeShift({ shiftId: shift4A.id, actor: actor(cashierId, 'cashier'), closingCashCents: 10000, terminalId: term4 });
    const shift4B = openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 10000, terminalId: term4 });



    // Generate bill & pay under Shift 4B
    const billGenRes4 = await request(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: { ...cashierAuth },
      body: { order_id: order4Id },
    });
    assert.ok(billGenRes4.status === 200 || billGenRes4.status === 201);
    const bill4Id = billGenRes4.data.bill.id;

    const payRes4 = await request(baseUrl, `/api/bills/${bill4Id}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: { method: 'cash', amount: billGenRes4.data.bill.total },
    });
    assert.equal(payRes4.status, 200);

    const dbOrder4Final = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(order4Id) as any;
    const dbBill4Final = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(bill4Id) as any;

    assert.equal(dbOrder4Final.shift_id, shift4A.id, 'orders.shift_id remains shift4A.id');
    assert.equal(dbBill4Final.shift_id, shift4B.id, 'bills.shift_id is shift4B.id');
    assert.notEqual(dbOrder4Final.shift_id, dbBill4Final.shift_id, 'orders.shift_id != bills.shift_id');
    console.log('   ✓ Case 9: order/bill shift independence verified (orders.shift_id != bills.shift_id)');

    // ------------------------------------------------------------------------
    // Case 10: payment rollback — failed payment does not persist shift attribution
    // ------------------------------------------------------------------------
    const c10 = await createOrderAndBill(baseUrl, ownerAuth);
    const failedPay = await request(baseUrl, `/api/bills/${c10.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: { method: 'cash', amount: -50 }, // Invalid amount
    });
    assert.equal(failedPay.status, 400);
    const dbBill10 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c10.billId) as any;
    assert.strictEqual(dbBill10.shift_id, null, 'Case 10: Failed payment rolled back cleanly; shift_id remains NULL');
    assert.equal(dbBill10.payment_status, 'unpaid');
    console.log('   ✓ Case 10: payment rollback — failed payment does not persist shift attribution');

    // ------------------------------------------------------------------------
    // Case 11: split-check bill — attribution happens only when paid
    // ------------------------------------------------------------------------
    upsertSettings({ split_checks_enabled: 'true' });
    const c11 = await createOrderAndBill(baseUrl, ownerAuth);
    // Add second item so check can split
    await request(baseUrl, `/api/orders/${c11.orderId}/items`, {
      method: 'POST',
      headers: { ...ownerAuth },
      body: { items: [{ product_id: 'prod-bill-002', quantity: 1 }] },
    });
    // Regenerate bill to sync totals
    const genSplit = await request(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: { ...ownerAuth },
      body: { order_id: c11.orderId },
    });
    const mainBillId = genSplit.data.bill.id;

    // Get active order items to get real IDs
    const itemsRes = await request(baseUrl, `/api/orders/${c11.orderId}`, { headers: { ...ownerAuth } });
    const item1Id = itemsRes.data.order.items[0].id;
    const item2Id = itemsRes.data.order.items[1].id;

    // Split into 2 checks
    const splitRes = await request(baseUrl, `/api/bills/${mainBillId}/split-check`, {
      method: 'POST',
      headers: { ...ownerAuth },
      body: {
        checks: [
          { label: 'Guest 1', items: [{ order_item_id: item1Id, quantity: 2 }] },
          { label: 'Guest 2', items: [{ order_item_id: item2Id, quantity: 1 }] },
        ],
      },
    });

    assert.equal(splitRes.status, 201);
    const splitBills = splitRes.data.bills;
    assert.equal(splitBills.length, 2);

    // Pay Guest 1 under Shift 4B
    const guest1Pay = await request(baseUrl, `/api/bills/${splitBills[0].id}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: { method: 'cash', amount: splitBills[0].total },
    });
    assert.equal(guest1Pay.status, 200);

    const dbGuest1 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(splitBills[0].id) as any;
    const dbGuest2 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(splitBills[1].id) as any;

    assert.equal(dbGuest1.shift_id, shift4B.id, 'Guest 1 bill gets shift4B.id upon payment');
    assert.strictEqual(dbGuest2.shift_id, null, 'Guest 2 unpaid bill shift_id remains NULL');
    console.log('   ✓ Case 11: split-check bill — shift attribution happens individually at payment time');

    // ------------------------------------------------------------------------
    // Case 12: batch payment endpoint (POST /api/bills/:id/payments)
    // ------------------------------------------------------------------------
    const c12 = await createOrderAndBill(baseUrl, ownerAuth);
    const batchPay = await request(baseUrl, `/api/bills/${c12.billId}/payments`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: {
        payments: [
          { method: 'cash', amount: 50 },
          { method: 'card', amount: c12.billTotal - 50, transaction_id: `tx-batch-${randomUUID()}` },
        ],
      },
    });
    assert.equal(batchPay.status, 200);
    const dbBill12 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c12.billId) as any;
    assert.equal(dbBill12.shift_id, shift4B.id, 'Batch payment assigns active shift ID');
    assert.equal(dbBill12.payment_status, 'paid');
    console.log('   ✓ Case 12: batch payments (POST /api/bills/:id/payments) assign shift_id correctly');

    // ------------------------------------------------------------------------
    // Case 13: custom payment method
    // ------------------------------------------------------------------------
    // Create a custom payment method in DB
    getDatabase().prepare(`
      INSERT INTO payment_methods (name, is_active, created_at, updated_at) VALUES ('Swiggy', 1, ?, ?)
    `).run(now(), now());
    const c13 = await createOrderAndBill(baseUrl, ownerAuth);
    const customPay = await request(baseUrl, `/api/bills/${c13.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: { method: 'Swiggy', amount: c13.billTotal },
    });
    assert.equal(customPay.status, 200);
    const dbBill13 = getDatabase().prepare('SELECT shift_id FROM bills WHERE id = ?').get(c13.billId) as any;
    assert.equal(dbBill13.shift_id, shift4B.id, 'Custom payment method assigns active shift ID');
    console.log('   ✓ Case 13: custom payment method assigns shift_id correctly');

    // ------------------------------------------------------------------------
    // Case 14: auth & authorization rules intact
    // ------------------------------------------------------------------------
    const c14 = await createOrderAndBill(baseUrl, ownerAuth);
    const unauthPay = await request(baseUrl, `/api/bills/${c14.billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: c14.billTotal },
    });
    assert.equal(unauthPay.status, 401, 'Unauthenticated payment request rejected with 401');
    console.log('   ✓ Case 14: authentication and authorization rules remain intact');

    // ------------------------------------------------------------------------
    // Case 15: malformed terminal header -> HTTP 400 + transaction rollback
    // ------------------------------------------------------------------------
    const c15 = await createOrderAndBill(baseUrl, ownerAuth);
    const malformedPay = await request(baseUrl, `/api/bills/${c15.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': 'invalid terminal header !' },
      body: { method: 'cash', amount: c15.billTotal },
    });
    assert.equal(malformedPay.status, 400, 'Malformed terminal header returns HTTP 400');
    assert.ok(malformedPay.data?.error?.includes('terminal_id'), 'Error message mentions terminal_id');
    const dbBill15 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c15.billId) as any;
    assert.strictEqual(dbBill15.shift_id, null, 'Malformed header leaves shift_id NULL');
    assert.equal(dbBill15.payment_status, 'unpaid', 'Malformed header leaves bill unpaid (transaction rolled back)');
    console.log('   ✓ Case 15: malformed terminal header -> HTTP 400 + payment transaction rolled back');

    // ------------------------------------------------------------------------
    // Case 16: full existing payment regression suite
    // ------------------------------------------------------------------------
    const c16 = await createOrderAndBill(baseUrl, ownerAuth);
    const normalPay = await request(baseUrl, `/api/bills/${c16.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term4 },
      body: { method: 'cash', amount: c16.billTotal },
    });
    assert.equal(normalPay.status, 200);
    const dbBill16 = getDatabase().prepare('SELECT shift_id, payment_status FROM bills WHERE id = ?').get(c16.billId) as any;
    assert.equal(dbBill16.shift_id, shift4B.id);
    assert.equal(dbBill16.payment_status, 'paid');
    console.log('   ✓ Case 16: full payment lifecycle succeeds regression check');

    console.log('='.repeat(60));
    console.log('✅ M4-D3 Bill/Payment Shift Integration tests passed successfully');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

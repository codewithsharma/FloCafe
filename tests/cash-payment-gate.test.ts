/**
 * M4-D4 — Cash payment gate (require_open_shift_for_cash).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/cash-payment-gate.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-cash-gate-'));

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

process.env.JWT_SECRET = 'cash-gate-test-secret';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

import {
  initTestDb,
  startServer,
  closeDatabase,
  seedCategory,
  seedProduct,
} from './helpers/test-setup';

const { getDatabase, now, upsertSettings } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { registerRoutes } = require('../main/routes');
const { openShift, closeShift } = require('../main/services/shift');

function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `cash-gate-${role}` },
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  if (
    method === 'POST'
    && /\/api\/bills\/[^/]+\/payments?(?:\?|$)/.test(urlPath)
    && headers['Idempotency-Key'] === undefined
    && headers['idempotency-key'] === undefined
  ) {
    headers['Idempotency-Key'] = `test-pay-${require('crypto').randomUUID()}`;
  }
  const fetchOptions: any = { headers };
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

function seedUser(id: string, role: string): string {
  const db = getDatabase();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, role, `${id}@test.local`, bcrypt.hashSync('ShiftPass1', 10), role, now(), now());
  return id;
}

function setShiftFlags(shiftsEnabled: boolean, cashGate: boolean): void {
  upsertSettings({
    shifts_enabled: shiftsEnabled ? 'true' : 'false',
    require_open_shift_for_cash: cashGate ? 'true' : 'false',
  });
}

function actor(userId: string, role: string) {
  return { userId, role };
}

function billSnapshot(billId: number) {
  return getDatabase().prepare(
    'SELECT shift_id, paid_amount, payment_status, payment_details FROM bills WHERE id = ?',
  ).get(billId) as {
    shift_id: number | null;
    paid_amount: number;
    payment_status: string;
    payment_details: string | null;
  };
}

async function createOrderAndBill(
  baseUrl: string,
  auth: Record<string, string>,
  terminalHeader?: Record<string, string>,
): Promise<{ orderId: number; billId: number; billTotal: number }> {
  const orderRes = await request(baseUrl, '/api/orders', {
    method: 'POST',
    headers: { ...auth, ...(terminalHeader || {}) },
    body: {
      type: 'takeaway',
      items: [{ product_id: 'prod-cash-001', quantity: 1 }],
    },
  });
  assert.equal(orderRes.status, 201);
  const orderId = orderRes.data.order.id;
  const billGenRes = await request(baseUrl, '/api/bills/generate', {
    method: 'POST',
    headers: auth,
    body: { order_id: orderId },
  });
  assert.ok(billGenRes.status === 200 || billGenRes.status === 201);
  return {
    orderId,
    billId: billGenRes.data.bill.id,
    billTotal: billGenRes.data.bill.total,
  };
}

async function payCash(
  baseUrl: string,
  billId: number,
  amount: number,
  auth: Record<string, string>,
  terminalHeader?: Record<string, string>,
) {
  return request(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    headers: { ...auth, ...(terminalHeader || {}) },
    body: { method: 'cash', amount },
  });
}

async function main() {
  console.log('M4-D4 Cash Payment Gate Tests');
  console.log('='.repeat(60));

  const db = initTestDb();
  db.prepare(
    "INSERT INTO payment_methods (name, is_active, sort_order, created_at, updated_at) VALUES ('UPI', 1, 10, ?, ?)",
  ).run(now(), now());

  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api')) { next(); return; }
    if (req.path === '/api/health') { next(); return; }
    if (req.path.startsWith('/api/auth') && !req.path.includes('/api/auth/me')) { next(); return; }
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      (req as any).user = jwt.verify(header.split(' ')[1], getJWTSecret());
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });
  registerRoutes(app);

  const { baseUrl, server } = await startServer(app);

  try {
    const ownerId = seedUser('owner-cash-001', 'owner');
    const cashierId = seedUser('cashier-cash-001', 'cashier');
    const waiterId = seedUser('waiter-cash-001', 'waiter');
    const ownerAuth = authHeader(ownerId, 'owner');
    const cashierAuth = authHeader(cashierId, 'cashier');
    const waiterAuth = authHeader(waiterId, 'waiter');

    seedCategory(db, 'cat-cash-001', 'Cash Gate Menu');
    seedProduct(db, 'prod-cash-001', 'cat-cash-001', 'Tea', 100);

    const term1 = `term-cash-1-${randomUUID()}`;
    const term2 = `term-cash-2-${randomUUID()}`;

    // Configuration matrix
    setShiftFlags(false, false);
    const cfg1 = await createOrderAndBill(baseUrl, ownerAuth);
    assert.equal((await payCash(baseUrl, cfg1.billId, cfg1.billTotal, ownerAuth)).status, 200);
    console.log('   ✓ shifts off + gate off + cash → ALLOW');

    setShiftFlags(false, true);
    const cfg2 = await createOrderAndBill(baseUrl, ownerAuth);
    assert.equal((await payCash(baseUrl, cfg2.billId, cfg2.billTotal, ownerAuth)).status, 200);
    console.log('   ✓ shifts off + gate on + cash → ALLOW');

    setShiftFlags(true, false);
    const cfg3 = await createOrderAndBill(baseUrl, ownerAuth);
    assert.equal((await payCash(baseUrl, cfg3.billId, cfg3.billTotal, ownerAuth, { 'X-Flo-Terminal-Id': term1 })).status, 200);
    console.log('   ✓ shifts on + gate off + cash + no shift → ALLOW');

    setShiftFlags(true, true);
    const shift1 = openShift({
      actor: actor(cashierId, 'cashier'),
      openingFloatCents: 0,
      terminalId: term1,
    });
    const cfg4 = await createOrderAndBill(baseUrl, ownerAuth);
    const cfg4Pay = await payCash(baseUrl, cfg4.billId, cfg4.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': term1 });
    assert.equal(cfg4Pay.status, 200);
    assert.equal(billSnapshot(cfg4.billId).shift_id, shift1.id);
    console.log('   ✓ shifts on + gate on + cash + active shift → ALLOW');

    const cfg5 = await createOrderAndBill(baseUrl, ownerAuth);
    const cfg5Pay = await payCash(baseUrl, cfg5.billId, cfg5.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': term2 });
    assert.equal(cfg5Pay.status, 409);
    assert.equal(cfg5Pay.data.error, 'An open shift is required for cash payments');
    console.log('   ✓ shifts on + gate on + cash + no active shift → BLOCK 409');

    // Non-cash with gate on and no shift
    const nc1 = await createOrderAndBill(baseUrl, ownerAuth);
    const cardPay = await request(baseUrl, `/api/bills/${nc1.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term2 },
      body: { method: 'card', amount: nc1.billTotal },
    });
    assert.equal(cardPay.status, 200);

    const nc2 = await createOrderAndBill(baseUrl, ownerAuth);
    const walletPay = await request(baseUrl, `/api/bills/${nc2.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term2 },
      body: { method: 'wallet', amount: nc2.billTotal, customer_id: null },
    });
    assert.notEqual(walletPay.status, 409, 'wallet should not be blocked by cash gate');

    const nc3 = await createOrderAndBill(baseUrl, ownerAuth);
    const upiPay = await request(baseUrl, `/api/bills/${nc3.billId}/payment`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term2 },
      body: { method: 'upi', amount: nc3.billTotal },
    });
    assert.equal(upiPay.status, 200);
    console.log('   ✓ card / wallet / custom non-cash allowed without active shift');

    // Terminal isolation
    const shift2 = openShift({
      actor: actor(cashierId, 'cashier'),
      openingFloatCents: 0,
      terminalId: term2,
    });
    const t1Bill = await createOrderAndBill(baseUrl, ownerAuth);
    assert.equal((await payCash(baseUrl, t1Bill.billId, t1Bill.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': term1 })).status, 200);
    const t2Blocked = await createOrderAndBill(baseUrl, ownerAuth);
    closeShift({ actor: actor(ownerId, 'owner'), shiftId: shift2.id, terminalId: term2 });
    const t2BlockPay = await payCash(baseUrl, t2Blocked.billId, t2Blocked.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': term2 });
    assert.equal(t2BlockPay.status, 409);
    const t2Reopen = openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 0, terminalId: term2 });
    const t2Allowed = await createOrderAndBill(baseUrl, ownerAuth);
    const t2Pay = await payCash(baseUrl, t2Allowed.billId, t2Allowed.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': term2 });
    assert.equal(t2Pay.status, 200);
    assert.equal(billSnapshot(t2Allowed.billId).shift_id, t2Reopen.id);
    assert.notEqual(billSnapshot(t1Bill.billId).shift_id, t2Reopen.id);
    console.log('   ✓ multi-terminal isolation and reopen behavior');

    // Missing / invalid terminal header
    const miss = await createOrderAndBill(baseUrl, ownerAuth);
    const missPay = await payCash(baseUrl, miss.billId, miss.billTotal, cashierAuth);
    assert.equal(missPay.status, 409);
    const invalid = await createOrderAndBill(baseUrl, ownerAuth);
    const invalidPay = await payCash(baseUrl, invalid.billId, invalid.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': '../etc/passwd' });
    assert.equal(invalidPay.status, 400);
    console.log('   ✓ missing terminal → BLOCK; invalid terminal → 400');

    // Partial payments — gate checks current terminal shift; attribution unchanged
    const term3 = `term-cash-3-${randomUUID()}`;
    const shift3A = openShift({ actor: actor(ownerId, 'owner'), openingFloatCents: 0, terminalId: term3 });
    const partial = await createOrderAndBill(baseUrl, ownerAuth);
    const p1 = await payCash(baseUrl, partial.billId, 50, ownerAuth, { 'X-Flo-Terminal-Id': term3 });
    assert.equal(p1.status, 200);
    assert.equal(billSnapshot(partial.billId).shift_id, shift3A.id);
    closeShift({ actor: actor(ownerId, 'owner'), shiftId: shift3A.id, terminalId: term3 });
    const p2Blocked = await payCash(baseUrl, partial.billId, partial.billTotal - 50, ownerAuth, { 'X-Flo-Terminal-Id': term3 });
    assert.equal(p2Blocked.status, 409);
    const shift3B = openShift({ actor: actor(ownerId, 'owner'), openingFloatCents: 0, terminalId: term3 });
    const p2 = await payCash(baseUrl, partial.billId, partial.billTotal - 50, ownerAuth, { 'X-Flo-Terminal-Id': term3 });
    assert.equal(p2.status, 200);
    assert.equal(billSnapshot(partial.billId).shift_id, shift3A.id);
    assert.notEqual(shift3B.id, shift3A.id);
    console.log('   ✓ partial cash: gate uses current shift; bills.shift_id stays on first payment');

    // Cross-terminal partial (gate off for attribution path)
    setShiftFlags(true, false);
    const term4 = `term-cash-4-${randomUUID()}`;
    const term5 = `term-cash-5-${randomUUID()}`;
    const shift4 = openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 0, terminalId: term4 });
    openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 0, terminalId: term5 });
    const cross = await createOrderAndBill(baseUrl, ownerAuth);
    assert.equal((await payCash(baseUrl, cross.billId, 40, cashierAuth, { 'X-Flo-Terminal-Id': term4 })).status, 200);
    assert.equal(billSnapshot(cross.billId).shift_id, shift4.id);
    assert.equal((await payCash(baseUrl, cross.billId, cross.billTotal - 40, cashierAuth, { 'X-Flo-Terminal-Id': term5 })).status, 200);
    assert.equal(billSnapshot(cross.billId).shift_id, shift4.id);
    console.log('   ✓ cross-terminal partial keeps original bills.shift_id');

    // Mixed batches
    setShiftFlags(true, true);
    closeShift({ actor: actor(ownerId, 'owner'), shiftId: shift1.id, terminalId: term1 });
    const mixedAllow = await createOrderAndBill(baseUrl, ownerAuth);
    openShift({ actor: actor(cashierId, 'cashier'), openingFloatCents: 0, terminalId: term1 });
    const mixedOk = await request(baseUrl, `/api/bills/${mixedAllow.billId}/payments`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term1 },
      body: {
        payments: [
          { method: 'cash', amount: mixedAllow.billTotal / 2 },
          { method: 'card', amount: mixedAllow.billTotal / 2 },
        ],
      },
    });
    assert.equal(mixedOk.status, 200);

    const mixedBlock = await createOrderAndBill(baseUrl, ownerAuth);
    closeShift({ actor: actor(ownerId, 'owner'), shiftId: t2Reopen.id, terminalId: term2 });
    const beforeMixed = billSnapshot(mixedBlock.billId);
    const mixedFail = await request(baseUrl, `/api/bills/${mixedBlock.billId}/payments`, {
      method: 'POST',
      headers: { ...cashierAuth, 'X-Flo-Terminal-Id': term2 },
      body: {
        payments: [
          { method: 'card', amount: mixedBlock.billTotal / 2 },
          { method: 'cash', amount: mixedBlock.billTotal / 2 },
        ],
      },
    });
    assert.equal(mixedFail.status, 409);
    const afterMixed = billSnapshot(mixedBlock.billId);
    assert.deepEqual(afterMixed, beforeMixed);
    console.log('   ✓ mixed batches atomic; cash+card allowed with shift');

    // Atomicity on blocked cash
    const atom = await createOrderAndBill(baseUrl, ownerAuth);
    const before = billSnapshot(atom.billId);
    const blocked = await payCash(baseUrl, atom.billId, atom.billTotal, cashierAuth, { 'X-Flo-Terminal-Id': term2 });
    assert.equal(blocked.status, 409);
    const after = billSnapshot(atom.billId);
    assert.equal(after.paid_amount, before.paid_amount);
    assert.equal(after.payment_status, before.payment_status);
    assert.equal(after.payment_details, before.payment_details);
    assert.equal(after.shift_id, before.shift_id);
    console.log('   ✓ blocked cash leaves bill row unchanged');

    // Auth unchanged — waiter cannot pay
    const authBill = await createOrderAndBill(baseUrl, ownerAuth);
    const waiterPay = await payCash(baseUrl, authBill.billId, authBill.billTotal, waiterAuth, { 'X-Flo-Terminal-Id': term1 });
    assert.equal(waiterPay.status, 403);
    console.log('   ✓ authorization unchanged (waiter cannot pay)');

    // Unauthenticated
    const unauthBill = await createOrderAndBill(baseUrl, ownerAuth);
    const unauth = await request(baseUrl, `/api/bills/${unauthBill.billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: unauthBill.billTotal },
    });
    assert.equal(unauth.status, 401);
    console.log('   ✓ authentication still required');

    console.log('='.repeat(60));
    console.log('✅ M4-D4 cash payment gate tests passed');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

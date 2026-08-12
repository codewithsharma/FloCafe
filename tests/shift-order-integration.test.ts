/**
 * M4-D2 Order Shift Integration Tests
 *
 * Usage: node tests/run-electron-node-test.cjs tests/shift-order-integration.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-order-test-'));

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

process.env.JWT_SECRET = 'shift-order-test-secret';

const express = require('express');
const bcrypt = require('bcryptjs');

const jwt = require('jsonwebtoken');
const {
  initTestDb,
  createApp,
  startServer,
  closeDatabase,
  seedOwnerUser,
  seedCategory,
  seedProduct,
} = require('./helpers/test-setup');
const { getDatabase, now, upsertSettings } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { orderRoutes } = require('../main/routes/orders');
const { shiftRoutes } = require('../main/routes/shifts');
const {
  openShift,
  closeShift,
  isShiftsEnabled,
  getOrCreateHostTerminalId,
  getActiveShift,
} = require('../main/services/shift');

function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `shift-ord-${role}` },
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

async function main() {
  console.log('M4-D2 Order Shift Integration Tests');
  console.log('='.repeat(60));

  const db = initTestDb();
  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api')) { next(); return; }
    if (req.path === '/api/health') { next(); return; }
    if (req.path.startsWith('/api/auth') && !req.path.includes('/api/auth/me')) { next(); return; }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const payload = jwt.verify(authHeader.split(' ')[1], getJWTSecret());
      (req as any).user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });
  const { registerRoutes } = require('../main/routes');
  registerRoutes(app);

  const { baseUrl, server } = await startServer(app);


  try {
    const ownerId = seedUser('owner-ord-001', 'owner');
    const cashierId = seedUser('cashier-ord-001', 'cashier');
    const waiterId = seedUser('waiter-ord-001', 'waiter');
    seedCategory(db, 'cat-ord-001', 'Test Category');
    seedProduct(db, 'prod-ord-001', 'cat-ord-001', 'Test Coffee', 100);
    seedProduct(db, 'prod-ord-002', 'cat-ord-001', 'Test Cake', 200);


    const term1 = `term1-${randomUUID()}`;
    const term2 = `term2-${randomUUID()}`;

    // ── 1. Feature flag OFF -> orders.shift_id = NULL ───────────────────────
    disableShifts();
    const res1 = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term1 },
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(res1.status, 201, 'order created when shifts disabled');
    assert.equal(res1.data.order.shift_id, null, 'shift_id is NULL when shifts disabled');
    console.log('   ✓ Case 1: feature flag OFF -> shift_id NULL');

    // ── 2. Feature flag ON + active shift -> correct shift_id ────────────────
    enableShifts();
    const shift1 = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term1,
      openingFloatCents: 5000,
    });

    const res2 = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term1 },
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 2 }] },
    });
    assert.equal(res2.status, 201, 'order created with active shift');
    assert.equal(res2.data.order.shift_id, shift1.id, 'order assigned to active shift ID');
    const dbOrder2 = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(res2.data.order.id) as { shift_id: number };
    assert.equal(dbOrder2.shift_id, shift1.id, 'DB record has correct shift_id');
    console.log('   ✓ Case 2: feature flag ON + active shift -> correct shift_id');

    // ── 3. Feature flag ON + no active shift -> NULL (does not block) ───────
    const res3 = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term2 },
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(res3.status, 201, 'order created when no active shift on terminal');
    assert.equal(res3.data.order.shift_id, null, 'shift_id is NULL when no active shift');
    console.log('   ✓ Case 3: feature flag ON + no active shift -> shift_id NULL');

    // ── 4. Terminal isolation (T1 -> S1, T2 -> S2) ──────────────────────────
    const shift2 = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term2,
      openingFloatCents: 10000,
    });

    const resT1 = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term1 },
      body: { type: 'takeaway', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    const resT2 = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term2 },
      body: { type: 'takeaway', items: [{ product_id: 'prod-ord-002', quantity: 1 }] },
    });
    assert.equal(resT1.data.order.shift_id, shift1.id, 'T1 order assigned to shift1');
    assert.equal(resT2.data.order.shift_id, shift2.id, 'T2 order assigned to shift2');
    console.log('   ✓ Case 4: terminal T1 gets shift S1, terminal T2 gets shift S2');

    // ── 5. Missing terminal header -> NULL (no host fallback) ───────────────
    const hostTermId = getOrCreateHostTerminalId();
    const hostShift = getActiveShift(hostTermId) || openShift({
      actor: actor(ownerId, 'owner'),
      terminalId: hostTermId,
      openingFloatCents: 2000,
    });

    const resNoHeader = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier') }, // NO X-Flo-Terminal-Id header
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(resNoHeader.status, 201, 'order succeeds without terminal header');
    assert.equal(resNoHeader.data.order.shift_id, null, 'shift_id is NULL without terminal header');
    assert.notEqual(resNoHeader.data.order.shift_id, hostShift.id, 'host terminal fallback is NOT used');
    console.log('   ✓ Case 5: missing terminal header -> shift_id NULL (no host fallback)');

    // ── 6. Malformed terminal header -> HTTP 400 + no order created ─────────
    const countBeforeMalformed = (getDatabase().prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count;
    const resMalformed = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': 'invalid terminal id with spaces!' },
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(resMalformed.status, 400, 'malformed terminal header returns 400');
    assert.equal(resMalformed.data.error, 'terminal_id is invalid', 'returns expected error message');
    const countAfterMalformed = (getDatabase().prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count;
    assert.equal(countAfterMalformed, countBeforeMalformed, 'no order row created in DB on 400 error');
    console.log('   ✓ Case 6: malformed terminal header -> HTTP 400 + transaction rolled back');

    // ── 7. Server App / Waiter order without terminal header -> NULL ─────────
    const resWaiter = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(waiterId, 'waiter') }, // waiter without header
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(resWaiter.status, 201, 'waiter order creation succeeds');
    assert.equal(resWaiter.data.order.shift_id, null, 'waiter order shift_id is NULL');
    console.log('   ✓ Case 7: waiter order without terminal header -> shift_id NULL');

    // ── 8. Order shift immutability across mutations ─────────────────────────
    const initialOrderRes = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term1 },
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    const orderIdToMutate = initialOrderRes.data.order.id;
    assert.equal(initialOrderRes.data.order.shift_id, shift1.id);

    // Mutation 1: Add item
    const resAddItem = await request(baseUrl, `/api/orders/${orderIdToMutate}/items`, {
      method: 'POST',
      headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': term2 }, // header changed to term2
      body: { items: [{ product_id: 'prod-ord-002', quantity: 1 }] },
    });
    assert.equal(resAddItem.status, 200, 'add items succeeds');
    const dbOrderAfterAdd = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(orderIdToMutate) as { shift_id: number };
    assert.equal(dbOrderAfterAdd.shift_id, shift1.id, 'shift_id remains shift1 after adding items');

    // Mutation 2: Discount order
    const resDiscount = await request(baseUrl, `/api/orders/${orderIdToMutate}/discount`, {
      method: 'PATCH',
      headers: { ...authHeader(ownerId, 'owner') },
      body: { discount_type: 'percentage', discount_value: 10, discount_reason: 'Test discount' },
    });
    assert.equal(resDiscount.status, 200, 'apply discount succeeds');
    const dbOrderAfterDisc = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(orderIdToMutate) as { shift_id: number };
    assert.equal(dbOrderAfterDisc.shift_id, shift1.id, 'shift_id remains shift1 after applying discount');


    // Mutation 3: Convert to takeaway
    const resTakeaway = await request(baseUrl, `/api/orders/${orderIdToMutate}/convert-to-takeaway`, {
      method: 'PATCH',
      headers: { ...authHeader(cashierId, 'cashier') },
    });
    assert.equal(resTakeaway.status, 200, 'convert to takeaway succeeds');
    const dbOrderAfterTakeaway = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(orderIdToMutate) as { shift_id: number };
    assert.equal(dbOrderAfterTakeaway.shift_id, shift1.id, 'shift_id remains shift1 after takeaway conversion');

    // Mutation 4: Item cancel
    const itemIdToCancel = resAddItem.data.order.items[0].id;
    const resCancelItem = await request(baseUrl, `/api/orders/${orderIdToMutate}/items/${itemIdToCancel}/cancel`, {
      method: 'PATCH',
      headers: { ...authHeader(ownerId, 'owner') },
      body: { reason: 'Customer changed mind' },
    });
    assert.equal(resCancelItem.status, 200, 'cancel item succeeds');
    const dbOrderAfterCancel = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(orderIdToMutate) as { shift_id: number };
    assert.equal(dbOrderAfterCancel.shift_id, shift1.id, 'shift_id remains shift1 after item cancel');

    console.log('   ✓ Case 8: orders.shift_id is strictly immutable across all order mutations');

    // ── 9. Order created in shift S1 retains S1 after S1 closes & S2 opens ───
    closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift1.id,
      terminalId: term1,
      countedCashCents: 5000,
    });

    const shift1New = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term1,
      openingFloatCents: 8000,
    });

    // Mutate original order created in shift1 after shift1 closed
    const resMutateClosedShiftOrder = await request(baseUrl, `/api/orders/${orderIdToMutate}/discount`, {
      method: 'PATCH',
      headers: { ...authHeader(ownerId, 'owner') },
      body: { discount_type: 'percentage', discount_value: 5, discount_reason: 'Re-discount' },
    });

    assert.equal(resMutateClosedShiftOrder.status, 200);
    const dbOrderHistorical = getDatabase().prepare('SELECT shift_id FROM orders WHERE id = ?').get(orderIdToMutate) as { shift_id: number };
    assert.equal(dbOrderHistorical.shift_id, shift1.id, 'order shift_id stays shift1 even after shift1 is closed and shift1New is open');
    console.log('   ✓ Case 9: order created in shift S1 retains S1 after S1 closes and S2 opens');

    // ── 10. Authentication & Authorization unchanged ─────────────────────────
    const resUnauth = await request(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(resUnauth.status, 401, 'unauthenticated order creation rejected');

    const resInvalidToken = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid.jwt.token' },
      body: { type: 'dine_in', items: [{ product_id: 'prod-ord-001', quantity: 1 }] },
    });
    assert.equal(resInvalidToken.status, 401, 'invalid JWT token rejected');
    console.log('   ✓ Case 10: authentication and authorization rules remain intact');

    console.log('='.repeat(60));
    console.log('✅ M4-D2 Order Shift Integration tests passed successfully');

  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

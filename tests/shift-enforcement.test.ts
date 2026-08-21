/**
 * M4-D5 — Shift enforcement / interceptor foundation.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/shift-enforcement.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-enforce-'));

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

process.env.JWT_SECRET = 'shift-enforce-test-secret';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { initTestDb, startServer, closeDatabase, seedOwnerUser, seedCategory, seedProduct } = require('./helpers/test-setup');
const { getDatabase, now, upsertSettings } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { registerRoutes } = require('../main/routes');
const { requireOpenShiftForTerminal } = require('../main/middleware/shift-enforcement');
const {
  ShiftServiceError,
  assertOpenShiftForPosTerminal,
  assertOpenShiftForCashPayment,
  readTerminalIdHeaderFromRequest,
  openShift,
  closeShift,
  getActiveShift,
} = require('../main/services/shift');

function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `shift-enf-${role}-${randomUUID()}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function seedUser(role: string): string {
  const db = getDatabase();
  const id = `${role}-enf-${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, role, `${id}@test.local`, bcrypt.hashSync('ShiftPass1', 10), role, now(), now());
  return id;
}

function setShiftsEnabled(enabled: boolean): void {
  upsertSettings({ shifts_enabled: enabled ? 'true' : 'false' });
}

async function request(
  baseUrl: string,
  urlPath: string,
  options: Record<string, any> = {},
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  const isPaymentMutation = method === 'POST' && /\/api\/bills\/[^/]+\/payments?(?:\?|$)/.test(urlPath);
  const isOrderCreate = method === 'POST' && /^\/api\/orders\/?(?:\?|$)/.test(urlPath);
  const isOrderAddItems = method === 'POST' && /^\/api\/orders\/[^/]+\/items(?:\?|$)/.test(urlPath);
  if (
    (isPaymentMutation || isOrderCreate || isOrderAddItems)
    && headers['Idempotency-Key'] === undefined
    && headers['idempotency-key'] === undefined
  ) {
    headers['Idempotency-Key'] = isPaymentMutation
      ? `test-pay-${require('crypto').randomUUID()}`
      : `test-ord-${require('crypto').randomUUID()}`;
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
    data = text;
  }
  return { status: response.status, data };
}

async function main() {
  console.log('M4-D5 Shift Enforcement Foundation Tests');
  console.log('='.repeat(60));

  const db = initTestDb();
  seedCategory(db, 'cat-enf', 'Enforcement');
  seedProduct(db, 'prod-enf-001', 'cat-enf', 'Item', 10);
  const owner = seedOwnerUser(db);
  const ownerId = owner.userId;
  const waiterId = seedUser('waiter');
  const ownerAuth = owner.authHeader;
  const waiterAuth = authHeader(waiterId, 'waiter');

  const term1 = `term-enf-1-${randomUUID().slice(0, 8)}`;
  const term2 = `term-enf-2-${randomUUID().slice(0, 8)}`;

  // ── Service-level behavior ───────────────────────────────────────────────
  {
    setShiftsEnabled(false);
    assert.equal(assertOpenShiftForPosTerminal(undefined), null);
    assert.equal(assertOpenShiftForPosTerminal(term1), null);
    console.log('   ✓ shifts_enabled=false → helper no-op');
  }

  {
    setShiftsEnabled(true);
    assert.throws(
      () => assertOpenShiftForPosTerminal(undefined),
      (error: unknown) => error instanceof ShiftServiceError
        && error.statusCode === 409
        && error.code === 'OPEN_SHIFT_REQUIRED',
    );
    assert.throws(
      () => assertOpenShiftForPosTerminal(term1),
      (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 409,
    );
    console.log('   ✓ shifts_enabled=true + missing/no shift → 409');
  }

  {
    const shift = openShift({
      actor: { userId: ownerId, role: 'owner' },
      terminalId: term1,
      openingFloatCents: 0,
    });
    const active = assertOpenShiftForPosTerminal(term1);
    assert.equal(active?.id, shift.id);
    console.log('   ✓ shifts_enabled=true + active shift → returns shift');
  }

  {
    assert.throws(
      () => assertOpenShiftForPosTerminal('!!!bad!!!'),
      (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
    );
    console.log('   ✓ malformed terminal header → HTTP 400');
  }

  {
    const shift1 = getActiveShift(term1);
    assert.ok(shift1);
    assert.equal(getActiveShift(term2), null);
    assert.throws(() => assertOpenShiftForPosTerminal(term2));
    console.log('   ✓ terminal T1 cannot use T2 shift');
  }

  {
    const req = { headers: { 'x-flo-terminal-id': term1 } };
    assert.equal(readTerminalIdHeaderFromRequest(req), term1);
    assert.equal(readTerminalIdHeaderFromRequest({ headers: {} }), undefined);
    console.log('   ✓ readTerminalIdHeaderFromRequest extracts header only');
  }

  // ── Middleware on isolated test route ────────────────────────────────────
  const middlewareApp = express();
  middlewareApp.use(express.json());
  middlewareApp.use((req: any, res: any, next: any) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      req.user = jwt.verify(header.split(' ')[1], getJWTSecret());
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });
  middlewareApp.post(
    '/api/test/shift-protected',
    (req: any, res: any, next: any) => {
      if (!['owner', 'manager', 'cashier'].includes(req.user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
    },
    requireOpenShiftForTerminal(),
    (req: any, res: any) => {
      res.json({ ok: true, shift_id: req.floActiveShift?.id ?? null });
    },
  );
  const { baseUrl: middlewareBase, server: middlewareServer } = await startServer(middlewareApp);

  {
    setShiftsEnabled(false);
    const res = await request(middlewareBase, '/api/test/shift-protected', {
      method: 'POST',
      headers: ownerAuth,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.equal(res.data.shift_id, null);
    console.log('   ✓ middleware no-op when shifts_enabled=false');
  }

  {
    setShiftsEnabled(true);
    const blocked = await request(middlewareBase, '/api/test/shift-protected', {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term2 },
      body: {},
    });
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, /open shift is required/i);
    console.log('   ✓ middleware blocks when no active shift for terminal');
  }

  {
    const shift2 = openShift({
      actor: { userId: ownerId, role: 'owner' },
      terminalId: term2,
      openingFloatCents: 0,
    });
    const allowed = await request(middlewareBase, '/api/test/shift-protected', {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term2 },
      body: {},
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.data.shift_id, shift2.id);
    console.log('   ✓ middleware allows when terminal has open shift');
  }

  {
    const denied = await request(middlewareBase, '/api/test/shift-protected', {
      method: 'POST',
      headers: waiterAuth,
      body: {},
    });
    assert.equal(denied.status, 403);
    console.log('   ✓ waiter RBAC unchanged on protected route');
  }

  middlewareServer.close();

  // ── Production routes: no global enforcement wired ───────────────────────
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
      req.user = jwt.verify(header.split(' ')[1], getJWTSecret());
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  {
    setShiftsEnabled(true);
    const orderRes = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: waiterAuth,
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-enf-001', quantity: 1 }],
      },
    });
    assert.equal(orderRes.status, 201);
    assert.equal(orderRes.data.order.shift_id, null);
    console.log('   ✓ Server App / waiter order without terminal header still allowed');
  }

  {
    const orderRes = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...ownerAuth, 'X-Flo-Terminal-Id': term1 },
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-enf-001', quantity: 1 }],
      },
    });
    assert.equal(orderRes.status, 201);
    const shift1 = getActiveShift(term1);
    assert.equal(orderRes.data.order.shift_id, shift1?.id ?? null);
    console.log('   ✓ order shift_id attribution unchanged (soft resolve)');
  }

  {
    upsertSettings({ require_open_shift_for_cash: 'true' });
    const orderRes = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...ownerAuth },
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-enf-001', quantity: 1 }],
      },
    });
    assert.equal(orderRes.status, 201);
    const billGen = await request(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: ownerAuth,
      body: { order_id: orderRes.data.order.id },
    });
    assert.ok(billGen.status === 200 || billGen.status === 201);
    const billId = billGen.data.bill.id;
    const before = getDatabase().prepare(
      'SELECT shift_id, paid_amount, payment_status, payment_details FROM bills WHERE id = ?',
    ).get(billId) as { shift_id: number | null; paid_amount: number; payment_status: string; payment_details: string | null };

    const payRes = await request(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      headers: ownerAuth,
      body: { method: 'cash', amount: billGen.data.bill.total },
    });
    assert.equal(payRes.status, 409);
    assert.match(payRes.data.error, /cash payments/i);

    const after = getDatabase().prepare(
      'SELECT shift_id, paid_amount, payment_status, payment_details FROM bills WHERE id = ?',
    ).get(billId);
    assert.deepEqual(after, before);
    console.log('   ✓ M4-D4 cash gate unchanged; blocked cash leaves bill unchanged');
  }

  {
    assert.throws(
      () => assertOpenShiftForCashPayment(undefined),
      (error: unknown) => error instanceof ShiftServiceError
        && error.message.includes('cash payments'),
    );
    console.log('   ✓ assertOpenShiftForCashPayment remains separate from POS helper');
  }

  {
    const shift1Record = getActiveShift(term1);
    assert.ok(shift1Record);
    assertOpenShiftForPosTerminal(term1);
    assertOpenShiftForPosTerminal(term1);
    const shift1After = getActiveShift(term1);
    assert.deepEqual(shift1After, shift1Record);
    closeShift({
      actor: { userId: ownerId, role: 'owner' },
      shiftId: shift1Record.id,
      terminalId: term1,
    });
    assert.throws(() => assertOpenShiftForPosTerminal(term1));
    console.log('   ✓ repeated enforcement does not mutate shift state; closed shift fails');
  }

  console.log('='.repeat(60));
  console.log('✅ M4-D5 shift enforcement foundation tests passed');
  server.close();
  closeDatabase();
}

main().catch((error) => {
  console.error(error);
  closeDatabase();
  process.exit(1);
});

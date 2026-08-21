/**
 * M4-C Shift Service + API + Terminal Identity Tests
 *
 * Usage: node tests/run-electron-node-test.cjs tests/shift-service.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-service-'));

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

process.env.JWT_SECRET = 'shift-service-test-secret';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  initDatabase,
  getDatabase,
  closeDatabase,
  now,
  upsertSettings,
} = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { registerRoutes } = require('../main/routes');
const auditLog = require('../main/services/audit-log');
const {
  ShiftServiceError,
  openShift,
  getActiveShift,
  getShift,
  listShifts,
  closeShift,
  forceCloseShift,
  getOrCreateHostTerminalId,
  getHostTerminalId,
  isShiftsEnabled,
  mapShiftWriteError,
} = require('../main/services/shift');

function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `shift-${role}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

async function listen(app: any): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function request(
  baseUrl: string,
  urlPath: string,
  options: Record<string, any> = {},
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  // OPS-02 / P18: local helper parity with tests/helpers/test-setup.ts api().
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
  if (options.body) fetchOptions.body = options.body;
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
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
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

function assertNoSensitiveKeys(metadata: Record<string, unknown> | null): void {
  const json = JSON.stringify(metadata || {});
  assert.equal(/password|pin|jwt|token|secret|credential/i.test(json), false, 'audit metadata must not contain secrets');
}

function countShifts(): number {
  return (getDatabase().prepare('SELECT COUNT(*) AS count FROM shifts').get() as { count: number }).count;
}

function countAudit(action: string, entityId?: string | number): number {
  if (entityId === undefined) {
    return (getDatabase().prepare('SELECT COUNT(*) AS count FROM audit_logs WHERE action = ?').get(action) as { count: number }).count;
  }
  return (getDatabase().prepare(
    'SELECT COUNT(*) AS count FROM audit_logs WHERE action = ? AND entity_id = ?',
  ).get(action, String(entityId)) as { count: number }).count;
}

async function main() {
  console.log('M4-C Shift Service + API Tests');
  console.log('='.repeat(60));

  initDatabase();
  const ownerId = seedUser('owner-shift-001', 'owner');
  const managerId = seedUser('mgr-shift-001', 'manager');
  const cashierId = seedUser('cashier-shift-001', 'cashier');
  const cashierTwoId = seedUser('cashier-shift-002', 'cashier');
  const waiterId = seedUser('waiter-shift-001', 'waiter');
  const chefId = seedUser('chef-shift-001', 'chef');
  const terminalA = `term-${randomUUID()}`;
  const terminalB = `term-${randomUUID()}`;

  // ── Feature flag default ──────────────────────────────────────────────────
  assert.equal(isShiftsEnabled(), false, 'shifts_enabled defaults to false');
  assert.throws(
    () => openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: terminalA,
      openingFloatCents: 0,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 503,
    'openShift is disabled when shifts_enabled=false',
  );
  console.log('   ✓ shifts_enabled=false blocks shift mutations');

  enableShifts();
  assert.equal(isShiftsEnabled(), true);

  // ── Unauthorized open ─────────────────────────────────────────────────────
  assert.throws(
    () => openShift({
      actor: actor(waiterId, 'waiter'),
      terminalId: terminalA,
      openingFloatCents: 100,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 403,
    'waiter cannot open a shift',
  );
  assert.throws(
    () => openShift({
      actor: actor(chefId, 'chef'),
      terminalId: terminalA,
      openingFloatCents: 100,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 403,
    'chef cannot open a shift',
  );
  console.log('   ✓ unauthorized roles cannot open a shift');

  // ── Invalid opening float ─────────────────────────────────────────────────
  for (const invalid of [-1, 1.5, '10.00', true, {}, null, undefined, Number.NaN, Infinity]) {
    assert.throws(
      () => openShift({
        actor: actor(cashierId, 'cashier'),
        terminalId: terminalA,
        openingFloatCents: invalid as any,
      }),
      (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
      `invalid opening float rejected: ${String(invalid)}`,
    );
  }
  console.log('   ✓ invalid opening float is rejected');

  assert.throws(
    () => openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: '../etc/passwd',
      openingFloatCents: 0,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
    'malformed terminal_id rejected',
  );
  assert.throws(
    () => openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: terminalA,
      openingFloatCents: 0,
      openingNote: 'n'.repeat(501),
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
    'oversized opening note rejected',
  );
  console.log('   ✓ malformed terminal_id and oversized notes are rejected');

  // ── Authorized open ───────────────────────────────────────────────────────
  const opened = openShift({
    actor: actor(cashierId, 'cashier'),
    terminalId: terminalA,
    openingFloatCents: 50000,
    openingNote: 'Drawer counted',
    context: { requestId: 'req-open-1', clientIp: '127.0.0.1', terminalId: terminalA },
  });
  assert.equal(opened.status, 'open');
  assert.equal(opened.terminal_id, terminalA);
  assert.equal(opened.opened_by_user_id, cashierId);
  assert.equal(opened.opening_float_cents, 50000);
  assert.equal(opened.opening_note, 'Drawer counted');
  assert.equal(opened.closed_at, null);
  assert.equal(opened.closed_by_user_id, null);
  assert.ok(opened.opened_at);
  assert.ok(opened.created_at);
  assert.ok(opened.updated_at);
  assert.equal(opened.expected_cash_cents, null);
  assert.equal(opened.variance_cents, null);
  console.log('   ✓ authorized cashier can open a shift');

  assert.equal(countAudit('shift.opened', opened.id), 1);
  const openAudit = getDatabase().prepare(
    `SELECT * FROM audit_logs WHERE action = 'shift.opened' AND entity_id = ?`,
  ).get(String(opened.id)) as any;
  assert.equal(openAudit.actor_user_id, cashierId);
  assert.equal(openAudit.entity_type, 'shift');
  const openMeta = JSON.parse(openAudit.metadata_json);
  assert.equal(openMeta.terminal_id, terminalA);
  assert.equal(openMeta.opening_float_cents, 50000);
  assertNoSensitiveKeys(openMeta);
  console.log('   ✓ shift.opened audit event is created without secrets');

  // ── Duplicate open ────────────────────────────────────────────────────────
  assert.throws(
    () => openShift({
      actor: actor(cashierTwoId, 'cashier'),
      terminalId: terminalA,
      openingFloatCents: 0,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 409,
    'duplicate open rejected',
  );
  assert.equal(countShifts(), 1, 'duplicate open does not create a second row');
  console.log('   ✓ duplicate open is rejected with a business conflict');

  // ── Unique constraint mapped to conflict ──────────────────────────────────
  try {
    getDatabase().prepare(`
      INSERT INTO shifts (
        terminal_id, status, opened_by_user_id, opening_float_cents,
        opened_at, created_at, updated_at
      ) VALUES (?, 'open', ?, 0, ?, ?, ?)
    `).run(terminalA, cashierId, now(), now(), now());
    assert.fail('second open insert should hit unique constraint');
  } catch (error) {
    const mapped = mapShiftWriteError(error);
    assert.equal(mapped instanceof ShiftServiceError, true);
    assert.equal(mapped.statusCode, 409);
    assert.equal(/UNIQUE|SQLITE/i.test(mapped.message), false, 'API error must not leak SQL');
  }
  console.log('   ✓ unique constraint is converted to a conflict error');

  // ── Active shift + terminal isolation ─────────────────────────────────────
  const activeA = getActiveShift(terminalA);
  assert.ok(activeA);
  assert.equal(activeA.id, opened.id);
  assert.equal(getActiveShift(terminalB), null, 'other terminal has no active shift');
  console.log('   ✓ active shift is returned and isolated per terminal');

  const otherOpen = openShift({
    actor: actor(managerId, 'manager'),
    terminalId: terminalB,
    openingFloatCents: 0,
  });
  assert.equal(getActiveShift(terminalA)!.id, opened.id);
  assert.equal(getActiveShift(terminalB)!.id, otherOpen.id);
  console.log('   ✓ two terminals can have independent open shifts');

  // ── Get shift ─────────────────────────────────────────────────────────────
  const fetched = getShift(opened.id);
  assert.ok(fetched);
  assert.equal(fetched.id, opened.id);
  assert.equal(getShift(999999), null);
  console.log('   ✓ getShift returns the row or null when missing');

  // ── List shifts ───────────────────────────────────────────────────────────
  const listed = listShifts({
    actor: actor(ownerId, 'owner'),
    terminalId: terminalA,
    status: 'open',
    limit: 10,
    offset: 0,
  });
  assert.equal(listed.shifts.length, 1);
  assert.equal(listed.shifts[0].id, opened.id);
  assert.throws(
    () => listShifts({ actor: actor(cashierId, 'cashier') }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 403,
    'cashier cannot list shift history',
  );
  assert.throws(
    () => listShifts({ actor: actor(ownerId, 'owner'), status: 'opening' as any }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
  );
  assert.throws(
    () => listShifts({ actor: actor(ownerId, 'owner'), limit: 0 }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
  );
  assert.throws(
    () => listShifts({ actor: actor(ownerId, 'owner'), offset: -1 }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
  );
  console.log('   ✓ listShifts filters, paginates, and rejects unsafe values');

  // ── Close shift ───────────────────────────────────────────────────────────
  const closed = closeShift({
    actor: actor(cashierTwoId, 'cashier'),
    shiftId: opened.id,
    terminalId: terminalA,
    countedCashCents: 49500,
    closingNote: 'Handover',
    context: { requestId: 'req-close-1', terminalId: terminalA },
  });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.closed_by_user_id, cashierTwoId);
  assert.equal(closed.counted_cash_cents, 49500);
  assert.equal(closed.closing_note, 'Handover');
  assert.ok(closed.closed_at);
  assert.equal(getActiveShift(terminalA), null);
  assert.equal(countAudit('shift.closed', opened.id), 1);
  const closeAudit = getDatabase().prepare(
    `SELECT * FROM audit_logs WHERE action = 'shift.closed' AND entity_id = ?`,
  ).get(String(opened.id)) as any;
  assert.equal(closeAudit.actor_user_id, cashierTwoId);
  const closeMeta = JSON.parse(closeAudit.metadata_json);
  assert.equal(closeMeta.counted_cash_cents, 49500);
  assert.equal(closeMeta.opened_by_user_id, cashierId);
  assertNoSensitiveKeys(closeMeta);
  console.log('   ✓ authorized cashier can close the terminal shift and store counted cash');

  assert.throws(
    () => closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: opened.id,
      terminalId: terminalA,
      countedCashCents: 1,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 409,
    'already closed shift rejected',
  );
  const unchanged = getShift(opened.id)!;
  assert.equal(unchanged.counted_cash_cents, 49500);
  assert.equal(unchanged.closed_by_user_id, cashierTwoId);
  console.log('   ✓ closing an already closed shift is rejected without mutation');

  assert.throws(
    () => closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: otherOpen.id,
      terminalId: terminalA,
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 403,
    'cashier cannot close another terminal shift',
  );
  console.log('   ✓ cashier close is scoped to the request terminal');

  // ── Force close ───────────────────────────────────────────────────────────
  assert.throws(
    () => forceCloseShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: otherOpen.id,
      reason: 'stale',
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 403,
    'cashier cannot force close',
  );
  assert.throws(
    () => forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: otherOpen.id,
      reason: '',
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 400,
    'force close requires a reason',
  );
  const forceClosed = forceCloseShift({
    actor: actor(managerId, 'manager'),
    shiftId: otherOpen.id,
    reason: 'Cashier left without closing',
    countedCashCents: 0,
    context: { requestId: 'req-force-1', terminalId: terminalB },
  });
  assert.equal(forceClosed.status, 'closed');
  assert.equal(forceClosed.closed_by_user_id, managerId);
  assert.equal(countAudit('shift.force_closed', otherOpen.id), 1);
  const forceAudit = getDatabase().prepare(
    `SELECT * FROM audit_logs WHERE action = 'shift.force_closed' AND entity_id = ?`,
  ).get(String(otherOpen.id)) as any;
  const forceMeta = JSON.parse(forceAudit.metadata_json);
  assert.equal(forceMeta.reason, 'Cashier left without closing');
  assert.equal(forceMeta.opened_by_user_id, managerId);
  assertNoSensitiveKeys(forceMeta);
  console.log('   ✓ manager force-close requires a reason and writes shift.force_closed');

  assert.throws(
    () => forceCloseShift({
      actor: actor(ownerId, 'owner'),
      shiftId: otherOpen.id,
      reason: 'again',
    }),
    (error: unknown) => error instanceof ShiftServiceError && error.statusCode === 409,
  );
  console.log('   ✓ force-closing an already closed shift is rejected');

  // ── Audit failure rolls back open ─────────────────────────────────────────
  const originalLog = auditLog.logAuditEvent;
  auditLog.logAuditEvent = () => {
    throw new Error('forced audit failure');
  };
  const beforeOpen = countShifts();
  const beforeAudit = (getDatabase().prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as { count: number }).count;
  assert.throws(
    () => openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: `term-${randomUUID()}`,
      openingFloatCents: 100,
    }),
    (error: unknown) => error instanceof Error && error.message === 'forced audit failure',
  );
  assert.equal(countShifts(), beforeOpen, 'failed audit rolls back shift insert');
  const afterAudit = (getDatabase().prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as { count: number }).count;
  assert.equal(afterAudit, beforeAudit, 'failed audit does not leave an audit row');
  auditLog.logAuditEvent = originalLog;
  console.log('   ✓ audit failure rolls back open shift');

  const rollbackTerminal = `term-${randomUUID()}`;
  const liveShift = openShift({
    actor: actor(cashierId, 'cashier'),
    terminalId: rollbackTerminal,
    openingFloatCents: 250,
  });

  auditLog.logAuditEvent = () => {
    throw new Error('forced audit failure');
  };
  const beforeCloseStatus = getShift(liveShift.id)!.status;
  try {
    closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: liveShift.id,
      terminalId: rollbackTerminal,
      countedCashCents: 250,
    });
    assert.fail('close during mocked audit should have thrown');
  } catch (error) {
    assert.equal((error as Error).message, 'forced audit failure');
  }
  assert.equal(getShift(liveShift.id)!.status, beforeCloseStatus, 'failed audit rolls back close');
  auditLog.logAuditEvent = originalLog;
  console.log('   ✓ audit failure rolls back close shift');

  closeShift({
    actor: actor(ownerId, 'owner'),
    shiftId: liveShift.id,
    countedCashCents: 250,
  });

  // ── Terminal identity ─────────────────────────────────────────────────────
  upsertSettings({ terminal_id: '' });
  assert.equal(getHostTerminalId(), null);
  const generated = getOrCreateHostTerminalId();
  assert.match(generated, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(getOrCreateHostTerminalId(), generated, 'host terminal id persists');
  assert.equal(getHostTerminalId(), generated);
  const openedOnHost = openShift({
    actor: actor(cashierId, 'cashier'),
    openingFloatCents: 0,
  });
  assert.equal(openedOnHost.terminal_id, generated);
  closeShift({
    actor: actor(ownerId, 'owner'),
    shiftId: openedOnHost.id,
  });
  console.log('   ✓ host terminal_id is generated once and reused');

  // ── HTTP API ──────────────────────────────────────────────────────────────
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

  const unauth = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    body: JSON.stringify({ terminal_id: terminalA, opening_float_cents: 0 }),
  });
  assert.equal(unauth.status, 401);
  console.log('   ✓ unauthenticated shift API is rejected');

  disableShifts();
  const disabledOpen = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: `term-${randomUUID()}`, opening_float_cents: 0 }),
  });
  assert.equal(disabledOpen.status, 503);
  assert.equal(typeof disabledOpen.data.error, 'string');
  console.log('   ✓ HTTP open returns 503 when shifts_enabled=false');

  const orderWhileDisabled = await request(baseUrl, '/api/orders', {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.notEqual(orderWhileDisabled.status, 503, 'order API is not gated by shifts_enabled');
  assert.ok(orderWhileDisabled.status === 200 || orderWhileDisabled.status === 400);
  console.log('   ✓ existing order API is unaffected when shifts are disabled');

  enableShifts();

  const waiterDenied = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(waiterId, 'waiter'),
    body: JSON.stringify({ terminal_id: `term-${randomUUID()}`, opening_float_cents: 0 }),
  });
  assert.equal(waiterDenied.status, 403);

  const httpTerminal = `term-${randomUUID()}`;
  const httpOpen = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': httpTerminal },
    body: JSON.stringify({ opening_float_cents: 1250, opening_note: 'HTTP open' }),
  });
  assert.equal(httpOpen.status, 201, `open should succeed (got ${httpOpen.status}: ${JSON.stringify(httpOpen.data)})`);
  assert.equal(httpOpen.data.shift.status, 'open');
  assert.equal(httpOpen.data.shift.opening_float_cents, 1250);
  const httpShiftId = httpOpen.data.shift.id;

  const duplicateHttp = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: httpTerminal, opening_float_cents: 0 }),
  });
  assert.equal(duplicateHttp.status, 409);
  assert.equal(/UNIQUE|SQLITE|constraint/i.test(JSON.stringify(duplicateHttp.data)), false);

  const [raceA, raceB] = await Promise.all([
    request(baseUrl, '/api/shifts/open', {
      method: 'POST',
      headers: authHeader(managerId, 'manager'),
      body: JSON.stringify({ terminal_id: `term-${randomUUID()}`, opening_float_cents: 0 }),
    }),
    request(baseUrl, '/api/shifts/open', {
      method: 'POST',
      headers: authHeader(ownerId, 'owner'),
      body: JSON.stringify({ terminal_id: httpTerminal, opening_float_cents: 0 }),
    }),
  ]);
  const raceStatuses = [raceA.status, raceB.status].sort();
  assert.ok(raceStatuses.includes(409), 'concurrent duplicate open yields 409');
  console.log('   ✓ HTTP open, duplicate, and race conflict behave correctly');

  const active = await request(baseUrl, `/api/shifts/active?terminal_id=${encodeURIComponent(httpTerminal)}`, {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(active.status, 200);
  assert.equal(active.data.shift.id, httpShiftId);

  const noneActive = await request(baseUrl, `/api/shifts/active?terminal_id=${encodeURIComponent(`term-${randomUUID()}`)}`, {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(noneActive.status, 200);
  assert.equal(noneActive.data.shift, null);

  const getOk = await request(baseUrl, `/api/shifts/${httpShiftId}`, {
    headers: authHeader(ownerId, 'owner'),
  });
  assert.equal(getOk.status, 200);
  assert.equal(getOk.data.shift.id, httpShiftId);
  assert.ok(getOk.data.summary);
  assert.equal(typeof getOk.data.summary.cash_payment_count, 'number');
  assert.equal(typeof getOk.data.summary.cash_payment_total_cents, 'number');
  assert.equal(typeof getOk.data.summary.non_cash_payment_total_cents, 'number');

  const cashierGetDenied = await request(baseUrl, `/api/shifts/${httpShiftId}`, {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(cashierGetDenied.status, 403);

  const missing = await request(baseUrl, '/api/shifts/999999', {
    headers: authHeader(managerId, 'manager'),
  });
  assert.equal(missing.status, 404);

  const badId = await request(baseUrl, '/api/shifts/not-an-id', {
    headers: authHeader(managerId, 'manager'),
  });
  assert.equal(badId.status, 400);

  const cashierList = await request(baseUrl, '/api/shifts', {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(cashierList.status, 403);

  const ownerList = await request(baseUrl, `/api/shifts?terminal_id=${encodeURIComponent(httpTerminal)}&status=open&limit=10&offset=0`, {
    headers: authHeader(ownerId, 'owner'),
  });
  assert.equal(ownerList.status, 200);
  assert.ok(Array.isArray(ownerList.data.shifts));
  assert.equal(ownerList.data.shifts.length, 1);

  const badPage = await request(baseUrl, '/api/shifts?limit=9999&offset=-4', {
    headers: authHeader(ownerId, 'owner'),
  });
  assert.equal(badPage.status, 400);

  const invalidMoney = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: `term-${randomUUID()}`, opening_float_cents: -5 }),
  });
  assert.equal(invalidMoney.status, 400);

  const closeOtherTerminal = await request(baseUrl, `/api/shifts/${httpShiftId}/close`, {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: `term-${randomUUID()}`, counted_cash_cents: 1 }),
  });
  assert.equal(closeOtherTerminal.status, 403);

  const httpClose = await request(baseUrl, `/api/shifts/${httpShiftId}/close`, {
    method: 'POST',
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': httpTerminal },
    body: JSON.stringify({ counted_cash_cents: 1200, closing_note: 'done' }),
  });
  assert.equal(httpClose.status, 200, `close should succeed (got ${httpClose.status}: ${JSON.stringify(httpClose.data)})`);
  assert.equal(httpClose.data.shift.status, 'closed');
  assert.equal(httpClose.data.shift.counted_cash_cents, 1200);
  assert.ok(httpClose.data.summary);
  assert.equal(httpClose.data.summary.cash_payment_count, 0);
  assert.equal(httpClose.data.summary.cash_payment_total_cents, 0);
  assert.equal(httpClose.data.summary.non_cash_payment_total_cents, 0);

  const alreadyClosed = await request(baseUrl, `/api/shifts/${httpShiftId}/close`, {
    method: 'POST',
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': httpTerminal },
    body: JSON.stringify({ counted_cash_cents: 1 }),
  });
  assert.equal(alreadyClosed.status, 409);

  const forceTerminal = `term-${randomUUID()}`;
  const forceOpen = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: forceTerminal, opening_float_cents: 0 }),
  });
  assert.equal(forceOpen.status, 201);
  const forceId = forceOpen.data.shift.id;

  const cashierForce = await request(baseUrl, `/api/shifts/${forceId}/force-close`, {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ reason: 'nope' }),
  });
  assert.equal(cashierForce.status, 403);

  const missingReason = await request(baseUrl, `/api/shifts/${forceId}/force-close`, {
    method: 'POST',
    headers: authHeader(managerId, 'manager'),
    body: JSON.stringify({}),
  });
  assert.equal(missingReason.status, 400);

  const forceOk = await request(baseUrl, `/api/shifts/${forceId}/force-close`, {
    method: 'POST',
    headers: authHeader(ownerId, 'owner'),
    body: JSON.stringify({ reason: 'Stale register', counted_cash_cents: 0 }),
  });
  assert.equal(forceOk.status, 200);
  assert.equal(forceOk.data.shift.status, 'closed');
  assert.ok(forceOk.data.summary);

  const previewDenied = await request(baseUrl, `/api/shifts/${httpShiftId}/reconciliation-preview`, {
    headers: authHeader(waiterId, 'waiter'),
  });
  assert.equal(previewDenied.status, 403);

  const previewWrongTerm = await request(baseUrl, `/api/shifts/${forceOpen.data.shift.id}/reconciliation-preview`, {
    headers: authHeader(cashierId, 'cashier'),
    // forceOpen shift is on forceTerminal; no matching terminal header/body
  });
  assert.equal(previewWrongTerm.status, 400);

  const reopenForPreview = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: httpTerminal, opening_float_cents: 500 }),
  });
  assert.equal(reopenForPreview.status, 201);
  const previewShiftId = reopenForPreview.data.shift.id;

  const previewOk = await request(baseUrl, `/api/shifts/${previewShiftId}/reconciliation-preview`, {
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': httpTerminal },
  });
  assert.equal(previewOk.status, 200);
  assert.equal(previewOk.data.expected_cash_cents, 500);
  assert.equal(previewOk.data.variance_cents, null);
  assert.equal(previewOk.data.counted_cash_cents, null);
  assert.ok(previewOk.data.summary);

  const terminalRes = await request(baseUrl, '/api/shifts/terminal-id', {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(terminalRes.status, 200);
  assert.equal(terminalRes.data.terminal_id, generated);
  const terminalAgain = await request(baseUrl, '/api/shifts/terminal-id', {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(terminalAgain.data.terminal_id, generated);
  console.log('   ✓ HTTP authorization, validation, IDOR, and terminal identity pass');

  // ── M4-D1: client header is identification, not host fallback / auth ─────
  const clientTerminal = randomUUID();
  const hostBeforeClientOpen = getHostTerminalId();
  const clientOpen = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': clientTerminal },
    body: JSON.stringify({ opening_float_cents: 0 }),
  });
  assert.equal(clientOpen.status, 201);
  assert.equal(clientOpen.data.shift.terminal_id, clientTerminal);
  assert.equal(getHostTerminalId(), hostBeforeClientOpen, 'host settings.terminal_id must stay unchanged');
  closeShift({ actor: actor(ownerId, 'owner'), shiftId: clientOpen.data.shift.id });

  const hostLookupWithClientHeader = await request(baseUrl, '/api/shifts/terminal-id', {
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': clientTerminal },
  });
  assert.equal(hostLookupWithClientHeader.status, 200);
  assert.equal(hostLookupWithClientHeader.data.terminal_id, generated);
  assert.notEqual(hostLookupWithClientHeader.data.terminal_id, clientTerminal);

  const missingActive = await request(baseUrl, '/api/shifts/active', {
    headers: authHeader(cashierId, 'cashier'),
  });
  assert.equal(missingActive.status, 400);

  const invalidHeaderActive = await request(baseUrl, '/api/shifts/active', {
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': '../etc/passwd' },
  });
  assert.equal(invalidHeaderActive.status, 400);

  const invalidHeaderOpen = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: { ...authHeader(cashierId, 'cashier'), 'X-Flo-Terminal-Id': 'bad id with spaces' },
    body: JSON.stringify({ opening_float_cents: 0 }),
  });
  assert.equal(invalidHeaderOpen.status, 400);

  const unauthWithTerminal = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: { 'X-Flo-Terminal-Id': randomUUID() },
    body: JSON.stringify({ opening_float_cents: 0 }),
  });
  assert.equal(unauthWithTerminal.status, 401);

  const waiterWithTerminal = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: { ...authHeader(waiterId, 'waiter'), 'X-Flo-Terminal-Id': randomUUID() },
    body: JSON.stringify({ opening_float_cents: 0 }),
  });
  assert.equal(waiterWithTerminal.status, 403);

  const chefWithTerminal = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: { ...authHeader(chefId, 'chef'), 'X-Flo-Terminal-Id': randomUUID() },
    body: JSON.stringify({ opening_float_cents: 0 }),
  });
  assert.equal(chefWithTerminal.status, 403);
  console.log('   ✓ client terminal header does not replace host id or grant authorization');

  const leakTerminal = `term-${randomUUID()}`;
  const leakOpen = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: leakTerminal, opening_float_cents: 0 }),
  });
  assert.equal(leakOpen.status, 201);
  const sqlLeak = await request(baseUrl, '/api/shifts/open', {
    method: 'POST',
    headers: authHeader(cashierId, 'cashier'),
    body: JSON.stringify({ terminal_id: leakTerminal, opening_float_cents: 0 }),
  });
  assert.equal(sqlLeak.status, 409);
  assert.equal(/SQLITE|constraint failed|stack/i.test(JSON.stringify(sqlLeak.data)), false);
  console.log('   ✓ API errors do not leak SQL or stack traces');

  server.close();
  closeDatabase();

  console.log('='.repeat(60));
  console.log('✅ M4-C shift service tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

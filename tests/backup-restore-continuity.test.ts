/**
 * P1.2 — Backup → destroy → restore financial/business continuity.
 * Usage: node tests/run-electron-node-test.cjs tests/backup-restore-continuity.test.ts
 *
 * Documents REC-01 (missing flo.db → silent empty DB) without changing that behavior.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-p12-continuity-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => '3.0.5-p12' },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(`ENC:${s}`, 'utf8'),
        decryptString: (b: Buffer) => {
          const text = b.toString('utf8');
          if (!text.startsWith('ENC:')) throw new Error('not encrypted');
          return text.slice(4);
        },
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

delete process.env.JWT_SECRET;
delete process.env.FLO_ALLOW_JWT_SECRET_ENV;

const {
  initDatabase,
  closeDatabase,
  getDatabase,
  getDbPath,
  createBackup,
  restoreBackup,
  getCurrentSchemaVersion,
  now,
  upsertSettings,
  businessDateInTimezone,
} = require('../main/db');
const {
  clearJWTSecretCache,
  initializeJWTSecret,
  getJWTSecret,
  getJwtSecretStatus,
  hasSecureJWTSecretFile,
  getJwtSecretFilePathForTests,
} = require('../main/services/jwt-secret');
const { logAuditEvent } = require('../main/services/audit-log');
const { closeBusinessDay, getDayClose } = require('../main/services/day-close');
const { createApp, api } = require('./helpers/test-setup');
const { billRoutes } = require('../main/routes/bills');

function unlinkLiveDb(): void {
  const dbPath = getDbPath();
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch { /* ignore */ }
  }
}

function paymentGross(detailsJson: string | null): number {
  if (!detailsJson) return 0;
  const parsed = JSON.parse(detailsJson);
  const lines = Array.isArray(parsed) ? parsed : [parsed];
  return lines.reduce((sum: number, line: any) => {
    const amount = Number(line?.amount);
    return Number.isFinite(amount) ? sum + Math.round(amount * 100) : sum;
  }, 0) / 100;
}

function seedUser(id: string, role: string): void {
  getDatabase().prepare(`
    INSERT INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    role,
    `${id}@continuity.local`,
    bcrypt.hashSync('ContPass1!', 4),
    role,
    role === 'manager' || role === 'owner' ? bcrypt.hashSync('1234', 4) : null,
    now(),
    now(),
  );
}

type ContinuitySnapshot = {
  orderId: number;
  paidBillId: number;
  fin01BillId: number;
  fin01OrderId: number;
  refundId: number;
  closedShiftId: number;
  expectedCashCents: number;
  businessDate: string;
  dayCloseId: number;
  cashInCents: number;
  cashRefundCents: number;
  netCashCents: number;
  paymentAuditCount: number;
  refundAuditCount: number;
  dayClosedAuditCount: number;
  jwtSecretBytes: string;
  encPath: string;
};

function seedContinuityFixture(): ContinuitySnapshot {
  const db = getDatabase();
  const t = now();

  seedUser('owner-p12', 'owner');
  seedUser('mgr-p12', 'manager');
  seedUser('cashier-p12', 'cashier');

  upsertSettings({
    shifts_enabled: 'true',
    timezone: 'Asia/Kolkata',
    jwt_secret_storage: 'safestorage',
  });

  db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run('cat-p12', 'Continuity');
  db.prepare('INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)')
    .run('prod-p12-full', 'cat-p12', 'Full Meal', 100);
  db.prepare('INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)')
    .run('prod-p12-fin01', 'cat-p12', 'FIN-01 Meal', 1000);

  const closedAt = t;
  const closedShift = db.prepare(`
    INSERT INTO shifts (
      terminal_id, status, opened_by_user_id, closed_by_user_id,
      opening_float_cents, counted_cash_cents, expected_cash_cents, variance_cents,
      opened_at, closed_at, created_at, updated_at
    ) VALUES (?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'term-p12-closed',
    'cashier-p12',
    'mgr-p12',
    5000,
    16000,
    15000,
    1000,
    closedAt,
    closedAt,
    t,
    t,
  );
  const closedShiftId = Number(closedShift.lastInsertRowid);

  // Fully paid cash+card bill on closed shift (total 100)
  const paidOrder = db.prepare(`
    INSERT INTO orders (order_number, type, status, subtotal, total, shift_id, created_at, updated_at)
    VALUES (?, 'takeaway', 'completed', 100, 100, ?, ?, ?)
  `).run('P12-ORD-FULL', closedShiftId, t, t);
  const orderId = Number(paidOrder.lastInsertRowid);
  db.prepare(`
    INSERT INTO order_items
      (order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
    VALUES (?, ?, ?, 100, 1, 100, 100, 'completed', ?, ?)
  `).run(orderId, 'prod-p12-full', 'Full Meal', t, t);

  const paidDetails = [
    { method: 'cash', amount: 40, requested_amount: 40, amount_omitted: false, tendered_amount: 40, change_amount: 0, timestamp: t },
    { method: 'card', amount: 60, requested_amount: 60, amount_omitted: false, timestamp: t },
  ];
  const paidBill = db.prepare(`
    INSERT INTO bills (
      bill_number, order_id, total, paid_amount, balance, payment_status,
      payment_details, shift_id, paid_at, created_at, updated_at
    ) VALUES (?, ?, 100, 100, 0, 'paid', ?, ?, ?, ?, ?)
  `).run('P12-BILL-FULL', orderId, JSON.stringify(paidDetails), closedShiftId, t, t, t);
  const paidBillId = Number(paidBill.lastInsertRowid);

  logAuditEvent({
    actorUserId: 'cashier-p12',
    action: 'payment.received',
    entityType: 'bill',
    entityId: paidBillId,
    result: 'success',
    metadata: { amount_cents: 10000, new_payment_status: 'paid' },
  });

  // FIN-01: total 1000, gross 600, refund 200, net 400, outstanding 400
  const fin01Order = db.prepare(`
    INSERT INTO orders (order_number, type, status, subtotal, total, shift_id, created_at, updated_at)
    VALUES (?, 'takeaway', 'completed', 1000, 1000, ?, ?, ?)
  `).run('P12-ORD-FIN01', closedShiftId, t, t);
  const fin01OrderId = Number(fin01Order.lastInsertRowid);
  db.prepare(`
    INSERT INTO order_items
      (order_id, product_id, product_name, unit_price, quantity, subtotal, total, status, created_at, updated_at)
    VALUES (?, ?, ?, 1000, 1, 1000, 1000, 'completed', ?, ?)
  `).run(fin01OrderId, 'prod-p12-fin01', 'FIN-01 Meal', t, t);

  const fin01Details = [
    {
      method: 'cash',
      amount: 600,
      requested_amount: 600,
      amount_omitted: false,
      tendered_amount: 600,
      change_amount: 0,
      timestamp: t,
    },
  ];
  const fin01Bill = db.prepare(`
    INSERT INTO bills (
      bill_number, order_id, total, paid_amount, balance, payment_status,
      payment_details, shift_id, created_at, updated_at
    ) VALUES (?, ?, 1000, 400, 600, 'partially_refunded', ?, ?, ?, ?)
  `).run('P12-BILL-FIN01', fin01OrderId, JSON.stringify(fin01Details), closedShiftId, t, t);
  const fin01BillId = Number(fin01Bill.lastInsertRowid);

  const refund = db.prepare(`
    INSERT INTO refunds (
      bill_id, order_id, amount, amount_cents, method, original_method,
      reason, status, shift_id, approved_by, created_by, created_at, updated_at
    ) VALUES (?, ?, 200, 20000, 'cash', 'cash', ?, 'completed', ?, ?, ?, ?, ?)
  `).run(fin01BillId, fin01OrderId, 'P12 FIN-01 partial refund', closedShiftId, 'mgr-p12', 'cashier-p12', t, t);
  const refundId = Number(refund.lastInsertRowid);

  logAuditEvent({
    actorUserId: 'mgr-p12',
    action: 'payment.refunded',
    entityType: 'refund',
    entityId: refundId,
    result: 'success',
    metadata: { bill_id: fin01BillId, amount_cents: 20000 },
  });

  // Cash on closed shift: opening 50 + cash in 40 − cash refund 200 = -110?
  // expected_cash_cents is persisted as fixture truth (15000) — immutability is the continuity claim.
  const expectedCashCents = 15000;

  const timezone = 'Asia/Kolkata';
  const businessDate = businessDateInTimezone(timezone, new Date());
  const dayCloseResult = closeBusinessDay({
    actor: { userId: 'owner-p12', role: 'owner' },
    businessDate,
  });
  const dayClose = dayCloseResult.day_close;
  const summary = dayCloseResult.summary;

  const paymentAuditCount = (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.received'`,
  ).get() as { c: number }).c;
  const refundAuditCount = (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.refunded'`,
  ).get() as { c: number }).c;
  const dayClosedAuditCount = (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'day.closed'`,
  ).get() as { c: number }).c;

  return {
    orderId,
    paidBillId,
    fin01BillId,
    fin01OrderId,
    refundId,
    closedShiftId,
    expectedCashCents,
    businessDate,
  dayCloseId: Number(dayClose.id),
  cashInCents: Number(summary.cash_payment_total_cents),
  cashRefundCents: Number(summary.cash_refund_total_cents),
  netCashCents: Number(summary.net_cash_movement_cents),
    paymentAuditCount,
    refundAuditCount,
    dayClosedAuditCount,
    jwtSecretBytes: getJWTSecret(),
    encPath: getJwtSecretFilePathForTests(),
  };
}

function assertMoneyInvariants(billId: number): {
  total: number;
  gross: number;
  refunds: number;
  net: number;
  outstanding: number;
} {
  const db = getDatabase();
  const bill = db.prepare('SELECT total, paid_amount, payment_details FROM bills WHERE id = ?').get(billId) as {
    total: number;
    paid_amount: number;
    payment_details: string;
  };
  const gross = paymentGross(bill.payment_details);
  const refunds = (db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS c FROM refunds WHERE bill_id = ? AND status = 'completed'`,
  ).get(billId) as { c: number }).c / 100;
  const net = Math.round((gross - refunds) * 100) / 100;
  const outstanding = Math.round((Number(bill.total) - gross) * 100) / 100;
  assert.ok(net >= -0.001, 'net_paid >= 0');
  assert.ok(outstanding >= -0.001, 'outstanding >= 0');
  assert.ok(gross <= Number(bill.total) + 0.001, 'gross <= total');
  assert.equal(Math.round(Number(bill.paid_amount) * 100), Math.round(net * 100), 'paid_amount matches net');
  return { total: Number(bill.total), gross, refunds, net, outstanding };
}

function authHeader(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${userId}@continuity.local`, role, jti: randomUUID() },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

async function main(): Promise<void> {
  console.log('P1.2 Backup → destroy → restore continuity');
  console.log('='.repeat(60));

  initDatabase();
  clearJWTSecretCache();
  const secret = initializeJWTSecret();
  assert.equal(hasSecureJWTSecretFile(), true, 'C10 precondition: jwt-secret.enc exists');
  assert.equal(getJwtSecretStatus(), 'secure', 'JWT status secure after init');

  const snap = seedContinuityFixture();
  assert.equal(snap.jwtSecretBytes, secret);

  // Pre-backup FIN-01 invariants
  const beforeFin = assertMoneyInvariants(snap.fin01BillId);
  assert.equal(beforeFin.total, 1000);
  assert.equal(beforeFin.gross, 600);
  assert.equal(beforeFin.refunds, 200);
  assert.equal(beforeFin.net, 400);
  assert.equal(beforeFin.outstanding, 400);
  console.log('   ✓ C1 realistic fixture seeded (orders/bills/payments/refunds/shift/day-close/audits)');

  const encBeforeBackup = fs.readFileSync(snap.encPath);
  const { path: backupPath } = await createBackup();
  assert.equal(fs.existsSync(backupPath), true, 'C2 backup file exists');
  const backupBytes = fs.readFileSync(backupPath);
  assert.equal(backupBytes.includes(Buffer.from(secret)), false, 'C10 backup must not contain JWT secret bytes');
  assert.equal(fs.existsSync(snap.encPath), true, 'C10 .enc still on disk after backup');
  assert.deepEqual(fs.readFileSync(snap.encPath), encBeforeBackup, 'C10 .enc unchanged by backup');
  console.log('   ✓ C2 production backup created; JWT secret excluded');

  // C12 corrupt backup while live DB still healthy
  const corruptPath = path.join(testDir, 'corrupt-backup.db');
  fs.writeFileSync(corruptPath, 'this is not a sqlite database');
  const corruptResult = restoreBackup(corruptPath, true);
  assert.equal(corruptResult.success, false, 'C12 corrupt backup rejected');
  assert.equal(
    (getDatabase().prepare('SELECT COUNT(*) AS c FROM bills').get() as { c: number }).c >= 2,
    true,
    'C12 live bills remain after corrupt reject',
  );
  console.log('   ✓ C12 corrupt backup fails closed; live DB preserved');

  // C14 metadata present on good backup; future schema rejected
  const Database = require('better-sqlite3');
  const metaDb = new Database(backupPath, { readonly: true, fileMustExist: true });
  const metaVer = metaDb.prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`).get() as { value: string };
  assert.ok(metaVer?.value, 'C14 schema_version metadata present');
  metaDb.close();
  const futurePath = path.join(testDir, 'future-schema-backup.db');
  fs.copyFileSync(backupPath, futurePath);
  const futureDb = new Database(futurePath);
  const futureVer = getCurrentSchemaVersion() + 50;
  futureDb.prepare(`UPDATE _flo_meta SET value = ? WHERE key = 'schema_version'`).run(String(futureVer));
  futureDb.pragma(`user_version = ${futureVer}`);
  futureDb.close();
  const futureReject = restoreBackup(futurePath, true);
  assert.equal(futureReject.success, false, 'C14 future schema backup rejected');
  assert.equal(
    (getDatabase().prepare('SELECT COUNT(*) AS c FROM bills').get() as { c: number }).c >= 2,
    true,
    'C14 live bills remain after incompatible reject',
  );
  console.log('   ✓ C14 backup metadata valid; incompatible schema rejected');

  // C3 destroy live DB
  closeDatabase();
  unlinkLiveDb();
  assert.equal(fs.existsSync(getDbPath()), false, 'C3 live flo.db removed');

  // C13 REC-01: document silent empty DB creation (behavior unchanged)
  initDatabase();
  const emptyOrders = (getDatabase().prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number }).c;
  assert.equal(emptyOrders, 0, 'C13 REC-01: missing DB restart yields empty orders (silent empty schema)');
  console.log('   ✓ C3 DB destroyed; C13 REC-01 documented (silent empty DB — not changed)');

  // C4 restore
  const restored = restoreBackup(backupPath, true);
  assert.equal(restored.success, true, `C4 restore succeeds: ${restored.error || 'ok'}`);
  console.log('   ✓ C4 backup restored onto empty live DB');

  // C5 business state
  const db = getDatabase();
  assert.ok(db.prepare('SELECT id FROM orders WHERE id = ?').get(snap.orderId), 'C5 paid order exists');
  assert.ok(db.prepare('SELECT id FROM orders WHERE id = ?').get(snap.fin01OrderId), 'C5 FIN-01 order exists');
  const paidBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(snap.paidBillId) as any;
  assert.equal(paidBill.payment_status, 'paid', 'C5 paid bill status');
  assert.equal(paymentGross(paidBill.payment_details), 100, 'C5 paid bill gross tender');
  const fin01 = db.prepare('SELECT * FROM bills WHERE id = ?').get(snap.fin01BillId) as any;
  assert.equal(fin01.payment_status, 'partially_refunded', 'C5 FIN-01 status');
  const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(snap.refundId) as any;
  assert.equal(Number(refund.amount_cents), 20000, 'C5 refund amount');
  assert.equal(Number(refund.shift_id), snap.closedShiftId, 'C5 refund shift association');
  console.log('   ✓ C5 orders/bills/payments/refunds restored');

  // C6 FIN-01 after restore
  const afterFin = assertMoneyInvariants(snap.fin01BillId);
  assert.equal(afterFin.gross, 600);
  assert.equal(afterFin.refunds, 200);
  assert.equal(afterFin.net, 400);
  assert.equal(afterFin.outstanding, 400);

  const app = createApp({ '/api/bills': billRoutes });
  const { baseUrl, server } = await new Promise<{ baseUrl: string; server: any }>((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') return reject(new Error('no port'));
      resolve({ baseUrl: `http://127.0.0.1:${addr.port}`, server: s });
    });
    s.on('error', reject);
  });
  try {
    const over = await api(baseUrl, `/api/bills/${snap.fin01BillId}/payment`, {
      method: 'POST',
      body: { method: 'card', amount: 401 },
      headers: authHeader('mgr-p12', 'manager'),
    });
    assert.equal(over.status, 400, 'C6 over-collection still rejected after restore');
    const ok = await api(baseUrl, `/api/bills/${snap.fin01BillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 400 },
      headers: authHeader('mgr-p12', 'manager'),
    });
    assert.equal(ok.status, 200, 'C6 remaining collectible ₹400 still allowed after restore');
    const afterPay = assertMoneyInvariants(snap.fin01BillId);
    assert.equal(afterPay.gross, 1000, 'C6 gross reaches total after allowed repay');
    assert.equal(afterPay.net, 800, 'C6 net = 1000 − 200');
    assert.equal(afterPay.outstanding, 0, 'C6 no further collectible');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  // createApp may inject JWT_SECRET for HTTP helpers — clear so C10/C11 use .enc path
  delete process.env.JWT_SECRET;
  clearJWTSecretCache();
  console.log('   ✓ C6 FIN-01 continuity after restore');

  // C7 shift continuity
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(snap.closedShiftId) as any;
  assert.equal(shift.status, 'closed', 'C7 shift closed');
  assert.equal(Number(shift.expected_cash_cents), snap.expectedCashCents, 'C7 expected cash immutable');
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS c FROM bills WHERE shift_id = ?').get(snap.closedShiftId) as { c: number }).c >= 2,
    true,
    'C7 bills remain on shift',
  );
  console.log('   ✓ C7 shift continuity / expected cash immutable');

  // C8 day-close continuity
  const day = getDayClose(snap.businessDate);
  assert.ok(day, 'C8 day close exists');
  assert.equal(Number(day.id), snap.dayCloseId, 'C8 same day_close id');
  const summary = typeof day.summary_json === 'string' ? JSON.parse(day.summary_json) : day.summary_json;
  assert.equal(Number(summary.cash_payment_total_cents), snap.cashInCents, 'C8 cash in');
  assert.equal(Number(summary.cash_refund_total_cents), snap.cashRefundCents, 'C8 cash refunds');
  assert.equal(Number(summary.net_cash_movement_cents), snap.netCashCents, 'C8 net cash');
  console.log('   ✓ C8 day-close continuity');

  // C9 audits
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.received'`).get() as { c: number }).c >= snap.paymentAuditCount,
    true,
    'C9 payment.received audits survive',
  );
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'payment.refunded'`).get() as { c: number }).c >= snap.refundAuditCount,
    true,
    'C9 payment.refunded audits survive',
  );
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'day.closed'`).get() as { c: number }).c >= snap.dayClosedAuditCount,
    true,
    'C9 day.closed audits survive',
  );
  console.log('   ✓ C9 audit continuity');

  // C10 same-machine JWT
  assert.equal(hasSecureJWTSecretFile(), true, 'C10 .enc still present after restore');
  clearJWTSecretCache();
  assert.equal(getJWTSecret(), snap.jwtSecretBytes, 'C10 same secret bytes');
  assert.equal(
    getDatabase().prepare(`SELECT value FROM settings WHERE key = 'jwt_secret'`).get(),
    undefined,
    'C10 no jwt_secret in SQLite after restore',
  );
  assert.equal(getJwtSecretStatus(), 'secure', 'C10 status remains secure');
  console.log('   ✓ C10 same-machine JWT continuity');

  // C11 new-machine: remove .enc → recovery_required (no silent regen)
  fs.unlinkSync(snap.encPath);
  clearJWTSecretCache();
  delete process.env.JWT_SECRET;
  const status = getJwtSecretStatus();
  assert.equal(status, 'recovery_required', `C11 expected recovery_required, got ${status}`);
  let regenerated = false;
  try {
    initializeJWTSecret();
    regenerated = true;
  } catch (err: any) {
    assert.match(String(err?.code || err?.message || err), /RECOVERY_REQUIRED|recovery/i, 'C11 initialize fails closed');
  }
  assert.equal(regenerated, false, 'C11 no silent JWT regeneration');
  console.log('   ✓ C11 new-machine recovery_required (no silent regen)');

  // Empty vs restored distinction already shown in C13→C4→C5
  console.log('✅ P1.2 continuity suite passed');
  closeDatabase();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((err) => {
  console.error(err);
  try { closeDatabase(); } catch { /* ignore */ }
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});

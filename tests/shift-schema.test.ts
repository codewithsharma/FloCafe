/**
 * M4-B Shift Schema Foundation Tests
 *
 * Usage: node tests/run-electron-node-test.cjs tests/shift-schema.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-schema-'));

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

const {
  initDatabase,
  getDatabase,
  closeDatabase,
  now,
  MIGRATIONS,
  buildIdealSchemaDb,
} = require('../main/db');

function tableColumns(db: any, table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row: any) => row.name);
}

function getSetting(db: any, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function seedUser(db: any, id = 'shift-user-001', email?: string): string {
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, 'Cashier', ?, 'hash', 'cashier', 1, ?, ?)
  `).run(id, email || `${id}@test.local`, now(), now());
  return id;
}

function insertOpenShift(db: any, terminalId: string, userId: string, status = 'open'): number {
  const t = now();
  const info = db.prepare(`
    INSERT INTO shifts (
      terminal_id, status, opened_by_user_id, opening_float_cents,
      opened_at, created_at, updated_at
    ) VALUES (?, ?, ?, 50000, ?, ?, ?)
  `).run(terminalId, status, userId, t, t, t);
  return Number(info.lastInsertRowid);
}

function dropShiftArtifacts(db: any): void {
  db.exec('DROP TABLE IF EXISTS shifts');
  for (const idx of [
    'idx_shifts_one_open_per_terminal',
    'idx_shifts_terminal_id',
    'idx_shifts_opened_by',
    'idx_shifts_status',
    'idx_shifts_opened_at',
    'idx_shifts_closed_at',
    'idx_shifts_terminal_closed',
    'idx_orders_shift_id',
    'idx_bills_shift_id',
  ]) {
    db.exec(`DROP INDEX IF EXISTS ${idx}`);
  }
  db.prepare('DELETE FROM settings WHERE key IN (?, ?, ?, ?)').run(
    'shifts_enabled', 'require_open_shift_for_cash', 'shift_stale_hours', 'terminal_id',
  );
}

async function main() {
  console.log('M4-B Shift Schema Tests');
  console.log('='.repeat(60));

  const latestMigration = MIGRATIONS[MIGRATIONS.length - 1];
  assert.equal(latestMigration.version, 69, 'latest migration is v69');
  assert.equal(latestMigration.name, 'm4_shift_foundation');

  // ── Fresh install v0 → v69 ───────────────────────────────────────────────
  initDatabase();
  const db = getDatabase();
  assert.equal(db.pragma('user_version', { simple: true }), 69);

  assert.ok(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`).get(),
    'shifts table exists on fresh install',
  );

  const shiftColumns = tableColumns(db, 'shifts');
  for (const col of [
    'id', 'terminal_id', 'status', 'opened_by_user_id', 'closed_by_user_id',
    'opening_float_cents', 'opening_note', 'closing_note', 'counted_cash_cents',
    'opened_at', 'closed_at', 'created_at', 'updated_at',
  ]) {
    assert.ok(shiftColumns.includes(col), `shifts.${col} exists`);
  }
  assert.ok(!shiftColumns.includes('expected_cash_cents'), 'M5 field expected_cash_cents not in M4-B');
  assert.ok(!shiftColumns.includes('variance_cents'), 'M5 field variance_cents not in M4-B');
  console.log('   ✓ fresh install has shifts table with required columns');

  assert.ok(tableColumns(db, 'orders').includes('shift_id'), 'orders.shift_id exists');
  assert.ok(tableColumns(db, 'bills').includes('shift_id'), 'bills.shift_id exists');
  console.log('   ✓ orders.shift_id and bills.shift_id exist');

  assert.equal(getSetting(db, 'shifts_enabled'), 'false', 'shifts_enabled defaults to false');
  assert.equal(getSetting(db, 'require_open_shift_for_cash'), 'false');
  assert.equal(getSetting(db, 'shift_stale_hours'), '24');
  assert.equal(getSetting(db, 'terminal_id'), '', 'terminal_id setting seeded empty');
  console.log('   ✓ shift settings seeded with approved defaults');

  const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'shifts'`).all()
    .map((row: any) => row.name);
  for (const expected of [
    'idx_shifts_one_open_per_terminal',
    'idx_shifts_terminal_id',
    'idx_shifts_opened_by',
    'idx_shifts_status',
    'idx_shifts_opened_at',
    'idx_shifts_closed_at',
    'idx_shifts_terminal_closed',
  ]) {
    assert.ok(indexes.includes(expected), `${expected} exists`);
  }
  console.log('   ✓ shift indexes exist');

  // ── Status constraint ─────────────────────────────────────────────────────
  const userId = seedUser(db);
  assert.throws(
    () => insertOpenShift(db, 'terminal-invalid-status', userId, 'opening'),
    /CHECK constraint failed|constraint failed/i,
    'invalid status rejected',
  );
  console.log('   ✓ status CHECK constraint enforced');

  // ── One open shift per terminal ───────────────────────────────────────────
  insertOpenShift(db, 'terminal-a', userId);
  assert.throws(
    () => insertOpenShift(db, 'terminal-a', userId),
    /UNIQUE constraint failed|constraint failed/i,
    'duplicate open shift on same terminal rejected',
  );
  console.log('   ✓ one open shift per terminal enforced');

  // ── Multiple terminals may have open shifts ───────────────────────────────
  insertOpenShift(db, 'terminal-b', userId);
  const openCount = (db.prepare(`SELECT COUNT(*) AS count FROM shifts WHERE status = 'open'`).get() as { count: number }).count;
  assert.equal(openCount, 2, 'two terminals can each have an open shift');
  console.log('   ✓ multiple terminals can have independent open shifts');

  // ── Closed shifts do not violate unique-open rule ─────────────────────────
  insertOpenShift(db, 'terminal-c', userId, 'closed');
  insertOpenShift(db, 'terminal-c', userId, 'closed');
  insertOpenShift(db, 'terminal-c', userId, 'open');
  console.log('   ✓ closed shifts do not block additional closed/open rows per terminal');

  // ── NULL shift_id valid on orders/bills ───────────────────────────────────
  const orderInsert = db.prepare(`
    INSERT INTO orders (order_number, status, subtotal, total, created_at, updated_at)
    VALUES ('SHIFT-ORD-1', 'pending', 100, 100, ?, ?)
  `).run(now(), now());
  const billInsert = db.prepare(`
    INSERT INTO bills (bill_number, order_id, total, balance, payment_status, created_at, updated_at)
    VALUES ('SHIFT-BILL-1', ?, 100, 100, 'unpaid', ?, ?)
  `).run(orderInsert.lastInsertRowid, now(), now());

  const orderRow = db.prepare('SELECT shift_id FROM orders WHERE id = ?').get(orderInsert.lastInsertRowid) as { shift_id: null };
  const billRow = db.prepare('SELECT shift_id FROM bills WHERE id = ?').get(billInsert.lastInsertRowid) as { shift_id: null };
  assert.equal(orderRow.shift_id, null);
  assert.equal(billRow.shift_id, null);
  console.log('   ✓ NULL shift_id valid on new orders and bills');

  // ── Upgrade v68 → v69 with existing transactional data ────────────────────
  const legacyUser = seedUser(db, 'legacy-user-001');
  const legacyOrder = db.prepare(`
    INSERT INTO orders (order_number, status, subtotal, total, user_id, created_at, updated_at)
    VALUES ('LEGACY-001', 'completed', 250, 250, ?, ?, ?)
  `).run(legacyUser, now(), now());
  const legacyBill = db.prepare(`
    INSERT INTO bills (bill_number, order_id, total, paid_amount, balance, payment_status, created_at, updated_at)
    VALUES ('LEGACY-BILL-001', ?, 250, 250, 0, 'paid', ?, ?)
  `).run(legacyOrder.lastInsertRowid, now(), now());
  const legacyOrderId = legacyOrder.lastInsertRowid;
  const legacyBillId = legacyBill.lastInsertRowid;

  dropShiftArtifacts(db);
  db.pragma('user_version = 68');
  closeDatabase();

  initDatabase();
  const upgraded = getDatabase();
  assert.equal(upgraded.pragma('user_version', { simple: true }), 69);
  assert.ok(
    upgraded.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`).get(),
    'shifts table exists after v68 upgrade',
  );
  assert.ok(tableColumns(upgraded, 'orders').includes('shift_id'));
  assert.ok(tableColumns(upgraded, 'bills').includes('shift_id'));

  const preservedOrder = upgraded.prepare('SELECT id, shift_id FROM orders WHERE id = ?').get(legacyOrderId) as any;
  const preservedBill = upgraded.prepare('SELECT id, shift_id FROM bills WHERE id = ?').get(legacyBillId) as any;
  assert.equal(preservedOrder.shift_id, null, 'existing order shift_id is NULL after upgrade');
  assert.equal(preservedBill.shift_id, null, 'existing bill shift_id is NULL after upgrade');
  assert.equal(getSetting(upgraded, 'shifts_enabled'), 'false');
  console.log('   ✓ v68 → v69 upgrade preserves existing orders/bills with NULL shift_id');

  // ── Migration idempotency (re-open at v69 does not re-run) ───────────────
  const shiftCountBefore = (upgraded.prepare('SELECT COUNT(*) AS count FROM shifts').get() as { count: number }).count;
  closeDatabase();
  initDatabase();
  const reopened = getDatabase();
  assert.equal(reopened.pragma('user_version', { simple: true }), 69);
  const shiftCountAfter = (reopened.prepare('SELECT COUNT(*) AS count FROM shifts').get() as { count: number }).count;
  assert.equal(shiftCountAfter, shiftCountBefore, 'reopening DB at v69 does not duplicate shift rows');
  console.log('   ✓ migration runner is idempotent at v69');

  closeDatabase();

  // ── Ideal schema parity ───────────────────────────────────────────────────
  const idealDb = buildIdealSchemaDb();
  assert.equal(idealDb.pragma('user_version', { simple: true }), 69);
  assert.ok(
    idealDb.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`).get(),
    'ideal schema includes shifts',
  );
  idealDb.close();
  console.log('   ✓ ideal schema at v69 includes shifts');

  console.log('='.repeat(60));
  console.log('✅ M4-B shift schema tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

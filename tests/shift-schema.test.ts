/**
 * M4-B / M5-B Shift Schema Foundation Tests
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

function insertShift(
  db: any,
  terminalId: string,
  userId: string,
  opts: {
    status?: string;
    openingFloatCents?: number;
    countedCashCents?: number | null;
    closedByUserId?: string | null;
    closedAt?: string | null;
  } = {},
): number {
  const t = now();
  const status = opts.status ?? 'open';
  const info = db.prepare(`
    INSERT INTO shifts (
      terminal_id, status, opened_by_user_id, closed_by_user_id,
      opening_float_cents, counted_cash_cents, opened_at, closed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    terminalId,
    status,
    userId,
    opts.closedByUserId ?? null,
    opts.openingFloatCents ?? 50000,
    opts.countedCashCents ?? null,
    t,
    opts.closedAt ?? (status === 'closed' ? t : null),
    t,
    t,
  );
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

function dropM5ShiftColumns(db: any): void {
  const cols = tableColumns(db, 'shifts');
  if (cols.includes('expected_cash_cents')) {
    db.exec('ALTER TABLE shifts DROP COLUMN expected_cash_cents');
  }
  if (cols.includes('variance_cents')) {
    db.exec('ALTER TABLE shifts DROP COLUMN variance_cents');
  }
}

async function main() {
  console.log('M4-B / M5-B Shift Schema Tests');
  console.log('='.repeat(60));

  const latestMigration = MIGRATIONS[MIGRATIONS.length - 1];
  assert.equal(latestMigration.version, 75, 'latest migration is v75');
  assert.equal(latestMigration.name, 'p2_8_inventory_movements_ledger');
  const v74 = MIGRATIONS.find((m: { version: number }) => m.version === 74);
  assert.ok(v74, 'v74 p0_2_jwt_secret_storage_marker migration exists');
  assert.equal(v74.name, 'p0_2_jwt_secret_storage_marker');
  const v73 = MIGRATIONS.find((m: { version: number }) => m.version === 73);
  assert.ok(v73, 'v73 p0_1_network_mode migration exists');
  assert.equal(v73.name, 'p0_1_network_mode');

  const v72 = MIGRATIONS.find((m: { version: number }) => m.version === 72);
  assert.ok(v72, 'v72 m6_refunds migration exists');
  assert.equal(v72.name, 'm6_refunds');

  const v70 = MIGRATIONS.find((m: { version: number }) => m.version === 70);
  assert.ok(v70, 'v70 m5_cash_reconciliation_columns migration exists');
  assert.equal(v70.name, 'm5_cash_reconciliation_columns');

  const v69 = MIGRATIONS.find((m: { version: number }) => m.version === 69);
  assert.ok(v69, 'v69 m4_shift_foundation migration exists');

  // ── Fresh install v0 → v75 ───────────────────────────────────────────────
  initDatabase();
  const db = getDatabase();
  assert.equal(db.pragma('user_version', { simple: true }), 75);

  assert.ok(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`).get(),
    'shifts table exists on fresh install',
  );
  assert.ok(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'day_closes'`).get(),
    'day_closes table exists on fresh install',
  );
  assert.ok(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'refunds'`).get(),
    'refunds table exists on fresh install',
  );
  assert.ok(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'refund_idempotency'`).get(),
    'refund_idempotency table exists on fresh install',
  );
  const networkMode = db.prepare(`SELECT value FROM settings WHERE key = 'network_mode'`).get() as { value: string } | undefined;
  assert.equal(networkMode?.value, 'localhost', 'fresh install defaults network_mode=localhost');

  const shiftColumns = tableColumns(db, 'shifts');
  for (const col of [
    'id', 'terminal_id', 'status', 'opened_by_user_id', 'closed_by_user_id',
    'opening_float_cents', 'opening_note', 'closing_note', 'counted_cash_cents',
    'expected_cash_cents', 'variance_cents',
    'opened_at', 'closed_at', 'created_at', 'updated_at',
  ]) {
    assert.ok(shiftColumns.includes(col), `shifts.${col} exists`);
  }
  console.log('   ✓ fresh install has shifts table with M5 reconciliation columns');

  const expectedCol = db.prepare(`PRAGMA table_info(shifts)`).all()
    .find((row: any) => row.name === 'expected_cash_cents') as { notnull: number } | undefined;
  const varianceCol = db.prepare(`PRAGMA table_info(shifts)`).all()
    .find((row: any) => row.name === 'variance_cents') as { notnull: number } | undefined;
  assert.ok(expectedCol, 'expected_cash_cents column metadata exists');
  assert.ok(varianceCol, 'variance_cents column metadata exists');
  assert.equal(expectedCol!.notnull, 0, 'expected_cash_cents is nullable');
  assert.equal(varianceCol!.notnull, 0, 'variance_cents is nullable');
  console.log('   ✓ expected_cash_cents and variance_cents are nullable');

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
    () => insertShift(db, 'terminal-invalid-status', userId, { status: 'opening' }),
    /CHECK constraint failed|constraint failed/i,
    'invalid status rejected',
  );
  console.log('   ✓ status CHECK constraint enforced');

  // ── One open shift per terminal ───────────────────────────────────────────
  insertShift(db, 'terminal-a', userId);
  assert.throws(
    () => insertShift(db, 'terminal-a', userId),
    /UNIQUE constraint failed|constraint failed/i,
    'duplicate open shift on same terminal rejected',
  );
  console.log('   ✓ one open shift per terminal enforced');

  // ── Multiple terminals may have open shifts ───────────────────────────────
  insertShift(db, 'terminal-b', userId);
  const openCount = (db.prepare(`SELECT COUNT(*) AS count FROM shifts WHERE status = 'open'`).get() as { count: number }).count;
  assert.equal(openCount, 2, 'two terminals can each have an open shift');
  console.log('   ✓ multiple terminals can have independent open shifts');

  // ── Closed shifts do not violate unique-open rule ─────────────────────────
  insertShift(db, 'terminal-c', userId, { status: 'closed' });
  insertShift(db, 'terminal-c', userId, { status: 'closed' });
  insertShift(db, 'terminal-c', userId, { status: 'open' });
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

  // ── M5 columns default NULL on new shifts ─────────────────────────────────
  const freshShiftId = insertShift(db, 'terminal-m5-null', userId);
  const freshShift = db.prepare(`
    SELECT opening_float_cents, counted_cash_cents, expected_cash_cents, variance_cents
    FROM shifts WHERE id = ?
  `).get(freshShiftId) as {
    opening_float_cents: number;
    counted_cash_cents: null;
    expected_cash_cents: null;
    variance_cents: null;
  };
  assert.equal(freshShift.opening_float_cents, 50000);
  assert.equal(freshShift.counted_cash_cents, null);
  assert.equal(freshShift.expected_cash_cents, null);
  assert.equal(freshShift.variance_cents, null);
  console.log('   ✓ new shifts have NULL expected_cash_cents and variance_cents');

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
  const upgradedFrom68 = getDatabase();
  assert.equal(upgradedFrom68.pragma('user_version', { simple: true }), 75);
  assert.ok(tableColumns(upgradedFrom68, 'shifts').includes('expected_cash_cents'));
  assert.ok(tableColumns(upgradedFrom68, 'shifts').includes('variance_cents'));

  const preservedOrder = upgradedFrom68.prepare('SELECT id, shift_id FROM orders WHERE id = ?').get(legacyOrderId) as any;
  const preservedBill = upgradedFrom68.prepare('SELECT id, shift_id FROM bills WHERE id = ?').get(legacyBillId) as any;
  assert.equal(preservedOrder.shift_id, null, 'existing order shift_id is NULL after upgrade');
  assert.equal(preservedBill.shift_id, null, 'existing bill shift_id is NULL after upgrade');
  assert.equal(getSetting(upgradedFrom68, 'shifts_enabled'), 'false');
  assert.ok(
    upgradedFrom68.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'day_closes'`).get(),
    'day_closes exists after upgrade from v68',
  );
  console.log('   ✓ v68 → v72 upgrade preserves existing orders/bills with NULL shift_id');

  // ── Upgrade v69 → v72 with existing open/closed shifts ────────────────────
  const upgradeUser = seedUser(upgradedFrom68, 'upgrade-user-001');
  const openShiftId = insertShift(upgradedFrom68, 'terminal-upgrade-open', upgradeUser, {
    status: 'open',
    openingFloatCents: 75000,
  });
  const closedShiftId = insertShift(upgradedFrom68, 'terminal-upgrade-closed', upgradeUser, {
    status: 'closed',
    openingFloatCents: 100000,
    countedCashCents: 98765,
    closedByUserId: upgradeUser,
    closedAt: now(),
  });

  dropM5ShiftColumns(upgradedFrom68);
  upgradedFrom68.pragma('user_version = 69');
  assert.ok(!tableColumns(upgradedFrom68, 'shifts').includes('expected_cash_cents'));
  assert.ok(!tableColumns(upgradedFrom68, 'shifts').includes('variance_cents'));
  closeDatabase();

  initDatabase();
  const upgradedFrom69 = getDatabase();
  assert.equal(upgradedFrom69.pragma('user_version', { simple: true }), 75);
  assert.ok(tableColumns(upgradedFrom69, 'shifts').includes('expected_cash_cents'));
  assert.ok(tableColumns(upgradedFrom69, 'shifts').includes('variance_cents'));

  const preservedOpen = upgradedFrom69.prepare(`
    SELECT status, opening_float_cents, counted_cash_cents, expected_cash_cents, variance_cents
    FROM shifts WHERE id = ?
  `).get(openShiftId) as any;
  const preservedClosed = upgradedFrom69.prepare(`
    SELECT status, opening_float_cents, counted_cash_cents, expected_cash_cents, variance_cents
    FROM shifts WHERE id = ?
  `).get(closedShiftId) as any;

  assert.equal(preservedOpen.status, 'open');
  assert.equal(preservedOpen.opening_float_cents, 75000);
  assert.equal(preservedOpen.counted_cash_cents, null);
  assert.equal(preservedOpen.expected_cash_cents, null, 'no backfill on open shift');
  assert.equal(preservedOpen.variance_cents, null, 'no backfill on open shift');

  assert.equal(preservedClosed.status, 'closed');
  assert.equal(preservedClosed.opening_float_cents, 100000);
  assert.equal(preservedClosed.counted_cash_cents, 98765, 'counted_cash_cents preserved');
  assert.equal(preservedClosed.expected_cash_cents, null, 'no historical expected backfill');
  assert.equal(preservedClosed.variance_cents, null, 'no historical variance backfill');
  console.log('   ✓ v69 → v70 upgrade preserves shifts; reconciliation columns NULL');

  // ── Migration idempotency (re-open at v70 does not re-run) ───────────────
  const shiftCountBefore = (upgradedFrom69.prepare('SELECT COUNT(*) AS count FROM shifts').get() as { count: number }).count;
  closeDatabase();
  initDatabase();
  const reopened = getDatabase();
  assert.equal(reopened.pragma('user_version', { simple: true }), 75);
  const shiftCountAfter = (reopened.prepare('SELECT COUNT(*) AS count FROM shifts').get() as { count: number }).count;
  assert.equal(shiftCountAfter, shiftCountBefore, 'reopening DB at v72 does not duplicate shift rows');
  console.log('   ✓ migration runner is idempotent at v72');

  closeDatabase();

  // ── Ideal schema parity ───────────────────────────────────────────────────
  const idealDb = buildIdealSchemaDb();
  assert.equal(idealDb.pragma('user_version', { simple: true }), 75);
  assert.ok(
    idealDb.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'shifts'`).get(),
    'ideal schema includes shifts',
  );
  assert.ok(
    idealDb.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'day_closes'`).get(),
    'ideal schema includes day_closes',
  );
  assert.ok(tableColumns(idealDb, 'shifts').includes('expected_cash_cents'));
  assert.ok(tableColumns(idealDb, 'shifts').includes('variance_cents'));
  idealDb.close();
  console.log('   ✓ ideal schema at v72 includes M5 reconciliation + day_closes');

  console.log('='.repeat(60));
  console.log('✅ M4-B / M5-B / M5-G shift schema tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

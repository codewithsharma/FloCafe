/**
 * H4 — Restore / Conflict Hardening
 *
 * Usage: node tests/run-electron-node-test.cjs tests/h4-restore-conflict-hardening.test.ts
 *        npm run test:h4
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-h4-restore-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'h4-restore-conflict-hardening-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedCategory,
  seedProduct,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { createBackup } = require('../main/db');

const ROOT = path.join(__dirname, '..');

async function createOrder(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
): Promise<{ orderId: number; itemId: number }> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers: authHeader,
  });
  assertEqual(order.status, 201, 'order created');
  return { orderId: order.data.order.id, itemId: order.data.order.items[0].id };
}

async function main() {
  console.log('H4 — Restore / Conflict Hardening');
  console.log('='.repeat(60));

  // ── Source contracts ──────────────────────────────────────────────────────
  console.log('\nH4-WIRE-01 backup integrity + restore audit + cancel lock');
  const dbSrc = fs.readFileSync(path.join(ROOT, 'main/db.ts'), 'utf8');
  const ordersSrc = [
    fs.readFileSync(path.join(ROOT, 'main/routes/orders.ts'), 'utf8'),
    ...['cancel','status','create'].map((f) =>
      fs.readFileSync(path.join(ROOT, 'main/routes/orders', f + '.ts'), 'utf8'),
    ),
  ].join('\n');
  const databaseRoute = fs.readFileSync(path.join(ROOT, 'main/routes/database.ts'), 'utf8');
  const ipcSrc = fs.readFileSync(path.join(ROOT, 'main/ipc.ts'), 'utf8');
  assert(dbSrc.includes("PRAGMA integrity_check") && dbSrc.includes('Backup integrity check failed'), 'createBackup verifies integrity');
  assert(databaseRoute.includes("backup.created"), 'HTTP backup writes audit');
  assert(ipcSrc.includes('restore.completed') || ipcSrc.includes("restore.failed"), 'IPC restore writes audit');
  assert(ordersSrc.includes('re-read under the txn lock') || ordersSrc.includes('locked.status === \'cancelled\''), 'cancel re-checks status in txn');
  assert(ordersSrc.includes('already_cancelled') || ordersSrc.includes("ITEM_STATUS_CONFLICT"), 'item cancel/restore conflict guards');

  // ── Behavioral: conflict / idempotent cancel ──────────────────────────────
  console.log('\nH4-CONFLICT-01 cancel + item restore safety');
  const db = initTestDb();
  const owner = seedOwnerUser(db);
  seedCategory(db, 'h4-cat', 'H4');
  seedProduct(db, 'h4-prod', 'h4-cat', 'H4 Product', 50, { track_inventory: 1, stock_quantity: 10 });

  const app = createApp({ '/api/orders': orderRoutes });
  const { baseUrl, server } = await startServer(app);

  const { orderId, itemId } = await createOrder(baseUrl, owner.authHeader, 'h4-prod');
  const stockBefore = (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('h4-prod') as {
    stock_quantity: number;
  }).stock_quantity;

  const cancel1 = await api(baseUrl, `/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'cancelled', reason: 'h4' },
    headers: owner.authHeader,
  });
  assertEqual(cancel1.status, 200, 'first cancel succeeds');
  const stockMid = (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('h4-prod') as {
    stock_quantity: number;
  }).stock_quantity;
  assertEqual(stockMid, stockBefore + 1, 'cancel restores one unit');

  const cancel2 = await api(baseUrl, `/api/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status: 'cancelled', reason: 'h4-retry' },
    headers: owner.authHeader,
  });
  assertEqual(cancel2.status, 200, 'repeat cancel succeeds (idempotent)');
  const stockAfter = (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('h4-prod') as {
    stock_quantity: number;
  }).stock_quantity;
  assertEqual(stockAfter, stockMid, 'repeat cancel does not double-restock');

  // Item cancel already-cancelled no-op
  const pending = await createOrder(baseUrl, owner.authHeader, 'h4-prod');
  db.prepare("UPDATE order_items SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
    now(),
    pending.itemId,
  );
  const redo = await api(baseUrl, `/api/orders/${pending.orderId}/items/${pending.itemId}/cancel`, {
    method: 'PATCH',
    body: {},
    headers: owner.authHeader,
  });
  assertEqual(redo.status, 200, 'duplicate item cancel is no-op 200');
  assertEqual(redo.data.already_cancelled, true, 'already_cancelled flag set');

  // Restore rejects non-cancelled status
  const live = await createOrder(baseUrl, owner.authHeader, 'h4-prod');
  const badRestore = await api(baseUrl, `/api/orders/${live.orderId}/items/${live.itemId}/restore`, {
    method: 'PATCH',
    body: {},
    headers: owner.authHeader,
  });
  assertEqual(badRestore.status, 409, 'restore pending item → 409');
  assertEqual(badRestore.data.code, 'ITEM_STATUS_CONFLICT', 'ITEM_STATUS_CONFLICT code');

  // ── Backup create integrity stamp ─────────────────────────────────────────
  console.log('\nH4-BACKUP-01 createBackup integrity + meta');
  const { path: backupPath, schemaVersion } = await createBackup();
  assert(fs.existsSync(backupPath), 'backup file exists');
  assert(schemaVersion >= 75, 'backup schema version stamped');
  const Database = require('better-sqlite3');
  const bak = new Database(backupPath, { readonly: true });
  const integrity = bak.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  assertEqual(integrity.integrity_check, 'ok', 'backup artifact integrity_check ok');
  const meta = bak
    .prepare("SELECT value FROM _flo_meta WHERE key = 'schema_version'")
    .get() as { value: string };
  assertEqual(String(meta.value), String(schemaVersion), 'meta schema_version matches');
  bak.close();

  server.close();
  closeDatabase();

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

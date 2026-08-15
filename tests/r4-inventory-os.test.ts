/**
 * R4 Inventory OS — backend deepen (units, idempotent adjust, stock counts, ledger reconstruct).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/r4-inventory-os.test.ts
 *    or: npm run test:r4
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r4-inv-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r4-inventory-os-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
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

const { productRoutes } = require('../main/routes/products');
const { inventoryRoutes } = require('../main/routes/inventory');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  adjustProductStock,
  reconstructQuantityFromLedger,
  compareCurrentStockToLedger,
} = require('../main/services/inventory');
const {
  assertCompatibleUnits,
  convertQuantity,
} = require('../main/services/inventory-units');

function seedRoleUser(
  db: any,
  id: string,
  role: string,
  email: string,
): { userId: string; authHeader: Record<string, string> } {
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, `Test ${role}`, email, passwordHash, role, now(), now());
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { userId: id, authHeader: { Authorization: `Bearer ${token}` } };
}

function stockHeaders(authHeader: Record<string, string>, key: string) {
  return { ...authHeader, 'Idempotency-Key': key };
}

async function main() {
  console.log('\nR4 — Inventory OS deepen\n' + '='.repeat(60));
  assertEqual(getSupportedSchemaVersion(), 78, 'schema version is 78');

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    78,
    'fresh DB at user_version 78',
  );

  const cols = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
  assert(cols.some((c) => c.name === 'inventory_unit'), 'products.inventory_unit exists');
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='stock_adjust_idempotency'").get(),
    'stock_adjust_idempotency table',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='inventory_counts'").get(),
    'inventory_counts table',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='inventory_count_lines'").get(),
    'inventory_count_lines table',
  );
  console.log('   ✓ schema v78');

  // Units
  assertEqual(convertQuantity(1, 'kg', 'g'), 1000, '1kg = 1000g');
  assertEqual(convertQuantity(500, 'g', 'kg'), 0.5, '500g = 0.5kg');
  assertEqual(convertQuantity(1, 'L', 'ml'), 1000, '1L = 1000ml');
  assertCompatibleUnits('pcs', 'pcs');
  let threw = false;
  try {
    convertQuantity(1, 'pcs', 'box');
  } catch (e: any) {
    threw = true;
    assertEqual(e.statusCode, 400, 'pcs→box 400');
  }
  assert(threw, 'pcs→box throws');
  threw = false;
  try {
    convertQuantity(1, 'kg', 'L');
  } catch (e: any) {
    threw = true;
    assertEqual(e.statusCode, 400, 'kg→L 400');
  }
  assert(threw, 'kg→L throws');
  console.log('   ✓ units');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'cashier-r4-001', 'cashier', 'cashier-r4@test.local');
  seedCategory(db, 'cat-r4', 'R4 Cat');
  seedProduct(db, 'prod-r4-a', 'cat-r4', 'R4 Milk', 40, {
    track_inventory: true,
    stock_quantity: 10,
  });
  db.prepare(`UPDATE products SET inventory_unit = 'kg' WHERE id = ?`).run('prod-r4-a');
  seedProduct(db, 'prod-r4-b', 'cat-r4', 'R4 Cups', 5, {
    track_inventory: true,
    stock_quantity: 20,
  });

  // Reconstruction with no movements
  const empty = reconstructQuantityFromLedger(db, 'prod-r4-b');
  assertEqual(empty.opening, 20, 'no-mov opening=current');
  assertEqual(empty.sumDeltas, 0, 'no-mov sum=0');
  assertEqual(empty.reconstructed, 20, 'no-mov reconstructed');
  assert(empty.valid, 'no-mov valid');

  adjustProductStock('prod-r4-b', 'decrease', 5);
  adjustProductStock('prod-r4-b', 'increase', 2);
  const recon = reconstructQuantityFromLedger(db, 'prod-r4-b');
  assertEqual(recon.current, 17, 'current 20-5+2');
  assert(recon.valid, 'ledger reconstruct valid');
  assert(compareCurrentStockToLedger('prod-r4-b').valid, 'compare still valid');
  console.log('   ✓ reconstruct');

  const app = createApp({
    '/api/products': productRoutes,
    '/api/inventory': inventoryRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // Missing Idempotency-Key
    const missingKey = await api(baseUrl, '/api/products/prod-r4-a/stock', {
      method: 'POST',
      body: { action: 'decrease', quantity: 1 },
      headers: owner.authHeader,
    });
    assertEqual(missingKey.status, 400, 'missing Idempotency-Key → 400');

    // Wastage with reason + idempotent replay
    const wasteKey = 'r4-waste-1';
    const waste1 = await api(baseUrl, '/api/products/prod-r4-a/stock', {
      method: 'POST',
      body: { action: 'wastage', quantity: 1, wastage_reason: 'SPOILAGE' },
      headers: stockHeaders(owner.authHeader, wasteKey),
    });
    assertEqual(waste1.status, 200, 'wastage 200');
    assertEqual(waste1.data.product.stock_quantity, 9, 'stock 10-1');

    const mov = db
      .prepare(
        `SELECT reason FROM inventory_movements WHERE product_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get('prod-r4-a') as { reason: string };
    assertEqual(mov.reason, 'wastage:SPOILAGE', 'reason wastage:SPOILAGE');

    const wasteReplay = await api(baseUrl, '/api/products/prod-r4-a/stock', {
      method: 'POST',
      body: { action: 'wastage', quantity: 1, wastage_reason: 'SPOILAGE' },
      headers: stockHeaders(owner.authHeader, wasteKey),
    });
    assertEqual(wasteReplay.status, 200, 'replay 200');
    assertEqual(wasteReplay.data.product.stock_quantity, 9, 'replay does not double-apply');

    const wasteConflict = await api(baseUrl, '/api/products/prod-r4-a/stock', {
      method: 'POST',
      body: { action: 'wastage', quantity: 2, wastage_reason: 'SPOILAGE' },
      headers: stockHeaders(owner.authHeader, wasteKey),
    });
    assertEqual(wasteConflict.status, 409, 'key reuse different body → 409');

    // Unit conversion on adjust (product is kg; send 500g)
    const unitAdj = await api(baseUrl, '/api/products/prod-r4-a/stock', {
      method: 'POST',
      body: { action: 'decrease', quantity: 500, inventory_unit: 'g' },
      headers: stockHeaders(owner.authHeader, 'r4-unit-1'),
    });
    assertEqual(unitAdj.status, 200, 'unit convert adjust 200');
    assertEqual(unitAdj.data.product.stock_quantity, 8.5, '9 - 0.5kg');

    // Audit
    const auditWaste = db
      .prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'inventory.wastage'`)
      .get() as { c: number };
    assert(auditWaste.c >= 1, 'inventory.wastage audit');

    // Cashier denied stock
    const cashierDenied = await api(baseUrl, '/api/products/prod-r4-a/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 1 },
      headers: stockHeaders(cashier.authHeader, 'r4-cash-1'),
    });
    assertEqual(cashierDenied.status, 403, 'cashier stock 403');

    // Ledger check
    const check = await api(baseUrl, '/api/inventory/products/prod-r4-a/ledger-check', {
      headers: manager.authHeader,
    });
    assertEqual(check.status, 200, 'ledger-check 200');
    assert(check.data.valid === true, 'ledger-check valid');

    // Stock count flow
    const created = await api(baseUrl, '/api/inventory/counts', {
      method: 'POST',
      body: { notes: 'R4 count' },
      headers: owner.authHeader,
    });
    assertEqual(created.status, 201, 'create count 201');
    const countId = created.data.count.id as string;
    assert(String(countId).startsWith('cnt-'), 'cnt- id prefix');
    assertEqual(created.data.count.status, 'draft', 'draft');

    const line = await api(baseUrl, `/api/inventory/counts/${countId}/lines`, {
      method: 'POST',
      body: { product_id: 'prod-r4-b', counted_qty: 15 },
      headers: owner.authHeader,
    });
    assertEqual(line.status, 200, 'upsert line 200');
    assertEqual(line.data.line.system_qty, 17, 'system snapshot 17');
    assertEqual(line.data.line.counted_qty, 15, 'counted 15');
    assertEqual(line.data.line.variance, -2, 'variance -2');

    const submitted = await api(baseUrl, `/api/inventory/counts/${countId}/submit`, {
      method: 'POST',
      body: {},
      headers: owner.authHeader,
    });
    assertEqual(submitted.status, 200, 'submit 200');
    assertEqual(submitted.data.count.status, 'submitted', 'submitted');

    const applied = await api(baseUrl, `/api/inventory/counts/${countId}/apply`, {
      method: 'POST',
      body: {},
      headers: owner.authHeader,
    });
    assertEqual(applied.status, 200, 'apply 200');
    assertEqual(applied.data.count.status, 'applied', 'applied');

    const after = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-r4-b') as { stock_quantity: number };
    assertEqual(after.stock_quantity, 15, 'apply set stock to counted');

    const countMov = db
      .prepare(
        `SELECT reason, reference_type FROM inventory_movements
         WHERE product_id = ? AND reason = 'count_variance' ORDER BY id DESC LIMIT 1`,
      )
      .get('prod-r4-b') as { reason: string; reference_type: string };
    assertEqual(countMov.reason, 'count_variance', 'count_variance reason');
    assertEqual(countMov.reference_type, 'inventory_count', 'ref inventory_count');

    const auditApply = db
      .prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'inventory.count_applied'`)
      .get() as { c: number };
    assertEqual(auditApply.c, 1, 'count_applied audit');

    // Cancel path
    const c2 = await api(baseUrl, '/api/inventory/counts', {
      method: 'POST',
      body: {},
      headers: owner.authHeader,
    });
    const cancel = await api(baseUrl, `/api/inventory/counts/${c2.data.count.id}/cancel`, {
      method: 'POST',
      body: {},
      headers: owner.authHeader,
    });
    assertEqual(cancel.status, 200, 'cancel 200');
    assertEqual(cancel.data.count.status, 'cancelled', 'cancelled');

    const list = await api(baseUrl, '/api/inventory/counts', { headers: owner.authHeader });
    assertEqual(list.status, 200, 'list counts 200');
    assert(list.data.counts.length >= 2, 'list has counts');

    // CHECK still unchanged
    const dbTs = fs.readFileSync(path.join(__dirname, '../main/db.ts'), 'utf8');
    assert(
      dbTs.includes("CHECK (movement_type IN ('sale', 'cancel_restore', 'adjustment'))"),
      'movement_type CHECK unchanged',
    );

    console.log('   ✓ stock adjust + counts + ledger-check');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`R4 Inventory OS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * INV-AUTO-86 — automatic menu 86 from stock.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/inv-auto-86.test.ts
 *    or: npm run test:inv-auto-86
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-inv-auto-86-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'inv-auto-86-secret';

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
  now,
} = require('./helpers/test-setup');

const { productRoutes } = require('../main/routes/products');
const { orderRoutes } = require('../main/routes/orders');
const { getSupportedSchemaVersion, withTxn, getDatabase } = require('../main/db');
const {
  adjustProductStock,
  decrementTrackedStock,
  restoreTrackedStock,
} = require('../main/services/inventory');
const {
  computeAutoUnavailable,
  effectiveIsActive,
  notifyStockChanged,
  setManualAvailability,
  syncAutoUnavailableForProduct,
} = require('../main/services/product-availability');
const { createRecipe } = require('../main/services/recipe');

function avail(db: any, id: string) {
  return db
    .prepare(
      `SELECT is_active, manual_unavailable, auto_unavailable, stock_quantity, track_inventory
       FROM products WHERE id = ?`,
    )
    .get(id) as {
    is_active: number;
    manual_unavailable: number;
    auto_unavailable: number;
    stock_quantity: number;
    track_inventory: number;
  };
}

function auditCount(db: any, productId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM audit_logs
         WHERE action = 'product.availability' AND entity_id = ?`,
      )
      .get(productId) as { c: number }
  ).c;
}

async function main() {
  console.log('INV-AUTO-86 — Auto-86 from stock');
  console.log('='.repeat(60));

  assertEqual(effectiveIsActive(false, false), true, 'both clear → available');
  assertEqual(effectiveIsActive(true, false), false, 'manual → unavailable');
  assertEqual(effectiveIsActive(false, true), false, 'auto → unavailable');
  assertEqual(effectiveIsActive(true, true), false, 'both → unavailable');

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip is v88');
  assertEqual(Number(db.pragma('user_version', { simple: true })), 88, 'fresh DB tip 88');

  const owner = seedOwnerUser(db);

  const cols = (db.prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  assert(cols.includes('manual_unavailable'), 'manual_unavailable column');
  assert(cols.includes('auto_unavailable'), 'auto_unavailable column');

  seedCategory(db, 'cat-auto86', 'Mains');
  seedProduct(db, 'sku-tracked', 'cat-auto86', 'Tracked Latte', 5, {
    track_inventory: true,
    stock_quantity: 2,
  });
  seedProduct(db, 'sku-zero', 'cat-auto86', 'Zero Stock', 4, {
    track_inventory: true,
    stock_quantity: 0,
  });
  seedProduct(db, 'sku-untracked', 'cat-auto86', 'Untracked Cake', 8, {
    track_inventory: false,
    stock_quantity: 0,
  });
  // Seed bypasses inventory service — sync once so tip semantics match create/adjust paths.
  withTxn(() => {
    notifyStockChanged(db, ['sku-zero', 'sku-untracked', 'sku-tracked']);
  });

  const zeroRow = avail(db, 'sku-zero');
  assertEqual(zeroRow.auto_unavailable, 1, 'stock 0 → auto_unavailable on tip');
  assertEqual(zeroRow.is_active, 0, 'stock 0 → effective inactive');

  const unt = avail(db, 'sku-untracked');
  assertEqual(unt.auto_unavailable, 0, 'untracked zero stock not auto-86');
  assertEqual(unt.is_active, 1, 'untracked remains active');

  withTxn(() => {
    syncAutoUnavailableForProduct(db, 'sku-tracked');
  });
  assertEqual(avail(db, 'sku-tracked').is_active, 1, 'stock available → active');
  assertEqual(avail(db, 'sku-tracked').auto_unavailable, 0, 'stock available → auto clear');

  const beforeAudits = auditCount(db, 'sku-tracked');
  withTxn(() => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get('sku-tracked');
    decrementTrackedStock(db, p, 2, now(), { reason: 'sale' });
  });
  const afterSale = avail(db, 'sku-tracked');
  assertEqual(afterSale.stock_quantity, 0, 'sale depletes stock');
  assertEqual(afterSale.auto_unavailable, 1, 'sale → auto_unavailable');
  assertEqual(afterSale.is_active, 0, 'sale → effective 86');
  assert(auditCount(db, 'sku-tracked') > beforeAudits, 'auto-86 audited');

  const auditsMid = auditCount(db, 'sku-tracked');
  withTxn(() => {
    notifyStockChanged(db, ['sku-tracked'], { reason: 'noop' });
    notifyStockChanged(db, ['sku-tracked'], { reason: 'noop' });
  });
  assertEqual(auditCount(db, 'sku-tracked'), auditsMid, 'no flap audits when unchanged');

  withTxn(() => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get('sku-tracked');
    restoreTrackedStock(db, p, 3, now(), { reason: 'cancel_restore' });
  });
  const restored = avail(db, 'sku-tracked');
  assertEqual(restored.stock_quantity, 3, 'restore stock');
  assertEqual(restored.auto_unavailable, 0, 'restore clears auto');
  assertEqual(restored.is_active, 1, 'restore → available');
  assertEqual(restored.manual_unavailable, 0, 'restore leaves manual clear');

  withTxn(() => {
    setManualAvailability(db, 'sku-tracked', false, { actorUserId: owner.userId });
  });
  assertEqual(avail(db, 'sku-tracked').manual_unavailable, 1, 'manual 86 set');
  assertEqual(avail(db, 'sku-tracked').is_active, 0, 'manual → inactive');

  withTxn(() => {
    adjustProductStock('sku-tracked', 'increase', 5, { reason: 'receiving' });
  });
  const afterRecv = avail(db, 'sku-tracked');
  assert(afterRecv.stock_quantity >= 5, 'receiving increased stock');
  assertEqual(afterRecv.manual_unavailable, 1, 'manual survives receiving');
  assertEqual(afterRecv.auto_unavailable, 0, 'auto clear when stock ok');
  assertEqual(afterRecv.is_active, 0, 'manual still blocks availability');

  withTxn(() => {
    adjustProductStock('sku-tracked', 'set', 0, { reason: 'count_variance' });
  });
  assertEqual(avail(db, 'sku-tracked').auto_unavailable, 1, 'set 0 → auto');
  withTxn(() => {
    setManualAvailability(db, 'sku-tracked', true, { actorUserId: owner.userId });
  });
  const bypass = avail(db, 'sku-tracked');
  assertEqual(bypass.manual_unavailable, 0, 'manual cleared on restore attempt');
  assertEqual(bypass.auto_unavailable, 1, 'auto remains at zero stock');
  assertEqual(bypass.is_active, 0, 'cannot bypass zero stock via manual restore');

  withTxn(() => {
    adjustProductStock('sku-tracked', 'set', 1, { reason: 'set' });
  });
  assertEqual(avail(db, 'sku-tracked').is_active, 1, 'stock=1 available');
  withTxn(() => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get('sku-tracked');
    decrementTrackedStock(db, p, 1, now());
  });
  assertEqual(avail(db, 'sku-tracked').is_active, 0, 'stock=0 after last unit → 86');

  seedProduct(db, 'ing-bun', 'cat-auto86', 'Bun', 1, {
    track_inventory: true,
    stock_quantity: 1,
  });
  seedProduct(db, 'menu-burger', 'cat-auto86', 'Chicken Burger', 12, {
    track_inventory: false,
    stock_quantity: 0,
  });
  createRecipe({
    productId: 'menu-burger',
    name: 'Burger BOM',
    yieldQty: 1,
    yieldUnit: 'pcs',
    actorUserId: owner.userId,
    ingredients: [
      { ingredient_product_id: 'ing-bun', quantity: 1, unit: 'pcs', position: 0 },
    ],
  });
  withTxn(() => {
    syncAutoUnavailableForProduct(getDatabase(), 'menu-burger');
  });
  assertEqual(avail(db, 'menu-burger').is_active, 1, 'recipe menu available with ingredient');
  withTxn(() => {
    const bun = db.prepare('SELECT * FROM products WHERE id = ?').get('ing-bun');
    decrementTrackedStock(db, bun, 1, now());
  });
  assertEqual(avail(db, 'ing-bun').auto_unavailable, 1, 'ingredient auto-86');
  assertEqual(avail(db, 'menu-burger').auto_unavailable, 1, 'menu auto-86 via recipe');
  assertEqual(avail(db, 'menu-burger').is_active, 0, 'menu effective unavailable');

  const app = createApp({
    '/api/products': productRoutes,
    '/api/orders': orderRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    withTxn(() => {
      adjustProductStock('sku-tracked', 'set', 0, { reason: 'set' });
    });
    assertEqual(avail(db, 'sku-tracked').is_active, 0, 'fixture inactive for POS reject');

    const rejectRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Idempotency-Key': `auto86-reject-${Date.now()}`,
      },
      body: {
        type: 'takeaway',
        items: [{ product_id: 'sku-tracked', quantity: 1 }],
      },
    });
    assertEqual(rejectRes.status, 400, 'POS rejects unavailable product');
    assert(
      String(rejectRes.data?.error || '')
        .toLowerCase()
        .includes('unavailable'),
      `reject message mentions unavailable (got ${rejectRes.data?.error})`,
    );

    withTxn(() => {
      adjustProductStock('sku-tracked', 'set', 5, { reason: 'set' });
      setManualAvailability(db, 'sku-tracked', true, { actorUserId: owner.userId });
    });
    assertEqual(avail(db, 'sku-tracked').is_active, 1, 'restored for accept path');

    const acceptRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Idempotency-Key': `auto86-accept-${Date.now()}`,
      },
      body: {
        type: 'takeaway',
        items: [{ product_id: 'sku-tracked', quantity: 1 }],
      },
    });
    assert(
      acceptRes.status === 201 || acceptRes.status === 200,
      `available order accepted (status ${acceptRes.status})`,
    );

    const stockBefore = avail(db, 'sku-tracked').stock_quantity;
    const manRes = await api(baseUrl, '/api/products/sku-tracked/availability', {
      method: 'POST',
      headers: owner.authHeader,
      body: { is_active: false },
    });
    assertEqual(manRes.status, 200, 'manual 86 API 200');
    assertEqual(avail(db, 'sku-tracked').manual_unavailable, 1, 'API sets manual');
    assertEqual(
      avail(db, 'sku-tracked').stock_quantity,
      stockBefore,
      'manual 86 does not touch stock',
    );

    assertEqual(computeAutoUnavailable(db, 'sku-untracked'), false, 'untracked compute false');

    const posPage = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/pos/page.tsx'),
      'utf8',
    );
    const eightySixLib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/pos/eighty-six.ts'),
      'utf8',
    );
    assert(
      eightySixLib.includes('auto_unavailable') || eightySixLib.includes('isAutoEightySixed'),
      'eighty-six helpers expose auto-86',
    );
    assert(
      posPage.includes('autoEightySix') ||
        posPage.includes('isAutoEightySixed') ||
        posPage.includes('auto_unavailable'),
      'POS UI surfaces auto-86 indicator',
    );

    console.log('\nAll INV-AUTO-86 checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

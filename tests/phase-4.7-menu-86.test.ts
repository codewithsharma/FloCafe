/**
 * Phase 4.7 — Restaurant 86 (sold-out) availability workflow.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.7-menu-86.test.ts
 *    or: npm run test:phase-4.7
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.7-menu-86-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-47-menu-86-secret';

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
const { getJWTSecret } = require('../main/routes/auth');
const {
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
  ACTIVE_VERTICAL_ENV_KEY,
} = require('../main/modules/vertical-config');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function frontendExists(rel: string): boolean {
  return fs.existsSync(path.join(FRONTEND, rel));
}

function lockVertical(id: string | undefined): void {
  resetActiveVerticalResolutionForTests();
  if (id === undefined) {
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
  } else {
    process.env[ACTIVE_VERTICAL_ENV_KEY] = id;
  }
  commitActiveVerticalFromEnv();
}

function seedCashierUser(db: any): { authHeader: Record<string, string> } {
  const userId = 'cashier-phase47-001';
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, 'Test Cashier', 'cashier@test.local', passwordHash, 'cashier', 1, now(), now());
  const token = jwt.sign({ userId, email: 'cashier@test.local', role: 'cashier' }, getJWTSecret(), {
    expiresIn: '1h',
  });
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

function productRow(
  db: any,
  id: string,
): {
  name: string;
  price: number;
  stock_quantity: number;
  is_active: number;
  deleted_at: string | null;
} {
  return db
    .prepare('SELECT name, price, stock_quantity, is_active, deleted_at FROM products WHERE id = ?')
    .get(id);
}

function movementCount(db: any, productId: string): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?')
      .get(productId) as {
      c: number;
    }
  ).c;
}

function schemaVersion(db: any): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

async function postAvailability(
  baseUrl: string,
  productId: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; data: any }> {
  const response = await (globalThis as any).fetch(
    `${baseUrl}/api/products/${productId}/availability`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { status: response.status, data };
}

async function main() {
  console.log('Phase 4.7 — Restaurant 86 availability');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  const { authHeader: cashierAuth } = seedCashierUser(db);
  seedCategory(db, 'cat-47', 'Drinks');
  seedProduct(db, 'prod-47-latte', 'cat-47', 'Latte', 120, {
    track_inventory: true,
    stock_quantity: 17,
  });
  seedProduct(db, 'prod-47-mocha', 'cat-47', 'Mocha', 140, {
    track_inventory: true,
    stock_quantity: 9,
  });

  const app = createApp({
    '/api/products': productRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    assertEqual(schemaVersion(db), 87, 'schema remains at tip v87');

    // ── Characterization: PUT { is_active } is COALESCE-safe ──────────
    console.log('\n1. Characterization — PUT is_active does not clobber name/price/stock');
    const beforePut = productRow(db, 'prod-47-mocha');
    const putOnlyActive = await api(baseUrl, '/api/products/prod-47-mocha', {
      method: 'PUT',
      body: { is_active: false },
      headers: ownerAuth,
    });
    assertEqual(putOnlyActive.status, 200, 'PUT { is_active: false } succeeds');
    const afterPut = productRow(db, 'prod-47-mocha');
    assertEqual(afterPut.name, beforePut.name, 'PUT keeps name');
    assertEqual(Number(afterPut.price), Number(beforePut.price), 'PUT keeps price');
    assertEqual(afterPut.stock_quantity, beforePut.stock_quantity, 'PUT keeps stock');
    assertEqual(Number(afterPut.is_active), 0, 'PUT sets is_active=0');

    const catalogAfterPut = await api(baseUrl, '/api/products?active=1', { headers: ownerAuth });
    assertEqual(catalogAfterPut.status, 200, 'GET ?active=1 succeeds');
    const activeIdsAfterPut = (catalogAfterPut.data.products as { id: string }[]).map((p) => p.id);
    assert(!activeIdsAfterPut.includes('prod-47-mocha'), 'GET ?active=1 hides inactive product');
    assert(activeIdsAfterPut.includes('prod-47-latte'), 'GET ?active=1 still lists active product');

    const restorePut = await api(baseUrl, '/api/products/prod-47-mocha', {
      method: 'PUT',
      body: { is_active: true },
      headers: ownerAuth,
    });
    assertEqual(restorePut.status, 200, 'PUT restore succeeds');
    assertEqual(
      Number(productRow(db, 'prod-47-mocha').is_active),
      1,
      'PUT restore sets is_active=1',
    );

    // ── Adapter: 86 / un-86 ───────────────────────────────────────────
    console.log('\n2. Adapter — POST /api/products/:id/availability');
    lockVertical('restaurant');
    const stockBefore86 = productRow(db, 'prod-47-latte').stock_quantity;
    const movementsBefore86 = movementCount(db, 'prod-47-latte');

    const eightySix = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: false },
      ownerAuth,
    );
    assertEqual(eightySix.status, 200, '86 returns 200');
    assert(!!eightySix.data?.product, '86 returns product');
    assertEqual(Number(eightySix.data?.product?.is_active), 0, '86 sets is_active=0');
    assertEqual(
      productRow(db, 'prod-47-latte').stock_quantity,
      stockBefore86,
      '86 does not change stock',
    );
    assertEqual(
      movementCount(db, 'prod-47-latte'),
      movementsBefore86,
      '86 does not write inventory_movements',
    );

    const catalogAfter86 = await api(baseUrl, '/api/products?active=1', { headers: ownerAuth });
    const activeAfter86 = (catalogAfter86.data.products as { id: string }[]).map((p) => p.id);
    assert(!activeAfter86.includes('prod-47-latte'), "POS catalog hides 86'd product");

    const audit86 = db
      .prepare(
        `SELECT action, entity_type, entity_id, metadata_json FROM audit_logs
         WHERE action = 'product.availability' AND entity_id = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get('prod-47-latte') as
      | {
          action: string;
          entity_type: string;
          entity_id: string;
          metadata_json: string;
        }
      | undefined;
    assert(!!audit86, '86 writes product.availability audit');
    if (audit86) {
      assertEqual(audit86.entity_type, 'product', 'audit entityType is product');
      const meta = JSON.parse(audit86.metadata_json);
      assertEqual(meta.is_active, false, 'audit metadata records is_active=false');
    }

    const un86 = await postAvailability(baseUrl, 'prod-47-latte', { is_active: true }, managerAuth);
    assertEqual(un86.status, 200, 'manager un-86 returns 200');
    assertEqual(Number(un86.data?.product?.is_active), 1, 'un-86 sets is_active=1');
    assertEqual(
      productRow(db, 'prod-47-latte').stock_quantity,
      stockBefore86,
      'un-86 does not change stock',
    );

    const catalogAfterUn86 = await api(baseUrl, '/api/products?active=1', { headers: ownerAuth });
    const activeAfterUn86 = (catalogAfterUn86.data.products as { id: string }[]).map((p) => p.id);
    assert(activeAfterUn86.includes('prod-47-latte'), 'POS catalog shows restored product');

    const lastWrite = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: false },
      ownerAuth,
    );
    assertEqual(lastWrite.status, 200, 'repeat toggle succeeds');
    const lastWrite2 = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: true },
      ownerAuth,
    );
    assertEqual(lastWrite2.status, 200, 'last write wins (restore)');
    assertEqual(Number(productRow(db, 'prod-47-latte').is_active), 1, 'last write is_active=1');

    const missing = await postAvailability(
      baseUrl,
      'does-not-exist',
      { is_active: false },
      ownerAuth,
    );
    assertEqual(missing.status, 404, 'missing product returns 404');
    assertEqual(missing.data.error, 'Product not found', 'missing product JSON error');

    db.prepare('UPDATE products SET deleted_at = ? WHERE id = ?').run(now(), 'prod-47-mocha');
    const deleted = await postAvailability(
      baseUrl,
      'prod-47-mocha',
      { is_active: false },
      ownerAuth,
    );
    assertEqual(deleted.status, 404, 'deleted product returns 404');
    assertEqual(deleted.data.error, 'Product not found', 'deleted product JSON error');

    const cashier86 = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: false },
      cashierAuth,
    );
    assertEqual(cashier86.status, 403, 'cashier 86 is forbidden');
    assertEqual(Number(productRow(db, 'prod-47-latte').is_active), 1, 'cashier 86 does not mutate');

    const badBody = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: 'no' },
      ownerAuth,
    );
    assertEqual(badBody.status, 400, 'non-boolean is_active is 400');

    const emptyBody = await postAvailability(baseUrl, 'prod-47-latte', {}, ownerAuth);
    assertEqual(emptyBody.status, 400, 'missing is_active is 400');

    // ── Frontend contracts ────────────────────────────────────────────
    console.log('\n3. Frontend contracts — Restaurant POS 86, Retail isolation');
    assert(frontendExists('lib/pos/eighty-six.ts'), 'eighty-six helper exists');
    const helper = frontendExists('lib/pos/eighty-six.ts')
      ? readFrontend('lib/pos/eighty-six.ts')
      : '';
    assert(
      helper.includes("verticalId === 'restaurant'"),
      '86 helper requires restaurant verticalId',
    );
    assert(
      helper.includes("role === 'owner'") && helper.includes("role === 'manager'"),
      '86 helper requires owner or manager',
    );
    assert(
      helper.includes('/availability') || helper.includes('availability'),
      'helper names the availability adapter',
    );

    const posPage = readFrontend('app/(dashboard)/pos/page.tsx');
    assert(posPage.includes('canShowRestaurantEightySix'), 'POS page uses 86 helper');
    assert(posPage.includes('/availability'), 'POS page calls availability adapter');
    assert(posPage.includes('showEightySix'), 'POS page passes showEightySix into the grid');
    assert(
      !posPage.includes("isModuleEnabled('tables'") ||
        posPage.includes('canShowRestaurantEightySix'),
      '86 is not gated only on tables module',
    );

    const grid = readFrontend('components/pos/ProductGrid.tsx');
    assert(grid.includes('data-testid="pos-product-86"'), 'ProductGrid has 86 control test id');
    assert(grid.includes('showEightySix'), 'ProductGrid gates 86 behind showEightySix');
    assert(grid.includes('onEightySix'), 'ProductGrid exposes onEightySix');
    assert(
      !grid.includes('<button') || grid.includes('DropdownMenu') || grid.includes('pos-product-86'),
      '86 control is present without requiring nested-button-only layout',
    );

    const i18nEn = readFrontend('lib/i18n/en.json');
    const i18nEs = readFrontend('lib/i18n/es.json');
    const i18nPt = readFrontend('lib/i18n/pt.json');
    assert(i18nEn.includes('"pos.eightySix"'), 'en i18n has pos.eightySix');
    assert(i18nEs.includes('"pos.eightySix"'), 'es i18n has pos.eightySix');
    assert(i18nPt.includes('"pos.eightySix"'), 'pt i18n has pos.eightySix');

    const topbar = readFrontend('components/pos/PosTopbar.tsx');
    assert(
      !topbar.includes('eightySix') && !topbar.includes('/availability'),
      'PosTopbar has no 86 chrome',
    );
    const cart = readFrontend('components/pos/CartPanel.tsx');
    assert(
      !cart.includes('eightySix') && !cart.includes('/availability'),
      'CartPanel has no 86 chrome',
    );

    const restoreStrip =
      posPage.includes('pos-86-restore-strip') || posPage.includes('eightySixed');
    assert(restoreStrip, 'POS has an 86 restore surface');

    // ── Isolation ─────────────────────────────────────────────────────
    console.log('\n4. Isolation — restaurant vs retail composition');
    lockVertical('retail');
    const retail86 = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: false },
      ownerAuth,
    );
    assertEqual(
      retail86.status,
      200,
      'shared product adapter remains callable on retail (UI is restaurant-only)',
    );
    const retailRestore = await postAvailability(
      baseUrl,
      'prod-47-latte',
      { is_active: true },
      ownerAuth,
    );
    assertEqual(retailRestore.status, 200, 'retail can restore via shared adapter');

    assertEqual(schemaVersion(db), 87, 'schema still at tip v87 after adapter use');
  } finally {
    server.close();
    closeDatabase();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Phase 4.7 restaurant 86 tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

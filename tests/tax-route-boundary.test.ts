/**
 * Phase 2.10 — Tax HTTP route boundary characterization.
 *
 * Locks mount ownership, paths, auth, flags, and response shapes for
 * /api/tax/* after consolidation into main/routes/tax.ts.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/tax-route-boundary.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-tax-route-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory, seedProduct,
  installAndActivateTestTaxPack,
  api, assert, assertEqual,
  getResults, closeDatabase, now,
} = require('./helpers/test-setup');

const { registerRoutes } = require('../main/routes/index');
const { getJWTSecret } = require('../main/routes/auth');

const dualRatePackData = require('./fixtures/synthetic-dual-rate-pack.json');
const indiaTaxPack = { ...dualRatePackData, id: 'test-in-pack-route', country: 'IN', currency: 'INR' };

function seedRoleUser(db: any, id: string, role: string) {
  const email = `${id}@test.local`;
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, id, email, bcrypt.hashSync('testpass123', 10), role, 1, now(), now());
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('Phase 2.10 Tax HTTP Route Boundary');
  console.log('='.repeat(60));

  const db = initTestDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('country', 'IN', ?)").run(now());
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('taxes_enabled', 'true', ?)").run(now());
  installAndActivateTestTaxPack(db, indiaTaxPack);

  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'cashier-tax-route', 'cashier');
  const waiter = seedRoleUser(db, 'waiter-tax-route', 'waiter');
  const chef = seedRoleUser(db, 'chef-tax-route', 'chef');

  seedCategory(db, 'cat-tax-route', 'Tax Route Cat');
  seedProduct(db, 'prod-tax-route', 'cat-tax-route', 'Route Coffee', 1000, {
    tax_category_id: 'standard',
    tax_behavior: 'exclusive',
  });

  const app = createApp({});
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // ── 1. Router mount / source ownership ────────────────────────────
    console.log('\n1. Tax router owns /api/tax; index only composes');
    const taxRoutePath = path.join(__dirname, '../main/routes/tax.ts');
    assert(fs.existsSync(taxRoutePath), 'main/routes/tax.ts exists');
    if (!fs.existsSync(taxRoutePath)) {
      console.error('\nFAILED: main/routes/tax.ts missing');
      process.exit(1);
    }
    const taxSrc = fs.readFileSync(taxRoutePath, 'utf8');
    const indexSrc = fs.readFileSync(path.join(__dirname, '../main/routes/index.ts'), 'utf8');
    assert(taxSrc.includes("'/preview'") || taxSrc.includes('"/preview"'), 'tax router has /preview');
    assert(taxSrc.includes("'/categories'") || taxSrc.includes('"/categories"'), 'tax router has /categories');
    assert(/app\.use\(\s*['"]\/api\/tax['"]/.test(indexSrc), 'index mounts /api/tax');
    assert(!/app\.post\(\s*['"]\/api\/tax\/preview['"]/.test(indexSrc), 'index has no inline preview');
    assert(!/app\.get\(\s*['"]\/api\/tax\/categories['"]/.test(indexSrc), 'index has no inline categories');
    assert(/app\.use\(\s*['"]\/api\/tax-packs['"]/.test(indexSrc), 'tax-packs still composed separately');

    // ── 2. Paths + methods available ──────────────────────────────────
    console.log('\n2. Existing endpoint paths and methods remain');
    const categories = await api(baseUrl, '/api/tax/categories', { headers: ownerAuth });
    assertEqual(categories.status, 200, 'GET /api/tax/categories 200');
    const preview = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      body: { items: [{ product_id: 'prod-tax-route', quantity: 1, addons: [] }] },
      headers: ownerAuth,
    });
    assertEqual(preview.status, 200, 'POST /api/tax/preview 200');

    // ── 3. Auth — unauthenticated ─────────────────────────────────────
    console.log('\n3. Unauthenticated requests denied');
    const noAuthCat = await api(baseUrl, '/api/tax/categories');
    assertEqual(noAuthCat.status, 401, 'categories unauth 401');
    const noAuthPrev = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      body: { items: [{ product_id: 'prod-tax-route', quantity: 1 }] },
    });
    assertEqual(noAuthPrev.status, 401, 'preview unauth 401');

    // ── 4. Authorization — categories owner/manager only ──────────────
    console.log('\n4. Categories require owner/manager; preview any auth role');
    assertEqual(
      (await api(baseUrl, '/api/tax/categories', { headers: managerAuth })).status,
      200,
      'manager categories 200',
    );
    assertEqual(
      (await api(baseUrl, '/api/tax/categories', { headers: cashier.authHeader })).status,
      403,
      'cashier categories 403',
    );
    assertEqual(
      (await api(baseUrl, '/api/tax/categories', { headers: waiter.authHeader })).status,
      403,
      'waiter categories 403',
    );
    assertEqual(
      (await api(baseUrl, '/api/tax/categories', { headers: chef.authHeader })).status,
      403,
      'chef categories 403',
    );
    assertEqual(
      (await api(baseUrl, '/api/tax/preview', {
        method: 'POST',
        body: { items: [{ product_id: 'prod-tax-route', quantity: 1, addons: [] }] },
        headers: cashier.authHeader,
      })).status,
      200,
      'cashier preview 200',
    );

    // ── 5. Feature flag taxes_enabled ─────────────────────────────────
    console.log('\n5. taxes_enabled=false zeros preview tax; shape intact');
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'taxes_enabled'").run();
    const disabled = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      body: { items: [{ product_id: 'prod-tax-route', quantity: 1, addons: [] }] },
      headers: ownerAuth,
    });
    assertEqual(disabled.status, 200, 'disabled preview 200');
    assertEqual(disabled.data.summary.tax_amount, 0, 'disabled tax_amount 0');
    assert(disabled.data.summary && typeof disabled.data.summary.total === 'number', 'summary.total present');
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'taxes_enabled'").run();

    // ── 6. Response shapes ────────────────────────────────────────────
    console.log('\n6. Response shapes preserved');
    for (const key of [
      'pack_id', 'country', 'categories', 'default_category_id',
      'configuration_ready', 'unclassified_category_id',
    ]) {
      assert(Object.prototype.hasOwnProperty.call(categories.data, key), `categories has ${key}`);
    }
    assertEqual(categories.data.configuration_ready, true, 'IN pack configuration_ready');
    assert(Array.isArray(categories.data.categories), 'categories is array');
    assert(categories.data.categories.length > 0, 'categories non-empty when ready');
    const cat0 = categories.data.categories[0];
    for (const key of ['id', 'label', 'rate_percent', 'rate_label']) {
      assert(Object.prototype.hasOwnProperty.call(cat0, key), `category row has ${key}`);
    }
    assert(Array.isArray(preview.data.items), 'preview.items array');
    assert(preview.data.summary, 'preview.summary present');
    for (const key of [
      'subtotal', 'discount_amount', 'discounted_subtotal', 'tax_amount',
      'tax_breakdown', 'packaging_charge', 'delivery_charge', 'service_charge',
      'round_off', 'total',
    ]) {
      assert(Object.prototype.hasOwnProperty.call(preview.data.summary, key), `summary has ${key}`);
    }

    // ── 7. Error behavior ─────────────────────────────────────────────
    console.log('\n7. Error behavior preserved');
    const badItems = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      body: {},
      headers: ownerAuth,
    });
    assertEqual(badItems.status, 400, 'missing items 400');
    assertEqual(badItems.data.error, 'Items are required', 'items required message');
    const badDiscount = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      body: {
        items: [{ product_id: 'prod-tax-route', quantity: 1 }],
        discount_type: 'bogus',
        discount_value: 10,
      },
      headers: ownerAuth,
    });
    assertEqual(badDiscount.status, 400, 'bad discount_type 400');

    // ── 8. Calculations unchanged (golden dual-rate) ──────────────────
    console.log('\n8. Tax calculation unchanged (₹1000 exclusive → 50)');
    const golden = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      body: { items: [{ product_id: 'prod-tax-route', quantity: 1, addons: [] }] },
      headers: ownerAuth,
    });
    assertEqual(golden.status, 200, 'golden preview 200');
    assertEqual(golden.data.summary.tax_amount, 50, 'tax_amount 50');
    assertEqual(golden.data.summary.subtotal, 1000, 'subtotal 1000');

    // ── 9. Tax-packs unchanged (separate router) ──────────────────────
    console.log('\n9. Tax-packs still available under /api/tax-packs');
    const packs = await api(baseUrl, '/api/tax-packs', { headers: ownerAuth });
    assertEqual(packs.status, 200, 'GET /api/tax-packs 200');
    assert(Array.isArray(packs.data.packs), 'packs array');

    // ── 10. Settings tax still under /api/settings ────────────────────
    console.log('\n10. Settings tax configuration path unchanged');
    const settingsTax = await api(baseUrl, '/api/settings/tax', { headers: ownerAuth });
    assertEqual(settingsTax.status, 200, 'GET /api/settings/tax 200');
    for (const key of [
      'tax_registered', 'tax_registration_number', 'state_code', 'tax_scheme', 'country',
    ]) {
      assert(Object.prototype.hasOwnProperty.call(settingsTax.data, key), `settings/tax has ${key}`);
    }

    // ── 11. Frontend-compatible paths (relative /tax/*) ───────────────
    console.log('\n11. Frontend path strings remain compatible');
    assert(
      fs.readFileSync(path.join(__dirname, '../frontend/src/hooks/use-tax-preview.ts'), 'utf8')
        .includes("/tax/preview"),
      'use-tax-preview still calls /tax/preview',
    );
    assert(
      fs.readFileSync(path.join(__dirname, '../frontend/src/app/(dashboard)/products/page.tsx'), 'utf8')
        .includes('/tax/categories'),
      'products page still calls /tax/categories',
    );

    // ── 12. Vertical-neutral (no restaurant hard-gate in tax router) ──
    console.log('\n12. Tax router remains vertical-neutral');
    assert(!/business_type\s*===\s*['"]restaurant['"]/.test(taxSrc), 'no restaurant hard-gate in tax.ts');
    assert(!/\b(table|kot|kds|waiter|kitchen)\b/i.test(taxSrc), 'no floor/KDS coupling in tax.ts');

    const { failed: failCount } = getResults();
    if (failCount > 0) {
      console.error(`\nFAILED: ${failCount} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll tax-route-boundary checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

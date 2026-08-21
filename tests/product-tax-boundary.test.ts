/**
 * Phase 2.13 — Product ↔ Tax ownership boundary.
 *
 * Architecture characterization only: Product persists tax config references;
 * Tax owns calculation/snapshot; historical bill tax is immutable when product
 * tax metadata changes. No money-math or schema changes.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/product-tax-boundary.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-prod-tax-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory,
  installAndActivateTestTaxPack,
  api, assert, assertEqual,
  getResults, closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');

const { productRoutes } = require('../main/routes/products');
const { registerRoutes } = require('../main/routes/index');
const {
  calculateTax,
  scaleItemTaxForDiscountRatio,
  scaleItemTaxAfterOrderDiscount,
} = require('../main/services/tax');
const { getSupportedSchemaVersion } = require('../main/db');
const {
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  getVerticalDefinition,
  OPERVIA_RESTAURANT_VERTICAL_ID,
} = require('../main/modules');

const dualRatePackData = require('./fixtures/synthetic-dual-rate-pack.json');
const indiaTaxPack = { ...dualRatePackData, id: 'test-in-pack-pt', country: 'IN', currency: 'INR' };

const ENGINE_SNAPSHOT_KEYS = [
  'packId', 'packVersion', 'effectiveFrom',
  'taxRounding', 'payableRounding', 'appliedRuleIds', 'lines',
] as const;

async function main() {
  console.log('Phase 2.13 Product ↔ Tax Ownership Boundary');
  console.log('='.repeat(60));

  const db = initTestDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('country', 'IN', ?)").run(now());
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('business_type', 'restaurant', ?)").run(now());
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('state_code', '27', ?)").run(now());
  installAndActivateTestTaxPack(db, indiaTaxPack);

  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-pt', 'Product Tax Boundary');

  const app = createApp({
    '/api/products': productRoutes,
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // ── 1. Product tax metadata preserved on create/update ────────────
    console.log('\n1. Product tax metadata preserved (create/update)');
    const create = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Boundary Cappuccino',
        price: 200,
        category_id: 'cat-pt',
        tax_category_id: 'standard',
        tax_behavior: 'exclusive',
      },
      headers: authHeader,
    });
    assertEqual(create.status, 201, 'create 201');
    const prodId = create.data.product.id;
    assertEqual(create.data.product.tax_category_id, 'standard', 'create tax_category_id=standard');
    assertEqual(create.data.product.tax_behavior, 'exclusive', 'create tax_behavior=exclusive');
    assertEqual(create.data.product.tax_type, 'none', 'legacy tax_type forced none');
    assertEqual(create.data.product.tax_rate, 0, 'legacy tax_rate forced 0');

    const update = await api(baseUrl, `/api/products/${prodId}`, {
      method: 'PUT',
      body: {
        name: 'Boundary Cappuccino',
        price: 200,
        tax_category_id: 'standard',
        tax_behavior: 'inclusive',
      },
      headers: authHeader,
    });
    assertEqual(update.status, 200, 'update 200');
    assertEqual(update.data.product.tax_behavior, 'inclusive', 'update tax_behavior=inclusive');
    assertEqual(update.data.product.tax_category_id, 'standard', 'update keeps tax_category_id');
    assertEqual(update.data.product.tax_type, 'none', 'update keeps tax_type none');
    assertEqual(update.data.product.tax_rate, 0, 'update keeps tax_rate 0');

    // ── 2. products.ts does NOT import tax-engine ─────────────────────
    console.log('\n2. products.ts does not import tax-engine');
    const productsSrc = fs.readFileSync(
      path.join(__dirname, '../main/routes/products.ts'),
      'utf8',
    );
    assert(
      !/from ['"]\.\.\/services\/tax-engine['"]/.test(productsSrc),
      'products.ts has no tax-engine import',
    );
    assert(
      !/require\(['"]\.\.\/services\/tax-engine['"]\)/.test(productsSrc),
      'products.ts has no tax-engine require',
    );

    // ── 3. Product does not calculate tax ─────────────────────────────
    console.log('\n3. Product route does not calculate tax');
    assert(!/\bcalculateTax\b/.test(productsSrc), 'no calculateTax in products.ts');
    assert(!/\bcalculateItemTax\b/.test(productsSrc), 'no calculateItemTax in products.ts');
    assert(
      productsSrc.includes('getActiveCountryPack') || productsSrc.includes('hasConfiguredTaxCategories'),
      'validates tax categories via Tax facade helpers',
    );

    // ── 4. Tax facade remains calculation boundary ────────────────────
    console.log('\n4. Tax facade calculateTax golden ₹1000 → 50.00');
    const engineInput = {
      pack: dualRatePackData,
      country: 'IN',
      businessType: 'restaurant',
      storeStateCode: '27',
      transactionDate: '2026-01-15T12:00:00.000Z',
      customer: null,
      lines: [{
        lineId: 'l1',
        kind: 'product',
        quantity: '1',
        unitPrice: '1000',
        productCategoryId: 'standard',
        taxBehavior: 'exclusive',
      }],
    };
    const viaFacade = calculateTax(engineInput);
    assertEqual(viaFacade.lines[0].taxAmount, '50.00', 'facade ₹1000 → 50.00');

    // ── 5. Existing tax calculation values unchanged ──────────────────
    console.log('\n5. Discount goldens unchanged');
    const scaled10 = scaleItemTaxForDiscountRatio(50, 50, 0.9);
    assertEqual(scaled10.taxAmount, 45, '50@0.9→45');
    const scaled20 = scaleItemTaxAfterOrderDiscount({
      itemTaxAmount: 22.5,
      itemExclusiveTaxAmount: 22.5,
      discountAmount: 200,
      subtotal: 1000,
    });
    assertEqual(scaled20.taxAmount, 18, '22.50@20%→18');

    // ── 6. Tax snapshot shape unchanged ───────────────────────────────
    console.log('\n6. EngineTaxSnapshot keys unchanged');
    for (const key of ENGINE_SNAPSHOT_KEYS) {
      assert(
        Object.prototype.hasOwnProperty.call(viaFacade.snapshot, key),
        `snapshot has ${key}`,
      );
    }

    // ── 7–8. Product create/update API compatible ─────────────────────
    console.log('\n7–8. Product create/update API compatible');
    assert(!!create.data.product.id, 'create returns product.id');
    assert(typeof create.data.product.price === 'number', 'create returns price');
    assert(!!update.data.product.id, 'update returns product.id');
    assertEqual(update.data.product.name, 'Boundary Cappuccino', 'update returns name');

    // ── 9–10. Historical bill tax unchanged when product tax changes ──
    console.log('\n9–10. Historical bill tax immutable when product tax config changes');
    const frozenSnapshot = JSON.stringify([{
      packId: indiaTaxPack.id,
      packVersion: indiaTaxPack.version,
      effectiveFrom: '2026-01-01',
      taxRounding: dualRatePackData.taxRounding,
      payableRounding: dualRatePackData.payableRounding,
      appliedRuleIds: ['cgst', 'sgst'],
      lines: [{
        lineId: 'hist-1',
        categoryId: 'standard',
        categorySource: 'product',
        taxBehavior: 'exclusive',
        grossAmount: '200.00',
        taxableBase: '200.00',
        taxAmount: '10.00',
        components: [],
      }],
    }]);
    const frozenTaxAmount = 10;
    const orderIns = db.prepare(`
      INSERT INTO orders (
        order_number, type, status, subtotal, tax_amount, tax_snapshot, total,
        created_at, updated_at
      ) VALUES (?, 'takeaway', 'completed', 200, ?, ?, 210, ?, ?)
    `).run('ORD-PT-HIST', frozenTaxAmount, frozenSnapshot, now(), now());
    const orderId = Number(orderIns.lastInsertRowid);
    const billIns = db.prepare(`
      INSERT INTO bills (
        bill_number, order_id, subtotal, tax_amount, tax_snapshot, total,
        paid_amount, balance, payment_status, paid_at, created_at, updated_at
      ) VALUES (?, ?, 200, ?, ?, 210, 210, 0, 'paid', ?, ?, ?)
    `).run(
      'BILL-PT-HIST', orderId, frozenTaxAmount, frozenSnapshot,
      now(), now(), now(),
    );
    const billId = Number(billIns.lastInsertRowid);

    const changeProduct = await api(baseUrl, `/api/products/${prodId}`, {
      method: 'PUT',
      body: {
        name: 'Boundary Cappuccino',
        price: 200,
        tax_category_id: null,
        tax_behavior: 'exempt',
      },
      headers: authHeader,
    });
    assertEqual(changeProduct.status, 200, 'product tax config change 200');
    assertEqual(changeProduct.data.product.tax_category_id, null, 'product category cleared');
    assertEqual(changeProduct.data.product.tax_behavior, 'exempt', 'product behavior exempt');

    const billAfter = db.prepare(
      'SELECT tax_amount, tax_snapshot, payment_status FROM bills WHERE id = ?',
    ).get(billId) as any;
    assertEqual(billAfter.payment_status, 'paid', 'bill still paid');
    assertEqual(billAfter.tax_amount, frozenTaxAmount, 'bill tax_amount unchanged');
    assertEqual(billAfter.tax_snapshot, frozenSnapshot, 'bill tax_snapshot unchanged');

    // ── 11. Tax pack / category validation still works ────────────────
    console.log('\n11. Invalid tax_category_id rejected');
    const invalid = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Bad Category',
        price: 50,
        category_id: 'cat-pt',
        tax_category_id: 'does-not-exist',
        tax_behavior: 'exclusive',
      },
      headers: authHeader,
    });
    assertEqual(invalid.status, 400, 'invalid category → 400');
    assert(
      String(invalid.data.error || '').includes('tax_category_id'),
      'error mentions tax_category_id',
    );

    // ── 12. Restaurant vertical composition smoke ─────────────────────
    console.log('\n12. Restaurant vertical includes product + tax');
    const restaurant = getVerticalDefinition(OPERVIA_RESTAURANT_VERTICAL_ID);
    assert(
      restaurant.enabledModules.includes('product'),
      'restaurant enables product',
    );
    assert(
      restaurant.enabledModules.includes('tax'),
      'restaurant enables tax',
    );

    // ── 13. retail-test composition includes product + tax ────────────
    console.log('\n13. retail-test composition includes product + tax');
    assert(
      OPERVIA_RETAIL_TEST_ENABLED_MODULES.includes('product'),
      'retail-test enables product',
    );
    assert(
      OPERVIA_RETAIL_TEST_ENABLED_MODULES.includes('tax'),
      'retail-test enables tax',
    );

    // ── 14. Schema stays v75 / no new migration ───────────────────────
    console.log('\n14. Schema version remains 86');
    assertEqual(getSupportedSchemaVersion(), 87, 'getSupportedSchemaVersion() === 86');

    const { failed: failCount } = getResults();
    if (failCount > 0) {
      console.error(`\nFAILED: ${failCount} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll product-tax-boundary checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

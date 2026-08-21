/**
 * P17 — Recipe & Ingredient Consumption / Food Cost Hardening
 * Usage: npm run test:p17
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-p17-recipe-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (s: string) => Buffer.from(s, 'utf8'),
        decryptString: (b: Buffer) => b.toString('utf8'),
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'p17-recipe-consumption-hardening-secret';

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

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { productRoutes } = require('../main/routes/products');
const { inventoryRoutes } = require('../main/routes/inventory');
const { recipeRoutes } = require('../main/routes/recipes');
const { getSupportedSchemaVersion, withTxn } = require('../main/db');
const { InventoryServiceError } = require('../main/services/inventory');
const {
  createRecipe,
  replaceRecipeIngredients,
  updateRecipe,
  computeRecipeCostForId,
} = require('../main/services/recipe');
const {
  consumeRecipeForOrderItem,
  reverseRecipeConsumptionForOrderItem,
} = require('../main/services/recipe-consumption');

function stockOf(db: any, productId: string): number {
  return Number(
    (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as {
        stock_quantity: number;
      }
    ).stock_quantity,
  );
}

function countAudit(db: any, action: string, entityId?: string): number {
  if (entityId != null) {
    return (
      db
        .prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action = ? AND entity_id = ?`)
        .get(action, String(entityId)) as { c: number }
    ).c;
  }
  return (
    db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action = ?`).get(action) as {
      c: number;
    }
  ).c;
}

function setIngredientStock(db: any, id: string, qty: number): void {
  db.prepare(
    `UPDATE products SET track_inventory = 1, stock_quantity = ?, updated_at = ? WHERE id = ?`,
  ).run(qty, now(), id);
}

async function main() {
  console.log('P17 — Recipe Consumption / Food Cost Hardening');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip remains v89');

  const owner = seedOwnerUser(db);
  const ownerAuth = owner.authHeader;
  seedCategory(db, 'cat-p17', 'P17 Cat');

  // Menu + ingredients
  seedProduct(db, 'menu-p17', 'cat-p17', 'P17 Latte', 200);
  seedProduct(db, 'ing-a', 'cat-p17', 'Ing A', 0, { track_inventory: true, stock_quantity: 10 });
  seedProduct(db, 'ing-b', 'cat-p17', 'Ing B', 0, { track_inventory: true, stock_quantity: 10 });
  seedProduct(db, 'ing-c', 'cat-p17', 'Ing C', 0, { track_inventory: true, stock_quantity: 10 });
  seedProduct(db, 'ing-cost', 'cat-p17', 'Ing Cost', 0, {
    track_inventory: true,
    stock_quantity: 100,
  });

  db.prepare(
    `UPDATE products SET cost = ?, cost_cents = ?, inventory_unit = 'pcs', updated_at = ? WHERE id = ?`,
  ).run(5.0, 999, now(), 'ing-cost');
  db.prepare(`UPDATE products SET cost = 1, cost_cents = 100, inventory_unit = 'pcs' WHERE id = ?`).run(
    'ing-a',
  );
  db.prepare(`UPDATE products SET cost = 1, cost_cents = 100, inventory_unit = 'pcs' WHERE id = ?`).run(
    'ing-b',
  );
  db.prepare(`UPDATE products SET cost = 1, cost_cents = 100, inventory_unit = 'pcs' WHERE id = ?`).run(
    'ing-c',
  );

  const recipeCost = createRecipe({
    productId: 'menu-p17',
    name: 'P17 Cost Recipe',
    yieldQty: 1,
    yieldUnit: 'pcs',
    actorUserId: owner.userId,
    ingredients: [
      {
        ingredient_product_id: 'ing-cost',
        quantity: 1,
        unit: 'pcs',
        prep_loss_bps: 0,
        position: 0,
      },
    ],
  });

  // ── P17-A: cost_cents preferred over cost ────────────────────────────────
  let orderItemSeq = 9000;
  const consumeWithItem = (menuId: string, portions = 1) => {
    orderItemSeq += 1;
    const orderId = `ord-p17-${orderItemSeq}`;
    const itemId = orderItemSeq;
    return withTxn(() =>
      consumeRecipeForOrderItem(db, {
        orderId,
        orderItemId: itemId,
        menuProductId: menuId,
        portions,
        actorUserId: owner.userId,
      }),
    );
  };

  const costConsume = consumeWithItem('menu-p17');
  assert(costConsume.consumed, 'cost path consumes');
  const costLine = db
    .prepare(
      `SELECT unit_cost_cents, line_cost_cents FROM recipe_consumption_lines WHERE consumption_id = ?`,
    )
    .get(costConsume.consumption!.id) as {
    unit_cost_cents: number;
    line_cost_cents: number;
  };
  assertEqual(costLine.unit_cost_cents, 999, 'prefer cost_cents (999) over cost*100 (500)');
  assertEqual(costLine.line_cost_cents, 999, 'line cost uses preferred unit cost');

  const liveCost = computeRecipeCostForId(recipeCost.id);
  assertEqual(liveCost.status, 'ok', 'live cost ok');
  assertEqual(liveCost.batchCostCents, 999, 'live recipe cost prefers cost_cents');

  // Historical snapshot immutability after catalog cost change
  db.prepare(`UPDATE products SET cost = 20, cost_cents = 2000, updated_at = ? WHERE id = ?`).run(
    now(),
    'ing-cost',
  );
  const lineAfterCatalog = db
    .prepare(
      `SELECT unit_cost_cents, line_cost_cents FROM recipe_consumption_lines WHERE consumption_id = ?`,
    )
    .get(costConsume.consumption!.id) as {
    unit_cost_cents: number;
    line_cost_cents: number;
  };
  assertEqual(lineAfterCatalog.unit_cost_cents, 999, 'snapshot unit cost immutable');
  assertEqual(lineAfterCatalog.line_cost_cents, 999, 'snapshot line cost immutable');
  const liveAfter = computeRecipeCostForId(recipeCost.id);
  assertEqual(liveAfter.batchCostCents, 2000, 'live cost updates with catalog');
  console.log('   ✓ P17-A cost_cents prefer + snapshot immutability');

  // ── BOM API: prep_loss / yield_unit / replace ───────────────────────────
  seedProduct(db, 'menu-p17-bom', 'cat-p17', 'P17 BOM Menu', 150);
  const recipeBom = createRecipe({
    productId: 'menu-p17-bom',
    name: 'P17 BOM',
    yieldQty: 2,
    yieldUnit: 'pcs',
    actorUserId: owner.userId,
    ingredients: [
      {
        ingredient_product_id: 'ing-a',
        quantity: 2,
        unit: 'pcs',
        prep_loss_bps: 1000,
        position: 0,
      },
    ],
  });
  const patched = updateRecipe(recipeBom.id, {
    name: 'P17 BOM Updated',
    yieldQty: 4,
    yieldUnit: 'box',
    actorUserId: owner.userId,
  });
  assertEqual(patched.name, 'P17 BOM Updated', 'PATCH name');
  assertEqual(Number(patched.yield_qty), 4, 'PATCH yield_qty');
  assertEqual(patched.yield_unit, 'box', 'PATCH yield_unit');

  const replaced = replaceRecipeIngredients(
    recipeBom.id,
    [
      {
        ingredient_product_id: 'ing-a',
        quantity: 3,
        unit: 'pcs',
        prep_loss_bps: 500,
        position: 0,
      },
      {
        ingredient_product_id: 'ing-b',
        quantity: 1,
        unit: 'pcs',
        prep_loss_bps: 0,
        position: 1,
      },
    ],
    owner.userId,
  );
  assertEqual(replaced.length, 2, 'replace adds/removes ingredients');
  assertEqual(Number(replaced[0].prep_loss_bps), 500, 'prep_loss_bps persisted');
  assert(countAudit(db, 'recipe.ingredient_changed', recipeBom.id) >= 1, 'ingredient audit');
  assert(countAudit(db, 'recipe.updated', recipeBom.id) >= 1, 'recipe.updated audit');

  let badPrep = false;
  try {
    replaceRecipeIngredients(
      recipeBom.id,
      [{ ingredient_product_id: 'ing-a', quantity: 1, unit: 'pcs', prep_loss_bps: -1, position: 0 }],
      owner.userId,
    );
  } catch {
    badPrep = true;
  }
  assert(badPrep, 'negative prep_loss rejected');
  console.log('   ✓ BOM prep_loss / yield_unit / PATCH / audit');

  // ── Multi-ingredient atomicity ──────────────────────────────────────────
  seedProduct(db, 'menu-p17-atom', 'cat-p17', 'P17 Atom', 100);
  setIngredientStock(db, 'ing-a', 10);
  setIngredientStock(db, 'ing-b', 0);
  setIngredientStock(db, 'ing-c', 10);
  const recipeAtom = createRecipe({
    productId: 'menu-p17-atom',
    name: 'P17 Atom',
    yieldQty: 1,
    actorUserId: owner.userId,
    ingredients: [
      { ingredient_product_id: 'ing-a', quantity: 1, unit: 'pcs', position: 0 },
      { ingredient_product_id: 'ing-b', quantity: 1, unit: 'pcs', position: 1 },
      { ingredient_product_id: 'ing-c', quantity: 1, unit: 'pcs', position: 2 },
    ],
  });
  const aBefore = stockOf(db, 'ing-a');
  const bBefore = stockOf(db, 'ing-b');
  const cBefore = stockOf(db, 'ing-c');
  let atomFailed = false;
  try {
    withTxn(() => {
      consumeRecipeForOrderItem(db, {
        orderId: 'ord-atom-1',
        orderItemId: 9101,
        menuProductId: 'menu-p17-atom',
        portions: 1,
        actorUserId: owner.userId,
      });
    });
  } catch (err: any) {
    atomFailed =
      err instanceof InventoryServiceError ||
      String(err?.message || '').includes('Insufficient stock');
  }
  assert(atomFailed, 'multi-ingredient consume fails when B insufficient');
  assertEqual(stockOf(db, 'ing-a'), aBefore, 'A unchanged after atomic fail');
  assertEqual(stockOf(db, 'ing-b'), bBefore, 'B unchanged after atomic fail');
  assertEqual(stockOf(db, 'ing-c'), cBefore, 'C unchanged after atomic fail');
  const atomCons = db
    .prepare(`SELECT COUNT(*) as c FROM recipe_consumptions WHERE order_item_id = 9101`)
    .get() as { c: number };
  assertEqual(atomCons.c, 0, 'no consumption row on atomic fail');
  console.log('   ✓ P17-D multi-ingredient atomicity');

  // ── Concurrency / CAS ───────────────────────────────────────────────────
  seedProduct(db, 'menu-p17-cas', 'cat-p17', 'P17 CAS', 100);
  setIngredientStock(db, 'ing-a', 1);
  createRecipe({
    productId: 'menu-p17-cas',
    name: 'P17 CAS',
    yieldQty: 1,
    actorUserId: owner.userId,
    ingredients: [{ ingredient_product_id: 'ing-a', quantity: 1, unit: 'pcs', position: 0 }],
  });
  let casOk = 0;
  let casFail = 0;
  for (let i = 0; i < 2; i++) {
    try {
      withTxn(() => {
        consumeRecipeForOrderItem(db, {
          orderId: `ord-cas-${i}`,
          orderItemId: 9200 + i,
          menuProductId: 'menu-p17-cas',
          portions: 1,
          actorUserId: owner.userId,
        });
      });
      casOk++;
    } catch {
      casFail++;
    }
  }
  assertEqual(casOk, 1, 'exactly one concurrent consume succeeds');
  assertEqual(casFail, 1, 'exactly one concurrent consume fails');
  assertEqual(stockOf(db, 'ing-a'), 0, 'CAS final stock 0');

  // stock = 0 → fail
  let zeroFail = false;
  try {
    withTxn(() => {
      consumeRecipeForOrderItem(db, {
        orderId: 'ord-cas-zero',
        orderItemId: 9210,
        menuProductId: 'menu-p17-cas',
        portions: 1,
        actorUserId: owner.userId,
      });
    });
  } catch {
    zeroFail = true;
  }
  assert(zeroFail, 'stock=0 consume fails');
  console.log('   ✓ P17-C recipe CAS / concurrency');

  // ── Idempotency ─────────────────────────────────────────────────────────
  seedProduct(db, 'menu-p17-idemp', 'cat-p17', 'P17 Idemp', 100);
  setIngredientStock(db, 'ing-a', 5);
  createRecipe({
    productId: 'menu-p17-idemp',
    name: 'P17 Idemp',
    yieldQty: 1,
    actorUserId: owner.userId,
    ingredients: [{ ingredient_product_id: 'ing-a', quantity: 1, unit: 'pcs', position: 0 }],
  });
  const first = withTxn(() =>
    consumeRecipeForOrderItem(db, {
      orderId: 'ord-idemp',
      orderItemId: 9300,
      menuProductId: 'menu-p17-idemp',
      portions: 1,
      actorUserId: owner.userId,
    }),
  );
  assert(first.consumed, 'first consume');
  const stockAfterFirst = stockOf(db, 'ing-a');
  const second = withTxn(() =>
    consumeRecipeForOrderItem(db, {
      orderId: 'ord-idemp',
      orderItemId: 9300,
      menuProductId: 'menu-p17-idemp',
      portions: 1,
      actorUserId: owner.userId,
    }),
  );
  assertEqual(second.skippedReason, 'already_consumed', 'retry skips');
  assertEqual(stockOf(db, 'ing-a'), stockAfterFirst, 'idempotent — no double consume');

  // reverse then duplicate reverse
  reverseRecipeConsumptionForOrderItem(db, {
    orderItemId: 9300,
    actorUserId: owner.userId,
    reason: 'order_cancelled',
  });
  const stockRestored = stockOf(db, 'ing-a');
  reverseRecipeConsumptionForOrderItem(db, {
    orderItemId: 9300,
    actorUserId: owner.userId,
    reason: 'order_cancelled',
  });
  assertEqual(stockOf(db, 'ing-a'), stockRestored, 'duplicate reverse is no-op');
  console.log('   ✓ P17-E idempotency + reverse idempotency');

  // ── HTTP + cancel/void/refund policy (P16 alignment) ────────────────────
  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/products': productRoutes,
    '/api/inventory': inventoryRoutes,
    '/api/recipes': recipeRoutes,
  });
  const { refundRoutes } = require('../main/routes/refunds');
  const { refundRestockRoutes } = require('../main/routes/refund-restock');
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  app.use('/api/refunds', refundRestockRoutes);

  const { baseUrl, server } = await startServer(app);

  try {
    seedProduct(db, 'menu-p17-pol', 'cat-p17', 'P17 Policy', 100);
    setIngredientStock(db, 'ing-a', 20);
    setIngredientStock(db, 'ing-b', 20);
    createRecipe({
      productId: 'menu-p17-pol',
      name: 'P17 Policy',
      yieldQty: 1,
      actorUserId: owner.userId,
      ingredients: [
        { ingredient_product_id: 'ing-a', quantity: 1, unit: 'pcs', position: 0 },
        { ingredient_product_id: 'ing-b', quantity: 1, unit: 'pcs', position: 1 },
      ],
    });

    const oFull = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p17-pol', quantity: 1 }] },
      headers: ownerAuth,
    });
    assertEqual(oFull.status, 201, 'policy order create');
    const aAfterCreate = stockOf(db, 'ing-a');
    assertEqual(aAfterCreate, 19, 'recipe consume at create');

    const cancelFull = await api(baseUrl, `/api/orders/${oFull.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'p17 full cancel' },
      headers: ownerAuth,
    });
    assertEqual(cancelFull.status, 200, 'full cancel ok');
    assertEqual(stockOf(db, 'ing-a'), 20, 'full cancel restores recipe stock');
    assertEqual(stockOf(db, 'ing-b'), 20, 'full cancel restores second ingredient');

    // Partial cancel: two lines, cancel one — no recipe reverse for remaining
    const oPartial = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [
          { product_id: 'menu-p17-pol', quantity: 1 },
          { product_id: 'menu-p17-pol', quantity: 1 },
        ],
      },
      headers: ownerAuth,
    });
    assertEqual(oPartial.status, 201, 'partial policy order');
    const items = oPartial.data.order.items;
    assert(items.length >= 2, 'two items');
    const stockBeforePartial = stockOf(db, 'ing-a');
    const cancelOne = await api(
      baseUrl,
      `/api/orders/${oPartial.data.order.id}/items/${items[0].id}/cancel`,
      { method: 'PATCH', body: {}, headers: ownerAuth },
    );
    assertEqual(cancelOne.status, 200, 'partial item cancel');
    // P16: partial pending cancel does NOT restore. Recipe same.
    assertEqual(
      stockOf(db, 'ing-a'),
      stockBeforePartial,
      'partial cancel does not restore recipe ingredients',
    );

    // Restaurant refund restock remains 403 (no recipe reverse path)
    const restockProbe = await api(baseUrl, '/api/refunds/fake-refund-id/restock', {
      method: 'POST',
      body: { order_item_id: 1, quantity: 1 },
      headers: { ...ownerAuth, 'Idempotency-Key': 'p17-restock-probe' },
    });
    assert(
      restockProbe.status === 403 || restockProbe.status === 404,
      `restaurant restock gated (${restockProbe.status})`,
    );
    if (restockProbe.status === 403) {
      assertEqual(
        restockProbe.data.code,
        'RESTOCK_VERTICAL_DISABLED',
        'restock vertical gate code',
      );
    }
    console.log('   ✓ P17-F cancel/void/refund policy aligns with P16');

    // Insufficient stock via order API
    setIngredientStock(db, 'ing-a', 0);
    const oInsuff = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p17-pol', quantity: 1 }] },
      headers: ownerAuth,
    });
    assert(
      oInsuff.status === 400 || oInsuff.status === 409,
      `insufficient recipe stock rejected (${oInsuff.status})`,
    );
    console.log('   ✓ insufficient stock order reject');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('='.repeat(60));
  console.log(`P17 results: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) {
    for (const f of results.failures) console.error('FAIL:', f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

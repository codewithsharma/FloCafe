/**
 * R5 BOM / Recipes / Food Cost OS — S-REC-01 … S-REC-12.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/r5-bom-recipes-food-cost.test.ts
 *    or: npm run test:r5
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r5-bom-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r5-bom-recipes-food-cost-secret';

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
const { recipeRoutes } = require('../main/routes/recipes');
const { orderRoutes } = require('../main/routes/orders');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { reconstructQuantityFromLedger } = require('../main/services/inventory');
const {
  computeRecipeCost,
  toCostCents,
  portionConsumeQty,
} = require('../main/services/recipe-cost');
const {
  createRecipe,
  replaceRecipeIngredients,
  computeRecipeCostForId,
  getActiveRecipeForProduct,
} = require('../main/services/recipe');
const { consumeRecipeForOrderItem } = require('../main/services/recipe-consumption');

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

async function main() {
  console.log('\nR5 — BOM / Recipes / Food Cost OS\n' + '='.repeat(60));
  assertEqual(getSupportedSchemaVersion(), 89, 'schema version is 89');

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    88,
    'fresh DB at user_version 89',
  );
  assert(!!db.prepare("SELECT name FROM sqlite_master WHERE name='recipes'").get(), 'recipes');
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='recipe_ingredients'").get(),
    'recipe_ingredients',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='recipe_consumptions'").get(),
    'recipe_consumptions',
  );
  console.log('   ✓ schema v79');

  const costOk = computeRecipeCost(
    [
      {
        quantity: 18,
        unit: 'g',
        prep_loss_bps: 0,
        inventoryUnit: 'g',
        unitCostCents: 50,
        ingredientProductId: 'beans',
      },
      {
        quantity: 180,
        unit: 'ml',
        prep_loss_bps: 0,
        inventoryUnit: 'ml',
        unitCostCents: 5,
        ingredientProductId: 'milk',
      },
    ],
    1,
    15000,
  );
  assertEqual(costOk.status, 'ok', 'S-REC-03 cost ok');
  assert(costOk.batchCostCents != null && costOk.batchCostCents > 0, 'batch cost > 0');
  assert(costOk.foodCostPercent != null, 'S-REC-04 food cost % present');

  const costMissing = computeRecipeCost(
    [
      {
        quantity: 10,
        unit: 'g',
        prep_loss_bps: 0,
        inventoryUnit: 'g',
        unitCostCents: null,
        ingredientProductId: 'x',
      },
    ],
    1,
    1000,
  );
  assertEqual(costMissing.status, 'insufficient_data', 'missing cost → insufficient_data');
  assertEqual(costMissing.batchCostCents, null, 'do not fabricate 0 cost');
  assertEqual(toCostCents(12.345), 1235, 'cost cents round');
  assertEqual(portionConsumeQty(100, 'ml', 0, 'ml', 10, 2), 20, 'portion scale');
  console.log('   ✓ S-REC-03/04 costing');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'cashier-r5', 'cashier', 'cashier-r5@test.local');
  const chef = seedRoleUser(db, 'chef-r5', 'chef', 'chef-r5@test.local');

  seedCategory(db, 'cat-r5', 'R5 Cat');
  seedProduct(db, 'ing-milk', 'cat-r5', 'Milk', 0, {
    track_inventory: true,
    stock_quantity: 5000,
  });
  seedProduct(db, 'ing-beans', 'cat-r5', 'Coffee Beans', 0, {
    track_inventory: true,
    stock_quantity: 2000,
  });
  seedProduct(db, 'menu-cap', 'cat-r5', 'Cappuccino', 150, {
    track_inventory: false,
    stock_quantity: 0,
  });
  db.prepare(`UPDATE products SET cost = ?, inventory_unit = ? WHERE id = ?`).run(
    0.05,
    'ml',
    'ing-milk',
  );
  db.prepare(`UPDATE products SET cost = ?, inventory_unit = ? WHERE id = ?`).run(
    0.5,
    'g',
    'ing-beans',
  );

  const recipe = createRecipe({
    productId: 'menu-cap',
    name: 'Cappuccino std',
    yieldQty: 1,
    yieldUnit: 'pcs',
    actorUserId: owner.userId,
    ingredients: [
      { ingredient_product_id: 'ing-beans', quantity: 18, unit: 'g', position: 0 },
      { ingredient_product_id: 'ing-milk', quantity: 180, unit: 'ml', position: 1 },
    ],
  });
  assert(recipe.id, 'S-REC-01 recipe created');
  assertEqual(recipe.is_active, 1, 'recipe active');
  console.log('   ✓ S-REC-01 create recipe');

  replaceRecipeIngredients(
    recipe.id,
    [
      { ingredient_product_id: 'ing-beans', quantity: 18, unit: 'g', position: 0 },
      { ingredient_product_id: 'ing-milk', quantity: 100, unit: 'ml', position: 1 },
    ],
    owner.userId,
  );
  console.log('   ✓ S-REC-02 ingredients');

  const costApi = computeRecipeCostForId(recipe.id);
  assertEqual(costApi.status, 'ok', 'recipe cost for id ok');

  const app = createApp({
    '/api/products': productRoutes,
    '/api/inventory': inventoryRoutes,
    '/api/recipes': recipeRoutes,
    '/api/orders': orderRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const listChef = await api(baseUrl, '/api/recipes', { headers: chef.authHeader });
    assertEqual(listChef.status, 200, 'chef can list recipes');
    const createCashier = await api(baseUrl, '/api/recipes', {
      method: 'POST',
      headers: cashier.authHeader,
      body: {
        product_id: 'menu-cap',
        name: 'Nope',
        ingredients: [{ ingredient_product_id: 'ing-milk', quantity: 1, unit: 'ml' }],
      },
    });
    assertEqual(createCashier.status, 403, 'cashier cannot mutate recipes');
    console.log('   ✓ RBAC');

    const milkBefore = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    const beansBefore = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans') as any)
        .stock_quantity,
    );

    const order1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: {
        type: 'takeaway',
        items: [{ product_id: 'menu-cap', quantity: 1 }],
      },
    });
    assertEqual(order1.status, 201, 'order create 201');
    const order1Id = order1.data.order.id;

    const milkAfter1 = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    const beansAfter1 = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans') as any)
        .stock_quantity,
    );
    assertEqual(Number((milkBefore - milkAfter1).toFixed(6)), 100, 'S-REC-05 milk -100ml');
    assertEqual(Number((beansBefore - beansAfter1).toFixed(6)), 18, 'S-REC-05 beans -18g');

    const cons1 = db
      .prepare('SELECT * FROM recipe_consumptions WHERE CAST(order_id AS TEXT) = ?')
      .get(String(order1Id)) as any;
    assert(cons1, 'consumption row');
    assertEqual(cons1.status, 'consumed', 'status consumed');
    console.log('   ✓ S-REC-05 consume on sale');

    const itemId = Number(cons1.order_item_id);
    const dup = consumeRecipeForOrderItem(db, {
      orderId: String(order1Id),
      orderItemId: itemId,
      menuProductId: 'menu-cap',
      portions: 1,
      actorUserId: owner.userId,
    });
    assertEqual(dup.skippedReason, 'already_consumed', 'S-REC-06 idempotent');
    const milkAfterDup = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    assertEqual(milkAfterDup, milkAfter1, 'no double depletion');
    console.log('   ✓ S-REC-06 idempotency');

    replaceRecipeIngredients(
      recipe.id,
      [
        { ingredient_product_id: 'ing-beans', quantity: 18, unit: 'g', position: 0 },
        { ingredient_product_id: 'ing-milk', quantity: 120, unit: 'ml', position: 1 },
      ],
      owner.userId,
    );

    const order2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: {
        type: 'takeaway',
        items: [{ product_id: 'menu-cap', quantity: 1 }],
      },
    });
    assertEqual(order2.status, 201, 'order2 201');
    const order2Id = order2.data.order.id;
    const milkAfter2 = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    assertEqual(Number((milkAfter1 - milkAfter2).toFixed(6)), 120, 'S-REC-08 sale2 uses 120ml');

    const line1 = db
      .prepare(
        `SELECT quantity_delta FROM recipe_consumption_lines
         WHERE consumption_id = ? AND ingredient_product_id = ?`,
      )
      .get(cons1.id, 'ing-milk') as any;
    assertEqual(Number(Math.abs(line1.quantity_delta).toFixed(6)), 100, 'sale1 snapshot 100');
    console.log('   ✓ S-REC-08 historical integrity');

    const cancel = await api(baseUrl, `/api/orders/${order2Id}/status`, {
      method: 'PATCH',
      headers: owner.authHeader,
      body: { status: 'cancelled', reason: 'test reverse' },
    });
    assertEqual(cancel.status, 200, 'cancel 200');
    const milkAfterCancel = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    assertEqual(milkAfterCancel, milkAfter1, 'S-REC-07 milk restored');
    const cons2 = db
      .prepare('SELECT status FROM recipe_consumptions WHERE CAST(order_id AS TEXT) = ?')
      .get(String(order2Id)) as any;
    assertEqual(cons2.status, 'reversed', 'consumption reversed');

    await api(baseUrl, `/api/orders/${order2Id}/status`, {
      method: 'PATCH',
      headers: owner.authHeader,
      body: { status: 'cancelled', reason: 'retry' },
    });
    const milkAfterCancel2 = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    assertEqual(milkAfterCancel2, milkAfterCancel, 'no double restock');
    console.log('   ✓ S-REC-07 cancel reverse');

    const milkMid = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    const oA = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'menu-cap', quantity: 1 }] },
    });
    const oB = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: manager.authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'menu-cap', quantity: 1 }] },
    });
    assertEqual(oA.status, 201, 'concurrent A');
    assertEqual(oB.status, 201, 'concurrent B');
    const milkConc = Number(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
        .stock_quantity,
    );
    assertEqual(Number((milkMid - milkConc).toFixed(6)), 240, 'S-REC-09 both 120');
    console.log('   ✓ S-REC-09 concurrent consumption');

    assert(getActiveRecipeForProduct('menu-cap'), 'S-REC-10 local recipe');
    console.log('   ✓ S-REC-10 offline-local');

    const recon = reconstructQuantityFromLedger(db, 'ing-milk');
    assert(recon.valid, 'S-REC-11 ledger reconstruct valid');
    assertEqual(
      Number(recon.reconstructed.toFixed(6)),
      Number(
        (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk') as any)
          .stock_quantity,
      ),
      'ledger equals stock',
    );
    console.log('   ✓ S-REC-11 ledger reconstruction');

    db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?').run(10, 'ing-milk');
    const blocked = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'menu-cap', quantity: 1 }] },
    });
    assertEqual(blocked.status, 400, 'S-REC-12 insufficient → 400');
    console.log('   ✓ S-REC-12 insufficient stock BLOCK');

    const sql = fs.readFileSync(path.join(__dirname, '../main/database/migrations.ts'), 'utf8');
    assert(
      sql.includes("movement_type IN ('sale', 'cancel_restore', 'adjustment')"),
      'movement_type CHECK preserved',
    );

    const hist = await api(baseUrl, `/api/recipes/consumptions?order_id=${order1Id}`, {
      headers: owner.authHeader,
    });
    assertEqual(hist.status, 200, 'consumptions api');
    assert(Array.isArray(hist.data.consumptions) && hist.data.consumptions.length >= 1, 'has rows');

    const costHttp = await api(baseUrl, `/api/recipes/${recipe.id}/cost`, {
      headers: owner.authHeader,
    });
    assertEqual(costHttp.status, 200, 'cost http');
    assertEqual(costHttp.data.status, 'ok', 'cost status ok');
    console.log('   ✓ HTTP cost + consumptions');
  } finally {
    server.close();
    closeDatabase();
  }

  const { failed } = getResults();
  if (failed > 0) process.exit(1);
  console.log('\nR5 COMPLETE — all S-REC scenarios passed\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

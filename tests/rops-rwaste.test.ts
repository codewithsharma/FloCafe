/**
 * ADR-015 / ROPS-RWASTE v1 — recipe-linked waste.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/rops-rwaste.test.ts
 *    or: npm run test:rwaste
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rwaste-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'rops-rwaste-secret';

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

const { recipeRoutes } = require('../main/routes/recipes');
const { getSupportedSchemaVersion, withTxn } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  createRecipe,
  replaceRecipeIngredients,
  setRecipeActive,
} = require('../main/services/recipe');
const { wasteRecipePortions } = require('../main/services/recipe-waste');
const { portionConsumeQty } = require('../main/services/recipe-cost');
const { reconstructQuantityFromLedger } = require('../main/services/inventory');

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

function idemHeaders(auth: Record<string, string>, key: string): Record<string, string> {
  return { ...auth, 'Idempotency-Key': key };
}

async function main() {
  console.log('\nROPS-RWASTE — Recipe-linked waste v1\n' + '='.repeat(60));
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip is v89');

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    89,
    'fresh DB at user_version 89',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='recipe_waste_events'").get(),
    'recipe_waste_events table',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='recipe_waste_lines'").get(),
    'recipe_waste_lines table',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='recipe_waste_idempotency'").get(),
    'recipe_waste_idempotency table',
  );
  assert(
    !!db.prepare("SELECT name FROM sqlite_master WHERE name='recipe_consumptions'").get(),
    'recipe_consumptions preserved',
  );

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'cashier-rw', 'cashier', 'cashier-rw@test.local');
  const chef = seedRoleUser(db, 'chef-rw', 'chef', 'chef-rw@test.local');

  seedCategory(db, 'cat-rw', 'RW Cat');
  seedProduct(db, 'menu-latte-rw', 'cat-rw', 'Latte RW', 5.5, {
    track_inventory: false,
    stock_quantity: 0,
  });
  seedProduct(db, 'ing-beans-rw', 'cat-rw', 'Beans RW', 0, {
    track_inventory: true,
    stock_quantity: 1000,
  });
  seedProduct(db, 'ing-milk-rw', 'cat-rw', 'Milk RW', 0, {
    track_inventory: true,
    stock_quantity: 5000,
  });
  db.prepare(`UPDATE products SET cost = ?, cost_cents = ?, inventory_unit = ? WHERE id = ?`).run(
    0.5,
    50,
    'g',
    'ing-beans-rw',
  );
  db.prepare(`UPDATE products SET cost = ?, cost_cents = ?, inventory_unit = ? WHERE id = ?`).run(
    0.05,
    5,
    'ml',
    'ing-milk-rw',
  );

  const recipe = createRecipe({
    productId: 'menu-latte-rw',
    name: 'Latte BOM RW',
    yieldQty: 1,
    yieldUnit: 'pcs',
    actorUserId: owner.userId,
    ingredients: [
      { ingredient_product_id: 'ing-beans-rw', quantity: 18, unit: 'g', prep_loss_bps: 0 },
      { ingredient_product_id: 'ing-milk-rw', quantity: 180, unit: 'ml', prep_loss_bps: 500 },
    ],
  });

  const app = createApp({
    '/api/recipes': recipeRoutes,
  });
  const { server, baseUrl } = await startServer(app);

  const expectedBeans = portionConsumeQty(18, 'g', 0, 'g', 1, 2);
  const expectedMilk = portionConsumeQty(180, 'ml', 500, 'ml', 1, 2);
  const beansBefore = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  const milkBefore = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk-rw') as any)
      .stock_quantity,
  );

  const wasteRes = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 2, wastage_reason: 'SPOILAGE', notes: 'burned batch' },
    headers: idemHeaders(owner.authHeader, 'rw-key-1'),
  });
  assertEqual(wasteRes.status, 201, 'waste returns 201');
  assert(!!wasteRes.data.waste_event?.id, 'waste_event id present');
  assertEqual(wasteRes.data.waste_event.portions, 2, 'portions snapped');
  assertEqual(wasteRes.data.waste_event.wastage_reason, 'SPOILAGE', 'reason snapped');
  assertEqual(wasteRes.data.lines.length, 2, 'two waste lines');

  const beansAfter = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  const milkAfter = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-milk-rw') as any)
      .stock_quantity,
  );
  assertEqual(beansAfter, beansBefore - expectedBeans, 'beans stock decreased by portion math');
  assertEqual(milkAfter, milkBefore - expectedMilk, 'milk stock decreased with prep_loss');

  const mov = db
    .prepare(
      `SELECT * FROM inventory_movements
       WHERE reference_type = 'recipe_waste' AND reference_id = ?
       ORDER BY id`,
    )
    .all(wasteRes.data.waste_event.id) as any[];
  assertEqual(mov.length, 2, 'two recipe_waste movements');
  assert(
    mov.every((m) => m.movement_type === 'adjustment'),
    'movement_type=adjustment',
  );
  assert(
    mov.every((m) => String(m.reason).startsWith('recipe_waste:')),
    'reason recipe_waste:<CODE>',
  );
  assertEqual(mov[0].reason, 'recipe_waste:SPOILAGE', 'reason includes SPOILAGE');

  const beansLine = wasteRes.data.lines.find((l: any) => l.ingredient_product_id === 'ing-beans-rw');
  assertEqual(beansLine.unit_cost_cents, 50, 'cost snapshot unit_cost_cents');
  assertEqual(
    beansLine.line_cost_cents,
    Math.round(expectedBeans * 50),
    'cost snapshot line_cost_cents',
  );

  const ledgerBeans = reconstructQuantityFromLedger(db, 'ing-beans-rw');
  assert(ledgerBeans.valid, 'beans ledger valid');
  assertEqual(ledgerBeans.current, beansAfter, 'beans ledger current matches stock');

  const audit = db
    .prepare(
      `SELECT * FROM audit_logs WHERE action = 'inventory.recipe_wasted' ORDER BY id DESC LIMIT 1`,
    )
    .get() as any;
  assert(!!audit, 'inventory.recipe_wasted audit row');
  assertEqual(String(audit.entity_id), wasteRes.data.waste_event.id, 'audit entity is waste event');

  const consCount = Number(
    (db.prepare('SELECT COUNT(*) AS c FROM recipe_consumptions').get() as any).c,
  );
  assertEqual(consCount, 0, 'recipe_consumptions unchanged by waste');

  const retry = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 2, wastage_reason: 'SPOILAGE', notes: 'burned batch' },
    headers: idemHeaders(owner.authHeader, 'rw-key-1'),
  });
  assertEqual(retry.status, 201, 'idempotent retry 201');
  assertEqual(retry.data.waste_event.id, wasteRes.data.waste_event.id, 'same waste event on retry');
  const beansAfterRetry = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  assertEqual(beansAfterRetry, beansAfter, 'retry does not double-decrement stock');
  const eventCount = Number(
    (db.prepare('SELECT COUNT(*) AS c FROM recipe_waste_events').get() as any).c,
  );
  assertEqual(eventCount, 1, 'only one waste event after retry');

  const conflict = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 3, wastage_reason: 'SPOILAGE', notes: 'burned batch' },
    headers: idemHeaders(owner.authHeader, 'rw-key-1'),
  });
  assertEqual(conflict.status, 409, 'idempotency conflict 409');
  assertEqual(conflict.data.code, 'RECIPE_WASTE_IDEMPOTENCY_CONFLICT', 'conflict code');

  const noKey = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'DAMAGED' },
    headers: owner.authHeader,
  });
  assertEqual(noKey.status, 400, 'missing Idempotency-Key → 400');
  assertEqual(noKey.data.code, 'RECIPE_WASTE_IDEMPOTENCY_REQUIRED', 'required code');

  const badQty = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 0, wastage_reason: 'OTHER' },
    headers: idemHeaders(owner.authHeader, 'rw-bad-qty'),
  });
  assertEqual(badQty.status, 400, 'portions=0 → 400');

  const negQty = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: -1, wastage_reason: 'OTHER' },
    headers: idemHeaders(owner.authHeader, 'rw-neg-qty'),
  });
  assertEqual(negQty.status, 400, 'portions=-1 → 400');

  const missing = await api(baseUrl, `/api/recipes/does-not-exist/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'OTHER' },
    headers: idemHeaders(owner.authHeader, 'rw-missing'),
  });
  assertEqual(missing.status, 404, 'unknown recipe → 404');

  setRecipeActive(recipe.id, false, owner.userId);
  const inactive = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'OTHER' },
    headers: idemHeaders(owner.authHeader, 'rw-inactive'),
  });
  assertEqual(inactive.status, 409, 'inactive recipe → 409');
  assertEqual(inactive.data.code, 'RECIPE_WASTE_INACTIVE', 'inactive code');
  setRecipeActive(recipe.id, true, owner.userId);

  const cashDenied = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'SPILLAGE' },
    headers: idemHeaders(cashier.authHeader, 'rw-cash'),
  });
  assertEqual(cashDenied.status, 403, 'cashier cannot waste');

  const chefDenied = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'SPILLAGE' },
    headers: idemHeaders(chef.authHeader, 'rw-chef'),
  });
  assertEqual(chefDenied.status, 403, 'chef cannot waste');

  const mgrOk = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'SPILLAGE' },
    headers: idemHeaders(manager.authHeader, 'rw-mgr-1'),
  });
  assertEqual(mgrOk.status, 201, 'manager can waste');

  db.prepare('UPDATE products SET stock_quantity = 1 WHERE id = ?').run('ing-beans-rw');
  const eventsBeforeFail = Number(
    (db.prepare('SELECT COUNT(*) AS c FROM recipe_waste_events').get() as any).c,
  );
  const failRes = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 50, wastage_reason: 'EXPIRED' },
    headers: idemHeaders(owner.authHeader, 'rw-insuff'),
  });
  assertEqual(failRes.status, 400, 'insufficient stock → 400');
  const eventsAfterFail = Number(
    (db.prepare('SELECT COUNT(*) AS c FROM recipe_waste_events').get() as any).c,
  );
  assertEqual(eventsAfterFail, eventsBeforeFail, 'txn rollback: no waste event on failure');
  const beansStuck = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  assertEqual(beansStuck, 1, 'txn rollback: beans stock unchanged');
  const idemFail = db
    .prepare(
      `SELECT 1 AS ok FROM recipe_waste_idempotency WHERE user_id = ? AND idempotency_key = ?`,
    )
    .get(owner.userId, 'rw-insuff');
  assert(!idemFail, 'failed request does not store idempotency row');

  db.prepare('UPDATE products SET stock_quantity = 1000 WHERE id = ?').run('ing-beans-rw');
  db.prepare('UPDATE products SET stock_quantity = 5000 WHERE id = ?').run('ing-milk-rw');
  const afterRestore = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'EXPIRED' },
    headers: idemHeaders(owner.authHeader, 'rw-insuff'),
  });
  assertEqual(afterRestore.status, 201, 'same Idempotency-Key succeeds after prior failed attempt');

  const beforeSvc = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  let threw = false;
  try {
    withTxn(() => {
      wasteRecipePortions(
        {
          recipeId: recipe.id,
          portions: 1,
          wastageReason: 'OTHER',
          actorUserId: owner.userId,
        },
        { db, alreadyInTxn: true },
      );
      throw new Error('force rollback');
    });
  } catch (e: any) {
    threw = e?.message === 'force rollback';
  }
  assert(threw, 'forced rollback threw');
  const afterSvc = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  assertEqual(afterSvc, beforeSvc, 'service waste rolls back with outer txn');

  replaceRecipeIngredients(
    recipe.id,
    [
      { ingredient_product_id: 'ing-beans-rw', quantity: 10, unit: 'g', prep_loss_bps: 1000 },
      { ingredient_product_id: 'ing-milk-rw', quantity: 100, unit: 'ml', prep_loss_bps: 0 },
    ],
    owner.userId,
  );
  const expectWithLoss = portionConsumeQty(10, 'g', 1000, 'g', 1, 1);
  const b0 = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  const lossWaste = await api(baseUrl, `/api/recipes/${recipe.id}/waste`, {
    method: 'POST',
    body: { portions: 1, wastage_reason: 'OTHER' },
    headers: idemHeaders(owner.authHeader, 'rw-loss'),
  });
  assertEqual(lossWaste.status, 201, 'waste with prep_loss works');
  const b1 = Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('ing-beans-rw') as any)
      .stock_quantity,
  );
  assertEqual(b1, b0 - expectWithLoss, 'prep_loss_bps applied same as consume math');

  server.close();
  closeDatabase();

  const { passed, failed, total } = getResults();
  console.log(`\n${'='.repeat(60)}\nResults: ${passed}/${total} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

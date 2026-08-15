/**
 * R9 Slice 6 — Food-cost report v1 (theoretical from R5 snapshots).
 * Usage: npm run test:r9.6
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r9-fc-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(s, 'utf8'),
        decryptString: (b: Buffer) => b.toString('utf8'),
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r9-food-cost-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { reportRoutes } = require('../main/routes/reports');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(db: any, id: string, role: string, email: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, email, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `r9f-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

async function main(): Promise<void> {
  console.log('\nR9 Slice 6 — Food-cost Report v1');
  console.log('='.repeat(60));

  const tip = getSupportedSchemaVersion();
  assert(tip >= 83, `schema tip >= 83 (got ${tip})`);
  initTestDb();
  const db = getDatabase();
  assertEqual(Number(db.pragma('user_version', { simple: true })), tip, 'fresh DB matches tip');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashierId = seedRole(db, 'cashier-r9f', 'cashier', 'cashier-r9f@test.local');

  const at = '2026-08-10T12:00:00.000Z';
  const orderInfo = db
    .prepare(
      `INSERT INTO orders (order_number, type, status, subtotal, tax_amount, total, created_at, updated_at)
       VALUES ('R9F-1', 'dine_in', 'completed', 200, 0, 200, ?, ?)`,
    )
    .run(at, at);
  const orderId = Number(orderInfo.lastInsertRowid);
  db.prepare(
    `INSERT INTO bills (
      bill_number, order_id, subtotal, tax_amount, total, total_cents, paid_amount, paid_amount_cents,
      balance, payment_status, created_at, updated_at
    ) VALUES (?, ?, 200, 0, 200, 20000, 200, 20000, 0, 'paid', ?, ?)`,
  ).run(`BILL-${orderId}`, orderId, at, at);

  db.prepare(
    `INSERT INTO recipe_consumptions (
      id, order_id, order_item_id, recipe_id, recipe_name, menu_product_id,
      portions, yield_qty, status, actor_user_id, created_at, reversed_at
    ) VALUES ('rc-1', ?, 1, 'recipe-latte', 'Latte Recipe', 'prod-latte', 1, 1, 'consumed', ?, ?, NULL)`,
  ).run(String(orderId), owner.userId, at);
  db.prepare(
    `INSERT INTO recipe_consumption_lines (
      consumption_id, ingredient_product_id, ingredient_name, quantity_delta, unit,
      unit_cost_cents, line_cost_cents, inventory_movement_id, created_at
    ) VALUES ('rc-1', 'ing-milk', 'Milk', -0.2, 'L', 500, 1000, NULL, ?)`,
  ).run(at);
  db.prepare(
    `INSERT INTO recipe_consumption_lines (
      consumption_id, ingredient_product_id, ingredient_name, quantity_delta, unit,
      unit_cost_cents, line_cost_cents, inventory_movement_id, created_at
    ) VALUES ('rc-1', 'ing-coffee', 'Coffee', -0.02, 'kg', NULL, NULL, NULL, ?)`,
  ).run(at);

  const app = createApp({ '/api/reports': reportRoutes });
  const { baseUrl, server } = await startServer(app);
  const q = 'start_date=2026-08-10&end_date=2026-08-10';

  try {
    const ok = await api(baseUrl, `/api/reports/food-cost?${q}`, { headers: owner.authHeader });
    assertEqual(ok.status, 200, 'Owner food-cost 200');
    const report = ok.data.foodCost;
    assertEqual(report.theoretical_cogs_cents, 1000, 'theoretical COGS from snapshots');
    assertEqual(report.insufficient_line_count, 1, 'counts null cost lines');
    assertEqual(report.consumption_count, 1, 'consumption count');
    assertEqual(report.net_sales, 200, 'net sales reused');
    assertEqual(report.food_cost_percent, 5, 'food cost % = 10/200*100');
    assertEqual(report.by_recipe.length, 1, 'recipe rollup');

    const mgr = await api(baseUrl, `/api/reports/food-cost?${q}`, { headers: manager.authHeader });
    assertEqual(mgr.status, 200, 'Manager food-cost 200');

    const denied = await api(baseUrl, `/api/reports/food-cost?${q}`, {
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(denied.status, 403, 'cashier food-cost 403');

    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(page.includes('foodCost') || page.includes('food-cost'), 'reports UI food cost');
    assert(en.includes('reports.foodCostTitle'), 'en food cost title');
    assert(en.includes('reports.foodCostClarity'), 'en food cost clarity');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('\nR9 Slice 6 COMPLETE — food-cost scenarios passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

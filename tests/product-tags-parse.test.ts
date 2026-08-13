/**
 * Regression: product tags must always be string[] on API responses
 * even when SQLite stores JSON strings or double-encoded JSON.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/product-tags-parse.test.ts
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-product-tags-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct,
  api, assert, assertEqual, closeDatabase, getDatabase,
} = require('./helpers/test-setup');
const { productRoutes } = require('../main/routes/products');

async function main() {
  console.log('Regression: product tags parse');
  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-1', 'Drinks');
  seedProduct(db, 'prod-arr', 'cat-1', 'Latte', 4);
  seedProduct(db, 'prod-json', 'cat-1', 'Mocha', 4.5);
  seedProduct(db, 'prod-double', 'cat-1', 'Flat White', 5);

  db.prepare(`UPDATE products SET tags = ? WHERE id = ?`).run(JSON.stringify(['hot', 'milk']), 'prod-arr');
  db.prepare(`UPDATE products SET tags = ? WHERE id = ?`).run('[]', 'prod-json');
  db.prepare(`UPDATE products SET tags = ? WHERE id = ?`).run(JSON.stringify('[]'), 'prod-double'); // stores '"[]"'

  const app = createApp({ '/api/products': productRoutes });
  const { baseUrl, server } = await startServer(app);
  try {
    const list = await api(baseUrl, '/api/products', { headers: authHeader });
    assertEqual(list.status, 200, 'list products 200');
    const products = list.data.products || list.data;
    const byId = Object.fromEntries(products.map((p: any) => [p.id, p]));

    assert(Array.isArray(byId['prod-arr'].tags), 'array tags stay array');
    assertEqual(byId['prod-arr'].tags.join(','), 'hot,milk', 'array tags content');

    assert(Array.isArray(byId['prod-json'].tags), 'JSON string [] becomes array');
    assertEqual(byId['prod-json'].tags.length, 0, 'JSON string [] is empty array');

    assert(Array.isArray(byId['prod-double'].tags), 'double-encoded [] becomes array');
    assertEqual(byId['prod-double'].tags.length, 0, 'double-encoded [] is empty array');

    const one = await api(baseUrl, '/api/products/prod-double', { headers: authHeader });
    assertEqual(one.status, 200, 'get one 200');
    assert(Array.isArray(one.data.product.tags), 'GET one returns array tags');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

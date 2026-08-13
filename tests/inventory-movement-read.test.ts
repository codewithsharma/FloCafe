/**
 * Phase 2.12 — Inventory movement read (service) characterization.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/inventory-movement-read.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-inv-read-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, seedCategory,
  assert, assertEqual, getResults, closeDatabase, now,
} = require('./helpers/test-setup');

const {
  applyAbsoluteStockChange,
  listInventoryMovements,
  getMovements,
  InventoryServiceError,
} = require('../main/services/inventory');
const { withTxn } = require('../main/db');

async function main() {
  console.log('Phase 2.12 Inventory Movement Read (service)');
  console.log('='.repeat(60));

  const db = initTestDb();
  seedCategory(db, 'cat-inv-read', 'Inv Read');
  db.prepare(`
    INSERT INTO products (
      id, category_id, name, price, tax_type, track_inventory, stock_quantity,
      is_active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('prod-a', 'cat-inv-read', 'A', 10, 'none', 1, 0, 1, 1, now(), now());
  db.prepare(`
    INSERT INTO products (
      id, category_id, name, price, tax_type, track_inventory, stock_quantity,
      is_active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('prod-b', 'cat-inv-read', 'B', 10, 'none', 1, 0, 1, 1, now(), now());

  withTxn(() => {
    applyAbsoluteStockChange(db, 'prod-a', 10, { referenceType: 'product_create', reason: 'opening' });
    applyAbsoluteStockChange(db, 'prod-a', 7, { referenceType: 'product_update', reason: 'product_update' });
    applyAbsoluteStockChange(db, 'prod-a', 12, { referenceType: 'manual', reason: 'increase' });
    applyAbsoluteStockChange(db, 'prod-b', 5, { referenceType: 'product_create', reason: 'opening' });
  });

  try {
    console.log('\n1. Ordering newest → oldest by id');
    const page = listInventoryMovements({ productId: 'prod-a', limit: 10 });
    assertEqual(page.movements.length, 3, 'three movements for prod-a');
    assertEqual(page.nextCursor, null, 'no nextCursor when all fit');
    assert(page.movements[0].id > page.movements[1].id, 'id DESC');
    assertEqual(page.movements[0].reason, 'increase', 'newest reason');

    console.log('\n2. Limit clamp + getMovements wrapper');
    const limited = listInventoryMovements({ productId: 'prod-a', limit: 2 });
    assertEqual(limited.movements.length, 2, 'limit 2');
    assert(limited.nextCursor !== null, 'nextCursor set');
    assertEqual(getMovements('prod-a', 2).length, 2, 'getMovements wrap');

    console.log('\n3. Cursor pagination');
    const page2 = listInventoryMovements({
      productId: 'prod-a',
      limit: 2,
      beforeId: limited.nextCursor,
    });
    assertEqual(page2.movements.length, 1, 'remaining one');
    assertEqual(page2.nextCursor, null, 'end of list');
    assert(
      page2.movements.every((m: any) => m.id < limited.nextCursor),
      'page2 ids < cursor',
    );

    console.log('\n4. Product isolation');
    const onlyB = listInventoryMovements({ productId: 'prod-b' });
    assertEqual(onlyB.movements.length, 1, 'prod-b one row');
    assertEqual(onlyB.movements[0].product_id, 'prod-b', 'product_id B');
    assert(
      !onlyB.movements.some((m: any) => m.product_id === 'prod-a'),
      'no prod-a leakage',
    );

    console.log('\n5. Empty history');
    db.prepare(`
      INSERT INTO products (
        id, category_id, name, price, tax_type, track_inventory, stock_quantity,
        is_active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('prod-empty', 'cat-inv-read', 'Empty', 1, 'none', 1, 0, 1, 1, now(), now());
    const empty = listInventoryMovements({ productId: 'prod-empty' });
    assertEqual(empty.movements.length, 0, 'empty movements');
    assertEqual(empty.nextCursor, null, 'empty nextCursor null');

    console.log('\n6. Malformed input');
    let threw = false;
    try {
      listInventoryMovements({ productId: '', limit: 10 });
    } catch (e: any) {
      threw = e instanceof InventoryServiceError && e.statusCode === 400;
    }
    assert(threw, 'empty productId → 400');
    threw = false;
    try {
      listInventoryMovements({ productId: 'prod-a', beforeId: 'x' });
    } catch (e: any) {
      threw = e instanceof InventoryServiceError && e.statusCode === 400;
    }
    assert(threw, 'bad beforeId → 400');

    console.log('\n7. Max limit enforced (request 999 → ≤500)');
    const big = listInventoryMovements({ productId: 'prod-a', limit: 999 });
    assert(big.movements.length <= 500, 'max 500');

    console.log('\n8. Stable field set');
    const row = page.movements[0];
    for (const key of [
      'id', 'product_id', 'quantity_delta', 'movement_type',
      'reference_type', 'reference_id', 'reason', 'stock_after', 'created_at',
    ]) {
      assert(Object.prototype.hasOwnProperty.call(row, key), `has ${key}`);
    }

    console.log('\n9. Reads do not mutate ledger');
    const beforeCount = (db.prepare(
      'SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?',
    ).get('prod-a') as any).c;
    listInventoryMovements({ productId: 'prod-a', limit: 1 });
    const afterCount = (db.prepare(
      'SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?',
    ).get('prod-a') as any).c;
    assertEqual(beforeCount, afterCount, 'no INSERT on read');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed}`);
      process.exit(1);
    }
    console.log('\nAll inventory-movement-read checks passed.');
  } finally {
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

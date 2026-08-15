/**
 * Phase 2.8 — Inventory movement ledger.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/inventory-ledger.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-inv-ledger-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct,
  api, assert, assertEqual,
  getResults, closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { productRoutes } = require('../main/routes/products');
const { registerRoutes } = require('../main/routes/index');
const { getSupportedSchemaVersion, withTxn } = require('../main/db');
const {
  adjustProductStock,
  calculateLedgerStock,
  compareCurrentStockToLedger,
  getMovements,
  recordMovement,
  decrementTrackedStock,
  restoreTrackedStock,
} = require('../main/services/inventory');

async function main() {
  console.log('Phase 2.8 Inventory Movement Ledger');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 79, 'supported schema version is 79');
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    79,
    'fresh DB migrates to user_version 79',
  );

  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_movements'",
  ).get();
  assert(!!table, 'inventory_movements table exists');

  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-led', 'Ledger Menu');
  seedProduct(db, 'prod-a', 'cat-led', 'Ledger Latte', 100, {
    track_inventory: true,
    stock_quantity: 20,
  });
  seedProduct(db, 'prod-b', 'cat-led', 'Ledger Tea', 80, {
    track_inventory: true,
    stock_quantity: 15,
  });

  // Compatibility: migration did not change existing stock
  assertEqual(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
    20,
    'existing stock preserved after migration',
  );
  assertEqual(calculateLedgerStock('prod-a'), 0, 'ledger starts empty (no backfill)');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/products': productRoutes,
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // ── Sale: stock + ledger atomic ─────────────────────────────────────
    console.log('\n1. Sale decrements stock and records negative movement');
    const sale = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [
          { product_id: 'prod-a', quantity: 3 },
          { product_id: 'prod-b', quantity: 2 },
        ],
      },
      headers: authHeader,
    });
    assertEqual(sale.status, 201, 'multi-product order created');
    const orderId = sale.data.order.id;
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
      17,
      'prod-a stock 20→17',
    );
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-b') as any).stock_quantity,
      13,
      'prod-b stock 15→13',
    );

    const movesA = getMovements('prod-a');
    assertEqual(movesA.length, 1, 'prod-a has 1 sale movement');
    assertEqual(movesA[0].movement_type, 'sale', 'movement_type=sale');
    assertEqual(movesA[0].quantity_delta, -3, 'delta=-3');
    assertEqual(movesA[0].stock_after, 17, 'stock_after=17');
    assertEqual(movesA[0].reference_type, 'order', 'reference_type=order');
    assertEqual(String(movesA[0].reference_id), String(orderId), 'reference_id=orderId');

    const movesB = getMovements('prod-b');
    assertEqual(movesB.length, 1, 'prod-b has 1 sale movement');
    assertEqual(movesB[0].quantity_delta, -2, 'prod-b delta=-2');
    assertEqual(calculateLedgerStock('prod-a'), -3, 'ledger sum prod-a=-3');
    assertEqual(calculateLedgerStock('prod-b'), -2, 'ledger sum prod-b=-2');

    // ── Adjustment ──────────────────────────────────────────────────────
    console.log('\n2. Adjustment records signed delta');
    adjustProductStock('prod-a', 'set', 30);
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
      30,
      'set → 30',
    );
    const adj = getMovements('prod-a')[0];
    assertEqual(adj.movement_type, 'adjustment', 'adjustment type');
    assertEqual(adj.quantity_delta, 13, 'set 17→30 delta=+13');
    assertEqual(adj.reason, 'set', 'reason=set');
    assertEqual(adj.reference_type, 'manual', 'manual reference');

    adjustProductStock('prod-a', 'decrease', 5);
    assertEqual(getMovements('prod-a')[0].quantity_delta, -5, 'decrease delta=-5');
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
      25,
      'after decrease 25',
    );

    // ── Cancel restore ──────────────────────────────────────────────────
    console.log('\n3. Order cancel restores stock + cancel_restore movement');
    adjustProductStock('prod-a', 'set', 10);
    const o2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-a', quantity: 4 }] },
      headers: authHeader,
    });
    assertEqual(o2.status, 201, 'order2 created');
    const oid2 = o2.data.order.id;
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
      6,
      'after sale 6',
    );
    const cancel = await api(baseUrl, `/api/orders/${oid2}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'ledger test' },
      headers: authHeader,
    });
    assert(cancel.status < 400, `cancel ok (${cancel.status})`);
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
      10,
      'cancel restored to 10',
    );
    const restoreMove = getMovements('prod-a').find((m: any) => m.movement_type === 'cancel_restore');
    assert(!!restoreMove, 'cancel_restore movement exists');
    assertEqual(restoreMove.quantity_delta, 4, 'restore delta=+4');

    // ── CRITICAL: ledger failure rolls back stock ───────────────────────
    console.log('\n4. CRITICAL — ledger insert failure rolls back stock');
    const beforeFail = (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any)
      .stock_quantity;
    const moveCountBefore = (db.prepare(
      'SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?',
    ).get('prod-a') as any).c;

    let rolledBack = false;
    try {
      withTxn(() => {
        db.prepare(
          'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?',
        ).run(1, now(), 'prod-a');
        // Invalid movement_type violates CHECK → fails after stock UPDATE
        db.prepare(`
          INSERT INTO inventory_movements (
            product_id, quantity_delta, movement_type, reference_type, reference_id,
            reason, stock_after, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('prod-a', -1, 'not_a_valid_type', 'order', 'x', null, beforeFail - 1, now());
      });
    } catch {
      rolledBack = true;
    }
    assert(rolledBack, 'transaction threw on invalid ledger insert');
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-a') as any).stock_quantity,
      beforeFail,
      'stock unchanged after ledger failure rollback',
    );
    assertEqual(
      (db.prepare('SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?').get('prod-a') as any).c,
      moveCountBefore,
      'no orphan ledger row after rollback',
    );

    // Inverse: stock UPDATE failure leaves ledger untouched (decrease floor)
    console.log('\n5. Stock update failure leaves ledger unchanged');
    const countBeforeDec = (db.prepare(
      'SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?',
    ).get('prod-a') as any).c;
    let adjFailed = false;
    try {
      adjustProductStock('prod-a', 'decrease', 999999);
    } catch {
      adjFailed = true;
    }
    assert(adjFailed, 'oversized decrease throws');
    assertEqual(
      (db.prepare('SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?').get('prod-a') as any).c,
      countBeforeDec,
      'no ledger row on failed decrease',
    );

    // ── Append-only ─────────────────────────────────────────────────────
    console.log('\n6. Append-only — no UPDATE/DELETE in service API');
    const invSrc = fs.readFileSync(path.join(__dirname, '../main/services/inventory.ts'), 'utf8');
    assert(!/UPDATE\s+inventory_movements/i.test(invSrc), 'service never UPDATEs movements');
    assert(!/DELETE\s+FROM\s+inventory_movements/i.test(invSrc), 'service never DELETEs movements');

    // ── Reconciliation diagnostic ───────────────────────────────────────
    console.log('\n7. Reconciliation diagnostic');
    const cmp = compareCurrentStockToLedger('prod-a');
    assertEqual(cmp.valid, true, 'latest stock_after matches current stock');
    assertEqual(cmp.difference, 0, 'difference=0');
    assert(typeof cmp.ledgerDeltaSum === 'number', 'ledgerDeltaSum present');

    // ── Refund policy unchanged ─────────────────────────────────────────
    console.log('\n8. Refund still does not restock / write ledger');
    const refundSrc = fs.readFileSync(path.join(__dirname, '../main/services/refund.ts'), 'utf8');
    assert(
      refundSrc.includes('No inventory restock') || refundSrc.includes('does not restock'),
      'refund documents no restock on money path',
    );
    assert(!refundSrc.includes('recordMovement'), 'refund does not record movements');
    assert(!refundSrc.includes('inventory_movements'), 'refund does not touch ledger');

    // ── Untracked product: no movement ──────────────────────────────────
    console.log('\n9. Untracked product creates no movement');
    seedProduct(db, 'prod-free', 'cat-led', 'Free Cookie', 10, {
      track_inventory: false,
      stock_quantity: 5,
    });
    const freeOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-free', quantity: 2 }] },
      headers: authHeader,
    });
    assertEqual(freeOrder.status, 201, 'untracked order ok');
    assertEqual(getMovements('prod-free').length, 0, 'no movements for untracked');
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-free') as any).stock_quantity,
      5,
      'untracked stock unchanged',
    );

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll inventory-ledger checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Integration Test: Held Orders API
 *
 * Tests that:
 * A) POST /held-orders creates a held order for a table
 * B) GET /held-orders returns a list of held orders
 * C) DELETE /held-orders/:tableId removes the held order
 *
 * Usage: node tests/run-electron-node-test.cjs tests/held-orders.test.ts
 */

// ── Electron Mock ────────────────────────────────────────────────────────────
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-held-orders-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedTable,
  api, assert, assertEqual,
  closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');

const { heldOrderRoutes } = require('../main/routes/held-orders');
const {
  ACTIVE_VERTICAL_ENV_KEY,
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
} = require('../main/modules');

async function main() {
  console.log('Integration Test: Held Orders API');
  console.log('='.repeat(50));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedTable(db, 'tbl-test-123', 101, 2);

  const app = createApp({
    '/api/held-orders': heldOrderRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const tableId = 'tbl-test-123';
    const mockItems = [{
      id: 'latte-line',
      product: { id: 'product-latte', name: 'Latte', price: 100 },
      quantity: 2,
      addons: [],
      special_instructions: '',
    }];
    
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n─── Scenario A: POST /held-orders creates a held order ───');
    
    const postRes = await api(baseUrl, '/api/held-orders', {
      method: 'POST',
      body: {
        tableId,
        items: mockItems,
        customerId: 1,
        guestCount: 2,
        orderNotes: 'Test Note'
      },
      headers: authHeader
    });
    
    assertEqual(postRes.status, 200, 'POST /held-orders returns 200');
    assertEqual(postRes.data.success, true, 'Returns success: true');
    const afterHold = db.prepare('SELECT status FROM tables WHERE id = ?').get(tableId) as { status: string };
    assertEqual(afterHold.status, 'held', 'tables ON: hold sets table status to held');
    console.log('  ✓ POST /held-orders creates successfully');

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n─── Scenario B: GET /held-orders returns held orders ───');
    
    const getRes = await api(baseUrl, '/api/held-orders', { headers: authHeader });
    assertEqual(getRes.status, 200, 'GET /held-orders returns 200');
    assert(Array.isArray(getRes.data.orders), 'Returns an array of orders');
    assertEqual(getRes.data.orders.length, 1, 'Array contains one order');
    
    const held = getRes.data.orders[0];
    assertEqual(held.tableId, tableId, 'Table ID matches');
    assertEqual(held.guestCount, 2, 'Guest count matches');
    assertEqual(held.orderNotes, 'Test Note', 'Notes match');
    assert(Array.isArray(held.items), 'Items is an array');
    assertEqual(held.items[0].product.name, 'Latte', 'Items parsed correctly');
    console.log('  ✓ GET /held-orders retrieves held order');

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n─── Scenario C: POST /held-orders validates request data ───');
    const invalidRequests = [
      { tableId: 123, items: mockItems },
      { tableId, items: mockItems, guestCount: -1 },
      { tableId, items: mockItems, customerId: {} },
      { tableId, items: [{ ...mockItems[0], quantity: 0 }] },
      { tableId, items: mockItems, orderNotes: 'a'.repeat(201) },
    ];
    for (const body of invalidRequests) {
      const invalidRes = await api(baseUrl, '/api/held-orders', {
        method: 'POST', body, headers: authHeader,
      });
      assertEqual(invalidRes.status, 400, 'Invalid held-order input returns 400');
    }
    console.log('  ✓ POST /held-orders rejects malformed input');

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n─── Scenario D: DELETE /held-orders/:tableId removes order ───');
    
    const delRes = await api(baseUrl, `/api/held-orders/${tableId}`, { method: 'DELETE', headers: authHeader });
    assertEqual(delRes.status, 200, 'DELETE /held-orders returns 200');
    
    const verifyRes = await api(baseUrl, '/api/held-orders', { headers: authHeader });
    assertEqual(verifyRes.data.orders.length, 0, 'Held orders list is empty after deletion');
    const afterDelete = db.prepare('SELECT status FROM tables WHERE id = ?').get(tableId) as { status: string };
    assertEqual(afterDelete.status, 'available', 'tables ON: delete frees held table to available');
    console.log('  ✓ DELETE /held-orders removes order correctly');

    // A stale screen or another terminal may send the same delete after the
    // record is already gone. That must be safe to retry.
    const repeatDeleteRes = await api(baseUrl, `/api/held-orders/${tableId}`, { method: 'DELETE', headers: authHeader });
    assertEqual(repeatDeleteRes.status, 200, 'Repeated DELETE is a successful no-op');
    assertEqual(repeatDeleteRes.data.success, true, 'Repeated DELETE returns success');
    assertEqual(repeatDeleteRes.data.deleted, false, 'Repeated DELETE reports that nothing remained to delete');
    console.log('  ✓ DELETE /held-orders is idempotent');

    // ─── Scenario E: malformed legacy rows do not hide valid rows ───
    console.log('\n─── Scenario E: malformed legacy rows are isolated ───');
    db.prepare(`
      INSERT INTO held_orders (id, table_id, items, customer_id, guest_count, order_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ho-valid-legacy', 'tbl-valid-legacy', JSON.stringify(mockItems), null, 1, '', now(), now());
    db.prepare(`
      INSERT INTO held_orders (id, table_id, items, customer_id, guest_count, order_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ho-malformed', 'tbl-malformed', '{invalid-json', null, 1, '', now(), now());
    const malformedRes = await api(baseUrl, '/api/held-orders', { headers: authHeader });
    assertEqual(malformedRes.status, 200, 'GET /held-orders succeeds with malformed stored data');
    assertEqual(malformedRes.data.orders.length, 1, 'Valid stored rows remain visible');
    assertEqual(malformedRes.data.orders[0].tableId, 'tbl-valid-legacy', 'Valid legacy row is returned');
    assertEqual(malformedRes.data.skippedCount, 1, 'Malformed row count is reported');
    assert(!JSON.stringify(malformedRes.data).includes('JSON'), 'Parser details are not exposed');
    console.log('  ✓ Malformed held orders are isolated');

    // Phase 3.4 — tables module off must not mutate tables.status
    console.log('\n─── Scenario F: tables module off skips table status writes ───');
    const envKey = ACTIVE_VERTICAL_ENV_KEY as string;
    const prev = process.env[envKey];
    const had = Object.prototype.hasOwnProperty.call(process.env, envKey);
    seedTable(db, 'tbl-retail-hold', 202, 2);
    db.prepare("UPDATE tables SET status = 'available', updated_at = ? WHERE id = ?").run(now(), 'tbl-retail-hold');
    try {
      resetActiveVerticalResolutionForTests();
      process.env[envKey] = 'retail';
      commitActiveVerticalFromEnv();
      const retailHold = await api(baseUrl, '/api/held-orders', {
        method: 'POST',
        body: {
          tableId: 'tbl-retail-hold',
          items: mockItems,
          guestCount: 1,
        },
        headers: authHeader,
      });
      assertEqual(retailHold.status, 200, 'hold still succeeds when tables module off');
      const statusOff = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-retail-hold') as { status: string };
      assertEqual(statusOff.status, 'available', 'tables OFF: hold does not set status held');
      await api(baseUrl, '/api/held-orders/tbl-retail-hold', { method: 'DELETE', headers: authHeader });
      console.log('  ✓ tables module off leaves table status untouched');
    } finally {
      resetActiveVerticalResolutionForTests();
      if (had) process.env[envKey] = prev;
      else delete process.env[envKey];
      commitActiveVerticalFromEnv();
    }

    console.log('\n✅ All held orders tests passed');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error('\n❌ Test failed:');
  console.error(err);
  process.exit(1);
});

/**
 * R2 — Restaurant Floor Operations
 *
 * S-FLOOR-01…10: open/pay/close · modify · transfer · transfer race ·
 * merge · split · cancel release · restart occupancy · offline local · RBAC
 *
 * Usage: npm run test:r2
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r2-floor-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r2-floor-operations-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
  seedCategory,
  seedProduct,
  seedTable,
  seedCustomer,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { tableRoutes } = require('../main/routes/tables');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { getJWTSecret } = require('../main/routes/auth');
const { getSupportedSchemaVersion } = require('../main/db');

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

async function createDineIn(
  baseUrl: string,
  auth: Record<string, string>,
  tableId: string,
  productId: string,
  qty = 1,
) {
  return api(baseUrl, '/api/orders', {
    method: 'POST',
    headers: auth,
    body: {
      type: 'dine_in',
      table_id: tableId,
      items: [{ product_id: productId, quantity: qty }],
    },
  });
}

async function payOrder(
  baseUrl: string,
  auth: Record<string, string>,
  orderId: number | string,
) {
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    headers: auth,
    body: { order_id: orderId },
  });
  assert(
    bill.status === 200 || bill.status === 201,
    `bill generate for order ${orderId} (got ${bill.status})`,
  );
  const billId = bill.data.bill.id;
  const amount = bill.data.bill.total;
  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    headers: auth,
    body: { method: 'cash', amount },
  });
  assertEqual(pay.status, 200, `payment for bill ${billId}`);
  return { billId, amount };
}

function auditCount(db: any, action: string, entityId?: string): number {
  if (entityId !== undefined) {
    return (
      db
        .prepare('SELECT COUNT(*) AS c FROM audit_logs WHERE action = ? AND entity_id = ?')
        .get(action, String(entityId)) as { c: number }
    ).c;
  }
  return (db.prepare('SELECT COUNT(*) AS c FROM audit_logs WHERE action = ?').get(action) as {
    c: number;
  }).c;
}

async function main() {
  console.log('\nR2 — Restaurant Floor Operations\n' + '='.repeat(60));
  assertEqual(getSupportedSchemaVersion(), 79, 'schema version is 79 (R5 recipes + kitchen + R4 inventory)');

  const db = initTestDb();
  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const waiter = seedRoleUser(db, 'waiter-r2-001', 'waiter', 'waiter-r2@test.local');
  const cashier = seedRoleUser(db, 'cashier-r2-001', 'cashier', 'cashier-r2@test.local');
  const chef = seedRoleUser(db, 'chef-r2-001', 'chef', 'chef-r2@test.local');

  seedCategory(db, 'cat-r2', 'R2 Cat');
  seedProduct(db, 'prod-r2-a', 'cat-r2', 'R2 Latte', 100);
  seedProduct(db, 'prod-r2-b', 'cat-r2', 'R2 Mocha', 150);
  seedCustomer(db, 'cust-r2', 'Floor Guest', '9000000001');

  const auth = owner.authHeader;

  const app = createApp({
    '/api/tables': tableRoutes,
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // ── S-FLOOR-01 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-01 Open table → create order → pay → close table');
    {
      seedTable(db, 'tbl-r2-01a', 101, 4);
      const created = await createDineIn(baseUrl, auth, 'tbl-r2-01a', 'prod-r2-a');
      assertEqual(created.status, 201, 'dine-in created');
      const orderId = created.data.order.id;
      const tableAfter = await api(baseUrl, '/api/tables/tbl-r2-01a', { headers: auth });
      assertEqual(tableAfter.data.table.status, 'occupied', 'table occupied');
      assertEqual(tableAfter.data.table.activeOrder.id, orderId, 'active order linked');

      await payOrder(baseUrl, auth, orderId);
      const tablePaid = await api(baseUrl, '/api/tables/tbl-r2-01a', { headers: auth });
      assertEqual(tablePaid.data.table.status, 'available', 'table freed after pay');
      assertEqual(tablePaid.data.table.activeOrder, null, 'no active order after pay');
    }

    // ── S-FLOOR-02 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-02 Open table → modify order → complete');
    {
      seedTable(db, 'tbl-r2-02a', 102, 4);
      const created = await createDineIn(baseUrl, auth, 'tbl-r2-02a', 'prod-r2-a');
      assertEqual(created.status, 201, 'order created');
      const orderId = created.data.order.id;
      const add = await api(baseUrl, `/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: auth,
        body: { items: [{ product_id: 'prod-r2-b', quantity: 1 }] },
      });
      assertEqual(add.status, 200, 'item added');
      const complete = await api(baseUrl, `/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: auth,
        body: { status: 'completed' },
      });
      assertEqual(complete.status, 200, 'order completed');
      const table = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-r2-02a') as {
        status: string;
      };
      assertEqual(table.status, 'available', 'table freed on complete');
    }

    // ── S-FLOOR-03 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-03 Transfer table A → B');
    {
      seedTable(db, 'tbl-r2-03a', 103, 4);
      seedTable(db, 'tbl-r2-03b', 104, 4);
      const created = await createDineIn(baseUrl, auth, 'tbl-r2-03a', 'prod-r2-a');
      const orderId = created.data.order.id;
      const itemCount = (
        db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(orderId) as {
          c: number;
        }
      ).c;

      const move = await api(baseUrl, '/api/tables/tbl-r2-03a/move-order', {
        method: 'POST',
        headers: waiter.authHeader,
        body: { target_table_id: 'tbl-r2-03b' },
      });
      assertEqual(move.status, 200, 'transfer ok');
      assertEqual(move.data.order.table_id, 'tbl-r2-03b', 'order on B');
      assertEqual(move.data.sourceTable.status, 'available', 'A available');
      assertEqual(move.data.targetTable.status, 'occupied', 'B occupied');
      const itemsAfter = (
        db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(orderId) as {
          c: number;
        }
      ).c;
      assertEqual(itemsAfter, itemCount, 'items intact');
      assert(auditCount(db, 'table.order_transferred', String(orderId)) >= 1, 'transfer audited');
    }

    // ── S-FLOOR-04 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-04 Transfer race');
    {
      seedTable(db, 'tbl-r2-04a', 105, 4);
      seedTable(db, 'tbl-r2-04b', 106, 4);
      seedTable(db, 'tbl-r2-04c', 107, 4);
      const o1 = await createDineIn(baseUrl, auth, 'tbl-r2-04a', 'prod-r2-a');
      const o2 = await createDineIn(baseUrl, auth, 'tbl-r2-04b', 'prod-r2-b');
      assertEqual(o1.status, 201, 'order A');
      assertEqual(o2.status, 201, 'order B');

      // Concurrent transfers to same free target — one wins, one 409
      const [r1, r2] = await Promise.all([
        api(baseUrl, '/api/tables/tbl-r2-04a/move-order', {
          method: 'POST',
          headers: auth,
          body: { target_table_id: 'tbl-r2-04c' },
        }),
        api(baseUrl, '/api/tables/tbl-r2-04b/move-order', {
          method: 'POST',
          headers: auth,
          body: { target_table_id: 'tbl-r2-04c' },
        }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      assertEqual(statuses[0], 200, 'one transfer succeeds');
      assertEqual(statuses[1], 409, 'other transfer conflicts');
      const occupiedOnC = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM orders WHERE table_id = ? AND status NOT IN ('completed','cancelled')`,
          )
          .get('tbl-r2-04c') as { c: number }
      ).c;
      assertEqual(occupiedOnC, 1, 'exactly one active order on C');

      // Second open on occupied table must fail
      const dup = await createDineIn(baseUrl, auth, 'tbl-r2-04c', 'prod-r2-a');
      assertEqual(dup.status, 409, 'second open refused');
      assertEqual(dup.data.code, 'TABLE_HAS_ACTIVE_ORDER', 'deterministic code');
    }

    // ── S-FLOOR-05 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-05 Merge unpaid tables/orders');
    {
      seedTable(db, 'tbl-r2-05a', 108, 4);
      seedTable(db, 'tbl-r2-05b', 109, 4);
      const oA = await createDineIn(baseUrl, auth, 'tbl-r2-05a', 'prod-r2-a');
      const oB = await createDineIn(baseUrl, auth, 'tbl-r2-05b', 'prod-r2-b');
      const idA = oA.data.order.id;
      const idB = oB.data.order.id;
      const itemsA = (
        db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(idA) as {
          c: number;
        }
      ).c;
      const itemsB = (
        db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(idB) as {
          c: number;
        }
      ).c;

      const merge = await api(baseUrl, '/api/tables/tbl-r2-05a/merge', {
        method: 'POST',
        headers: auth,
        body: { source_table_id: 'tbl-r2-05b' },
      });
      assertEqual(merge.status, 200, 'merge ok');
      assertEqual(merge.data.survivingTable.status, 'occupied', 'surviving occupied');
      assertEqual(merge.data.sourceTable.status, 'available', 'source freed');
      const mergedItems = (
        db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(idA) as {
          c: number;
        }
      ).c;
      assertEqual(mergedItems, itemsA + itemsB, 'all items on surviving order');
      const srcStatus = (
        db.prepare('SELECT status FROM orders WHERE id = ?').get(idB) as { status: string }
      ).status;
      assertEqual(srcStatus, 'cancelled', 'source order cancelled without restock path');
      assert(auditCount(db, 'table.merged', 'tbl-r2-05a') >= 1, 'merge audited');

      // Billed merge forbidden
      seedTable(db, 'tbl-r2-05c', 110, 4);
      seedTable(db, 'tbl-r2-05d', 111, 4);
      const billed = await createDineIn(baseUrl, auth, 'tbl-r2-05c', 'prod-r2-a');
      await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        headers: auth,
        body: { order_id: billed.data.order.id },
      });
      await createDineIn(baseUrl, auth, 'tbl-r2-05d', 'prod-r2-b');
      const billedMerge = await api(baseUrl, '/api/tables/tbl-r2-05c/merge', {
        method: 'POST',
        headers: auth,
        body: { source_table_id: 'tbl-r2-05d' },
      });
      assertEqual(billedMerge.status, 409, 'billed merge refused');
      assertEqual(billedMerge.data.code, 'BILLED_MERGE_FORBIDDEN', 'ADR guard code');
    }

    // ── S-FLOOR-06 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-06 Split table/order');
    {
      seedTable(db, 'tbl-r2-06a', 112, 4);
      seedTable(db, 'tbl-r2-06b', 113, 4);
      const created = await api(baseUrl, '/api/orders', {
        method: 'POST',
        headers: auth,
        body: {
          type: 'dine_in',
          table_id: 'tbl-r2-06a',
          items: [
            { product_id: 'prod-r2-a', quantity: 1 },
            { product_id: 'prod-r2-b', quantity: 1 },
          ],
        },
      });
      assertEqual(created.status, 201, 'two-item order');
      const orderId = created.data.order.id;
      const items = db
        .prepare('SELECT id FROM order_items WHERE order_id = ? ORDER BY id')
        .all(orderId) as Array<{ id: number }>;
      assertEqual(items.length, 2, 'two items');

      const split = await api(baseUrl, '/api/tables/tbl-r2-06a/split', {
        method: 'POST',
        headers: auth,
        body: { target_table_id: 'tbl-r2-06b', order_item_ids: [items[1].id] },
      });
      assertEqual(split.status, 200, 'split ok');
      assertEqual(split.data.sourceTable.status, 'occupied', 'source still occupied');
      assertEqual(split.data.targetTable.status, 'occupied', 'target occupied');
      assertEqual(split.data.newOrder.table_id, 'tbl-r2-06b', 'new order on B');
      const srcItems = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM order_items WHERE order_id = ? AND status NOT IN ('cancelled','voided','void_adjustment')`,
          )
          .get(orderId) as { c: number }
      ).c;
      assertEqual(srcItems, 1, 'one item remains on source');
      assert(auditCount(db, 'table.split', 'tbl-r2-06a') >= 1, 'split audited');
    }

    // ── S-FLOOR-07 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-07 Cancel order → table released');
    {
      seedTable(db, 'tbl-r2-07a', 114, 4);
      const created = await createDineIn(baseUrl, auth, 'tbl-r2-07a', 'prod-r2-a');
      const orderId = created.data.order.id;
      const cancel = await api(baseUrl, `/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: auth,
        body: { status: 'cancelled', reason: 'guest left' },
      });
      assertEqual(cancel.status, 200, 'cancelled');
      const table = db.prepare('SELECT status, assigned_waiter_id FROM tables WHERE id = ?').get(
        'tbl-r2-07a',
      ) as { status: string; assigned_waiter_id: string | null };
      assertEqual(table.status, 'available', 'no phantom occupied');
    }

    // ── S-FLOOR-08 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-08 Restart with occupied tables');
    {
      seedTable(db, 'tbl-r2-08a', 115, 4);
      const created = await createDineIn(baseUrl, auth, 'tbl-r2-08a', 'prod-r2-a');
      const orderId = created.data.order.id;
      // Simulate restart: re-read from SQLite SoR (same DB connection = durable state)
      const row = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-r2-08a') as {
        status: string;
      };
      assertEqual(row.status, 'occupied', 'status durable in SQLite');
      const listed = await api(baseUrl, '/api/tables/tbl-r2-08a', { headers: auth });
      assertEqual(listed.data.table.activeOrder.id, orderId, 'active order restored from SoR');
    }

    // ── S-FLOOR-09 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-09 Offline floor operation (local SQLite, no cloud gate)');
    {
      seedTable(db, 'tbl-r2-09a', 116, 4);
      seedTable(db, 'tbl-r2-09b', 117, 4);
      // Local API works without network — create, transfer, complete entirely via localhost
      const created = await createDineIn(baseUrl, auth, 'tbl-r2-09a', 'prod-r2-a');
      assertEqual(created.status, 201, 'offline-safe create');
      const move = await api(baseUrl, '/api/tables/tbl-r2-09a/move-order', {
        method: 'POST',
        headers: auth,
        body: { target_table_id: 'tbl-r2-09b' },
      });
      assertEqual(move.status, 200, 'offline-safe transfer');
      await payOrder(baseUrl, auth, created.data.order.id);
      const table = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-r2-09b') as {
        status: string;
      };
      assertEqual(table.status, 'available', 'offline-safe complete frees table');
    }

    // ── S-FLOOR-10 ─────────────────────────────────────────────────────
    console.log('\nS-FLOOR-10 RBAC table mutation');
    {
      seedTable(db, 'tbl-r2-10a', 118, 4);
      seedTable(db, 'tbl-r2-10b', 119, 4);

      const createByWaiter = await api(baseUrl, '/api/tables', {
        method: 'POST',
        headers: waiter.authHeader,
        body: { number: 'NOPE-W', capacity: 2 },
      });
      assertEqual(createByWaiter.status, 403, 'waiter cannot create table');

      const createByChef = await api(baseUrl, '/api/tables', {
        method: 'POST',
        headers: chef.authHeader,
        body: { number: 'NOPE-C', capacity: 2 },
      });
      assertEqual(createByChef.status, 403, 'chef cannot create table');

      const createByManager = await api(baseUrl, '/api/tables', {
        method: 'POST',
        headers: manager.authHeader,
        body: { number: 'MGR-OK', capacity: 2, section: 'Patio', floor: '1' },
      });
      assertEqual(createByManager.status, 201, 'manager can create');
      assertEqual(createByManager.data.table.section, 'Patio', 'section persisted');

      const openByWaiter = await createDineIn(baseUrl, waiter.authHeader, 'tbl-r2-10a', 'prod-r2-a');
      assertEqual(openByWaiter.status, 201, 'waiter can open table / create order');

      const assignByCashier = await api(baseUrl, '/api/tables/tbl-r2-10a/assign-waiter', {
        method: 'POST',
        headers: cashier.authHeader,
        body: { waiter_user_id: waiter.userId },
      });
      assertEqual(assignByCashier.status, 403, 'cashier cannot assign waiter');

      const assignByManager = await api(baseUrl, '/api/tables/tbl-r2-10a/assign-waiter', {
        method: 'POST',
        headers: manager.authHeader,
        body: { waiter_user_id: waiter.userId },
      });
      assertEqual(assignByManager.status, 200, 'manager assigns waiter');
      assertEqual(
        assignByManager.data.table.assigned_waiter_id,
        waiter.userId,
        'waiter id stored',
      );
      assert(auditCount(db, 'table.waiter_assigned', 'tbl-r2-10a') >= 1, 'assign audited');

      const transferByWaiter = await api(baseUrl, '/api/tables/tbl-r2-10a/move-order', {
        method: 'POST',
        headers: waiter.authHeader,
        body: { target_table_id: 'tbl-r2-10b' },
      });
      assertEqual(transferByWaiter.status, 200, 'waiter can transfer');

      // Status with active order blocked
      seedTable(db, 'tbl-r2-10c', 120, 4);
      await createDineIn(baseUrl, auth, 'tbl-r2-10c', 'prod-r2-a');
      const badStatus = await api(baseUrl, '/api/tables/tbl-r2-10c/status', {
        method: 'PATCH',
        headers: manager.authHeader,
        body: { status: 'available' },
      });
      assertEqual(badStatus.status, 409, 'cannot free occupied via status while order active');
    }

    // CRUD audit
    assert(auditCount(db, 'table.created') >= 1, 'table.created audited');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`R2 results: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

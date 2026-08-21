/**
 * R3 — Kitchen OS
 *
 * S-KDS-01…10 + priority RBAC: board feed · station filter · item CAS
 * lifecycle · concurrent CAS · FE stale contract · companion advertise ·
 * cancel exclusion · notes/addons · KOT contract · SoR persistence · rush
 *
 * Expected endpoints (TDD — may fail until R3 implementation lands):
 *   GET    /api/kds/orders[?station_id=]
 *   PATCH  /api/order-items/:id/status  { status, expected_status }  → timestamps + audit
 *   PATCH  /api/kds/orders/:id/priority { priority: number 0-9 }  (manager+)
 *   POST   /api/printers/print-kot      { orderId, stationName?, items?, useUnicode? }
 * Schema v77: order_items preparing_started_at / ready_at / served_at;
 *             orders.kitchen_priority INTEGER DEFAULT 0 for list sort.
 *
 * Usage: npm run test:r3
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r3-kitchen-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r3-kitchen-os-secret';
process.env.KDS_PORT = '19153';

const {
  shouldAdvertiseLanKds,
  shouldPublishMdns,
  mdnsTxtKdsFields,
} = require('../main/services/kds-recovery');

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
  seedCategory,
  seedProduct,
  seedTable,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { tableRoutes } = require('../main/routes/tables');
const { billRoutes } = require('../main/routes/bills');
const { kdsRoutes } = require('../main/routes/kds');
const { orderItemRoutes } = require('../main/routes/order-items');
const { printerRoutes, routeItemsToStations } = require('../main/routes/printers');
const { getJWTSecret } = require('../main/routes/auth');
const { getSupportedSchemaVersion } = require('../main/db');
const {
  startKdsServer,
  stopKdsServer,
  isKdsServerRunning,
} = require('../main/kds-server');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFe(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

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

function seedKitchenStation(
  db: any,
  id: string,
  name: string,
  categoryIds: string[],
): void {
  db.prepare(
    `INSERT INTO kitchen_stations (id, name, category_ids, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, ?, ?)`,
  ).run(id, name, JSON.stringify(categoryIds), now(), now());
}

function assignStationUser(db: any, userId: string, stationId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO station_users (user_id, station_id, created_at) VALUES (?, ?, ?)`,
  ).run(userId, stationId, now());
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

function findKdsOrder(list: any[], orderId: number | string): any | undefined {
  return (list || []).find((o: any) => String(o.id) === String(orderId));
}

async function createTakeaway(
  baseUrl: string,
  auth: Record<string, string>,
  items: Array<Record<string, unknown>>,
  extras: Record<string, unknown> = {},
) {
  return api(baseUrl, '/api/orders', {
    method: 'POST',
    headers: auth,
    body: {
      type: 'takeaway',
      items,
      ...extras,
    },
  });
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

/** Safe for TDD routes that may still 404 with an HTML body. */
async function apiMaybeHtml(
  baseUrl: string,
  urlPath: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const fetchOptions: any = { headers };
  if (options.method) fetchOptions.method = options.method;
  if (options.body !== undefined) {
    fetchOptions.body =
      typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const response = await (globalThis as any).fetch(baseUrl + urlPath, fetchOptions);
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 200) };
  }
  return { status: response.status, data };
}

async function main() {
  console.log('\nR3 — Kitchen OS\n' + '='.repeat(60));
  // Expected: R3 migration adds item kitchen timestamps + order priority.
  assertEqual(getSupportedSchemaVersion(), 87, 'schema version is 87 (tip after R10–R14)');

  const db = initTestDb();
  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const waiter = seedRoleUser(db, 'waiter-r3-001', 'waiter', 'waiter-r3@test.local');
  const chef = seedRoleUser(db, 'chef-r3-001', 'chef', 'chef-r3@test.local');

  seedCategory(db, 'cat-r3-hot', 'Hot Food');
  seedCategory(db, 'cat-r3-bar', 'Bar');
  seedProduct(db, 'prod-r3-burger', 'cat-r3-hot', 'R3 Burger', 200);
  seedProduct(db, 'prod-r3-latte', 'cat-r3-bar', 'R3 Latte', 120);
  seedTable(db, 'tbl-r3-01', 301, 4);

  seedKitchenStation(db, 'stn-r3-hot', 'Hot Line', ['cat-r3-hot']);
  seedKitchenStation(db, 'stn-r3-bar', 'Bar', ['cat-r3-bar']);
  assignStationUser(db, chef.userId, 'stn-r3-hot');
  assignStationUser(db, chef.userId, 'stn-r3-bar');

  // Optional addon seed for S-KDS-08 (skip path still asserts notes if create rejects addons).
  try {
    db.prepare(
      `INSERT INTO addon_groups (id, name, is_required, min_selection, max_selection, is_active, sort_order, created_at, updated_at)
       VALUES ('ag-r3', 'Extras', 0, 0, 3, 1, 0, ?, ?)`,
    ).run(now(), now());
    db.prepare(
      `INSERT INTO addons (id, addon_group_id, name, price, is_active, sort_order, created_at, updated_at)
       VALUES ('addon-r3-cheese', 'ag-r3', 'Extra Cheese', 30, 1, 0, ?, ?)`,
    ).run(now(), now());
    db.prepare(
      `INSERT OR IGNORE INTO addon_group_product (addon_group_id, product_id) VALUES ('ag-r3', 'prod-r3-burger')`,
    ).run();
  } catch {
    // Addon schema variants must not block the suite — notes path still runs.
  }

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('kds_enabled', 'true', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('kot_printing_enabled', 'true', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const auth = owner.authHeader;

  const app = createApp({
    '/api/tables': tableRoutes,
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/kds': kdsRoutes,
    '/api/order-items': orderItemRoutes,
    '/api/printers': printerRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // ── S-KDS-01 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-01 Create order → GET /api/kds/orders includes items');
    {
      // dine_in or takeaway both feed the board; use dine_in here.
      db.prepare('UPDATE tables SET kitchen_station_id = ? WHERE id = ?').run(
        'stn-r3-hot',
        'tbl-r3-01',
      );
      const created = await createDineIn(baseUrl, auth, 'tbl-r3-01', 'prod-r3-burger');
      assertEqual(created.status, 201, 'dine_in created');
      const orderId = created.data.order.id;

      const ownerBoard = await api(baseUrl, '/api/kds/orders', { headers: auth });
      assertEqual(ownerBoard.status, 200, 'owner GET /api/kds/orders');
      const ownerOrder = findKdsOrder(ownerBoard.data.orders, orderId);
      assert(!!ownerOrder, 'owner board includes order');
      assert((ownerOrder?.items?.length || 0) >= 1, 'owner board includes items');
      assertEqual(ownerOrder?.station_name, 'Hot Line', 'dine_in projects station_name from table station');
      assert('kitchen_priority' in (ownerOrder || {}), 'kitchen_priority projected on KDS order');

      const chefBoard = await api(baseUrl, '/api/kds/orders', { headers: chef.authHeader });
      assertEqual(chefBoard.status, 200, 'chef GET /api/kds/orders');
      const chefOrder = findKdsOrder(chefBoard.data.orders, orderId);
      assert(!!chefOrder, 'chef board includes order');
      assert((chefOrder?.items?.length || 0) >= 1, 'chef board includes items');
    }

    // ── S-KDS-02 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-02 Station filter by category_ids');
    {
      const created = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-burger', quantity: 1 },
        { product_id: 'prod-r3-latte', quantity: 1 },
      ]);
      assertEqual(created.status, 201, 'mixed-category takeaway created');
      const orderId = created.data.order.id;

      const hot = await api(baseUrl, '/api/kds/orders?station_id=stn-r3-hot', {
        headers: chef.authHeader,
      });
      assertEqual(hot.status, 200, 'hot station list 200');
      const hotOrder = findKdsOrder(hot.data.orders, orderId);
      assert(!!hotOrder, 'hot station sees order');
      const hotNames = (hotOrder?.items || []).map((i: any) => i.product_name || i.product_id);
      assert(
        hotNames.some((n: string) => String(n).includes('Burger') || String(n) === 'prod-r3-burger'),
        'hot station shows burger',
      );
      assert(
        !hotNames.some((n: string) => String(n).includes('Latte') || String(n) === 'prod-r3-latte'),
        'hot station hides latte',
      );

      const bar = await api(baseUrl, '/api/kds/orders?station_id=stn-r3-bar', {
        headers: chef.authHeader,
      });
      assertEqual(bar.status, 200, 'bar station list 200');
      const barOrder = findKdsOrder(bar.data.orders, orderId);
      assert(!!barOrder, 'bar station sees order');
      const barNames = (barOrder?.items || []).map((i: any) => i.product_name || i.product_id);
      assert(
        barNames.some((n: string) => String(n).includes('Latte') || String(n) === 'prod-r3-latte'),
        'bar station shows latte',
      );
      assert(
        !barNames.some((n: string) => String(n).includes('Burger') || String(n) === 'prod-r3-burger'),
        'bar station hides burger',
      );
    }

    // ── S-KDS-03 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-03 Item status CAS lifecycle + timestamps + audit');
    {
      const created = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-burger', quantity: 1 },
      ]);
      assertEqual(created.status, 201, 'order for lifecycle');
      const orderId = created.data.order.id;
      const itemId = created.data.order.items?.[0]?.id
        ?? (db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(orderId) as { id: number })
          .id;

      const toPreparing = await api(baseUrl, `/api/order-items/${itemId}/status`, {
        method: 'PATCH',
        headers: chef.authHeader,
        body: { status: 'preparing', expected_status: 'pending' },
      });
      assertEqual(toPreparing.status, 200, 'pending→preparing');
      let row = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as any;
      assertEqual(row.status, 'preparing', 'db status preparing');
      assert(!!row.preparing_started_at, 'preparing_started_at set');

      const toReady = await api(baseUrl, `/api/order-items/${itemId}/status`, {
        method: 'PATCH',
        headers: chef.authHeader,
        body: { status: 'ready', expected_status: 'preparing' },
      });
      assertEqual(toReady.status, 200, 'preparing→ready');
      row = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as any;
      assertEqual(row.status, 'ready', 'db status ready');
      assert(!!row.ready_at, 'ready_at set');

      const toServed = await api(baseUrl, `/api/order-items/${itemId}/status`, {
        method: 'PATCH',
        headers: chef.authHeader,
        body: { status: 'served', expected_status: 'ready' },
      });
      assertEqual(toServed.status, 200, 'ready→served');
      row = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as any;
      assertEqual(row.status, 'served', 'db status served');
      assert(!!row.served_at, 'served_at set');

      assert(
        auditCount(db, 'kitchen.item_status_changed', String(itemId)) >= 1
          || auditCount(db, 'kitchen.item_status_changed') >= 1,
        'audit_logs has kitchen.item_status_changed',
      );
    }

    // ── S-KDS-04 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-04 Concurrent CAS — one 200, one 409');
    {
      const created = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-latte', quantity: 1 },
      ]);
      assertEqual(created.status, 201, 'order for CAS race');
      const orderId = created.data.order.id;
      const itemId = created.data.order.items?.[0]?.id
        ?? (db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(orderId) as { id: number })
          .id;

      const [a, b] = await Promise.all([
        api(baseUrl, `/api/order-items/${itemId}/status`, {
          method: 'PATCH',
          headers: chef.authHeader,
          body: { status: 'preparing', expected_status: 'pending' },
        }),
        api(baseUrl, `/api/order-items/${itemId}/status`, {
          method: 'PATCH',
          headers: owner.authHeader,
          body: { status: 'preparing', expected_status: 'pending' },
        }),
      ]);
      const statuses = [a.status, b.status].sort();
      assertEqual(statuses[0], 200, 'one CAS winner is 200');
      assertEqual(statuses[1], 409, 'one CAS loser is 409');
    }

    // ── S-KDS-05 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-05 Frontend stale / retry contract (source only)');
    {
      const hook = readFe('hooks/useKdsConnection.ts');
      assert(hook.includes('dataStale'), 'useKdsConnection exposes dataStale');
      assert(
        hook.includes('pendingRetriesRef') ||
          hook.includes('flushPendingStatusRetry') ||
          hook.includes('PendingStatusRetry'),
        'useKdsConnection has pendingRetriesRef / flushPendingStatusRetry (H2)',
      );
      assert(
        hook.includes('connectionStale')
          || fs.readFileSync(path.join(FRONTEND, 'components/kds/KdsHeader.tsx'), 'utf8').includes(
            'kds.connectionStale',
          )
          || fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8').includes(
            'connectionStale',
          ),
        'connectionStale string present in hook/header/i18n',
      );
    }

    // ── S-KDS-06 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-06 Companion advertise helpers + start/stop honesty');
    {
      assertEqual(
        shouldAdvertiseLanKds({ networkMode: 'kds_lan', kdsCompanionRunning: false }),
        false,
        'no LAN advertise when companion stopped',
      );
      assertEqual(
        shouldAdvertiseLanKds({ networkMode: 'kds_lan', kdsCompanionRunning: true }),
        true,
        'advertise when companion running in kds_lan',
      );
      assertEqual(
        shouldPublishMdns({ networkMode: 'kds_lan', kdsCompanionRunning: false }),
        false,
        'skip mDNS when companion stopped in kds_lan',
      );
      assertEqual(
        mdnsTxtKdsFields({ kdsCompanionRunning: false, kdsPort: 3002 }),
        null,
        'mDNS txt omits kds when stopped',
      );

      stopKdsServer();
      assertEqual(isKdsServerRunning(), false, 'isKdsServerRunning false after stop');
      await startKdsServer();
      assertEqual(isKdsServerRunning(), true, 'isKdsServerRunning true after start');
      stopKdsServer();
      assertEqual(isKdsServerRunning(), false, 'isKdsServerRunning false after second stop');
    }

    // ── S-KDS-07 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-07 Cancelled order excluded from active KDS board');
    {
      const created = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-burger', quantity: 1 },
      ]);
      assertEqual(created.status, 201, 'order for cancel');
      const orderId = created.data.order.id;

      const before = await api(baseUrl, '/api/kds/orders', { headers: chef.authHeader });
      assert(!!findKdsOrder(before.data.orders, orderId), 'order visible before cancel');

      const cancel = await api(baseUrl, `/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: auth,
        body: { status: 'cancelled', reason: 'guest left' },
      });
      assertEqual(cancel.status, 200, 'order cancelled');

      const after = await api(baseUrl, '/api/kds/orders', { headers: chef.authHeader });
      assertEqual(after.status, 200, 'board still 200 after cancel');
      const cancelledOnBoard = findKdsOrder(after.data.orders, orderId);
      assert(
        !cancelledOnBoard,
        'cancelled order not listed as active on GET /api/kds/orders',
      );
    }

    // ── S-KDS-08 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-08 Notes / modifiers visible on KDS projection');
    {
      const withNotes = await createTakeaway(
        baseUrl,
        auth,
        [
          {
            product_id: 'prod-r3-burger',
            quantity: 1,
            special_instructions: 'No onion',
            addons: [{ id: 'addon-r3-cheese', name: 'Extra Cheese', price: 30, quantity: 1 }],
          },
        ],
        { special_instructions: 'Rush table notes' },
      );

      let orderId: number | string;
      let itemId: number | string | undefined;
      if (withNotes.status === 201) {
        orderId = withNotes.data.order.id;
        itemId = withNotes.data.order.items?.[0]?.id;
      } else {
        // Fallback: notes only if addon setup rejected.
        const notesOnly = await createTakeaway(
          baseUrl,
          auth,
          [
            {
              product_id: 'prod-r3-burger',
              quantity: 1,
              special_instructions: 'No onion',
            },
          ],
          { special_instructions: 'Rush table notes' },
        );
        assertEqual(notesOnly.status, 201, 'order with notes (addons optional)');
        orderId = notesOnly.data.order.id;
        itemId = notesOnly.data.order.items?.[0]?.id;
      }

      const board = await api(baseUrl, '/api/kds/orders', { headers: chef.authHeader });
      const projected = findKdsOrder(board.data.orders, orderId);
      assert(!!projected, 'notes order on board');
      const item =
        (projected?.items || []).find((i: any) => String(i.id) === String(itemId))
        || projected?.items?.[0];
      assert(!!item, 'projected item present');
      const itemNotes = String(item.special_instructions || '');
      const orderNotes = String(
        projected.special_instructions || projected.order_notes || projected.notes || '',
      );
      assert(
        itemNotes.includes('No onion') || orderNotes.includes('Rush table notes'),
        'special_instructions / order notes visible on KDS projection',
      );
      if (Array.isArray(item.addons) && item.addons.length > 0) {
        assert(
          item.addons.some((a: any) => String(a.name || '').includes('Cheese')),
          'addons visible on projected item when present',
        );
      }
    }

    // ── S-KDS-09 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-09 KOT print contract without printer (no 500 crash)');
    {
      const created = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-burger', quantity: 1 },
      ]);
      assertEqual(created.status, 201, 'order for KOT');
      const orderId = created.data.order.id;
      const orderItems = db
        .prepare('SELECT * FROM order_items WHERE order_id = ?')
        .all(orderId) as any[];

      // Structural contract: routeItemsToStations returns groups without throwing.
      const groups = routeItemsToStations(db, orderItems);
      assert(Array.isArray(groups), 'routeItemsToStations returns array');

      const kot = await api(baseUrl, '/api/printers/print-kot', {
        method: 'POST',
        headers: auth,
        body: { orderId },
      });
      assert(kot.status !== 500, 'print-kot does not 500 without printer');
      assert(
        kot.status === 400 || kot.status === 502 || kot.status === 403,
        'print-kot returns structured client/upstream error without printer',
      );
      assert(
        typeof (kot.data?.error || kot.data?.code) === 'string',
        'print-kot error payload has error or code',
      );
    }

    // ── S-KDS-10 ─────────────────────────────────────────────────────────
    console.log('\nS-KDS-10 Local SQLite SoR — bump status then re-GET');
    {
      const created = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-latte', quantity: 1 },
      ]);
      assertEqual(created.status, 201, 'order for SoR persistence');
      const orderId = created.data.order.id;
      const itemId = created.data.order.items?.[0]?.id
        ?? (db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(orderId) as { id: number })
          .id;

      const bump = await api(baseUrl, `/api/order-items/${itemId}/status`, {
        method: 'PATCH',
        headers: chef.authHeader,
        body: { status: 'preparing', expected_status: 'pending' },
      });
      assertEqual(bump.status, 200, 'status bumped to preparing');

      const again = await api(baseUrl, '/api/kds/orders', { headers: chef.authHeader });
      const projected = findKdsOrder(again.data.orders, orderId);
      const item = (projected?.items || []).find((i: any) => String(i.id) === String(itemId));
      assertEqual(item?.status, 'preparing', 're-GET reflects persisted preparing status');
      const dbStatus = (
        db.prepare('SELECT status FROM order_items WHERE id = ?').get(itemId) as { status: string }
      ).status;
      assertEqual(dbStatus, 'preparing', 'SQLite SoR holds preparing');
    }

    // ── S-KDS priority ───────────────────────────────────────────────────
    console.log('\nS-KDS priority — manager can set rush; waiter/chef 403; list sorts rush first');
    {
      // PATCH /api/kds/orders/:id/priority { priority: number 0-9 }
      const normal = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-burger', quantity: 1 },
      ]);
      const rush = await createTakeaway(baseUrl, auth, [
        { product_id: 'prod-r3-latte', quantity: 1 },
      ]);
      assertEqual(normal.status, 201, 'normal priority order created');
      assertEqual(rush.status, 201, 'rush candidate order created');
      const normalId = normal.data.order.id;
      const rushId = rush.data.order.id;

      const waiterDenied = await apiMaybeHtml(baseUrl, `/api/kds/orders/${rushId}/priority`, {
        method: 'PATCH',
        headers: waiter.authHeader,
        body: { priority: 9 },
      });
      assertEqual(waiterDenied.status, 403, 'waiter cannot set priority');

      const chefDenied = await apiMaybeHtml(baseUrl, `/api/kds/orders/${rushId}/priority`, {
        method: 'PATCH',
        headers: chef.authHeader,
        body: { priority: 9 },
      });
      // Expected once route lands: chef role is rejected with 403 (not 404).
      assertEqual(chefDenied.status, 403, 'chef cannot set priority');

      const managerOk = await apiMaybeHtml(baseUrl, `/api/kds/orders/${rushId}/priority`, {
        method: 'PATCH',
        headers: manager.authHeader,
        body: { priority: 9 },
      });
      assertEqual(managerOk.status, 200, 'manager can set priority');

      const board = await api(baseUrl, '/api/kds/orders', { headers: chef.authHeader });
      assertEqual(board.status, 200, 'board after priority');
      const ids = (board.data.orders || []).map((o: any) => o.id);
      const rushIdx = ids.findIndex((id: any) => String(id) === String(rushId));
      const normalIdx = ids.findIndex((id: any) => String(id) === String(normalId));
      assert(rushIdx >= 0, 'rush order still on board');
      assert(normalIdx >= 0, 'normal order still on board');
      assert(rushIdx < normalIdx, 'list sorts rush before normal');
    }
  } finally {
    stopKdsServer();
    server.close();
    closeDatabase();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

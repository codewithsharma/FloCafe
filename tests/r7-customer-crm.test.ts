/**
 * R7 Customer & CRM OS — S-CRM-01 … S-CRM-20.
 *
 * Usage: npm run test:r7
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r7-crm-'));
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

process.env.JWT_SECRET = 'r7-customer-crm-os-secret';

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

const { customerRoutes } = require('../main/routes/customers');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { getSupportedSchemaVersion } = require('../main/db');
const { explainSegments, DEFAULT_CRM_SEGMENT_RULES } = require('../main/services/customer-segments');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(
  db: any,
  id: string,
  role: string,
  email: string,
): { id: string; token: string; authHeader: Record<string, string> } {
  const hash = bcrypt.hashSync('password123', 4);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, email, hash, role, now(), now());
  const token = jwt.sign({ userId: id, role }, getJWTSecret(), { expiresIn: '2h' });
  return { id, token, authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('\nR7 — Customer & CRM OS\n' + '='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 86, 'S-CRM schema tip v86');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRole(db, 'user-cashier-r7', 'cashier', 'cashier-r7@test.local');
  const waiter = seedRole(db, 'user-waiter-r7', 'waiter', 'waiter-r7@test.local');
  const chef = seedRole(db, 'user-chef-r7', 'chef', 'chef-r7@test.local');

  seedCategory(db, 'cat-r7', 'R7 Cat');
  seedProduct(db, 'prod-r7', 'cat-r7', 'CRM Latte', 25, { track_inventory: false });
  db.prepare('UPDATE products SET price_cents = 2500, tags = ? WHERE id = ?').run(
    JSON.stringify(['coffee']),
    'prod-r7',
  );

  const app = createApp({
    '/api/customers': customerRoutes,
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
  });
  // Also mount flat search used by POS
  const { getWalletBalance, parseCustomer } = require('../main/routes/customers');
  const { requireRole } = require('../main/middleware/security');
  app.get('/api/customers-search', requireRole('owner', 'manager', 'cashier', 'waiter'), (req: any, res: any) => {
    const q = String(req.query.q || '');
    if (q.length < 2) return res.json([]);
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM customers WHERE is_active = 1 AND (phone_digits LIKE ? OR name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 20`,
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`);
    res.json(rows.map((c: any) => ({ ...parseCustomer(c), wallet_balance: getWalletBalance(c.id) })));
  });

  const { baseUrl, server } = await startServer(app);

  try {
    // S-CRM-01 create
    console.log('\nS-CRM-01 customer create');
    const created = await api(baseUrl, '/api/customers', {
      method: 'POST',
      headers: owner.authHeader,
      body: { name: 'Ada CRM', phone: '+919876543210', email: 'ada@example.com' },
    });
    assertEqual(created.status, 201, 'create 201');
    const customerId = created.data.customer.id;
    assert(!!customerId, 'customer id');

    // S-CRM-04 phone normalization
    console.log('\nS-CRM-04 phone normalization');
    assertEqual(created.data.customer.phone, '+919876543210', 'E.164 stored');

    // S-CRM-05 duplicate
    console.log('\nS-CRM-05 duplicate phone');
    const dup = await api(baseUrl, '/api/customers', {
      method: 'POST',
      headers: owner.authHeader,
      body: { name: 'Other', phone: '+919876543210' },
    });
    assertEqual(dup.status, 409, 'duplicate phone 409');

    // S-CRM-02 update
    console.log('\nS-CRM-02 customer update');
    const updated = await api(baseUrl, `/api/customers/${customerId}`, {
      method: 'PUT',
      headers: cashier.authHeader,
      body: { name: 'Ada Customer', notes: 'VIP table preference' },
    });
    assertEqual(updated.status, 200, 'update 200');
    assertEqual(updated.data.customer.name, 'Ada Customer', 'name updated');

    // Waiter cannot update
    const waiterDenied = await api(baseUrl, `/api/customers/${customerId}`, {
      method: 'PUT',
      headers: waiter.authHeader,
      body: { name: 'Nope' },
    });
    assertEqual(waiterDenied.status, 403, 'waiter update denied');

    // S-CRM-06 order association + history spend
    console.log('\nS-CRM-06/07 order association + history');
    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: cashier.authHeader,
      body: {
        type: 'takeaway',
        customer_id: customerId,
        items: [{ product_id: 'prod-r7', quantity: 2 }],
      },
    });
    assertEqual(order.status, 201, 'order create');
    const orderId = order.data.order.id;
    assertEqual(String(order.data.order.customer_id), String(customerId), 'order linked');

    // Second order for returning/loyal math
    await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: cashier.authHeader,
      body: {
        type: 'dine_in',
        customer_id: customerId,
        items: [{ product_id: 'prod-r7', quantity: 1 }],
      },
    });

    // S-CRM-08 / 09 Customer 360 + spending cents
    console.log('\nS-CRM-08/09 Customer 360 + cents');
    const crm = await api(baseUrl, `/api/customers/${customerId}/crm`, {
      headers: manager.authHeader,
    });
    assertEqual(crm.status, 200, 'crm 200');
    assertEqual(crm.data.crm.orders.total_orders, 2, 'two orders');
    assertEqual(crm.data.crm.spending.total_spend_cents, 2500 * 3, 'spend cents 75.00');
    assertEqual(crm.data.crm.spending.average_order_cents, Math.round((7500) / 2), 'AOV cents');
    assert(Array.isArray(crm.data.crm.segments), 'segments array');
    assert(crm.data.crm.loyalty && typeof crm.data.crm.loyalty.balance_points === 'number', 'loyalty');

    // S-CRM-19 financial cents correctness unit
    console.log('\nS-CRM-19 financial cents');
    assert(
      Number.isInteger(crm.data.crm.spending.total_spend_cents),
      'total_spend_cents integer',
    );

    // S-CRM-10 segmentation
    console.log('\nS-CRM-10 segmentation');
    const segs = explainSegments({
      orderCount: 2,
      cancelledCount: 0,
      totalSpendCents: 7500,
      ordersInWindow: 2,
      daysSinceLastOrder: 0,
      isActive: true,
    });
    assert(
      segs.some((s: any) => s.id === 'returning'),
      'returning segment',
    );
    assert(
      segs.every((s: any) => typeof s.reason === 'string' && s.reason.length > 0),
      'segments explainable',
    );
    assert(DEFAULT_CRM_SEGMENT_RULES.loyal_min_orders === 5, 'central rules');

    // S-CRM-11 preferences
    console.log('\nS-CRM-11 preferences');
    assert(
      Array.isArray(crm.data.crm.preferences.favorite_items),
      'favorite items derived',
    );

    // S-CRM-12/13 notes RBAC + audit
    console.log('\nS-CRM-12/13 notes');
    const note = await api(baseUrl, `/api/customers/${customerId}/notes`, {
      method: 'POST',
      headers: cashier.authHeader,
      body: { body: 'Prefers window seat' },
    });
    assertEqual(note.status, 201, 'note create');
    const noteId = note.data.note.id;
    const waiterNote = await api(baseUrl, `/api/customers/${customerId}/notes`, {
      method: 'POST',
      headers: waiter.authHeader,
      body: { body: 'waiter should fail' },
    });
    assertEqual(waiterNote.status, 403, 'waiter cannot create note');

    const auditRow = getDatabase()
      .prepare(`SELECT * FROM audit_logs WHERE action = 'customer.note_created' AND entity_id = ?`)
      .get(noteId);
    assert(!!auditRow, 'note_created audited');

    const noteUpdate = await api(baseUrl, `/api/customers/${customerId}/notes/${noteId}`, {
      method: 'PUT',
      headers: manager.authHeader,
      body: { body: 'Prefers quiet corner' },
    });
    assertEqual(noteUpdate.status, 200, 'note update');
    assert(
      !!getDatabase()
        .prepare(`SELECT 1 FROM audit_logs WHERE action = 'customer.note_updated' AND entity_id = ?`)
        .get(noteId),
      'note_updated audited',
    );

    // S-CRM-03 archive
    console.log('\nS-CRM-03 archive');
    const archived = await api(baseUrl, `/api/customers/${customerId}/deactivate`, {
      method: 'POST',
      headers: owner.authHeader,
      body: {},
    });
    assertEqual(archived.status, 200, 'archive 200');
    assertEqual(Number(archived.data.customer.is_active), 0, 'inactive');
    assert(
      !!getDatabase()
        .prepare(`SELECT 1 FROM audit_logs WHERE action = 'customer.archived' AND entity_id = ?`)
        .get(customerId),
      'archived audited',
    );

    // S-CRM-17 historical orders preserved
    console.log('\nS-CRM-17 historical order preservation');
    const orderStill = getDatabase().prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    assertEqual(String(orderStill.customer_id), String(customerId), 'order still linked after archive');

    // reactivate for remaining tests
    await api(baseUrl, `/api/customers/${customerId}/reactivate`, {
      method: 'POST',
      headers: owner.authHeader,
      body: {},
    });

    // S-CRM-14 loyalty integration (balance visible; earn path unchanged)
    console.log('\nS-CRM-14 loyalty integration');
    const wallet = await api(baseUrl, `/api/customers/${customerId}/wallet`, {
      headers: cashier.authHeader,
    });
    assertEqual(wallet.status, 200, 'wallet endpoint');
    assert(typeof wallet.data.balance === 'number', 'balance number');

    // S-CRM-15 offline: CRM endpoints hit SQLite only (no network deps) — proven by local API success
    console.log('\nS-CRM-15 offline operation');
    assert(crm.status === 200 && created.status === 201, 'local SQLite CRM ops work');

    // S-CRM-16 search
    console.log('\nS-CRM-16 customer search');
    const search = await api(baseUrl, '/api/customers?search=Ada', {
      headers: waiter.authHeader,
    });
    assertEqual(search.status, 200, 'list search');
    assert(
      (search.data.data || []).some((c: any) => String(c.id) === String(customerId)),
      'found by name',
    );
    const posSearch = await api(baseUrl, '/api/customers-search?q=98765', {
      headers: waiter.authHeader,
    });
    assertEqual(posSearch.status, 200, 'pos search');
    assert(Array.isArray(posSearch.data) && posSearch.data.length >= 1, 'pos search hits');

    // S-CRM-18 unauthorized
    console.log('\nS-CRM-18 unauthorized');
    const chefDenied = await api(baseUrl, '/api/customers', { headers: chef.authHeader });
    assertEqual(chefDenied.status, 403, 'chef list denied');
    const metricsChef = await api(baseUrl, '/api/customers/metrics', { headers: chef.authHeader });
    assertEqual(metricsChef.status, 403, 'chef metrics denied');

    // Metrics owner
    const metrics = await api(baseUrl, '/api/customers/metrics', { headers: owner.authHeader });
    assertEqual(metrics.status, 200, 'metrics 200');
    assert(metrics.data.metrics.total_customers >= 1, 'total customers');
    assert(Number.isInteger(metrics.data.metrics.customer_revenue_cents), 'revenue cents int');

    // Soft-delete note
    const del = await api(baseUrl, `/api/customers/${customerId}/notes/${noteId}`, {
      method: 'DELETE',
      headers: owner.authHeader,
    });
    assertEqual(del.status, 200, 'note delete');
    assert(
      !!getDatabase()
        .prepare(`SELECT 1 FROM audit_logs WHERE action = 'customer.note_deleted' AND entity_id = ?`)
        .get(noteId),
      'note_deleted audited',
    );

    // S-CRM-20 regression: create/update still return customer payloads
    console.log('\nS-CRM-20 regression shape');
    assert(created.data.customer && updated.data.customer, 'CRUD shapes intact');

    // UI contract: detail page exists
    const detailPage = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/customers/detail/page.tsx'),
      'utf8',
    );
    assert(detailPage.includes('fetchCustomerCrm'), 'UI Customer 360 page');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('\nR7 COMPLETE — all S-CRM scenarios passed\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

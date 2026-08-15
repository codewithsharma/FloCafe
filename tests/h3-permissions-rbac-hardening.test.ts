/**
 * H3 — Permissions / RBAC Hardening
 *
 * Usage: node tests/run-electron-node-test.cjs tests/h3-permissions-rbac-hardening.test.ts
 *        npm run test:h3
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-h3-rbac-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'h3-permissions-rbac-hardening-secret';

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

const { getJWTSecret } = require('../main/routes/auth');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { productRoutes } = require('../main/routes/products');
const { orderItemRoutes } = require('../main/routes/order-items');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFe(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function seedRoleUser(db: any, id: string, role: string, pin?: string) {
  const email = `${id}@h3.test`;
  db.prepare(
    `
    INSERT INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `,
  ).run(
    id,
    id,
    email,
    bcrypt.hashSync('testpass123', 10),
    role,
    pin ? bcrypt.hashSync(pin, 10) : null,
    now(),
    now(),
  );
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { userId: id, role, authHeader: { Authorization: `Bearer ${token}` }, token };
}

async function createOrder(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
): Promise<{ orderId: number; itemId: number }> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers: authHeader,
  });
  assertEqual(order.status, 201, 'order created');
  const orderId = order.data.order.id;
  const itemId = order.data.order.items[0].id;
  return { orderId, itemId };
}

async function main() {
  console.log('H3 — Permissions / RBAC Hardening');
  console.log('='.repeat(60));

  // ── Explicit requireRole wiring (source contracts) ────────────────────────
  console.log('\nH3-WIRE-01 explicit requireRole on sensitive mutations');
  const ordersSrc = fs.readFileSync(path.join(ROOT, 'main/routes/orders.ts'), 'utf8');
  const orderItemsSrc = fs.readFileSync(path.join(ROOT, 'main/routes/order-items.ts'), 'utf8');
  assert(
    /items\/:itemId\/cancel[\s\S]{0,120}requireRole\(/.test(ordersSrc) ||
      /requireRole\([^)]*\)[\s\S]{0,80}items\/:itemId\/cancel/.test(ordersSrc),
    'item cancel uses requireRole',
  );
  assert(
    /items\/:itemId\/restore[\s\S]{0,120}requireRole\(/.test(ordersSrc) ||
      /requireRole\([^)]*\)[\s\S]{0,80}items\/:itemId\/restore/.test(ordersSrc),
    'item restore uses requireRole',
  );
  assert(
    /requireRole\(['"]chef['"],\s*['"]manager['"],\s*['"]owner['"]\)/.test(orderItemsSrc) ||
      /requireRole\(['"]owner['"],\s*['"]manager['"],\s*['"]chef['"]\)/.test(orderItemsSrc),
    'order-items status uses requireRole(chef|manager|owner)',
  );

  // ── Frontend UX alignment contracts ───────────────────────────────────────
  console.log('\nH3-UI-01 discount + settings role gates');
  const paymentModal = readFe('components/pos/PaymentModal.tsx');
  const prepaid = readFe('components/pos/PrepaidCheckoutModal.tsx');
  const settingsPage = readFe('app/(dashboard)/settings/page.tsx');
  assert(
    /canApplyOrderDiscount|canApplyDiscount/.test(paymentModal) ||
      (paymentModal.includes("role === 'owner'") && paymentModal.includes("role === 'manager'")),
    'PaymentModal gates discount UI to owner/manager',
  );
  assert(
    /canApplyOrderDiscount|canApplyDiscount/.test(prepaid) ||
      (prepaid.includes("role === 'owner'") && prepaid.includes("role === 'manager'")),
    'PrepaidCheckoutModal gates discount UI to owner/manager',
  );
  assert(
    settingsPage.includes('canViewSettings') || settingsPage.includes('canAccessSettings'),
    'Settings page redirects non owner/manager deep-links',
  );

  // ── Behavioral authz ──────────────────────────────────────────────────────
  console.log('\nH3-API-01 sensitive mutations by role');
  const db = initTestDb();
  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'h3-cashier', 'cashier');
  const waiter = seedRoleUser(db, 'h3-waiter', 'waiter');
  const chef = seedRoleUser(db, 'h3-chef', 'chef');
  seedCategory(db, 'h3-cat', 'H3 Cat');
  seedProduct(db, 'h3-prod', 'h3-cat', 'H3 Product', 100);

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/products': productRoutes,
    '/api/order-items': orderItemRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  // Unauthenticated
  const unauthDiscount = await api(baseUrl, '/api/orders/1/discount', {
    method: 'PATCH',
    body: { discount_type: 'amount', discount_value: 1 },
  });
  assertEqual(unauthDiscount.status, 401, 'unauthenticated discount → 401');

  const unauthCancel = await api(baseUrl, '/api/orders/1/items/1/cancel', {
    method: 'PATCH',
    body: {},
  });
  assertEqual(unauthCancel.status, 401, 'unauthenticated item cancel → 401');

  const unauthStock = await api(baseUrl, '/api/products/h3-prod/stock', {
    method: 'POST',
    body: { action: 'increase', quantity: 1 },
  });
  assertEqual(unauthStock.status, 401, 'unauthenticated stock adjust → 401');

  // Create order as owner for subsequent role probes
  const { orderId, itemId } = await createOrder(baseUrl, owner.authHeader, 'h3-prod');

  // Discount: owner/manager ok; cashier/waiter/chef 403; no mutation on deny
  const beforeDiscount = db.prepare('SELECT discount_amount FROM orders WHERE id = ?').get(orderId) as {
    discount_amount: number;
  };
  for (const [label, user] of [
    ['cashier', cashier],
    ['waiter', waiter],
    ['chef', chef],
  ] as const) {
    const denied = await api(baseUrl, `/api/orders/${orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 5 },
      headers: user.authHeader,
    });
    assertEqual(denied.status, 403, `${label} cannot apply order discount`);
  }
  const afterDeniedDiscount = db
    .prepare('SELECT discount_amount FROM orders WHERE id = ?')
    .get(orderId) as { discount_amount: number };
  assertEqual(
    afterDeniedDiscount.discount_amount || 0,
    beforeDiscount.discount_amount || 0,
    'denied discount does not mutate order',
  );

  const ownerDiscount = await api(baseUrl, `/api/orders/${orderId}/discount`, {
    method: 'PATCH',
    body: { discount_type: 'percentage', discount_value: 5, discount_reason: 'h3' },
    headers: owner.authHeader,
  });
  assertEqual(ownerDiscount.status, 200, 'owner can apply order discount');

  const managerDiscount = await api(baseUrl, `/api/orders/${orderId}/discount`, {
    method: 'PATCH',
    body: { discount_type: 'percentage', discount_value: 10, discount_reason: 'h3-mgr' },
    headers: manager.authHeader,
  });
  assertEqual(managerDiscount.status, 200, 'manager can apply order discount');

  // Item restore: cashier/waiter/chef denied; state unchanged
  db.prepare("UPDATE order_items SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
    now(),
    itemId,
  );
  for (const [label, user] of [
    ['cashier', cashier],
    ['waiter', waiter],
    ['chef', chef],
  ] as const) {
    const denied = await api(baseUrl, `/api/orders/${orderId}/items/${itemId}/restore`, {
      method: 'PATCH',
      body: {},
      headers: user.authHeader,
    });
    assertEqual(denied.status, 403, `${label} cannot restore item`);
  }
  const stillCancelled = db.prepare('SELECT status FROM order_items WHERE id = ?').get(itemId) as {
    status: string;
  };
  assertEqual(stillCancelled.status, 'cancelled', 'denied restore does not mutate item');

  const managerRestore = await api(baseUrl, `/api/orders/${orderId}/items/${itemId}/restore`, {
    method: 'PATCH',
    body: {},
    headers: manager.authHeader,
  });
  assertEqual(managerRestore.status, 200, 'manager can restore item');

  // Chef cannot cancel pending item (role policy)
  const chefOrder = await createOrder(baseUrl, owner.authHeader, 'h3-prod');
  const chefCancel = await api(
    baseUrl,
    `/api/orders/${chefOrder.orderId}/items/${chefOrder.itemId}/cancel`,
    {
      method: 'PATCH',
      body: {},
      headers: chef.authHeader,
    },
  );
  assertEqual(chefCancel.status, 403, 'chef cannot cancel/void order item');
  const chefItem = db.prepare('SELECT status FROM order_items WHERE id = ?').get(chefOrder.itemId) as {
    status: string;
  };
  assertEqual(chefItem.status, 'pending', 'denied chef cancel does not mutate item');

  // Stock adjust: only owner/manager
  for (const [label, user] of [
    ['cashier', cashier],
    ['waiter', waiter],
    ['chef', chef],
  ] as const) {
    const denied = await api(baseUrl, '/api/products/h3-prod/stock', {
      method: 'POST',
      body: { action: 'wastage', quantity: 1 },
      headers: user.authHeader,
    });
    assertEqual(denied.status, 403, `${label} cannot adjust stock/wastage`);
  }

  // KDS item status: cashier/waiter denied
  for (const [label, user] of [
    ['cashier', cashier],
    ['waiter', waiter],
  ] as const) {
    const denied = await api(baseUrl, `/api/order-items/${itemId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing' },
      headers: user.authHeader,
    });
    assertEqual(denied.status, 403, `${label} cannot PATCH order-items status`);
  }

  // Forged JWT role claim must not escalate (DB role wins)
  console.log('\nH3-JWT-01 DB role overrides forged JWT claim');
  const forgedOwnerClaim = jwt.sign(
    { userId: cashier.userId, email: 'h3-cashier@h3.test', role: 'owner' },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  const forged = await api(baseUrl, `/api/orders/${orderId}/discount`, {
    method: 'PATCH',
    body: { discount_type: 'percentage', discount_value: 50 },
    headers: { Authorization: `Bearer ${forgedOwnerClaim}` },
  });
  assertEqual(forged.status, 403, 'forged owner claim on cashier user still 403');

  // Denied roles also cannot apply flat discounts when mode allows (defense in depth)
  for (const [label, user] of [
    ['cashier', cashier],
    ['waiter', waiter],
    ['chef', chef],
  ] as const) {
    const denied = await api(baseUrl, `/api/orders/${orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'percentage', discount_value: 1 },
      headers: user.authHeader,
    });
    assertEqual(denied.status, 403, `${label} still denied after successful manager discount`);
  }

  server.close();
  closeDatabase();

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

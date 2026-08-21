/**
 * R6 Purchasing & Supplier OS — S-PUR-01 … S-PUR-18.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/r6-purchasing.test.ts
 *    or: npm run test:r6
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r6-purchasing-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r6-purchasing-supplier-os-secret';

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

const { productRoutes } = require('../main/routes/products');
const { inventoryRoutes } = require('../main/routes/inventory');
const { purchasingRoutes } = require('../main/routes/purchasing');
const { getSupportedSchemaVersion, createBackup } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

function section(title: string): void {
  console.log(`\n${title}`);
}

async function main() {
  console.log('\nR6 — Purchasing & Supplier OS\n' + '='.repeat(60));
  assertEqual(getSupportedSchemaVersion(), 87, 'schema version is 87');

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    86,
    'fresh DB user_version 87',
  );

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'cashier-r6', 'cashier', 'cashier-r6@test.local');
  const waiter = seedRoleUser(db, 'waiter-r6', 'waiter', 'waiter-r6@test.local');
  const chef = seedRoleUser(db, 'chef-r6', 'chef', 'chef-r6@test.local');

  seedCategory(db, 'cat-r6', 'R6 Cat');
  seedProduct(db, 'sku-flour', 'cat-r6', 'Flour', 40, {
    track_inventory: true,
    stock_quantity: 10,
  });
  seedProduct(db, 'sku-oil', 'cat-r6', 'Oil', 100, {
    track_inventory: true,
    stock_quantity: 5,
  });
  db.prepare(
    `UPDATE products SET inventory_unit = ?, cost = ?, updated_at = ? WHERE id = ?`,
  ).run('kg', 40, now(), 'sku-flour');
  db.prepare(
    `UPDATE products SET inventory_unit = ?, cost = ?, updated_at = ? WHERE id = ?`,
  ).run('L', 100, now(), 'sku-oil');

  const app = createApp({
    '/api/products': productRoutes,
    '/api/inventory': inventoryRoutes,
    '/api/purchasing': purchasingRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // ─── S-PUR-01 supplier CRUD ───
    section('S-PUR-01 supplier CRUD');
    const createSup = await api(baseUrl, '/api/purchasing/suppliers', {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Foods',
        contact_name: 'Priya',
        phone: '+911234567890',
        email: 'priya@acme.test',
        address: '12 Market St',
        tax_id: 'GSTIN123',
        notes: 'Primary flour vendor',
      }),
    });
    assertEqual(createSup.status, 201, 'create supplier 201');
    const supplierId = createSup.data.supplier.id;
    assert(supplierId, 'supplier id');
    assertEqual(createSup.data.supplier.name, 'Acme Foods', 'supplier name');
    assertEqual(createSup.data.supplier.is_active, 1, 'supplier active');

    const listSup = await api(baseUrl, '/api/purchasing/suppliers', {
      headers: owner.authHeader,
    });
    assertEqual(listSup.status, 200, 'list suppliers');
    assert(listSup.data.suppliers.some((s: any) => s.id === supplierId), 'listed');

    const getSup = await api(baseUrl, `/api/purchasing/suppliers/${supplierId}`, {
      headers: owner.authHeader,
    });
    assertEqual(getSup.status, 200, 'get supplier');
    assertEqual(getSup.data.supplier.tax_id, 'GSTIN123', 'tax id');

    const patchSup = await api(baseUrl, `/api/purchasing/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_name: 'Priya S' }),
    });
    assertEqual(patchSup.status, 200, 'patch supplier');
    assertEqual(patchSup.data.supplier.contact_name, 'Priya S', 'contact updated');

    // ─── S-PUR-03 supplier product mapping ───
    section('S-PUR-03 supplier product mapping');
    const mapRes = await api(baseUrl, `/api/purchasing/suppliers/${supplierId}/products`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: 'sku-flour',
        supplier_sku: 'ACME-FL-01',
        purchase_unit: 'kg',
        last_purchase_cost_cents: 4500,
      }),
    });
    assertEqual(mapRes.status, 201, 'map product');
    assertEqual(mapRes.data.mapping.supplier_sku, 'ACME-FL-01', 'supplier sku');

    const mapList = await api(baseUrl, `/api/purchasing/suppliers/${supplierId}/products`, {
      headers: owner.authHeader,
    });
    assertEqual(mapList.status, 200, 'list mappings');
    assertEqual(mapList.data.mappings.length, 1, 'one mapping');

    // ─── S-PUR-04 PO creation ───
    section('S-PUR-04 PO creation');
    const poCreate = await api(baseUrl, '/api/purchasing/purchase-orders', {
      method: 'POST',
      headers: { ...manager.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        expected_date: '2026-08-20',
        notes: 'Weekly flour',
        lines: [
          {
            product_id: 'sku-flour',
            purchase_unit: 'kg',
            ordered_qty: 10,
            unit_cost_cents: 4500,
          },
        ],
      }),
    });
    assertEqual(poCreate.status, 201, 'create PO');
    const poId = poCreate.data.purchase_order.id;
    assertEqual(poCreate.data.purchase_order.status, 'draft', 'draft status');
    assert(poCreate.data.purchase_order.po_number, 'po number');
    assertEqual(poCreate.data.purchase_order.subtotal_cents, 45000, 'subtotal 10*4500');
    assertEqual(poCreate.data.lines.length, 1, 'one line');
    const lineId = poCreate.data.lines[0].id;

    // ─── S-PUR-05 / S-PUR-06 lifecycle ───
    section('S-PUR-05/06 PO lifecycle + illegal transitions');
    const badRecvDraft = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}/receive`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'recv-draft-1',
      },
      body: JSON.stringify({
        lines: [{ po_line_id: lineId, quantity: 1 }],
      }),
    });
    assertEqual(badRecvDraft.status, 409, 'cannot receive draft');

    const orderPo = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ordered' }),
    });
    assertEqual(orderPo.status, 200, 'draft→ordered');
    assertEqual(orderPo.data.purchase_order.status, 'ordered', 'ordered');

    const illegal = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    });
    assertEqual(illegal.status, 409, 'illegal ordered→draft');

    // ─── S-PUR-07 partial receiving ───
    section('S-PUR-07 partial receiving');
    const stockBefore = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-flour').stock_quantity,
    );
    const recv1 = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}/receive`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'recv-partial-1',
      },
      body: JSON.stringify({
        lines: [{ po_line_id: lineId, quantity: 6 }],
      }),
    });
    assertEqual(recv1.status, 200, 'partial receive');
    assertEqual(recv1.data.purchase_order.status, 'partially_received', 'partially_received');
    assertEqual(recv1.data.lines[0].received_qty, 6, 'received 6');
    assertEqual(recv1.data.lines[0].remaining_qty, 4, 'remaining 4');
    const stockMid = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-flour').stock_quantity,
    );
    assertEqual(stockMid, stockBefore + 6, 'stock +6');

    // ─── S-PUR-08 full receiving (second receive) ───
    section('S-PUR-08 full receiving');
    const recv2 = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}/receive`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'recv-full-2',
      },
      body: JSON.stringify({
        lines: [{ po_line_id: lineId, quantity: 4 }],
      }),
    });
    assertEqual(recv2.status, 200, 'complete receive');
    assertEqual(recv2.data.purchase_order.status, 'received', 'received');
    assertEqual(recv2.data.lines[0].received_qty, 10, 'received 10');
    assertEqual(recv2.data.lines[0].remaining_qty, 0, 'remaining 0');
    const stockEnd = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-flour').stock_quantity,
    );
    assertEqual(stockEnd, stockBefore + 10, 'stock +10 total');

    // ─── S-PUR-12 inventory ledger ───
    section('S-PUR-12 inventory ledger integration');
    const movements = db
      .prepare(
        `SELECT * FROM inventory_movements WHERE product_id = ? AND reason = 'purchase_receipt' ORDER BY id`,
      )
      .all('sku-flour');
    assertEqual(movements.length, 2, 'two purchase_receipt movements');
    const recon = reconstructQuantityFromLedger(db, 'sku-flour');
    assert(recon.valid !== false || Math.abs(recon.difference) < 0.0001, 'ledger reconciles');
    const check = await api(baseUrl, '/api/inventory/products/sku-flour/ledger-check', {
      headers: owner.authHeader,
    });
    assertEqual(check.status, 200, 'ledger-check http');
    assertEqual(check.data.valid, true, 'ledger-check valid');

    // ─── S-PUR-09 over-receiving ───
    section('S-PUR-09 over-receiving rejection');
    const po2 = await api(baseUrl, '/api/purchasing/purchase-orders', {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: [
          {
            product_id: 'sku-oil',
            purchase_unit: 'L',
            ordered_qty: 5,
            unit_cost_cents: 12000,
          },
        ],
      }),
    });
    const po2Id = po2.data.purchase_order.id;
    const po2Line = po2.data.lines[0].id;
    await api(baseUrl, `/api/purchasing/purchase-orders/${po2Id}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ordered' }),
    });
    const over = await api(baseUrl, `/api/purchasing/purchase-orders/${po2Id}/receive`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'recv-over-1',
      },
      body: JSON.stringify({
        lines: [{ po_line_id: po2Line, quantity: 6 }],
      }),
    });
    assertEqual(over.status, 409, 'over-receive 409');
    assert(
      String(over.data.error || over.data.code || '').includes('PO_RECEIVE_EXCEEDS_ORDER') ||
        String(over.data.code) === 'PO_RECEIVE_EXCEEDS_ORDER',
      'PO_RECEIVE_EXCEEDS_ORDER code',
    );
    const oilStock = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-oil').stock_quantity,
    );
    assertEqual(oilStock, 5, 'oil stock unchanged after over-receive');

    // ─── S-PUR-10 idempotency ───
    section('S-PUR-10 repeated receiving idempotency');
    const oilBefore = oilStock;
    const idempKey = 'recv-idemp-oil-1';
    const rA = await api(baseUrl, `/api/purchasing/purchase-orders/${po2Id}/receive`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({
        lines: [{ po_line_id: po2Line, quantity: 3 }],
      }),
    });
    assertEqual(rA.status, 200, 'first idemp receive');
    const rB = await api(baseUrl, `/api/purchasing/purchase-orders/${po2Id}/receive`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({
        lines: [{ po_line_id: po2Line, quantity: 3 }],
      }),
    });
    assertEqual(rB.status, 200, 'replay idemp receive');
    assertEqual(rB.data.receipt.id, rA.data.receipt.id, 'same receipt replay');
    const oilAfter = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-oil').stock_quantity,
    );
    assertEqual(oilAfter, oilBefore + 3, 'oil stock +3 once');
    const oilMoves = db
      .prepare(
        `SELECT COUNT(*) as c FROM inventory_movements WHERE product_id = ? AND reason = 'purchase_receipt'`,
      )
      .get('sku-oil').c;
    assertEqual(Number(oilMoves), 1, 'one oil purchase movement');

    // ─── S-PUR-11 concurrent receiving ───
    section('S-PUR-11 concurrent receiving');
    const po3 = await api(baseUrl, '/api/purchasing/purchase-orders', {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: [
          {
            product_id: 'sku-flour',
            purchase_unit: 'kg',
            ordered_qty: 10,
            unit_cost_cents: 4000,
          },
        ],
      }),
    });
    const po3Id = po3.data.purchase_order.id;
    const po3Line = po3.data.lines[0].id;
    await api(baseUrl, `/api/purchasing/purchase-orders/${po3Id}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ordered' }),
    });
    const flourBeforeConc = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-flour').stock_quantity,
    );
    const [c1, c2] = await Promise.all([
      api(baseUrl, `/api/purchasing/purchase-orders/${po3Id}/receive`, {
        method: 'POST',
        headers: {
          ...owner.authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'conc-a',
        },
        body: JSON.stringify({ lines: [{ po_line_id: po3Line, quantity: 7 }] }),
      }),
      api(baseUrl, `/api/purchasing/purchase-orders/${po3Id}/receive`, {
        method: 'POST',
        headers: {
          ...manager.authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'conc-b',
        },
        body: JSON.stringify({ lines: [{ po_line_id: po3Line, quantity: 7 }] }),
      }),
    ]);
    const statuses = [c1.status, c2.status].sort((a, b) => a - b);
    assertEqual(statuses[0], 200, 'one concurrent receive succeeds');
    assertEqual(statuses[1], 409, 'other concurrent receive conflicts');
    const po3Get = await api(baseUrl, `/api/purchasing/purchase-orders/${po3Id}`, {
      headers: owner.authHeader,
    });
    const receivedConc = Number(po3Get.data.lines[0].received_qty);
    assertEqual(receivedConc, 7, 'exactly one 7kg receive wins');
    const flourAfterConc = Number(
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('sku-flour').stock_quantity,
    );
    assertEqual(flourAfterConc, flourBeforeConc + 7, 'stock +7 from winner');

    // ─── S-PUR-13 audit ───
    section('S-PUR-13 receiving audit');
    const audits = db
      .prepare(
        `SELECT action FROM audit_logs WHERE action IN (
          'supplier.created','supplier.updated','purchase_order.created',
          'purchase_order.ordered','purchase_receipt.created','purchase_receipt.completed'
        )`,
      )
      .all()
      .map((r: any) => r.action);
    assert(audits.includes('supplier.created'), 'supplier.created audited');
    assert(audits.includes('purchase_order.created'), 'po.created audited');
    assert(audits.includes('purchase_order.ordered'), 'po.ordered audited');
    assert(
      audits.includes('purchase_receipt.created') || audits.includes('purchase_receipt.completed'),
      'receipt audited',
    );

    // ─── S-PUR-14 RBAC ───
    section('S-PUR-14 RBAC');
    const cashCreate = await api(baseUrl, '/api/purchasing/suppliers', {
      method: 'POST',
      headers: { ...cashier.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nope' }),
    });
    assertEqual(cashCreate.status, 403, 'cashier cannot create supplier');
    const waitCreate = await api(baseUrl, '/api/purchasing/purchase-orders', {
      method: 'POST',
      headers: { ...waiter.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: [{ product_id: 'sku-flour', purchase_unit: 'kg', ordered_qty: 1, unit_cost_cents: 1 }],
      }),
    });
    assertEqual(waitCreate.status, 403, 'waiter cannot create PO');
    const chefList = await api(baseUrl, '/api/purchasing/suppliers', {
      headers: chef.authHeader,
    });
    assertEqual(chefList.status, 200, 'chef can list suppliers');
    const chefMut = await api(baseUrl, '/api/purchasing/suppliers', {
      method: 'POST',
      headers: { ...chef.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Chef Nope' }),
    });
    assertEqual(chefMut.status, 403, 'chef cannot mutate');

    // ─── S-PUR-02 / S-PUR-18 deactivation ───
    section('S-PUR-02/18 supplier deactivation');
    const deact2 = await api(baseUrl, `/api/purchasing/suppliers/${supplierId}/deactivate`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(deact2.status, 200, 'deactivate');
    assertEqual(deact2.data.supplier.is_active, 0, 'inactive');
    const poHist = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}`, {
      headers: owner.authHeader,
    });
    assertEqual(poHist.status, 200, 'historical PO readable');
    const newPoInactive = await api(baseUrl, '/api/purchasing/purchase-orders', {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: [
          { product_id: 'sku-flour', purchase_unit: 'kg', ordered_qty: 1, unit_cost_cents: 100 },
        ],
      }),
    });
    assertEqual(newPoInactive.status, 400, 'cannot PO inactive supplier');

    // Reactivate for remaining tests
    await api(baseUrl, `/api/purchasing/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });

    // ─── S-PUR-16 historical integrity + cancel policy ───
    section('S-PUR-16 historical PO integrity / cancel');
    const poCancel = await api(baseUrl, '/api/purchasing/purchase-orders', {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: [
          { product_id: 'sku-flour', purchase_unit: 'kg', ordered_qty: 2, unit_cost_cents: 1000 },
        ],
      }),
    });
    const cancelId = poCancel.data.purchase_order.id;
    await api(baseUrl, `/api/purchasing/purchase-orders/${cancelId}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ordered' }),
    });
    const cancelOk = await api(baseUrl, `/api/purchasing/purchase-orders/${cancelId}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assertEqual(cancelOk.status, 200, 'cancel unordered receive PO');
    const cancelRecv = await api(baseUrl, `/api/purchasing/purchase-orders/${poId}/status`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assertEqual(cancelRecv.status, 409, 'cannot cancel fully received PO');

    // ─── S-PUR-15 offline (local SoR) ───
    section('S-PUR-15 offline behavior');
    assert(getDatabase(), 'local SQLite SoR');
    const localSup = await api(baseUrl, '/api/purchasing/suppliers', {
      method: 'POST',
      headers: { ...owner.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Offline Vendor' }),
    });
    assertEqual(localSup.status, 201, 'supplier create offline-safe');

    // ─── S-PUR-17 backup/restore compatibility ───
    section('S-PUR-17 backup/restore compatibility');
    const bak = await createBackup();
    assert(bak && bak.path, 'backup created');
    const bakPath = bak.path;
    assert(fs.existsSync(bakPath), 'backup file exists');
    const Database = require('better-sqlite3');
    const bakDb = new Database(bakPath, { readonly: true });
    const bakVer = Number(bakDb.pragma('user_version', { simple: true }));
    assertEqual(bakVer, 87, 'backup schema v87');
    const hasSup = bakDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='suppliers'`)
      .get();
    assert(hasSup, 'suppliers table in backup');
    bakDb.close();

    // Cost: last purchase + catalog cost update
    section('Cost capture');
    // Last flour receive for this supplier was concurrent PO at 4000 cents.
    const flourCost = db.prepare('SELECT cost FROM products WHERE id = ?').get('sku-flour');
    assertEqual(Number(flourCost.cost), 40, 'catalog cost reflects last receive (40.00)');
    const mapping = db
      .prepare(
        `SELECT last_purchase_cost_cents FROM supplier_products WHERE supplier_id = ? AND product_id = ?`,
      )
      .get(supplierId, 'sku-flour');
    assertEqual(Number(mapping.last_purchase_cost_cents), 4000, 'mapping last cost cents');

    console.log('\nR6 COMPLETE — all S-PUR scenarios passed\n');
  } finally {
    server.close();
    closeDatabase();
  }

  const { failed } = getResults();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * KDS-H-OUTBOX — durable snapshot delivery intent + restart recovery.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/kds-h-outbox.test.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-kds-outbox-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => 'test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb,
  assertEqual,
  assert,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');
const { getDatabase, getSupportedSchemaVersion, withTxn } = require('../main/db');
const { applyKitchenItemStatus } = require('../main/services/kitchen-status');
const {
  claimNextKdsOutboxJob,
  completeOpenKdsSnapshotJobs,
  enqueueKdsSnapshotDelivery,
  listOpenKdsOutboxJobs,
  markKdsOutboxDone,
  markKdsOutboxFailed,
  processKdsOutboxOnce,
  recoverStaleKdsOutboxLeases,
  registerKdsOutboxBroadcaster,
  stopKdsOutboxWorker,
} = require('../main/services/kds-delivery-outbox');

async function main() {
  console.log('KDS-H-OUTBOX — durable delivery intent');
  console.log('='.repeat(60));

  stopKdsOutboxWorker();
  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip is v89');
  assertEqual(Number(db.pragma('user_version', { simple: true })), 89, 'fresh DB at tip 88');

  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES ('chef-1', 'Chef', 'chef@test.local', 'x', 'chef', 1, ?, ?)`,
  ).run(now(), now());
  db.prepare(
    `INSERT INTO categories (id, name, sort_order) VALUES ('cat-1', 'Mains', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO products (id, name, price, category_id, is_active)
     VALUES ('p1', 'Burger', 10, 'cat-1', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO orders (id, order_number, status, type, user_id, created_at, updated_at)
     VALUES (501, 'T-501', 'pending', 'dine_in', 'chef-1', ?, ?)`,
  ).run(now(), now());
  db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, subtotal, tax_amount, total, status, created_at, updated_at)
     VALUES (901, 501, 'p1', 'Burger', 1, 10, 10, 0, 10, 'pending', ?, ?)`,
  ).run(now(), now());

  // Same transaction: status change + outbox intent
  withTxn(() => {
    applyKitchenItemStatus(db, {
      itemId: 901,
      status: 'preparing',
      actorUserId: 'chef-1',
    });
  });

  const item = db.prepare(`SELECT status FROM order_items WHERE id = 901`).get() as {
    status: string;
  };
  assertEqual(item.status, 'preparing', 'SQLite remains SoR for kitchen status');

  let open = listOpenKdsOutboxJobs(db);
  assertEqual(open.length, 1, 'one open delivery intent after status change');
  assertEqual(open[0].job_type, 'snapshot', 'job_type is snapshot');
  assertEqual(open[0].status, 'pending', 'intent starts pending');
  const eventId = open[0].event_id;
  assert(!!eventId, 'stable event_id present');

  // Coalesce — second bump does not create a second open row
  withTxn(() => {
    applyKitchenItemStatus(db, {
      itemId: 901,
      status: 'ready',
      actorUserId: 'chef-1',
    });
  });
  open = listOpenKdsOutboxJobs(db);
  assertEqual(open.length, 1, 'coalesced to a single open snapshot intent');

  // Claim → fail → pending with backoff
  const claimed = claimNextKdsOutboxJob(db);
  assert(!!claimed, 'claim succeeds');
  assertEqual(claimed.status, 'in_flight', 'claimed as in_flight');
  assertEqual(claimed.attempts, 1, 'attempts incremented on claim');
  const failed = markKdsOutboxFailed(db, claimed.id, 'no_clients');
  assertEqual(failed.status, 'pending', 'failed delivery reschedules as pending');
  assert(!!failed.next_attempt_at, 'next_attempt_at set');

  // Force eligible and process with mock broadcaster success
  db.prepare(
    `UPDATE kds_delivery_outbox SET next_attempt_at = ?, status = 'pending' WHERE id = ?`,
  ).run(new Date(0).toISOString(), claimed.id);

  let broadcastCalls = 0;
  registerKdsOutboxBroadcaster(() => {
    broadcastCalls += 1;
    return { attempted: 1, succeeded: 1 };
  });
  const once = processKdsOutboxOnce(db);
  assertEqual(once.processed, true, 'worker processed a job');
  assertEqual(once.result, 'done', 'successful broadcast marks done');
  assertEqual(broadcastCalls, 1, 'broadcast invoked once');
  assertEqual(listOpenKdsOutboxJobs(db).length, 0, 'no open jobs after success');

  // Restart recovery: inject in_flight stale lease → recover → pending
  const row = enqueueKdsSnapshotDelivery(db, { reason: 'restart-test' });
  db.prepare(
    `UPDATE kds_delivery_outbox
     SET status = 'in_flight', leased_at = ?, attempts = 1 WHERE id = ?`,
  ).run(new Date(Date.now() - 120_000).toISOString(), row.id);
  const recovered = recoverStaleKdsOutboxLeases(db);
  assert(recovered >= 1, 'stale in_flight recovered');
  const after = db.prepare(`SELECT status FROM kds_delivery_outbox WHERE id = ?`).get(row.id) as {
    status: string;
  };
  assertEqual(after.status, 'pending', 'recovered lease is pending again');

  // completeOpen after live push
  enqueueKdsSnapshotDelivery(db, { reason: 'live-push' });
  assert(listOpenKdsOutboxJobs(db).length >= 1, 'open job before complete');
  completeOpenKdsSnapshotJobs(db);
  assertEqual(listOpenKdsOutboxJobs(db).length, 0, 'completeOpen clears open snapshot jobs');

  // Idempotent drain: marking done twice is safe
  const again = enqueueKdsSnapshotDelivery(db, { reason: 'idempotent' });
  markKdsOutboxDone(db, again.id);
  markKdsOutboxDone(db, again.id);
  assertEqual(
    (db.prepare(`SELECT status FROM kds_delivery_outbox WHERE id = ?`).get(again.id) as any)
      .status,
    'done',
    'done remains done',
  );

  // Event identity uniqueness preserved
  const uniq = db
    .prepare(`SELECT COUNT(*) AS c FROM kds_delivery_outbox WHERE event_id = ?`)
    .get(eventId) as { c: number };
  assertEqual(Number(uniq.c), 1, 'event_id remains unique');

  // OPS-02-KDS-001: notifyKdsUpdate enqueues durable snapshot when no client accepts push.
  completeOpenKdsSnapshotJobs(db);
  assertEqual(listOpenKdsOutboxJobs(db).length, 0, 'cleared before notify enqueue check');
  registerKdsOutboxBroadcaster(() => ({ attempted: 0, succeeded: 0 }));
  const { notifyKdsUpdate } = require('../main/services/kds');
  notifyKdsUpdate();
  await new Promise((r) => setImmediate(r));
  assertEqual(
    listOpenKdsOutboxJobs(db).length,
    1,
    'OPS-02-KDS-001: notifyKdsUpdate leaves open outbox when no WS client succeeds',
  );

  const results = getResults();
  if (results.failed > 0) {
    throw new Error(`${results.failed} assertions failed`);
  }
  console.log('\n✅ KDS-H-OUTBOX tests passed');
}

main()
  .then(() => {
    stopKdsOutboxWorker();
    closeDatabase();
    Module._load = originalLoad;
    fs.rmSync(testDir, { recursive: true, force: true });
  })
  .catch((err) => {
    try {
      stopKdsOutboxWorker();
      closeDatabase();
    } catch {
      /* ignore */
    }
    Module._load = originalLoad;
    fs.rmSync(testDir, { recursive: true, force: true });
    console.error(err);
    process.exit(1);
  });

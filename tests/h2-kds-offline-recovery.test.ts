/**
 * H2 — KDS Offline / Recovery Hardening
 *
 * Usage: node tests/run-electron-node-test.cjs tests/h2-kds-offline-recovery.test.ts
 *        npm run test:h2
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-h2-kds-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'h2-kds-offline-recovery-secret';
process.env.KDS_PORT = '19150';

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
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { kdsInfoRoutes } = require('../main/routes/kds-info');
const { startKdsServer, stopKdsServer, isKdsServerRunning, getKdsPort } = require('../main/kds-server');
const { requireRole } = require('../main/middleware/security');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFe(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

async function main() {
  console.log('H2 — KDS Offline / Recovery Hardening');
  console.log('='.repeat(60));

  // ── Pure advertise helpers ────────────────────────────────────────────────
  console.log('\nH2-ADV-01 advertise helpers');
  assertEqual(
    shouldAdvertiseLanKds({ networkMode: 'kds_lan', kdsCompanionRunning: false }),
    false,
    'do not advertise LAN KDS when companion stopped',
  );
  assertEqual(
    shouldAdvertiseLanKds({ networkMode: 'kds_lan', kdsCompanionRunning: true }),
    true,
    'advertise LAN KDS when companion running in kds_lan',
  );
  assertEqual(
    shouldAdvertiseLanKds({ networkMode: 'localhost', kdsCompanionRunning: true }),
    false,
    'localhost never advertises LAN KDS',
  );
  assertEqual(
    shouldPublishMdns({ networkMode: 'kds_lan', kdsCompanionRunning: false }),
    false,
    'skip mDNS in kds_lan when companion stopped',
  );
  assertEqual(
    shouldPublishMdns({ networkMode: 'lan', kdsCompanionRunning: false }),
    true,
    'lan mode still publishes mDNS for POS even if KDS stopped',
  );
  assertEqual(
    mdnsTxtKdsFields({ kdsCompanionRunning: false, kdsPort: 3002 }),
    null,
    'mDNS txt omits kds fields when stopped',
  );
  const txt = mdnsTxtKdsFields({ kdsCompanionRunning: true, kdsPort: 3002 });
  assert(!!txt && txt.kds_port === '3002', 'mDNS txt includes kds_port when running');

  // ── kds-info when companion not running ───────────────────────────────────
  console.log('\nH2-ADV-02 kds-info 503 when companion not running');
  const db = initTestDb();
  const owner = seedOwnerUser(db);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('network_mode', 'kds_lan', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('kds_enabled', 'true', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  stopKdsServer();
  assertEqual(isKdsServerRunning(), false, 'companion not running before info call');

  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = { userId: owner.userId, email: 'owner@test.local', role: 'owner' };
    next();
  });
  app.use('/api/kds-info', requireRole('owner', 'manager', 'cashier', 'waiter', 'chef'), kdsInfoRoutes);

  const { baseUrl, server } = await startServer(app);
  const stopped = await api(baseUrl, '/api/kds-info', { headers: owner.authHeader });
  assertEqual(stopped.status, 503, 'kds-info 503 when companion stopped');
  assertEqual(stopped.data.code, 'KDS_SERVER_NOT_RUNNING', 'code KDS_SERVER_NOT_RUNNING');
  assertEqual(stopped.data.kds_server_running, false, 'kds_server_running false');

  // ── kds-info when companion running ───────────────────────────────────────
  console.log('\nH2-ADV-03 kds-info 200 when companion running');
  await startKdsServer();
  assertEqual(isKdsServerRunning(), true, 'companion running');
  const running = await api(baseUrl, '/api/kds-info', { headers: owner.authHeader });
  assertEqual(running.status, 200, 'kds-info 200 when companion running');
  assert(String(running.data.ip_url || '').includes(`:${getKdsPort()}`), 'ip_url uses live KDS port');
  assertEqual(running.data.kds_server_running, true, 'kds_server_running true');

  stopKdsServer();
  server.close();

  // ── Notify coalesce + cancelled exclusion (source contracts) ───────────────
  console.log('\nH2-NOTIFY-01 coalesce and cancel exclusion');
  const kdsSvc = fs.readFileSync(path.join(ROOT, 'main/services/kds.ts'), 'utf8');
  assert(kdsSvc.includes('broadcastQueued'), 'notify coalesces via broadcastQueued');
  assert(kdsSvc.includes('queueMicrotask'), 'notify uses microtask coalesce');
  assert(
    /status NOT IN \('completed', 'cancelled'\)/.test(kdsSvc) ||
      kdsSvc.includes("NOT IN ('completed', 'cancelled')"),
    'active orders exclude cancelled',
  );

  // ── Frontend stale + reconnect retry contracts ────────────────────────────
  console.log('\nH2-UI-01 stale board + reconnect retry');
  const hook = readFe('hooks/useKdsConnection.ts');
  const header = readFe('components/kds/KdsHeader.tsx');
  const workspace = readFe('components/kds/KdsWorkspace.tsx');
  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert(hook.includes('dataStale'), 'useKdsConnection exposes dataStale');
  assert(
    hook.includes('pendingRetriesRef') || hook.includes('pendingRetryRef'),
    'reconnect retries failed status (per-item queue)',
  );
  assert(hook.includes('flushPendingStatusRetry'), 'reconnect flushes pending status retry');
  assert(hook.includes('MAX_PENDING_STATUS_RETRY_ATTEMPTS'), 'silent retry attempt cap');
  assert(header.includes('dataStale'), 'KdsHeader receives dataStale');
  assert(header.includes('kds.connectionStale'), 'KdsHeader shows stale label');
  assert(workspace.includes('dataStale'), 'KdsWorkspace passes dataStale');
  assert(en.includes('kds.connectionStale') || en.includes('"kds.connectionStale"'), 'i18n has stale label');

  // ── Lifecycle integrity contracts (existing SoR + CAS) ────────────────────
  console.log('\nH2-LIFE-01 order lifecycle integrity contracts');
  const kitchenSrc = fs.readFileSync(path.join(ROOT, 'main/routes/kitchen.ts'), 'utf8');
  const kdsRoutesSrc = fs.readFileSync(path.join(ROOT, 'main/routes/kds.ts'), 'utf8');
  assert(
    kitchenSrc.includes('expected_status') || kdsRoutesSrc.includes('expected_status'),
    'status updates support expected_status CAS',
  );
  assert(kdsSvc.includes('notifyKdsUpdate'), 'order path notifies KDS via notifyKdsUpdate');
  assert(
    /409/.test(kitchenSrc) || /409/.test(kdsRoutesSrc) || kdsRoutesSrc.includes('CONFLICT'),
    'CAS conflict surfaces as conflict response',
  );

  // Wire helpers into production advertise paths
  console.log('\nH2-WIRE-01 production uses kds-recovery helpers');
  const kdsInfoSrc = fs.readFileSync(path.join(ROOT, 'main/routes/kds-info.ts'), 'utf8');
  const indexSrc = fs.readFileSync(path.join(ROOT, 'main/index.ts'), 'utf8');
  assert(kdsInfoSrc.includes('isKdsServerRunning'), 'kds-info checks isKdsServerRunning');
  assert(kdsInfoSrc.includes('KDS_SERVER_NOT_RUNNING'), 'kds-info returns KDS_SERVER_NOT_RUNNING');
  assert(
    indexSrc.includes('shouldPublishMdns') || indexSrc.includes('mdnsTxtKdsFields'),
    'main index uses recovery advertise helpers',
  );

  // ── Recovery: restart companion → advertise again ─────────────────────────
  console.log('\nH2-REC-01 companion restart restores advertise');
  const db2 = initTestDb();
  const owner2 = seedOwnerUser(db2);
  db2.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('network_mode', 'kds_lan', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());
  db2.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('kds_enabled', 'true', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());
  stopKdsServer();
  const app2 = express();
  app2.use(express.json());
  app2.use((req: any, _res: any, next: any) => {
    req.user = { userId: owner2.userId, email: 'owner@test.local', role: 'owner' };
    next();
  });
  app2.use('/api/kds-info', requireRole('owner', 'manager', 'cashier', 'waiter', 'chef'), kdsInfoRoutes);
  const started2 = await startServer(app2);
  const down = await api(started2.baseUrl, '/api/kds-info', { headers: owner2.authHeader });
  assertEqual(down.status, 503, 'advertise down after companion stop');
  await startKdsServer();
  const up = await api(started2.baseUrl, '/api/kds-info', { headers: owner2.authHeader });
  assertEqual(up.status, 200, 'advertise restored after companion restart');
  stopKdsServer();
  started2.server.close();

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

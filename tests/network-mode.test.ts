/**
 * P0.1 LAN security — deployment modes (localhost | kds_lan | lan).
 * Tests listen-host policy, real bind addresses, pairing gates, mDNS policy,
 * auth retention, and intentional private-IP rate-limit behavior.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import express from 'express';
import request from 'supertest';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-network-mode-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

import {
  DEFAULT_NETWORK_MODE,
  getNetworkMode,
  isLanKdsEnabled,
  isLanPosEnabled,
  isLanServerAppEnabled,
  mdnsPrimaryPort,
  parseNetworkMode,
  resolveListenHost,
  shouldAdvertiseMdns,
} from '../main/services/network-mode';
import { rateLimit } from '../main/middleware/security';
import { initDatabase, closeDatabase, upsertSettings, getCurrentSchemaVersion } from '../main/db';
import {
  startServer,
  stopServer,
  getServerPort,
  getServerListenHost,
} from '../main/server';
import {
  startKdsServer,
  stopKdsServer,
  getKdsPort,
  getKdsListenHost,
} from '../main/kds-server';
import {
  startServerApp,
  stopServerApp,
  getServerAppListenHost,
} from '../main/server-app';
import { getServerAppPort } from '../main/server-app-state';
import { posInfoRoutes } from '../main/routes/pos-info';
import { kdsInfoRoutes } from '../main/routes/kds-info';
import { serverAppInfoRoutes } from '../main/routes/server-app-info';
import { requireRole } from '../main/middleware/security';
import jwt from 'jsonwebtoken';
import { getJWTSecret } from '../main/routes/auth';

function assertListenAddress(serverHost: string, expected: '127.0.0.1' | '0.0.0.0', label: string): void {
  assert.equal(serverHost, expected, `${label} listen host`);
}

async function withMode(
  mode: 'localhost' | 'kds_lan' | 'lan',
  fn: () => Promise<void>,
): Promise<void> {
  stopServer();
  stopKdsServer();
  stopServerApp();
  upsertSettings({ network_mode: mode });
  await startServer();
  await startKdsServer();
  await startServerApp();
  try {
    await fn();
  } finally {
    stopServer();
    stopKdsServer();
    stopServerApp();
  }
}

async function run(): Promise<void> {
  console.log('Testing P0.1 network_mode deployment modes...');

  // ── Pure policy ────────────────────────────────────────────────────────
  assert.equal(parseNetworkMode(null), 'localhost', 'missing → localhost');
  assert.equal(parseNetworkMode(''), 'localhost', 'empty → localhost');
  assert.equal(parseNetworkMode('garbage'), 'localhost', 'invalid → localhost (no silent 0.0.0.0)');
  assert.equal(parseNetworkMode('LAN'), 'lan', 'case-insensitive lan');
  assert.equal(parseNetworkMode('kds_lan'), 'kds_lan', 'kds_lan');
  assert.equal(DEFAULT_NETWORK_MODE, 'localhost', 'default is localhost');

  assert.equal(resolveListenHost('localhost', 'pos'), '127.0.0.1');
  assert.equal(resolveListenHost('localhost', 'kds'), '127.0.0.1');
  assert.equal(resolveListenHost('localhost', 'server_app'), '127.0.0.1');

  assert.equal(resolveListenHost('kds_lan', 'pos'), '127.0.0.1', 'kds_lan keeps POS off LAN');
  assert.equal(resolveListenHost('kds_lan', 'kds'), '0.0.0.0', 'kds_lan exposes KDS');
  assert.equal(resolveListenHost('kds_lan', 'server_app'), '127.0.0.1', 'kds_lan keeps waiter off LAN');

  assert.equal(resolveListenHost('lan', 'pos'), '0.0.0.0');
  assert.equal(resolveListenHost('lan', 'kds'), '0.0.0.0');
  assert.equal(resolveListenHost('lan', 'server_app'), '0.0.0.0');

  assert.equal(shouldAdvertiseMdns('localhost'), false);
  assert.equal(shouldAdvertiseMdns('kds_lan'), true);
  assert.equal(shouldAdvertiseMdns('lan'), true);

  assert.equal(mdnsPrimaryPort('kds_lan', { pos: 3001, kds: 3002, serverApp: 3003 }), 3002);
  assert.equal(mdnsPrimaryPort('lan', { pos: 3001, kds: 3002, serverApp: 3003 }), 3001);

  assert.equal(isLanPosEnabled('localhost'), false);
  assert.equal(isLanPosEnabled('kds_lan'), false);
  assert.equal(isLanPosEnabled('lan'), true);
  assert.equal(isLanKdsEnabled('localhost'), false);
  assert.equal(isLanKdsEnabled('kds_lan'), true);
  assert.equal(isLanServerAppEnabled('kds_lan'), false);
  assert.equal(isLanServerAppEnabled('lan'), true);
  console.log('   ✓ listen-host / mDNS policy');

  // ── Rate limit: keep intentional LAN bypass; auth still throttles private IP ─
  const createRateLimitedApp = (maxRequests: number, ipOverride: string, extra?: Record<string, unknown>) => {
    const app = express();
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', { get: () => ipOverride, configurable: true });
      next();
    });
    app.use(rateLimit({ windowMs: 60_000, max: maxRequests, ...(extra || {}) }));
    app.get('/test', (_req, res) => res.status(200).json({ ok: true }));
    return app;
  };

  const privateGeneral = createRateLimitedApp(2, '192.168.1.50');
  for (let i = 0; i < 5; i++) {
    const res = await request(privateGeneral).get('/test');
    assert.equal(res.status, 200, `general API still bypasses private IP (trusted LAN volume) #${i + 1}`);
  }

  const authPrivate = createRateLimitedApp(2, '192.168.1.50', { bypassPrivateIp: false });
  assert.equal((await request(authPrivate).get('/test')).status, 200);
  assert.equal((await request(authPrivate).get('/test')).status, 200);
  assert.equal((await request(authPrivate).get('/test')).status, 429, 'auth rate limit still applies on private IP');
  console.log('   ✓ rate-limit: general private bypass retained; auth still limited');

  // ── DB + real binds ────────────────────────────────────────────────────
  initDatabase();
  assert.ok(getCurrentSchemaVersion() >= 74, 'schema includes jwt_secret_storage migration v74');
  assert.equal(getNetworkMode(), 'localhost', 'fresh install defaults to localhost');

  await withMode('localhost', async () => {
    assertListenAddress(getServerListenHost(), '127.0.0.1', 'POS localhost');
    assertListenAddress(getKdsListenHost(), '127.0.0.1', 'KDS localhost');
    assertListenAddress(getServerAppListenHost(), '127.0.0.1', 'Server App localhost');

    const posPort = getServerPort();
    const health = await request(`http://127.0.0.1:${posPort}`).get('/api/health');
    assert.equal(health.status, 200, 'Electron loopback health works in localhost mode');

    const unauthPay = await request(`http://127.0.0.1:${posPort}`)
      .post('/api/bills/1/payment')
      .send({ amount: 1, method: 'cash' });
    assert.equal(unauthPay.status, 401, 'financial API still requires auth in localhost mode');
  });
  console.log('   ✓ LOCALHOST binds 127.0.0.1; Electron health OK; unauth payment 401');

  await withMode('kds_lan', async () => {
    assertListenAddress(getServerListenHost(), '127.0.0.1', 'POS not on LAN in kds_lan');
    assertListenAddress(getKdsListenHost(), '0.0.0.0', 'KDS on LAN in kds_lan');
    assertListenAddress(getServerAppListenHost(), '127.0.0.1', 'Server App not on LAN in kds_lan');

    const kdsHealth = await request(`http://127.0.0.1:${getKdsPort()}`).get('/api/health');
    assert.equal(kdsHealth.status, 200, 'KDS reachable on loopback under kds_lan');

    const unauthPay = await request(`http://127.0.0.1:${getServerPort()}`)
      .post('/api/bills/1/payment')
      .send({ amount: 1, method: 'cash' });
    assert.equal(unauthPay.status, 401, 'financial API still auth-gated in kds_lan');
  });
  console.log('   ✓ KDS_LAN exposes only KDS; POS/waiter localhost; auth intact');

  await withMode('lan', async () => {
    assertListenAddress(getServerListenHost(), '0.0.0.0', 'POS LAN');
    assertListenAddress(getKdsListenHost(), '0.0.0.0', 'KDS LAN');
    assertListenAddress(getServerAppListenHost(), '0.0.0.0', 'Server App LAN');

    assert.equal((await request(`http://127.0.0.1:${getServerPort()}`).get('/api/health')).status, 200);
    assert.equal((await request(`http://127.0.0.1:${getKdsPort()}`).get('/api/health')).status, 200);
    assert.equal((await request(`http://127.0.0.1:${getServerAppPort()}`).get('/api/health')).status, 200);

    const unauthPay = await request(`http://127.0.0.1:${getServerPort()}`)
      .post('/api/bills/1/payment')
      .send({ amount: 1, method: 'cash' });
    assert.equal(unauthPay.status, 401, 'financial API still auth-gated in lan mode');
  });
  console.log('   ✓ LAN mode binds all three services; auth intact');

  // ── Pairing / QR gates (supertest on mounted routes) ───────────────────
  const bcrypt = require('bcryptjs');
  const { getDatabase } = require('../main/db');
  const db = getDatabase();
  const hashed = bcrypt.hashSync('OwnerPass123!', 10);
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, email, password, role, is_active)
    VALUES ('net-owner-1', 'Owner', 'net-owner@flo.local', ?, 'owner', 1)
  `).run(hashed);
  upsertSettings({ kds_enabled: 'true', server_app_enabled: 'true' });

  const token = jwt.sign(
    { userId: 'net-owner-1', email: 'net-owner@flo.local', role: 'owner' },
    getJWTSecret(),
    { expiresIn: '1h' },
  );

  function pairingApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = {
        userId: 'net-owner-1',
        email: 'net-owner@flo.local',
        role: 'owner',
      };
      next();
    });
    app.use('/api/pos-info', requireRole('owner', 'manager', 'cashier', 'waiter', 'chef'), posInfoRoutes);
    app.use('/api/kds-info', requireRole('owner', 'manager', 'cashier', 'waiter', 'chef'), kdsInfoRoutes);
    app.use('/api/server-app-info', requireRole('owner', 'manager', 'cashier', 'waiter', 'chef'), serverAppInfoRoutes);
    return app;
  }

  // Ensure getServerPort etc. exist for info routes — start briefly in lan then stop
  upsertSettings({ network_mode: 'localhost' });
  await startServer();
  await startKdsServer();
  await startServerApp();

  let res = await request(pairingApp()).get('/api/pos-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'pos-info blocked in localhost');
  assert.equal(res.body.code, 'NETWORK_MODE_REQUIRES_LAN');

  res = await request(pairingApp()).get('/api/kds-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'kds-info blocked in localhost');
  assert.equal(res.body.code, 'NETWORK_MODE_REQUIRES_KDS_LAN');

  res = await request(pairingApp()).get('/api/server-app-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'server-app-info blocked in localhost');
  assert.equal(res.body.code, 'NETWORK_MODE_REQUIRES_LAN');

  stopServer();
  stopKdsServer();
  stopServerApp();

  upsertSettings({ network_mode: 'kds_lan' });
  await startServer();
  await startKdsServer();
  await startServerApp();

  res = await request(pairingApp()).get('/api/pos-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'pos-info still blocked in kds_lan');

  res = await request(pairingApp()).get('/api/kds-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, 'kds-info allowed in kds_lan');
  assert.ok(res.body.ip_url?.includes(`:${getKdsPort()}`), 'kds QR uses KDS port');
  assert.ok(!String(res.body.ip_url).includes(':3001') || res.body.ip_url.includes(`:${getKdsPort()}`));

  res = await request(pairingApp()).get('/api/server-app-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'server-app-info blocked in kds_lan');

  stopServer();
  stopKdsServer();
  stopServerApp();

  upsertSettings({ network_mode: 'lan' });
  await startServer();
  await startKdsServer();
  await startServerApp();

  res = await request(pairingApp()).get('/api/pos-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, 'pos-info allowed in lan');
  assert.ok(res.body.ip_url, 'pos-info returns ip_url');
  assert.ok(res.body.network_mode === 'lan', 'pos-info reports mode');

  res = await request(pairingApp()).get('/api/kds-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, 'kds-info allowed in lan');

  res = await request(pairingApp()).get('/api/server-app-info').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, 'server-app-info allowed in lan');
  assert.ok(res.body.ip_url, 'server-app-info returns ip_url');

  // Unauthenticated financial still 401 under lan
  res = await request(`http://127.0.0.1:${getServerPort()}`)
    .post('/api/bills/1/payments')
    .send({});
  assert.equal(res.status, 401, 'unauth payments → 401 in lan mode');

  console.log('   ✓ QR/info routes reflect deployment mode');

  stopServer();
  stopKdsServer();
  stopServerApp();
  closeDatabase();

  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  console.log('✅ P0.1 network_mode tests passed!');
}

run().catch((err) => {
  console.error(err);
  try {
    stopServer();
    stopKdsServer();
    stopServerApp();
    closeDatabase();
  } catch { /* ignore */ }
  process.exit(1);
});

/**
 * Phase 2.4 — GET /api/platform/composition
 *
 * Usage: node tests/run-electron-node-test.cjs tests/platform-composition-api.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-platform-composition-'));
Module._load = function (request: string, _parent: unknown, _isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-platform-composition';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodeAssert = require('node:assert/strict');
const request = require('supertest');
const {
  initTestDb, createApp, assert, assertEqual, closeDatabase, now,
} = require('./helpers/test-setup');

const { platformRoutes } = require('../main/routes/platform');
const { getJWTSecret } = require('../main/routes/auth');
const {
  getPlatformCompositionResponse,
  OPERVIA_RESTAURANT_ENABLED_MODULES,
} = require('../main/modules');

function seedUser(db: any, id: string, role: string, email: string) {
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, `${role} user`, email,
    bcrypt.hashSync('testpass123', 10),
    role,
    bcrypt.hashSync('1234', 10),
    now(), now(),
  );
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

const FORBIDDEN_SNIPPETS = [
  'password',
  'pin_hash',
  'master_pin',
  'jwt_secret',
  'api_key',
  'refresh_token',
  'google',
  'drive',
  'sqlite',
  'dbpath',
  'process.env',
  '/users/',
  '@',
];

async function main() {
  console.log('Phase 2.4 Platform Composition API');
  console.log('='.repeat(60));

  const db = initTestDb();
  const ownerAuth = seedUser(db, 'plat-comp-owner', 'owner', 'plat-comp-owner@test.local');
  const managerAuth = seedUser(db, 'plat-comp-manager', 'manager', 'plat-comp-manager@test.local');
  const cashierAuth = seedUser(db, 'plat-comp-cashier', 'cashier', 'plat-comp-cashier@test.local');
  const waiterAuth = seedUser(db, 'plat-comp-waiter', 'waiter', 'plat-comp-waiter@test.local');
  const chefAuth = seedUser(db, 'plat-comp-chef', 'chef', 'plat-comp-chef@test.local');

  const app = createApp({ '/api/platform': platformRoutes });

  try {
    console.log('\n1. Unauthenticated request → 401');
    const noAuth = await request(app).get('/api/platform/composition');
    assertEqual(noAuth.status, 401, 'no auth status');
    assertEqual(noAuth.body.error, 'Authentication required', 'no auth message');

    console.log('\n2. Invalid token → 401');
    const badTokenValue = jwt.sign(
      { userId: 'bad-user', role: 'owner' },
      'wrong-secret-for-test',
      { expiresIn: '1h' },
    );
    const badToken = await request(app)
      .get('/api/platform/composition')
      .set('Authorization', `Bearer ${badTokenValue}`);
    assertEqual(badToken.status, 401, 'bad token status');
    assertEqual(badToken.body.error, 'Invalid or expired token', 'bad token message');

    console.log('\n3. Authorized roles → 200');
    for (const [label, auth] of [['owner', ownerAuth], ['manager', managerAuth]] as const) {
      const res = await request(app).get('/api/platform/composition').set(auth);
      assertEqual(res.status, 200, `${label} status`);
      assertEqual(res.body.verticalId, 'restaurant', `${label} verticalId`);
      assertEqual(res.body.verticalName, 'Opervia Restaurant', `${label} verticalName`);
      nodeAssert.equal(res.body.diagnostics.valid, true, `${label} diagnostics.valid`);
      nodeAssert.ok(Array.isArray(res.body.enabledModules), `${label} enabledModules array`);
      assertEqual(res.body.enabledModules.length, OPERVIA_RESTAURANT_ENABLED_MODULES.length, `${label} module count`);
    }

    console.log('\n4. Unauthorized roles → 403');
    for (const [label, auth] of [
      ['cashier', cashierAuth],
      ['waiter', waiterAuth],
      ['chef', chefAuth],
    ] as const) {
      const res = await request(app).get('/api/platform/composition').set(auth);
      assertEqual(res.status, 403, `${label} status`);
      assertEqual(res.body.error, 'Insufficient permissions', `${label} message`);
    }

    console.log('\n5. Response shape matches getPlatformCompositionResponse()');
    const ownerRes = await request(app).get('/api/platform/composition').set(ownerAuth);
    const expected = getPlatformCompositionResponse();
    nodeAssert.deepEqual(ownerRes.body, expected, 'HTTP body matches service projection');

    console.log('\n6. Deterministic sorted module order');
    const sorted = [...ownerRes.body.enabledModules].sort();
    nodeAssert.deepEqual(ownerRes.body.enabledModules, sorted, 'enabledModules sorted');
    const again = await request(app).get('/api/platform/composition').set(ownerAuth);
    nodeAssert.deepEqual(again.body, ownerRes.body, 'repeat GET identical');

    console.log('\n7. No sensitive information in payload');
    const serialized = JSON.stringify(ownerRes.body).toLowerCase();
    for (const snippet of FORBIDDEN_SNIPPETS) {
      nodeAssert.ok(!serialized.includes(snippet), `response must not contain ${snippet}`);
    }
    nodeAssert.ok(!('schemaVersion' in ownerRes.body), 'full snapshot schemaVersion not exposed');
    nodeAssert.ok(!('dependencies' in ownerRes.body), 'dependency internals not exposed');
    nodeAssert.ok(!('registryIntegrity' in ownerRes.body), 'registry integrity not exposed');
    nodeAssert.ok(!('modules' in ownerRes.body), 'full modules object not exposed');
    nodeAssert.ok(!('vertical' in ownerRes.body), 'full vertical object not exposed');

    console.log('\n8. Read-only — mutating verbs not supported');
    const postRes = await request(app).post('/api/platform/composition').set(ownerAuth);
    assert(postRes.status === 404 || postRes.status === 405, 'POST not allowed');

    console.log('\n' + '='.repeat(60));
    console.log('All platform composition API tests passed.');
  } finally {
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

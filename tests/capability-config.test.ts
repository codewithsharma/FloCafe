/**
 * Phase 3.2 — Deploy/start vertical & capability configuration.
 *
 * Proves ACTIVE_VERTICAL_ID env (unset → restaurant; empty/unknown → fail-closed)
 * resolves once for startup, feeds Phase 3.1 remount, and never hot-swaps.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/capability-config.test.ts
 *    or: npm run test:capability-config
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-capability-config-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, startServer, seedOwnerUser,
  assert, assertEqual,
  getResults, closeDatabase,
} = require('./helpers/test-setup');

const { registerRoutes } = require('../main/routes/index');
const {
  ACTIVE_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  ACTIVE_VERTICAL_ENV_KEY,
  resolveActiveVerticalId,
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
  getActiveVerticalId,
  getRouteMountPlan,
  assertFailClosedComposition,
  CompositionValidationError,
  formatStartupCompositionDiagnostics,
} = require('../main/modules');

const ENV_KEY = ACTIVE_VERTICAL_ENV_KEY as string;

function withEnv(
  value: string | undefined,
  fn: () => void,
): void {
  const prev = process.env[ENV_KEY];
  const had = Object.prototype.hasOwnProperty.call(process.env, ENV_KEY);
  try {
    resetActiveVerticalResolutionForTests();
    if (value === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = value;
    }
    fn();
  } finally {
    resetActiveVerticalResolutionForTests();
    if (had) {
      process.env[ENV_KEY] = prev;
    } else {
      delete process.env[ENV_KEY];
    }
  }
}

function expectCompositionError(fn: () => void, label: string): void {
  let threw = false;
  try {
    fn();
  } catch (err: any) {
    threw = err instanceof CompositionValidationError
      || err?.name === 'CompositionValidationError'
      || /fail-closed|unknown vertical|empty/i.test(String(err?.message || ''));
  }
  assert(threw, label);
}

async function probeStatus(baseUrl: string, urlPath: string, headers: Record<string, string> = {}): Promise<number> {
  const response = await (globalThis as any).fetch(baseUrl + urlPath, {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return response.status as number;
}

async function main() {
  console.log('Phase 3.2 Capability Configuration (deploy/start)');
  console.log('='.repeat(60));

  assertEqual(ENV_KEY, 'ACTIVE_VERTICAL_ID', 'config env key is ACTIVE_VERTICAL_ID');
  assertEqual(ACTIVE_VERTICAL_ID, OPERVIA_RESTAURANT_VERTICAL_ID, 'compile-time default constant remains restaurant');

  // ── Test 1 — Default (unset) ──────────────────────────────────────────
  console.log('\nTest 1 — unset env → restaurant');
  withEnv(undefined, () => {
    assertEqual(resolveActiveVerticalId(), 'restaurant', 'unset resolves to restaurant');
    assertEqual(commitActiveVerticalFromEnv(), 'restaurant', 'commit unset → restaurant');
    assertEqual(getActiveVerticalId(), 'restaurant', 'getActiveVerticalId after commit');
    assertFailClosedComposition({ verticalId: getActiveVerticalId() });
    const plan = getRouteMountPlan(getActiveVerticalId());
    assert(plan.mounted.includes('/api/tables'), 'default mounts tables');
  });

  // ── Test 2 — Explicit restaurant ──────────────────────────────────────
  console.log('\nTest 2 — ACTIVE_VERTICAL_ID=restaurant');
  withEnv('restaurant', () => {
    assertEqual(resolveActiveVerticalId(), 'restaurant', 'explicit restaurant');
    commitActiveVerticalFromEnv();
    const plan = getRouteMountPlan(getActiveVerticalId());
    assert(plan.mounted.includes('/api/tables'), 'restaurant mounts /api/tables');
    assert(plan.mounted.includes('/api/kds'), 'restaurant mounts /api/kds');
    assert(plan.mounted.includes('/api/products'), 'restaurant mounts core products');
  });

  // ── Test 3 — Safe retail-test ─────────────────────────────────────────
  console.log('\nTest 3 — ACTIVE_VERTICAL_ID=retail-test (safe composition, not production Retail)');
  withEnv('retail-test', () => {
    assertEqual(resolveActiveVerticalId(), OPERVIA_RETAIL_TEST_VERTICAL_ID, 'retail-test selected');
    commitActiveVerticalFromEnv();
    assertEqual(getActiveVerticalId(), 'retail-test', 'active id is retail-test');
    const plan = getRouteMountPlan(getActiveVerticalId());
    assert(plan.mounted.includes('/api/products'), 'retail-test mounts products');
    assert(plan.mounted.includes('/api/orders'), 'retail-test mounts orders');
    assert(!plan.mounted.includes('/api/tables'), 'retail-test omits tables');
    assert(plan.skipped.includes('/api/tables'), 'retail-test skips tables');
  });

  // ── Test 4 — Unknown vertical ─────────────────────────────────────────
  console.log('\nTest 4 — unknown vertical fails closed');
  withEnv('does-not-exist', () => {
    expectCompositionError(
      () => resolveActiveVerticalId(),
      'unknown vertical throws CompositionValidationError',
    );
    expectCompositionError(
      () => commitActiveVerticalFromEnv(),
      'commit unknown fails closed',
    );
  });

  // ── Test 5 — Malformed / empty ────────────────────────────────────────
  console.log('\nTest 5 — empty / whitespace fail closed (not default)');
  withEnv('', () => {
    expectCompositionError(
      () => resolveActiveVerticalId(),
      'empty string fails closed',
    );
  });
  withEnv('   ', () => {
    expectCompositionError(
      () => resolveActiveVerticalId(),
      'whitespace-only fails closed',
    );
  });
  withEnv('unknown', () => {
    expectCompositionError(
      () => resolveActiveVerticalId(),
      'unknown fails closed',
    );
  });

  // ── Diagnostics ───────────────────────────────────────────────────────
  console.log('\nDiagnostics — safe composition summary');
  withEnv(undefined, () => {
    const id = commitActiveVerticalFromEnv();
    const log = formatStartupCompositionDiagnostics(id);
    assert(/Active vertical:\s*restaurant/i.test(log), 'diagnostics name restaurant');
    assert(/Enabled modules:/i.test(log), 'diagnostics lists modules');
    assert(/tables/i.test(log), 'diagnostics includes tables for restaurant');
    assert(!/JWT|password|secret|token=/i.test(log), 'diagnostics omit secrets');
  });

  // ── Test 6–8 — Live mount + startup safety ────────────────────────────
  console.log('\nTest 6–8 — live remount + invalid startup does not listen');
  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);

  // Restaurant via env commit + registerRoutes
  withEnv('restaurant', () => {
    const verticalId = commitActiveVerticalFromEnv();
    const app = express();
    app.use((req: any, _res: any, next: any) => {
      if (req.body === undefined) req.body = {};
      next();
    });
    registerRoutes(app, { verticalId });
  });

  // Retail-test: tables absent, core present
  await (async () => {
    const prev = process.env[ENV_KEY];
    const had = Object.prototype.hasOwnProperty.call(process.env, ENV_KEY);
    resetActiveVerticalResolutionForTests();
    process.env[ENV_KEY] = 'retail-test';
    try {
      const verticalId = commitActiveVerticalFromEnv();
      const app = express();
      app.use((req: any, _res: any, next: any) => {
        if (req.body === undefined) req.body = {};
        next();
      });
      registerRoutes(app, { verticalId });
      const { baseUrl, server } = await startServer(app);
      try {
        const tables = await probeStatus(baseUrl, '/api/tables', authHeader);
        assertEqual(tables, 404, 'retail-test /api/tables absent → 404');
        const products = await probeStatus(baseUrl, '/api/products', authHeader);
        assert(products !== 404, `retail-test core /api/products present (status ${products})`);
        const orders = await probeStatus(baseUrl, '/api/orders', authHeader);
        assert(orders !== 404, `retail-test core /api/orders present (status ${orders})`);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      resetActiveVerticalResolutionForTests();
      if (had) process.env[ENV_KEY] = prev;
      else delete process.env[ENV_KEY];
    }
  })();

  // Invalid config: registerRoutes throws; no listen
  await (async () => {
    const prev = process.env[ENV_KEY];
    const had = Object.prototype.hasOwnProperty.call(process.env, ENV_KEY);
    resetActiveVerticalResolutionForTests();
    process.env[ENV_KEY] = 'does-not-exist';
    let listenReached = false;
    let threw = false;
    try {
      const verticalId = resolveActiveVerticalId();
      const app = express();
      registerRoutes(app, { verticalId });
      listenReached = true;
      await startServer(app);
    } catch (err: any) {
      threw = err instanceof CompositionValidationError
        || err?.name === 'CompositionValidationError'
        || /unknown vertical|fail-closed/i.test(String(err?.message || ''));
    } finally {
      resetActiveVerticalResolutionForTests();
      if (had) process.env[ENV_KEY] = prev;
      else delete process.env[ENV_KEY];
    }
    assert(threw, 'invalid env aborts before/at route registration');
    assert(!listenReached, 'invalid env never reaches listen');
  })();

  // No runtime switch API
  const verticalConfigSrc = fs.readFileSync(
    path.join(__dirname, '../main/modules/vertical-config.ts'),
    'utf8',
  );
  assert(!/function\s+switchVertical|setVertical\s*\(|changeVertical|reloadVertical/.test(verticalConfigSrc),
    'no runtime vertical switch helpers');

  closeDatabase();

  const { passed, failed, total } = getResults();
  console.log('='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('✅ Phase 3.2 capability configuration contracts passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

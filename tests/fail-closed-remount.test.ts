/**
 * Phase 3.1 — Fail-closed vertical remount.
 *
 * Proves Express mounts follow enabled modules for the resolved vertical:
 * restaurant keeps restaurant routes; retail-test omits them; unknown /
 * invalid composition fails closed at validation (no silent restaurant
 * fallback, no mount-everything).
 *
 * Production ACTIVE_VERTICAL_ID remains restaurant. Case B uses the
 * synthetic retail-test composition via registerRoutes({ verticalId })
 * — production Retail is Phase 3.3.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/fail-closed-remount.test.ts
 *    or: npm run test:fail-closed-remount
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-fail-closed-remount-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb,
  startServer,
  seedOwnerUser,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
} = require('./helpers/test-setup');

const { registerRoutes } = require('../main/routes/index');
const {
  ACTIVE_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  getRouteMountPlan,
  assertFailClosedComposition,
  CompositionValidationError,
  getVerticalDefinition,
  isModuleEnabled,
} = require('../main/modules');

const RESTAURANT_PREFIXES = [
  '/api/tables',
  '/api/kitchen',
  '/api/kitchen-stations',
  '/api/kds',
  '/api/kds-info',
  '/api/menu-csv',
  '/api/addon-groups',
] as const;

const CORE_PREFIXES = [
  '/api/auth',
  '/api/products',
  '/api/inventory',
  '/api/tax',
  '/api/orders',
  '/api/bills',
  '/api/payment-methods',
  '/api/pos-info',
  '/api/settings',
] as const;

function assertPrefixPresent(plan: { mounted: string[] }, prefix: string, label: string): void {
  assert(plan.mounted.includes(prefix), `${label}: ${prefix} mounted`);
}

function assertPrefixAbsent(
  plan: { mounted: string[]; skipped: string[] },
  prefix: string,
  label: string,
): void {
  assert(!plan.mounted.includes(prefix), `${label}: ${prefix} not mounted`);
  assert(plan.skipped.includes(prefix), `${label}: ${prefix} listed in skipped`);
}

/** Status-only probe — Express default 404 body is HTML, not JSON. */
async function probeStatus(
  baseUrl: string,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<number> {
  const response = await (globalThis as any).fetch(baseUrl + urlPath, {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return response.status as number;
}

async function main() {
  console.log('Phase 3.1 Fail-Closed Vertical Remount');
  console.log('='.repeat(60));

  assertEqual(
    ACTIVE_VERTICAL_ID,
    OPERVIA_RESTAURANT_VERTICAL_ID,
    'production ACTIVE remains restaurant',
  );

  // ── Case A — Restaurant mount plan ────────────────────────────────────
  console.log('\nCase A — Restaurant vertical: core + restaurant routes mounted');
  const restaurantPlan = getRouteMountPlan(OPERVIA_RESTAURANT_VERTICAL_ID);
  assertEqual(restaurantPlan.verticalId, 'restaurant', 'restaurant plan verticalId');
  for (const prefix of CORE_PREFIXES) {
    assertPrefixPresent(restaurantPlan, prefix, 'restaurant');
  }
  for (const prefix of RESTAURANT_PREFIXES) {
    assertPrefixPresent(restaurantPlan, prefix, 'restaurant');
  }
  assertEqual(restaurantPlan.skipped.length, 0, 'restaurant skips no catalog mounts');

  // ── Case B — Retail-test mount plan ───────────────────────────────────
  console.log('\nCase B — retail-test composition: core present, restaurant absent');
  const retailPlan = getRouteMountPlan(OPERVIA_RETAIL_TEST_VERTICAL_ID);
  assertEqual(retailPlan.verticalId, 'retail-test', 'retail-test plan verticalId');
  for (const prefix of CORE_PREFIXES) {
    assertPrefixPresent(retailPlan, prefix, 'retail-test');
  }
  for (const prefix of RESTAURANT_PREFIXES) {
    assertPrefixAbsent(retailPlan, prefix, 'retail-test');
  }
  for (const id of ['tables', 'kitchen', 'kds', 'menu', 'addons'] as const) {
    assert(!isModuleEnabled(id, OPERVIA_RETAIL_TEST_VERTICAL_ID), `retail-test disables ${id}`);
  }

  // ── Case C — Invalid vertical fail-closed ─────────────────────────────
  console.log('\nCase C — unknown vertical fails closed (no restaurant fallback)');
  let unknownThrew = false;
  try {
    getVerticalDefinition('unknown-vertical-xyz');
  } catch (err: any) {
    unknownThrew =
      err instanceof CompositionValidationError ||
      err?.name === 'CompositionValidationError' ||
      /unknown vertical/i.test(String(err?.message || ''));
  }
  assert(unknownThrew, 'getVerticalDefinition(unknown) throws CompositionValidationError');

  let assertUnknownThrew = false;
  try {
    assertFailClosedComposition({ verticalId: 'unknown-vertical-xyz' });
  } catch (err: any) {
    assertUnknownThrew =
      err instanceof CompositionValidationError ||
      err?.name === 'CompositionValidationError' ||
      /unknown vertical/i.test(String(err?.message || ''));
  }
  assert(assertUnknownThrew, 'assertFailClosedComposition(unknown) throws');

  let mountUnknownThrew = false;
  try {
    const badApp = express();
    registerRoutes(badApp, { verticalId: 'unknown-vertical-xyz' });
  } catch (err: any) {
    mountUnknownThrew =
      err instanceof CompositionValidationError ||
      err?.name === 'CompositionValidationError' ||
      /unknown vertical/i.test(String(err?.message || ''));
  }
  assert(mountUnknownThrew, 'registerRoutes(unknown) fails closed before mounting');

  // ── Case D — Disabled restaurant capability → route absent ────────────
  console.log('\nCase D — disabled restaurant modules omit their routes');
  assertPrefixAbsent(retailPlan, '/api/tables', 'disabled tables');
  assertPrefixAbsent(retailPlan, '/api/kds', 'disabled kds');
  assertPrefixAbsent(retailPlan, '/api/addon-groups', 'disabled addons');

  // ── Case E — Missing dependency fail-closed ───────────────────────────
  console.log('\nCase E — enabled set with missing dependency fails closed');
  let missingDepThrew = false;
  try {
    // kds requires kitchen/order/product — enabling kds alone is invalid.
    assertFailClosedComposition({
      verticalId: 'synthetic-missing-deps',
      enabledModules: ['kds'] as any,
    });
  } catch (err: any) {
    missingDepThrew =
      err instanceof CompositionValidationError ||
      err?.name === 'CompositionValidationError' ||
      /missing dependency|fail-closed|invalid composition/i.test(String(err?.message || ''));
  }
  assert(missingDepThrew, 'missing dependency composition fails closed');

  // Valid restaurant composition still passes.
  assertFailClosedComposition({ verticalId: OPERVIA_RESTAURANT_VERTICAL_ID });
  assertFailClosedComposition({ verticalId: OPERVIA_RETAIL_TEST_VERTICAL_ID });
  assert(true, 'restaurant + retail-test compositions validate');

  // ── Live Express: restaurant mounts restaurant routes ─────────────────
  console.log('\nLive mount — restaurant ACTIVE composition');
  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);

  const restaurantApp = express();
  restaurantApp.use((req: any, _res: any, next: any) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  registerRoutes(restaurantApp);
  const restaurantServer = await startServer(restaurantApp);

  try {
    const tablesStatus = await probeStatus(restaurantServer.baseUrl, '/api/tables', authHeader);
    assert(tablesStatus !== 404, `restaurant GET /api/tables registered (status ${tablesStatus})`);

    const productsStatus = await probeStatus(restaurantServer.baseUrl, '/api/products', authHeader);
    assert(
      productsStatus !== 404,
      `restaurant GET /api/products registered (status ${productsStatus})`,
    );
  } finally {
    await new Promise<void>((resolve) => restaurantServer.server.close(() => resolve()));
  }

  // ── Live Express: retail-test does not register restaurant routes ─────
  console.log('\nLive mount — retail-test omits restaurant HTTP (direct access)');
  const retailApp = express();
  retailApp.use((req: any, _res: any, next: any) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  registerRoutes(retailApp, { verticalId: OPERVIA_RETAIL_TEST_VERTICAL_ID });
  const retailServer = await startServer(retailApp);

  try {
    for (const prefix of RESTAURANT_PREFIXES) {
      const status = await probeStatus(retailServer.baseUrl, prefix, authHeader);
      assertEqual(status, 404, `retail-test ${prefix} not registered → 404`);
    }

    const coreHits = [
      '/api/products',
      '/api/orders',
      '/api/inventory/movements',
      '/api/tax/categories',
      '/api/payment-methods',
      '/api/pos-info',
    ];
    for (const prefix of coreHits) {
      const status = await probeStatus(retailServer.baseUrl, prefix, authHeader);
      assert(status !== 404, `retail-test core ${prefix} still registered (status ${status})`);
    }
  } finally {
    await new Promise<void>((resolve) => retailServer.server.close(() => resolve()));
    closeDatabase();
  }

  const { passed, failed, total } = getResults();
  console.log('='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('✅ Phase 3.1 fail-closed remount contracts passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

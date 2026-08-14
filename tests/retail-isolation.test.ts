/**
 * Retail isolation P0 — companion KDS / Server App must not bind when the
 * committed vertical disables those restaurant modules.
 *
 * Characterization of post-4.15 audit P0-1 / P1-09.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/retail-isolation.test.ts
 *    or: npm run test:retail-isolation
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

process.env.KDS_PORT = process.env.KDS_PORT || '18702';
process.env.SERVER_APP_PORT = process.env.SERVER_APP_PORT || '18703';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-retail-isolation-'));
Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

import { startKdsServer, stopKdsServer, isKdsServerRunning } from '../main/kds-server';
import { startServerApp, stopServerApp, isServerAppRunning } from '../main/server-app';
import { initDatabase, closeDatabase } from '../main/db';
import {
  ACTIVE_VERTICAL_ENV_KEY,
  commitActiveVerticalFromEnv,
  isModuleEnabled,
  resetActiveVerticalResolutionForTests,
} from '../main/modules';

const KDS_PORT = parseInt(process.env.KDS_PORT || '18702', 10);
const SERVER_APP_PORT = parseInt(process.env.SERVER_APP_PORT || '18703', 10);

function probeHealth(port: number): Promise<number | 'refused'> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        resolve('refused');
        return;
      }
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`health probe timed out on ${port}`));
    });
  });
}

function commitVertical(id: string | undefined): void {
  resetActiveVerticalResolutionForTests();
  if (id === undefined) {
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
  } else {
    process.env[ACTIVE_VERTICAL_ENV_KEY] = id;
  }
  commitActiveVerticalFromEnv();
}

async function startCompanions(): Promise<void> {
  await startKdsServer();
  await startServerApp();
}

function stopCompanions(): void {
  stopKdsServer();
  stopServerApp();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('Retail isolation P0 — companion process gating');
  console.log('='.repeat(60));

  initDatabase();
  const prev = process.env[ACTIVE_VERTICAL_ENV_KEY];
  const had = Object.prototype.hasOwnProperty.call(process.env, ACTIVE_VERTICAL_ENV_KEY);

  try {
    console.log('\nA. Restaurant: KDS and Server App remain available');
    commitVertical(undefined);
    assert.equal(isModuleEnabled('kds'), true, 'restaurant enables kds');
    assert.equal(isModuleEnabled('tables'), true, 'restaurant enables tables');
    await startCompanions();
    assert.equal(isKdsServerRunning(), true, 'restaurant KDS binds');
    assert.equal(isServerAppRunning(), true, 'restaurant Server App binds');
    assert.equal(await probeHealth(KDS_PORT), 200, 'restaurant KDS /api/health is 200');
    assert.equal(await probeHealth(SERVER_APP_PORT), 200, 'restaurant Server App /api/health is 200');
    stopCompanions();
    await delay(50);
    console.log('   ✓ restaurant companions listen');

    console.log('\nB. Retail: KDS and Server App must not bind (P0-1)');
    commitVertical('retail');
    assert.equal(isModuleEnabled('kds', 'retail'), false, 'retail disables kds');
    assert.equal(isModuleEnabled('tables', 'retail'), false, 'retail disables tables');
    assert.equal(isModuleEnabled('addons', 'retail'), false, 'retail disables addons');
    await startCompanions();
    assert.equal(isKdsServerRunning(), false, 'retail must not leave KDS running');
    assert.equal(isServerAppRunning(), false, 'retail must not leave Server App running');
    assert.equal(await probeHealth(KDS_PORT), 'refused', 'direct KDS access fail-closed on retail');
    assert.equal(
      await probeHealth(SERVER_APP_PORT),
      'refused',
      'direct Server App access fail-closed on retail',
    );
    stopCompanions();
    console.log('   ✓ retail companions do not listen');

    console.log('\nC. retail-test: same fail-closed companion gate');
    commitVertical('retail-test');
    assert.equal(isModuleEnabled('kds'), false, 'retail-test disables kds');
    assert.equal(isModuleEnabled('tables'), false, 'retail-test disables tables');
    await startCompanions();
    assert.equal(isKdsServerRunning(), false, 'retail-test must not leave KDS running');
    assert.equal(isServerAppRunning(), false, 'retail-test must not leave Server App running');
    assert.equal(await probeHealth(KDS_PORT), 'refused', 'retail-test KDS fail-closed');
    assert.equal(await probeHealth(SERVER_APP_PORT), 'refused', 'retail-test Server App fail-closed');
    stopCompanions();
    console.log('   ✓ retail-test companions do not listen');

    console.log('\n✅ Retail isolation companion gates passed');
  } finally {
    stopCompanions();
    resetActiveVerticalResolutionForTests();
    if (had && prev !== undefined) process.env[ACTIVE_VERTICAL_ENV_KEY] = prev;
    else delete process.env[ACTIVE_VERTICAL_ENV_KEY];
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  stopCompanions();
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

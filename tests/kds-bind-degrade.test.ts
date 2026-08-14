/**
 * P1-07 — KDS bind exhaustion must not reject (POS billing must continue).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/kds-bind-degrade.test.ts
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

process.env.KDS_PORT = process.env.KDS_PORT || '19200';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-kds-bind-degrade-'));
Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

import { startKdsServer, stopKdsServer, isKdsServerRunning } from '../main/kds-server';
import { initDatabase, closeDatabase } from '../main/db';
import {
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
} from '../main/modules';

const BASE_PORT = parseInt(process.env.KDS_PORT || '19200', 10);

function occupyPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => resolve(server));
  });
}

async function main(): Promise<void> {
  console.log('P1-07 KDS bind degrade (do not quit POS)');
  resetActiveVerticalResolutionForTests();
  delete process.env.ACTIVE_VERTICAL_ID;
  commitActiveVerticalFromEnv();
  initDatabase();

  const holders: net.Server[] = [];
  try {
    for (let p = BASE_PORT; p < BASE_PORT + 10; p++) {
      holders.push(await occupyPort(p));
    }

    await startKdsServer();
    assert.equal(isKdsServerRunning(), false, 'KDS must not report running after bind exhaustion');
    console.log('   ✓ startKdsServer resolved without throwing');
  } finally {
    stopKdsServer();
    for (const s of holders) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    closeDatabase();
  }
  console.log('✅ KDS bind degrade passed');
}

main().catch((err) => {
  console.error(err);
  stopKdsServer();
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

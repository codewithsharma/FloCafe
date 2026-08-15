/**
 * P1-06 — Hard-unopenable live DB must fail closed into recovery (not crash).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/p1-06-unopenable-db.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-p106-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => '3.0.5-p106' },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(`ENC:${s}`, 'utf8'),
        decryptString: (b: Buffer) => {
          const text = b.toString('utf8');
          if (!text.startsWith('ENC:')) throw new Error('not encrypted');
          return text.slice(4);
        },
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

delete process.env.JWT_SECRET;
delete process.env.FLO_ALLOW_JWT_SECRET_ENV;

const {
  initDatabase,
  closeDatabase,
  getDbPath,
  DatabaseRecoveryRequiredError,
} = require('../dist/db');
const {
  markInstallationInitialized,
  isRecoveryRequired,
  getRecoveryReason,
  clearRecoveryRequired,
  resetInstallStateCacheForTests,
} = require('../dist/services/install-state');

function teardown(): void {
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  clearRecoveryRequired();
  resetInstallStateCacheForTests();
  fs.rmSync(testDir, { recursive: true, force: true });
}

console.log('P1-06 unopenable DB fail-closed');

try {
  // Fresh install opens fine
  initDatabase();
  markInstallationInitialized();
  closeDatabase();

  // Replace live DB path with a directory so better-sqlite3 cannot open it
  const dbPath = getDbPath();
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.mkdirSync(dbPath);

  resetInstallStateCacheForTests();
  let threw: unknown = null;
  try {
    initDatabase();
  } catch (err) {
    threw = err;
  }

  assert.ok(threw instanceof DatabaseRecoveryRequiredError, 'expected DatabaseRecoveryRequiredError');
  assert.equal((threw as { reason: string }).reason, 'corrupt_database');
  assert.equal(isRecoveryRequired(), true);
  assert.equal(getRecoveryReason(), 'corrupt_database');

  console.log('✅ P1-06 unopenable DB fail-closed tests passed');
} finally {
  teardown();
}

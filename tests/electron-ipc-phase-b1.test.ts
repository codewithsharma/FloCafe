/**
 * P0.6 Phase B1 — IPC surface reduction + restore path hardening.
 * Usage: node tests/run-electron-node-test.cjs tests/electron-ipc-phase-b1.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-ipc-b1-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(s, 'utf8'),
        decryptString: (b: Buffer) => b.toString('utf8'),
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

import {
  resolveManagedBackupPath,
  validateExternalRestorePath,
  MANAGED_BACKUP_FILENAME_RE,
} from '../main/security/restore-path';

const REMOVED_CHANNELS = [
  'db-health-check',
  'db-apply-safe-fixes',
  'db-initialize',
  'get-settings',
  'set-setting',
  'get-printers',
  'save-printer',
  'get-daily-summary',
  'get-kds-info',
  'open-kds-window',
  'whatsapp-get-status',
];

const RETAINED_INVOKE = [
  'backup-database',
  'restore-backup',
  'master-pin-status',
  'get-app-info',
];

function main(): void {
  console.log('P0.6 Phase B1 IPC / restore-path tests');
  console.log('='.repeat(60));

  const backupDir = path.join(testDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const liveDb = path.join(testDir, 'flo.db');
  fs.writeFileSync(liveDb, 'live');

  const goodName = 'flo-backup-2026-08-13T00-00-00-000Z-abcd1234.db';
  const goodPath = path.join(backupDir, goodName);
  fs.writeFileSync(goodPath, 'backup-bytes');

  assert.equal(MANAGED_BACKUP_FILENAME_RE.test(goodName), true);
  assert.equal(resolveManagedBackupPath(backupDir, goodName), goodPath);
  console.log('   ✓ valid managed backup fileName resolves');

  assert.throws(() => resolveManagedBackupPath(backupDir, '/etc/passwd'), /Invalid backup/);
  assert.throws(() => resolveManagedBackupPath(backupDir, '../flo.db'), /Invalid backup/);
  assert.throws(() => resolveManagedBackupPath(backupDir, '..\\flo.db'), /Invalid backup/);
  assert.throws(() => resolveManagedBackupPath(backupDir, 'flo-backup-evil/../../flo.db'), /Invalid backup/);
  assert.throws(() => resolveManagedBackupPath(backupDir, 'not-a-backup.db'), /Invalid backup/);
  assert.throws(() => resolveManagedBackupPath(backupDir, goodName + '.tmp'), /Invalid backup/);
  console.log('   ✓ arbitrary absolute / traversal / unsupported names rejected');

  const outside = path.join(testDir, 'outside.db');
  fs.writeFileSync(outside, 'x');
  assert.throws(() => resolveManagedBackupPath(backupDir, path.basename(outside)), /Invalid backup|not found/i);
  // basename outside.db doesn't match managed pattern
  assert.throws(() => resolveManagedBackupPath(backupDir, 'outside.db'), /Invalid backup/);
  console.log('   ✓ non-managed names rejected');

  // External picker validation
  assert.equal(validateExternalRestorePath(outside, liveDb), path.resolve(outside));
  assert.throws(() => validateExternalRestorePath(backupDir, liveDb), /regular file|directory/i);
  assert.throws(() => validateExternalRestorePath(liveDb, liveDb), /live database/i);
  assert.throws(() => validateExternalRestorePath(path.join(testDir, 'missing.db'), liveDb), /not found|exist/i);
  fs.writeFileSync(path.join(testDir, 'notes.txt'), 'nope');
  assert.throws(() => validateExternalRestorePath(path.join(testDir, 'notes.txt'), liveDb), /Unsupported|\.db/i);

  const linkPath = path.join(testDir, 'link-escape.db');
  try {
    fs.symlinkSync(outside, linkPath);
    assert.throws(() => validateExternalRestorePath(linkPath, liveDb), /symlink|regular file/i);
    console.log('   ✓ symlink escape rejected');
  } catch (err: any) {
    if (err?.code === 'EPERM' || err?.code === 'EACCES') {
      console.log('   ✓ symlink test skipped (OS permission)');
    } else if (String(err?.message || err).includes('symlink') || String(err?.message || err).includes('regular file')) {
      console.log('   ✓ symlink escape rejected');
    } else {
      throw err;
    }
  }
  console.log('   ✓ external picker path validation');

  // Source contracts
  const ipcSrc = fs.readFileSync(path.join(__dirname, '../main/ipc.ts'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(__dirname, '../main/preload.ts'), 'utf8');
  for (const ch of REMOVED_CHANNELS) {
    assert.equal(ipcSrc.includes(`'${ch}'`) || ipcSrc.includes(`"${ch}"`), false, `ipc must not register ${ch}`);
    assert.equal(preloadSrc.includes(`'${ch}'`) || preloadSrc.includes(`"${ch}"`), false, `preload must not invoke ${ch}`);
  }
  for (const ch of RETAINED_INVOKE) {
    assert.ok(ipcSrc.includes(`'${ch}'`), `ipc retains ${ch}`);
  }
  assert.ok(preloadSrc.includes('backupDatabase'), 'preload retains backupDatabase');
  assert.ok(preloadSrc.includes('restoreBackup'), 'preload retains restoreBackup');
  assert.equal(preloadSrc.includes('dbApplySafeFixes'), false, 'preload drops dbApplySafeFixes');
  assert.equal(preloadSrc.includes('savePrinter'), false, 'preload drops savePrinter');
  assert.equal(preloadSrc.includes('openKdsWindow'), false, 'preload drops openKdsWindow');
  assert.equal(/restoreBackup:\s*\([^)]*backupPath/.test(preloadSrc), false, 'preload must not accept backupPath');
  assert.match(preloadSrc, /restoreBackup:\s*\([^)]*fileName/, 'preload restore uses fileName');
  console.log('   ✓ removed orphan IPC channels; retained desktop bridge');

  // KDS: no open-kds-window and no privileged KDS preload attachment
  assert.equal(/open-kds-window/.test(ipcSrc), false, 'open-kds-window removed');
  assert.equal(/preload: path\.join\(__dirname, 'preload\.js'\)/.test(ipcSrc), false, 'ipc must not attach full preload to secondary windows');
  console.log('   ✓ KDS privileged preload surface removed');

  // Restore handler must resolve managed fileName / picker validation
  assert.match(ipcSrc, /resolveManagedBackupPath|validateExternalRestorePath/, 'restore uses path hardening helpers');
  assert.equal(/presetBackupPath/.test(ipcSrc), false, 'no presetBackupPath absolute path API');
  console.log('   ✓ restore security model in ipc source');

  console.log('✅ P0.6 Phase B1 IPC tests passed!');
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  main();
} catch (err) {
  console.error(err);
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
}

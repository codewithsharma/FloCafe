/**
 * P1.2 REC-01 — fail-closed missing/empty production database.
 * Usage: node tests/run-electron-node-test.cjs tests/rec-01-recovery.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import bcrypt from 'bcryptjs';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rec01-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => '3.0.5-rec01' },
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
  getDatabase,
  getDbPath,
  createBackup,
  restoreBackup,
  resetDatabaseWithBackup,
  DatabaseRecoveryRequiredError,
  isDatabaseOpen,
  SchemaVersionMismatchError,
  getSupportedSchemaVersion,
} = require('../main/db');
const {
  markInstallationInitialized,
  clearInstallationMarker,
  isInstallationInitialized,
  getInstallStateFilePath,
  isRecoveryRequired,
  getRecoveryReason,
  getInstallState,
  resetInstallStateCacheForTests,
  setRecoveryRequired,
  clearRecoveryRequired,
} = require('../main/services/install-state');
const { now } = require('../main/db');
const { recoveryApiProtectionMiddleware } = require('../main/server');
const express = require('express');
const request = require('supertest');
const { authRoutes } = require('../main/routes/auth');

function unlinkLiveDb(): void {
  const dbPath = getDbPath();
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch { /* ignore */ }
  }
}

function seedOwner(): void {
  const t = now();
  getDatabase().prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)
  `).run('owner-rec01', 'Owner', 'owner@rec01.local', bcrypt.hashSync('OwnerPass1!', 4), t, t);
}

function userCount(): number {
  return (getDatabase().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
}

async function main(): Promise<void> {
  console.log('P1.2 REC-01 recovery hardening');
  console.log('='.repeat(60));

  // ── REC01-01 first install: no DB, no marker ─────────────────────────
  resetInstallStateCacheForTests();
  clearInstallationMarker();
  unlinkLiveDb();
  assert.equal(isInstallationInitialized(), false);
  initDatabase();
  assert.equal(isDatabaseOpen(), true);
  assert.equal(isRecoveryRequired(), false);
  assert.equal(userCount(), 0);
  console.log('   ✓ REC01-01 first install creates DB; setup path available');

  // ── REC01-02 successful setup → marker ACTIVE ────────────────────────
  seedOwner();
  markInstallationInitialized();
  assert.equal(isInstallationInitialized(), true);
  assert.equal(fs.existsSync(getInstallStateFilePath()), true);
  const marker = JSON.parse(fs.readFileSync(getInstallStateFilePath(), 'utf8'));
  assert.equal(typeof marker.initializedAt, 'string');
  assert.equal(marker.version, 1);
  assert.equal(getInstallState({ databasePresent: true, operationalUsers: 1 }).state, 'ACTIVE');
  console.log('   ✓ REC01-02 setup writes installation marker; ACTIVE');

  // ── REC01-03 existing install + DB present ───────────────────────────
  closeDatabase();
  resetInstallStateCacheForTests();
  initDatabase();
  assert.equal(isRecoveryRequired(), false);
  assert.equal(getInstallState({ databasePresent: true, operationalUsers: 1 }).state, 'ACTIVE');
  console.log('   ✓ REC01-03 existing installation normal startup ACTIVE');

  const { path: backupPath } = await createBackup();

  // ── REC01-04 missing flo.db → RECOVERY, no silent create ─────────────
  closeDatabase();
  unlinkLiveDb();
  assert.equal(fs.existsSync(getDbPath()), false);
  assert.equal(isInstallationInitialized(), true);
  let threw: unknown = null;
  try {
    initDatabase();
  } catch (err) {
    threw = err;
  }
  assert.ok(threw instanceof DatabaseRecoveryRequiredError, 'expected DatabaseRecoveryRequiredError');
  assert.equal((threw as any).reason, 'missing_database');
  assert.equal(fs.existsSync(getDbPath()), false, 'must not create empty flo.db');
  assert.equal(isDatabaseOpen(), false);
  setRecoveryRequired('missing_database');
  assert.equal(isRecoveryRequired(), true);
  console.log('   ✓ REC01-04 missing DB → RECOVERY_REQUIRED; no empty DB');

  // ── REC01-05 setup cannot initialize while RECOVERY_REQUIRED ─────────
  {
    const usersBefore = 0; // no live DB
    const app = express();
    app.use(express.json());
    app.use(recoveryApiProtectionMiddleware);
    app.use('/api/auth', authRoutes);

    const res = await request(app)
      .post('/api/auth/setup/initialize')
      .send({
        name: 'Hacker Owner',
        password: 'OwnerPass1!',
        master_pin: '1234',
        accept_terms: true,
        business_name: 'Stolen Cafe',
      });

    assert.ok(res.status === 503 || res.status === 403, `expected 403/503, got ${res.status}`);
    assert.equal(res.body.recovery_required, true);
    assert.equal(fs.existsSync(getDbPath()), false, 'setup must not create DB');
    assert.equal(isInstallationInitialized(), true);
    // No owner created (no DB / still recovery)
    assert.equal(isDatabaseOpen(), false);
    void usersBefore;
  }
  console.log('   ✓ REC01-05 setup/initialize blocked in recovery; no owner created');

  // ── REC01-06 money APIs unavailable (behavioral) ─────────────────────
  {
    let moneyMutated = false;
    const app = express();
    app.use(express.json());
    app.use(recoveryApiProtectionMiddleware);
    app.post('/api/bills/1/payment', (_req: any, res: any) => {
      moneyMutated = true;
      res.json({ success: true });
    });

    const res = await request(app)
      .post('/api/bills/1/payment')
      .send({ method: 'cash', amount: 100 });

    assert.equal(res.status, 503);
    assert.equal(res.body.recovery_required, true);
    assert.equal(moneyMutated, false, 'money handler must not run');
  }
  console.log('   ✓ REC01-06 money mutation blocked with HTTP 503; no financial mutation');

  // ── REC01-07 KDS/Server App/mDNS not started in recovery (source contract)
  {
    const indexSrc = fs.readFileSync(path.join(__dirname, '../main/index.ts'), 'utf8');
    const recoveryMatch = indexSrc.match(/if \(recoveryMode\) \{[\s\S]*?\n      return;\n    \}/);
    assert.ok(recoveryMatch, 'recoveryMode early-return block must exist');
    const recoveryBlock = recoveryMatch![0];
    assert.equal(recoveryBlock.includes('startKdsServer'), false, 'recovery must not start KDS');
    assert.equal(recoveryBlock.includes('startServerApp'), false, 'recovery must not start Server App');
    assert.equal(recoveryBlock.includes('startMdns'), false, 'recovery must not start mDNS');
    assert.ok(indexSrc.includes('await startKdsServer()'), 'healthy path still starts KDS');
    assert.ok(indexSrc.includes('await startServerApp()'), 'healthy path still starts Server App');
    assert.ok(indexSrc.includes('startMdns()'), 'healthy path still starts mDNS');
    const recoveryIdx = indexSrc.indexOf('if (recoveryMode)');
    const kdsIdx = indexSrc.indexOf('await startKdsServer()');
    assert.ok(recoveryIdx > 0 && kdsIdx > recoveryIdx, 'KDS start is after recovery early-return');
  }
  console.log('   ✓ REC01-07 recovery mode skips KDS/Server App/mDNS (startup branch contract)');

  // ── REC01-13 recovery middleware fail-closed on evaluation error ──────
  {
    const installState = require('../main/services/install-state');
    const original = installState.isRecoveryRequired;
    let nextCalled = false;
    try {
      installState.isRecoveryRequired = () => {
        throw new Error('simulated install-state failure');
      };
      const app = express();
      app.use(recoveryApiProtectionMiddleware);
      app.post('/api/bills/1/payment', (_req: any, res: any) => {
        nextCalled = true;
        res.json({ ok: true });
      });

      const res = await request(app).post('/api/bills/1/payment').send({});
      assert.equal(res.status, 503);
      assert.equal(res.body.reason, 'RECOVERY_STATE_UNAVAILABLE');
      assert.equal(res.body.recovery_required, true);
      assert.equal(nextCalled, false, 'next()/handler must not run when state eval fails');
    } finally {
      installState.isRecoveryRequired = original;
    }
  }
  console.log('   ✓ REC01-13 recovery middleware fail-closed → 503; next() not called');

  // ── REC01-09 corrupt backup while missing DB ─────────────────────────
  const corruptPath = path.join(testDir, 'corrupt.db');
  fs.writeFileSync(corruptPath, 'not-a-sqlite-file');
  const corruptResult = restoreBackup(corruptPath, true);
  assert.equal(corruptResult.success, false);
  assert.equal(fs.existsSync(getDbPath()), false, 'corrupt restore must not create empty DB');
  assert.equal(isInstallationInitialized(), true);
  setRecoveryRequired('missing_database');
  console.log('   ✓ REC01-09 corrupt backup rejected; still no empty DB');

  // ── REC01-08 valid restore from recovery ─────────────────────────────
  const restored = restoreBackup(backupPath, true);
  assert.equal(restored.success, true, restored.error || 'restore ok');
  assert.equal(isDatabaseOpen(), true);
  assert.equal(userCount() >= 1, true);
  assert.equal(isInstallationInitialized(), true);
  assert.equal(isRecoveryRequired(), false);
  console.log('   ✓ REC01-08 valid restore → ACTIVE');

  // ── REC01-11 empty replacement SQLite + marker ───────────────────────
  closeDatabase();
  unlinkLiveDb();
  const Database = require('better-sqlite3');
  new Database(getDbPath()).close();
  resetInstallStateCacheForTests();
  assert.equal(isInstallationInitialized(), true);
  initDatabase();
  assert.equal(isRecoveryRequired(), true);
  assert.equal(getRecoveryReason(), 'empty_database');
  assert.equal(
    getInstallState({ databasePresent: true, operationalUsers: 0 }).state,
    'RECOVERY_REQUIRED',
  );
  console.log('   ✓ REC01-11 empty replacement DB + marker → RECOVERY (not first install)');

  // Restore again to continue
  closeDatabase();
  unlinkLiveDb();
  clearRecoveryRequired();
  const restored2 = restoreBackup(backupPath, true);
  assert.equal(restored2.success, true, restored2.error || 'restore2');
  clearRecoveryRequired();

  // ── REC01-14 factory-reset failure preserves marker (no silent FIRST_INSTALL)
  {
    if (userCount() === 0) {
      seedOwner();
      markInstallationInitialized();
    }
    assert.equal(isInstallationInitialized(), true);
    const usersBefore = userCount();
    assert.ok(usersBefore >= 1);

    let failed: unknown = null;
    try {
      await resetDatabaseWithBackup({ injectFailureAfterEmptyInit: true });
    } catch (err) {
      failed = err;
    }
    assert.ok(failed, 'injected failure must surface');
    assert.equal(isInstallationInitialized(), true, 'marker must remain after failed reset');
    assert.equal(isDatabaseOpen(), true, 'safety-backup rollback must reopen DB');
    assert.equal(userCount() >= 1, true, 'pre-reset data restored from safety backup');

    // Next startup with missing DB must still be recovery, never FIRST_INSTALL.
    closeDatabase();
    unlinkLiveDb();
    resetInstallStateCacheForTests();
    assert.equal(isInstallationInitialized(), true);
    assert.equal(
      getInstallState({ databasePresent: false }).state,
      'RECOVERY_REQUIRED',
    );
    let bootErr: unknown = null;
    try {
      initDatabase();
    } catch (err) {
      bootErr = err;
    }
    assert.ok(bootErr instanceof DatabaseRecoveryRequiredError);
    assert.equal(fs.existsSync(getDbPath()), false);
    assert.equal(isInstallationInitialized(), true);

    // Restore live DB to continue suite
    clearRecoveryRequired();
    const r = restoreBackup(backupPath, true);
    assert.equal(r.success, true, r.error || 'restore after reset-failure test');
    clearRecoveryRequired();
  }
  console.log('   ✓ REC01-14 factory-reset failure keeps marker; no silent FIRST_INSTALL');

  // ── REC01-10 factory reset clears marker (only after success) ────────
  if (userCount() === 0) {
    seedOwner();
    markInstallationInitialized();
  }
  assert.equal(isInstallationInitialized(), true);
  await resetDatabaseWithBackup();
  assert.equal(isInstallationInitialized(), false, 'marker cleared after successful factory reset');
  assert.equal(isRecoveryRequired(), false);
  assert.equal(userCount(), 0);
  seedOwner();
  markInstallationInitialized();
  assert.equal(isInstallationInitialized(), true);
  console.log('   ✓ REC01-10 factory reset clears marker; first-run semantics restored');

  // ── REC01-15 corrupt marker + missing DB → fail-closed recovery ──────
  {
    closeDatabase();
    unlinkLiveDb();
    fs.writeFileSync(getInstallStateFilePath(), '{not-valid-json', 'utf8');
    resetInstallStateCacheForTests();
    assert.equal(isInstallationInitialized(), true, 'corrupt marker file still counts as present');
    assert.equal(
      getInstallState({ databasePresent: false }).state,
      'RECOVERY_REQUIRED',
      'must not treat corrupt marker as FIRST_INSTALL',
    );
    let corruptBoot: unknown = null;
    try {
      initDatabase();
    } catch (err) {
      corruptBoot = err;
    }
    assert.ok(corruptBoot instanceof DatabaseRecoveryRequiredError);
    assert.equal(fs.existsSync(getDbPath()), false);
    assert.notEqual(
      getInstallState({ databasePresent: false }).state,
      'FIRST_INSTALL',
    );
    // Repair marker for remaining tests
    markInstallationInitialized();
    const r = restoreBackup(backupPath, true);
    assert.equal(r.success, true);
    clearRecoveryRequired();
  }
  console.log('   ✓ REC01-15 corrupt marker + missing DB → RECOVERY (not FIRST_INSTALL)');

  // ── REC01-12 incompatible schema preserved (not first install) ───────
  closeDatabase();
  const futurePath = path.join(testDir, 'future.db');
  fs.copyFileSync(getDbPath(), futurePath);
  initDatabase();
  closeDatabase();
  unlinkLiveDb();
  fs.copyFileSync(futurePath, getDbPath());
  const fut = new Database(getDbPath());
  const futureVer = getSupportedSchemaVersion() + 99;
  try {
    fut.exec(`CREATE TABLE IF NOT EXISTS _flo_meta (key TEXT PRIMARY KEY, value TEXT)`);
  } catch { /* ignore */ }
  fut.pragma(`user_version = ${futureVer}`);
  fut.close();
  markInstallationInitialized();
  resetInstallStateCacheForTests();
  let mismatch: unknown = null;
  try {
    initDatabase();
  } catch (err) {
    mismatch = err;
  }
  assert.ok(mismatch instanceof SchemaVersionMismatchError, 'schema mismatch must throw');
  assert.equal(isInstallationInitialized(), true, 'must not clear marker into first-install');
  console.log('   ✓ REC01-12 incompatible schema stays fatal; not first-install');

  // Backfill safety: empty DB without marker must NOT auto-mark
  closeDatabase();
  clearInstallationMarker();
  unlinkLiveDb();
  resetInstallStateCacheForTests();
  initDatabase();
  assert.equal(isInstallationInitialized(), false, 'empty first install must not backfill marker');
  console.log('   ✓ backfill never marks empty first-install DB');

  console.log('✅ REC-01 suite passed');
  closeDatabase();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((err) => {
  console.error(err);
  try { closeDatabase(); } catch { /* ignore */ }
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});

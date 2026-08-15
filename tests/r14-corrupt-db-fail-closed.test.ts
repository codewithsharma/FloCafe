/**
 * R14 — Corrupt-but-openable live DB fail-closed.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/r14-corrupt-db-fail-closed.test.ts
 *        npm run test:r14
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import bcrypt from 'bcryptjs';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r14-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => '3.0.5-r14' },
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
  getDbHealth,
  isDatabaseOpen,
  now,
} = require('../main/db');
const {
  markInstallationInitialized,
  isRecoveryRequired,
  getRecoveryReason,
  getInstallState,
  resetInstallStateCacheForTests,
  clearRecoveryRequired,
} = require('../main/services/install-state');
const { checkSqliteIntegrity, runHealthCheck } = require('../main/services/schema-health');
const { recoveryApiProtectionMiddleware } = require('../main/server');
const express = require('express');
const request = require('supertest');
const Database = require('better-sqlite3');

function unlinkLiveDb(): void {
  const dbPath = getDbPath();
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

function seedOwner(): void {
  const t = now();
  getDatabase()
    .prepare(
      `
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)
  `,
    )
    .run('owner-r14', 'Owner', 'owner@r14.local', bcrypt.hashSync('OwnerPass1!', 4), t, t);
}

/**
 * Corrupt freelist header so SQLite still opens and serves SELECTs, but
 * PRAGMA integrity_check fails (classic corrupt-but-openable).
 */
function makeCorruptButOpenable(dbPath: string): void {
  const buf = Buffer.from(fs.readFileSync(dbPath));
  // Bytes 32–35: freelist trunk page; 36–39: freelist leaf count (big-endian).
  buf.writeUInt32BE(2, 32);
  buf.writeUInt32BE(99, 36);
  fs.writeFileSync(dbPath, buf);
}

async function main(): Promise<void> {
  console.log('R14 — Corrupt-DB fail-closed');
  console.log('='.repeat(60));

  // ── R14-01 healthy install + good backup ─────────────────────────────
  resetInstallStateCacheForTests();
  unlinkLiveDb();
  initDatabase();
  seedOwner();
  markInstallationInitialized();
  assert.equal(isRecoveryRequired(), false);
  assert.equal(checkSqliteIntegrity(getDatabase()).ok, true);
  const healthyReport = runHealthCheck();
  assert.equal(healthyReport.integrity.ok, true, 'schema-health integrity ok on healthy DB');

  const backup = await createBackup();
  const backupPath = backup.path as string;
  assert.ok(backupPath && fs.existsSync(backupPath), 'backup file exists');
  console.log('   ✓ R14-01 healthy DB + integrity-checked backup');

  // ── R14-02 corrupt-openable → latch corrupt_database ─────────────────
  closeDatabase();
  makeCorruptButOpenable(getDbPath());

  // Prove fixture is openable + dirty before initDatabase latch.
  {
    const probe = new Database(getDbPath());
    const integrity = checkSqliteIntegrity(probe);
    assert.equal(integrity.ok, false, 'fixture must fail integrity_check');
    assert.ok(integrity.details.length > 0);
    const users = probe.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    assert.ok(users.c >= 1, 'fixture still serves dirty reads');
    probe.close();
  }

  resetInstallStateCacheForTests();
  initDatabase();
  assert.equal(isDatabaseOpen(), true, 'corrupt-openable stays open for restore');
  assert.equal(isRecoveryRequired(), true);
  assert.equal(getRecoveryReason(), 'corrupt_database');
  assert.equal(
    getInstallState({ databasePresent: true, operationalUsers: 1 }).state,
    'RECOVERY_REQUIRED',
  );
  assert.equal(getDbHealth().ok, false);
  console.log('   ✓ R14-02 initDatabase latches corrupt_database (install-state)');

  // ── R14-03 /api/health + money path refuse dirty service ─────────────
  {
    const app = express();
    app.use(express.json());
    app.use(recoveryApiProtectionMiddleware);
    app.get('/api/health', (_req: any, res: any) => {
      const {
        isRecoveryRequired: irr,
        getRecoveryReason: grr,
        getInstallState: gis,
      } = require('../main/services/install-state');
      if (irr()) {
        return res.status(503).json({
          status: 'recovery_required',
          recovery_required: true,
          reason: grr(),
          install_state: gis().state,
        });
      }
      res.status(200).json({ status: 'ok' });
    });
    let moneyRan = false;
    app.post('/api/bills/1/payment', (_req: any, res: any) => {
      moneyRan = true;
      res.json({ ok: true });
    });

    const health = await request(app).get('/api/health');
    assert.equal(health.status, 503);
    assert.equal(health.body.recovery_required, true);
    assert.equal(health.body.status, 'recovery_required');
    assert.equal(health.body.reason, 'corrupt_database');

    const pay = await request(app).post('/api/bills/1/payment').send({ method: 'cash', amount: 1 });
    assert.equal(pay.status, 503);
    assert.equal(pay.body.recovery_required, true);
    assert.equal(pay.body.reason, 'corrupt_database');
    assert.equal(moneyRan, false, 'money handler must not run on dirty DB');
  }
  console.log('   ✓ R14-03 health 503 recovery_required; money APIs blocked');

  // ── R14-04 schema-health reports integrity failure ───────────────────
  {
    const report = runHealthCheck();
    assert.equal(report.integrity.ok, false);
    assert.ok(report.integrity.details.length > 0);
  }
  console.log('   ✓ R14-04 schema-health.integrity reflects corrupt-openable');

  // ── R14-05 good backup restore clears latch (H4 path intact) ─────────
  const restored = restoreBackup(backupPath, true);
  assert.equal(restored.success, true, restored.error || 'restore must succeed');
  assert.equal(isDatabaseOpen(), true);
  assert.equal(isRecoveryRequired(), false);
  assert.equal(getRecoveryReason(), null);
  assert.equal(checkSqliteIntegrity(getDatabase()).ok, true);
  assert.equal(getDbHealth().ok, true);
  const owner = getDatabase().prepare(`SELECT email FROM users WHERE id = ?`).get('owner-r14') as
    { email: string } | undefined;
  assert.ok(owner, 'restored owner present');
  clearRecoveryRequired();
  console.log('   ✓ R14-05 good backup restore → ACTIVE (H4 path preserved)');

  // ── R14-06 wire contracts (deepen, don't rebuild) ────────────────────
  {
    const root = path.join(__dirname, '..');
    const dbSrc = fs.readFileSync(path.join(root, 'main/db.ts'), 'utf8');
    const healthSrc = fs.readFileSync(path.join(root, 'main/services/schema-health.ts'), 'utf8');
    const installSrc = fs.readFileSync(path.join(root, 'main/services/install-state.ts'), 'utf8');
    assert.ok(healthSrc.includes('checkSqliteIntegrity'), 'schema-health exports integrity helper');
    assert.ok(dbSrc.includes("setRecoveryRequired('corrupt_database')"), 'startup latches corrupt');
    assert.ok(dbSrc.includes('checkSqliteIntegrity'), 'startup reuses schema-health integrity');
    assert.ok(installSrc.includes("'corrupt_database'"), 'install-state reason exists');
  }
  console.log('   ✓ R14-06 wire contracts: schema-health + install-state latch');

  closeDatabase();
  console.log('\nR14 corrupt-DB fail-closed: ALL PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

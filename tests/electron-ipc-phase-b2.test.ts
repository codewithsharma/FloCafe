/**
 * P0.6 Phase B2 — restart-and-install owner/manager JWT gate.
 * Usage: node tests/run-electron-node-test.cjs tests/electron-ipc-phase-b2.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-ipc-b2-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => '1.2.3-test' },
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

process.env.JWT_SECRET = 'b2-updater-ipc-test-secret-please-do-not-use-in-prod';
delete process.env.FLO_ALLOW_JWT_SECRET_ENV;

const { initDatabase, closeDatabase, getDatabase, now } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const {
  revokeToken,
  clearRevokedTokens,
  clearUserAuthCache,
  invalidateUserAuthCache,
} = require('../main/middleware/security');
const { queryAuditLogs } = require('../main/services/audit-log');
const { authorizeOwnerManagerJwt } = require('../main/security/ipc-auth');
const { handleRestartAndInstall } = require('../main/security/restart-and-install');

function seedUser(id: string, role: string, opts: { active?: boolean; tokensValidAfter?: string | null } = {}): void {
  const db = getDatabase();
  const active = opts.active === false ? 0 : 1;
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, tokens_valid_after, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    role,
    `${id}@test.local`,
    bcrypt.hashSync('StrongPass1', 4),
    role,
    active,
    opts.tokensValidAfter ?? null,
    now(),
    now(),
  );
}

function signToken(userId: string, role: string, overrides: jwt.SignOptions = {}): string {
  return jwt.sign(
    { userId, email: `${userId}@test.local`, role, jti: `jti-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h', ...overrides },
  );
}

function clearAudits(): void {
  getDatabase().prepare('DELETE FROM audit_logs').run();
}

function main(): void {
  console.log('P0.6 Phase B2 updater IPC JWT gate tests');
  console.log('='.repeat(60));

  initDatabase();
  clearRevokedTokens();
  clearUserAuthCache();

  seedUser('u-owner', 'owner');
  seedUser('u-manager', 'manager');
  seedUser('u-cashier', 'cashier');
  seedUser('u-waiter', 'waiter');
  seedUser('u-chef', 'chef');
  seedUser('u-inactive', 'owner', { active: false });

  let quitCalls = 0;
  const quitAndInstall = () => {
    quitCalls += 1;
  };

  function run(
    token: string | undefined | null,
    updateDownloaded: boolean,
  ): { success: boolean; error?: string } {
    return handleRestartAndInstall(token, {
      updateDownloaded,
      fromVersion: '1.2.3-test',
      toVersion: '1.2.4',
      quitAndInstall,
    });
  }

  // ── Auth helper + restart gate ──────────────────────────────────────────
  quitCalls = 0;
  assert.equal(run(undefined, true).success, false);
  assert.equal(run(null, true).success, false);
  assert.equal(run('', true).success, false);
  assert.equal(quitCalls, 0, 'missing token must not quit/install');
  console.log('   ✓ restart without token → rejected');

  quitCalls = 0;
  assert.equal(run('not-a-jwt', true).success, false);
  assert.equal(run(123 as unknown as string, true).success, false);
  assert.equal(quitCalls, 0);
  console.log('   ✓ malformed token → rejected');

  quitCalls = 0;
  const expired = signToken('u-owner', 'owner', { expiresIn: -10 });
  assert.equal(run(expired, true).success, false);
  assert.equal(quitCalls, 0);
  console.log('   ✓ expired token → rejected');

  quitCalls = 0;
  const ownerTok = signToken('u-owner', 'owner');
  revokeToken(ownerTok, Date.now() + 60_000);
  assert.equal(run(ownerTok, true).success, false);
  assert.equal(quitCalls, 0);
  clearRevokedTokens();
  console.log('   ✓ revoked token → rejected');

  quitCalls = 0;
  const staleUser = 'u-stale';
  seedUser(staleUser, 'owner', { tokensValidAfter: now() });
  // Token issued in the past relative to tokens_valid_after
  const staleTok = jwt.sign(
    { userId: staleUser, email: 'stale@test.local', role: 'owner', jti: 'stale', iat: Math.floor(Date.now() / 1000) - 120 },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  invalidateUserAuthCache(staleUser);
  assert.equal(authorizeOwnerManagerJwt(staleTok).ok, false);
  assert.equal(run(staleTok, true).success, false);
  assert.equal(quitCalls, 0);
  console.log('   ✓ stale token → rejected');

  quitCalls = 0;
  assert.equal(run(signToken('u-cashier', 'cashier'), true).success, false);
  assert.equal(run(signToken('u-waiter', 'waiter'), true).success, false);
  assert.equal(run(signToken('u-chef', 'chef'), true).success, false);
  assert.equal(quitCalls, 0);
  console.log('   ✓ cashier / waiter / chef tokens → rejected');

  quitCalls = 0;
  clearAudits();
  const ownerOk = signToken('u-owner', 'owner');
  const ownerResult = run(ownerOk, true);
  assert.equal(ownerResult.success, true);
  assert.equal(quitCalls, 1, 'owner + downloaded must quit/install once');
  console.log('   ✓ owner token → allowed');

  quitCalls = 0;
  clearAudits();
  const mgrOk = signToken('u-manager', 'manager');
  assert.equal(run(mgrOk, true).success, true);
  assert.equal(quitCalls, 1);
  console.log('   ✓ manager token → allowed');

  quitCalls = 0;
  const notReady = run(signToken('u-owner', 'owner'), false);
  assert.equal(notReady.success, false);
  assert.equal(quitCalls, 0, 'download flag false must not quit/install');
  console.log('   ✓ owner/manager + download flag false → safe no-op');

  quitCalls = 0;
  clearAudits();
  assert.equal(run(signToken('u-manager', 'manager'), true).success, true);
  assert.equal(quitCalls, 1);
  console.log('   ✓ owner/manager + downloaded update → install allowed');

  // Rejected paths never install (already asserted via quitCalls); explicit matrix
  quitCalls = 0;
  for (const bad of [undefined, '', 'bad', signToken('u-cashier', 'cashier'), expired]) {
    assert.equal(run(bad as any, true).success, false);
  }
  assert.equal(quitCalls, 0, 'rejected requests must not invoke quit/install');
  console.log('   ✓ rejected requests never invoke quit/install');

  // ── Audit ───────────────────────────────────────────────────────────────
  clearAudits();
  quitCalls = 0;
  const auditToken = signToken('u-owner', 'owner');
  assert.equal(run(auditToken, true).success, true);

  const audits = queryAuditLogs({ action: 'updater.restart_and_install', limit: 10 });
  assert.ok(audits.length >= 1, 'successful restart creates audit event');
  const row = audits[0];
  assert.equal(row.action, 'updater.restart_and_install');
  assert.equal(row.actor_user_id, 'u-owner');
  assert.equal(row.result, 'success');
  const meta = row.metadata as Record<string, unknown> | null;
  assert.ok(meta && typeof meta === 'object');
  assert.equal(meta.role, 'owner');
  assert.equal(meta.updateDownloaded, true);
  const blob = JSON.stringify(row);
  assert.equal(blob.includes(auditToken), false, 'token must never appear in audit row');
  assert.equal(blob.includes(process.env.JWT_SECRET!), false, 'JWT secret must never appear in audit');
  for (const key of Object.keys(meta)) {
    assert.equal(/(password|pin|token|secret|authorization|jwt)/i.test(key), false, `secret-like key ${key}`);
  }
  console.log('   ✓ successful restart audited with actor/role metadata; no token/secret');

  // Inactive owner must fail closed
  quitCalls = 0;
  assert.equal(run(signToken('u-inactive', 'owner'), true).success, false);
  assert.equal(quitCalls, 0);
  console.log('   ✓ inactive user token → rejected');

  // ── Source contracts ────────────────────────────────────────────────────
  const indexSrc = fs.readFileSync(path.join(__dirname, '../main/index.ts'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(__dirname, '../main/preload.ts'), 'utf8');
  const typesSrc = fs.readFileSync(path.join(__dirname, '../frontend/src/types/electron.d.ts'), 'utf8');
  const hookSrc = fs.readFileSync(path.join(__dirname, '../frontend/src/hooks/useUpdateStatus.ts'), 'utf8');

  assert.match(indexSrc, /handleRestartAndInstall|authorizeOwnerManagerJwt/, 'index uses B2 auth helper');
  assert.match(preloadSrc, /restartAndInstall:\s*\(\s*token/, 'preload passes token');
  assert.match(preloadSrc, /restart-and-install',\s*token/, 'preload invokes with token');
  assert.match(typesSrc, /restartAndInstall:\s*\(token:\s*string\)/, 'types require token');
  assert.match(hookSrc, /restartAndInstall\(/, 'hook still exposes restart');
  assert.match(hookSrc, /localStorage\.getItem\(['"]token['"]\)|useAuthStore|getState\(\)\.token/, 'hook passes existing auth token');

  // Status / check remain unauthenticated (no token arg)
  assert.match(preloadSrc, /getUpdateStatus:\s*\(\)\s*=>/);
  assert.match(preloadSrc, /checkForUpdates:\s*\(\)\s*=>/);
  assert.match(preloadSrc, /getStatus:\s*\(\)\s*=>/);
  const restartSrc = fs.readFileSync(path.join(__dirname, '../main/security/restart-and-install.ts'), 'utf8');
  const ipcAuthSrc = fs.readFileSync(path.join(__dirname, '../main/security/ipc-auth.ts'), 'utf8');
  assert.equal(restartSrc.includes('authorizeMasterPin'), false, 'restart gate must not use Master PIN');
  assert.equal(ipcAuthSrc.includes('authorizeMasterPin'), false, 'ipc-auth must not use Master PIN');
  assert.match(restartSrc, /updater\.restart_and_install/, 'audit action name');
  console.log('   ✓ source contracts: token IPC, public status/check, no Master PIN');

  console.log('✅ P0.6 Phase B2 updater IPC tests passed!');
  closeDatabase();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  main();
} catch (err) {
  console.error(err);
  try { closeDatabase(); } catch { /* ignore */ }
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
}

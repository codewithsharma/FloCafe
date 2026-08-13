/**
 * P0.2 JWT secret → Electron safeStorage (jwt-secret.enc)
 * Usage: node tests/run-electron-node-test.cjs tests/jwt-secret-storage.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import jwt from 'jsonwebtoken';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-jwt-secret-'));

let encryptionAvailable = true;
const mockSafeStorage = {
  isEncryptionAvailable: () => encryptionAvailable,
  encryptString: (s: string) => Buffer.from(`ENC:${s}`, 'utf8'),
  decryptString: (b: Buffer) => {
    const text = b.toString('utf8');
    if (!text.startsWith('ENC:')) throw new Error('not encrypted');
    return text.slice(4);
  },
};

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: mockSafeStorage,
    };
  }
  return originalLoad.apply(this, arguments as any);
};

// Ensure env secret does not short-circuit unless we opt in
delete process.env.JWT_SECRET;
delete process.env.FLO_ALLOW_JWT_SECRET_ENV;

const {
  clearJWTSecretCache,
  getJWTSecret,
  initializeJWTSecret,
  migrateLegacyJWTSecret,
  recoverJWTSecret,
  rotateJWTSecret,
  getJwtSecretStatus,
  hasSecureJWTSecretFile,
  getJwtSecretFilePathForTests,
  JwtSecretError,
  isJwtSecretEnvAllowed,
} = require('../main/services/jwt-secret');
const { initDatabase, closeDatabase, getDatabase, upsertSettings, createBackup } = require('../main/db');

function sqliteHasJwtSecret(): boolean {
  const row = getDatabase().prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get();
  return !!row;
}

async function main() {
  console.log('P0.2 JWT secret storage tests');
  console.log('='.repeat(60));

  initDatabase();
  assert.ok(getDatabase().pragma('user_version', { simple: true }) >= 74, 'schema >= v74');

  // 1–4: first install generates, persists, signs, verifies
  clearJWTSecretCache();
  encryptionAvailable = true;
  const secret1 = initializeJWTSecret();
  assert.equal(typeof secret1, 'string');
  assert.ok(secret1.length >= 64, 'generated secret length');
  assert.equal(hasSecureJWTSecretFile(), true, 'jwt-secret.enc exists');
  assert.equal(sqliteHasJwtSecret(), false, 'SQLite has no plaintext jwt_secret after first install');
  assert.equal(getJwtSecretStatus(), 'secure');

  clearJWTSecretCache();
  const secret2 = getJWTSecret();
  assert.equal(secret2, secret1, 'secret persists across cache clear / restart');

  const token = jwt.sign({ userId: 'u1', role: 'owner' }, secret1, { expiresIn: '1h' });
  const decoded = jwt.verify(token, getJWTSecret()) as { userId: string };
  assert.equal(decoded.userId, 'u1', 'secret can sign and verify JWT');
  console.log('   ✓ first install generate / persist / sign / verify');

  // 5–8: legacy migration preserves bytes and tokens; failure keeps legacy
  fs.unlinkSync(getJwtSecretFilePathForTests());
  clearJWTSecretCache();
  const legacy = 'aa'.repeat(32); // 64 hex chars
  upsertSettings({ jwt_secret: legacy, jwt_secret_storage: 'legacy' });
  assert.equal(getJwtSecretStatus(), 'legacy_pending_migration');

  const priorToken = jwt.sign({ userId: 'legacy-user', role: 'owner', jti: 'j1' }, legacy, { expiresIn: '1h' });
  const migrated = migrateLegacyJWTSecret();
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.secret, legacy, 'migration preserves exact bytes');
  assert.equal(sqliteHasJwtSecret(), false, 'legacy SQLite row removed after verify');
  assert.doesNotThrow(() => jwt.verify(priorToken, getJWTSecret()), 'existing token still verifies after migration');
  console.log('   ✓ legacy migration preserves secret bytes and tokens');

  // Migration failure preserves legacy: corrupt encrypt path
  fs.unlinkSync(getJwtSecretFilePathForTests());
  clearJWTSecretCache();
  const legacy2 = 'bb'.repeat(32);
  upsertSettings({ jwt_secret: legacy2, jwt_secret_storage: 'legacy' });
  const origEncrypt = mockSafeStorage.encryptString;
  mockSafeStorage.encryptString = () => Buffer.from('ENC:WRONG_SECRET_VALUE_PAD________', 'utf8');
  try {
    assert.throws(() => migrateLegacyJWTSecret(), (err: any) => err instanceof JwtSecretError);
    assert.equal(sqliteHasJwtSecret(), true, 'failed migration keeps SQLite secret');
    assert.equal(
      (getDatabase().prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get() as { value: string }).value,
      legacy2,
    );
  } finally {
    mockSafeStorage.encryptString = origEncrypt;
  }
  // Clean migrate for later tests
  migrateLegacyJWTSecret();
  console.log('   ✓ migration failure preserves legacy SQLite secret');

  // 9–10: corruption / unavailable fail closed
  clearJWTSecretCache();
  fs.writeFileSync(getJwtSecretFilePathForTests(), Buffer.from('not-valid'), { mode: 0o600 });
  assert.throws(() => getJWTSecret(), (err: any) => err?.code === 'JWT_SECRET_CORRUPT' || err?.code === 'JWT_SECRET_RECOVERY_REQUIRED');

  encryptionAvailable = true;
  recoverJWTSecret();
  encryptionAvailable = false;
  clearJWTSecretCache();
  delete process.env.JWT_SECRET;
  const prevRunAsNodeUna = process.env.ELECTRON_RUN_AS_NODE;
  const prevNodeEnvUna = process.env.NODE_ENV;
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.FLO_ALLOW_JWT_SECRET_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => getJWTSecret(), (err: any) => err?.code === 'JWT_SECRET_STORAGE_UNAVAILABLE');
  } finally {
    process.env.ELECTRON_RUN_AS_NODE = prevRunAsNodeUna;
    process.env.NODE_ENV = prevNodeEnvUna;
    encryptionAvailable = true;
    clearJWTSecretCache();
  }
  console.log('   ✓ corrupt file + unavailable safeStorage fail closed');

  // 11–13: recovery required + explicit recover invalidates old tokens
  const beforeRecover = getJWTSecret();
  const oldTok = jwt.sign({ userId: 'x', role: 'owner' }, beforeRecover, { expiresIn: '1h' });
  fs.unlinkSync(getJwtSecretFilePathForTests());
  clearJWTSecretCache();
  upsertSettings({ jwt_secret_storage: 'safestorage' });
  assert.equal(getJwtSecretStatus(), 'recovery_required');
  assert.throws(() => initializeJWTSecret(), (err: any) => err?.code === 'JWT_SECRET_RECOVERY_REQUIRED');

  const recovered = recoverJWTSecret();
  assert.notEqual(recovered, beforeRecover, 'recovery generates replacement secret');
  assert.throws(() => jwt.verify(oldTok, recovered), 'old tokens invalid after recovery');
  assert.doesNotThrow(() => jwt.verify(jwt.sign({ userId: 'x' }, recovered, { expiresIn: '1h' }), getJWTSecret()));
  console.log('   ✓ recovery required + recover invalidates old tokens');

  // 14–15: SQLite clean; backup must not contain secret string
  assert.equal(sqliteHasJwtSecret(), false);
  const currentSecret = getJWTSecret();
  const { path: backupPath } = await createBackup();
  const backupBytes = fs.readFileSync(backupPath);
  assert.ok(!backupBytes.includes(Buffer.from(currentSecret)), 'DB backup does not contain signing secret');
  console.log('   ✓ SQLite clean; backup excludes secret');

  // 16: settings API shape — omit jwt_secret (unit via public logic / DB)
  const settingsRows = getDatabase().prepare('SELECT key FROM settings').all() as { key: string }[];
  assert.ok(!settingsRows.some((r) => r.key === 'jwt_secret'), 'no jwt_secret setting row');
  console.log('   ✓ no jwt_secret in settings table');

  // 18: JWT_SECRET env for CI
  clearJWTSecretCache();
  process.env.JWT_SECRET = 'ci-test-secret-value-32bytes-minimum!!';
  assert.equal(isJwtSecretEnvAllowed(), true, 'ELECTRON_RUN_AS_NODE allows env');
  assert.equal(getJWTSecret(), 'ci-test-secret-value-32bytes-minimum!!');
  delete process.env.JWT_SECRET;
  clearJWTSecretCache();
  // reload from file
  assert.equal(getJWTSecret(), recovered);
  console.log('   ✓ JWT_SECRET works in CI runner');

  // 19: production packaged forbids env when not allowed — simulate by clearing ELECTRON_RUN_AS_NODE
  const prevRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.FLO_ALLOW_JWT_SECRET_ENV;
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'should-not-use';
  clearJWTSecretCache();
  try {
    assert.equal(isJwtSecretEnvAllowed(), false);
    assert.throws(() => getJWTSecret(), (err: any) => err?.code === 'JWT_SECRET_ENV_FORBIDDEN');
  } finally {
    process.env.ELECTRON_RUN_AS_NODE = prevRunAsNode;
    process.env.NODE_ENV = prevNodeEnv;
    delete process.env.JWT_SECRET;
    clearJWTSecretCache();
  }
  console.log('   ✓ production does not silently use JWT_SECRET');

  // 20: rotation invalidates tokens
  const preRotate = getJWTSecret();
  const liveTok = jwt.sign({ userId: 'rot', role: 'owner' }, preRotate, { expiresIn: '1h' });
  const afterRotate = rotateJWTSecret();
  assert.notEqual(afterRotate, preRotate);
  assert.throws(() => jwt.verify(liveTok, afterRotate));
  console.log('   ✓ rotation invalidates existing tokens');

  closeDatabase();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  console.log('✅ P0.2 JWT secret storage tests passed!');
}

main().catch((err) => {
  console.error(err);
  try { closeDatabase(); } catch { /* ignore */ }
  process.exit(1);
});

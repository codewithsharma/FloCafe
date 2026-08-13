/**
 * JWT signing secret — Electron safeStorage → userData/jwt-secret.enc
 *
 * Production never keeps plaintext jwt_secret in SQLite after migration.
 * CI/tests may supply JWT_SECRET when FLO_ALLOW_JWT_SECRET_ENV=1,
 * NODE_ENV=test, or ELECTRON_RUN_AS_NODE (test runner).
 *
 * States:
 * - first_install: no .enc, no legacy SQLite row → generate + encrypt
 * - legacy: SQLite plaintext present → migrate (same bytes) then delete row
 * - secure: .enc decrypts → use
 * - recovery_required: marker says safestorage (or users exist) but .enc missing/corrupt
 *   → do NOT silently regenerate; call recoverJWTSecret() explicitly
 */

import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { getDatabase, now } from '../db';

export const JWT_SECRET_FILE = 'jwt-secret.enc';
export const JWT_SECRET_STORAGE_KEY = 'jwt_secret_storage';
export const JWT_SECRET_STORAGE_SECURE = 'safestorage';
export const LEGACY_JWT_SECRET_KEY = 'jwt_secret';

export type JwtSecretStatus =
  | 'env'
  | 'secure'
  | 'legacy_pending_migration'
  | 'first_install'
  | 'recovery_required'
  | 'unavailable';

export class JwtSecretError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'JWT_SECRET_STORAGE_UNAVAILABLE'
      | 'JWT_SECRET_RECOVERY_REQUIRED'
      | 'JWT_SECRET_CORRUPT'
      | 'JWT_SECRET_MIGRATE_FAILED'
      | 'JWT_SECRET_ENV_FORBIDDEN',
  ) {
    super(message);
    this.name = 'JwtSecretError';
  }
}

let _cache: string | null = null;

function getSecretFilePath(): string {
  return path.join(app.getPath('userData'), JWT_SECRET_FILE);
}

export function clearJWTSecretCache(): void {
  _cache = null;
}

export function isJwtSecretEnvAllowed(): boolean {
  if (process.env.FLO_ALLOW_JWT_SECRET_ENV === '1') return true;
  if (process.env.NODE_ENV === 'test') return true;
  // Electron test runner (tests/run-electron-node-test.cjs)
  if (process.env.ELECTRON_RUN_AS_NODE === '1') return true;
  // Unpackaged / controlled local development (dev-server, npm run dev)
  try {
    if (!app.isPackaged) return true;
  } catch {
    return true;
  }
  return false;
}

export function isSecureJwtStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Test-runner escape: Electron-as-Node suites without a safeStorage mock. */
function ensureTestRunnerSecret(): void {
  if (process.env.JWT_SECRET) return;
  if (!isJwtSecretEnvAllowed()) return;
  if (isSecureJwtStorageAvailable()) return;
  process.env.JWT_SECRET = `test-ephemeral-${process.pid}-${Date.now()}`;
}

export function hasSecureJWTSecretFile(): boolean {
  try {
    return fs.existsSync(getSecretFilePath());
  } catch {
    return false;
  }
}

function readLegacySqliteSecret(): string | null {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(LEGACY_JWT_SECRET_KEY) as
      | { value: string }
      | undefined;
    return row?.value || null;
  } catch {
    return null;
  }
}

function getStorageMarker(): string | null {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(JWT_SECRET_STORAGE_KEY) as
      | { value: string }
      | undefined;
    return row?.value || null;
  } catch {
    return null;
  }
}

function setStorageMarker(value: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JWT_SECRET_STORAGE_KEY, value, now());
}

function deleteLegacySqliteSecret(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_JWT_SECRET_KEY);
}

function installHasUsers(): boolean {
  try {
    const row = getDatabase().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    return Number(row?.c) > 0;
  } catch {
    return false;
  }
}

function writeEncryptedSecret(secret: string): void {
  if (!isSecureJwtStorageAvailable()) {
    throw new JwtSecretError(
      'Secure storage is unavailable — cannot persist JWT secret',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }
  const encrypted = safeStorage.encryptString(secret);
  fs.writeFileSync(getSecretFilePath(), encrypted, { mode: 0o600 });
}

function readEncryptedSecret(): string {
  if (!isSecureJwtStorageAvailable()) {
    throw new JwtSecretError(
      'Secure storage is unavailable — cannot read JWT secret',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }
  if (!hasSecureJWTSecretFile()) {
    throw new JwtSecretError(
      'JWT signing secret file is missing — recovery required',
      'JWT_SECRET_RECOVERY_REQUIRED',
    );
  }
  try {
    const encrypted = fs.readFileSync(getSecretFilePath());
    const secret = safeStorage.decryptString(encrypted);
    if (!secret || typeof secret !== 'string' || secret.length < 32) {
      throw new Error('empty');
    }
    return secret;
  } catch (err) {
    if (err instanceof JwtSecretError) throw err;
    throw new JwtSecretError(
      'JWT signing secret file is corrupt or undecryptable — recovery required',
      'JWT_SECRET_CORRUPT',
    );
  }
}

export function getJwtSecretStatus(): JwtSecretStatus {
  ensureTestRunnerSecret();
  if (process.env.JWT_SECRET && isJwtSecretEnvAllowed()) return 'env';
  if (!isSecureJwtStorageAvailable() && !isJwtSecretEnvAllowed()) return 'unavailable';
  if (hasSecureJWTSecretFile()) {
    try {
      readEncryptedSecret();
      return 'secure';
    } catch {
      return 'recovery_required';
    }
  }
  if (readLegacySqliteSecret()) return 'legacy_pending_migration';
  if (getStorageMarker() === JWT_SECRET_STORAGE_SECURE || installHasUsers()) {
    return 'recovery_required';
  }
  return 'first_install';
}

/**
 * Crash-safe legacy migration: encrypt exact bytes → verify → only then DELETE SQLite row.
 */
export function migrateLegacyJWTSecret(): { migrated: boolean; secret: string | null } {
  const legacy = readLegacySqliteSecret();
  if (!legacy) return { migrated: false, secret: null };

  if (!isSecureJwtStorageAvailable()) {
    throw new JwtSecretError(
      'Cannot migrate JWT secret — secure storage unavailable',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }

  // If .enc already exists and matches legacy, just delete SQLite (idempotent crash recovery)
  if (hasSecureJWTSecretFile()) {
    try {
      const existing = readEncryptedSecret();
      if (existing === legacy) {
        deleteLegacySqliteSecret();
        setStorageMarker(JWT_SECRET_STORAGE_SECURE);
        _cache = existing;
        return { migrated: true, secret: existing };
      }
      // File exists but differs — do not delete legacy; fail closed
      throw new JwtSecretError(
        'Secure JWT secret file conflicts with legacy SQLite secret',
        'JWT_SECRET_MIGRATE_FAILED',
      );
    } catch (err) {
      if (err instanceof JwtSecretError && err.code === 'JWT_SECRET_MIGRATE_FAILED') throw err;
      // Corrupt file while legacy remains — rewrite from legacy
    }
  }

  writeEncryptedSecret(legacy);
  const verified = readEncryptedSecret();
  if (verified !== legacy) {
    try { fs.unlinkSync(getSecretFilePath()); } catch { /* ignore */ }
    throw new JwtSecretError(
      'JWT secret migration verification failed — legacy SQLite secret preserved',
      'JWT_SECRET_MIGRATE_FAILED',
    );
  }

  deleteLegacySqliteSecret();
  setStorageMarker(JWT_SECRET_STORAGE_SECURE);
  _cache = verified;
  console.log('[Auth] Migrated JWT secret from SQLite to secure storage');
  return { migrated: true, secret: verified };
}

function generateAndPersistSecret(): string {
  if (!isSecureJwtStorageAvailable()) {
    throw new JwtSecretError(
      'Cannot create JWT secret — secure storage unavailable',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }
  const secret = randomBytes(32).toString('hex');
  writeEncryptedSecret(secret);
  const verified = readEncryptedSecret();
  if (verified !== secret) {
    try { fs.unlinkSync(getSecretFilePath()); } catch { /* ignore */ }
    throw new JwtSecretError(
      'JWT secret persistence verification failed',
      'JWT_SECRET_MIGRATE_FAILED',
    );
  }
  // Ensure no leftover plaintext
  deleteLegacySqliteSecret();
  setStorageMarker(JWT_SECRET_STORAGE_SECURE);
  _cache = verified;
  console.log('[Auth] Generated new JWT secret in secure storage');
  return verified;
}

/**
 * Startup entry: migrate legacy if needed, load secure secret, or first-install generate.
 * Does NOT silently regenerate when recovery is required.
 */
export function initializeJWTSecret(): string {
  clearJWTSecretCache();
  ensureTestRunnerSecret();

  if (process.env.JWT_SECRET) {
    if (!isJwtSecretEnvAllowed()) {
      throw new JwtSecretError(
        'JWT_SECRET env is not allowed in this environment',
        'JWT_SECRET_ENV_FORBIDDEN',
      );
    }
    _cache = process.env.JWT_SECRET;
    return _cache;
  }

  const status = getJwtSecretStatus();
  if (status === 'unavailable') {
    throw new JwtSecretError(
      'Secure storage is unavailable — authentication cannot start',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }
  if (status === 'recovery_required') {
    throw new JwtSecretError(
      'JWT signing secret is missing or corrupt — owner recovery required',
      'JWT_SECRET_RECOVERY_REQUIRED',
    );
  }
  if (status === 'legacy_pending_migration') {
    const { secret } = migrateLegacyJWTSecret();
    if (!secret) {
      throw new JwtSecretError('Legacy JWT migration produced no secret', 'JWT_SECRET_MIGRATE_FAILED');
    }
    return secret;
  }
  if (status === 'secure') {
    _cache = readEncryptedSecret();
    return _cache;
  }
  // first_install
  return generateAndPersistSecret();
}

/**
 * Explicit new-machine / corrupt-file recovery. Invalidates all prior JWTs
 * by replacing the signing secret. Caller must authorize (owner + Master PIN).
 */
export function recoverJWTSecret(): string {
  if (process.env.JWT_SECRET && isJwtSecretEnvAllowed()) {
    clearJWTSecretCache();
    _cache = process.env.JWT_SECRET;
    return _cache;
  }
  if (!isSecureJwtStorageAvailable()) {
    throw new JwtSecretError(
      'Cannot recover JWT secret — secure storage unavailable',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }
  // Remove corrupt file if present
  if (hasSecureJWTSecretFile()) {
    try { fs.unlinkSync(getSecretFilePath()); } catch { /* ignore */ }
  }
  deleteLegacySqliteSecret();
  const secret = generateAndPersistSecret();
  // Force credential-era invalidation as belt-and-suspenders (new secret already breaks verify)
  try {
    getDatabase().prepare('UPDATE users SET tokens_valid_after = ?').run(now());
  } catch { /* ignore */ }
  console.log('[Auth] JWT secret recovered — all prior tokens invalidated');
  return secret;
}

/**
 * Owner-initiated rotation (hard cutover). Same as recover with a new random secret.
 */
export function rotateJWTSecret(): string {
  return recoverJWTSecret();
}

export function getJWTSecret(): string {
  if (_cache) return _cache;
  ensureTestRunnerSecret();

  if (process.env.JWT_SECRET) {
    if (!isJwtSecretEnvAllowed()) {
      throw new JwtSecretError(
        'JWT_SECRET env is not allowed in this environment',
        'JWT_SECRET_ENV_FORBIDDEN',
      );
    }
    _cache = process.env.JWT_SECRET;
    return _cache;
  }

  // Lazy path for tests that never call initializeJWTSecret
  const status = getJwtSecretStatus();
  if (status === 'legacy_pending_migration') {
    const { secret } = migrateLegacyJWTSecret();
    if (secret) return secret;
  }
  if (status === 'secure') {
    _cache = readEncryptedSecret();
    return _cache;
  }
  if (status === 'first_install') {
    return generateAndPersistSecret();
  }
  if (status === 'unavailable') {
    throw new JwtSecretError(
      'Secure storage is unavailable — authentication unavailable',
      'JWT_SECRET_STORAGE_UNAVAILABLE',
    );
  }
  throw new JwtSecretError(
    'JWT signing secret is missing or corrupt — recovery required',
    'JWT_SECRET_RECOVERY_REQUIRED',
  );
}

/** Test helper: path to encrypted file under current userData. */
export function getJwtSecretFilePathForTests(): string {
  return getSecretFilePath();
}

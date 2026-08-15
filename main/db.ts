import Database from 'better-sqlite3';
import type { Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { BUNDLED_COUNTRY_PACKS, bundledPackVersionId } from './tax-packs/bundled';
import { now, parseDbTimestamp } from './database/time';
import {
  insertOrderItemAddons,
  parseItemJson,
  attachEffectiveAddons,
  parseRowJson,
} from './database/order-row';
import {
  clearInstallationMarker,
  isInstallationInitialized,
  markInstallationInitialized,
  setRecoveryRequired,
  clearRecoveryRequired,
} from './services/install-state';
import { MIGRATIONS, setMigrationHost } from './database/migrations';

export { MIGRATIONS };

let db: Database.Database;
let dbHealthError: string | null = null;

/** Typed fail-closed condition when an existing install is missing its operational DB (REC-01). */
export class DatabaseRecoveryRequiredError extends Error {
  readonly code = 'DATABASE_RECOVERY_REQUIRED';
  readonly reason: 'missing_database' | 'empty_database';

  constructor(reason: 'missing_database' | 'empty_database', message?: string) {
    super(
      message ||
        (reason === 'missing_database'
          ? 'Operational database is missing — restore required'
          : 'Operational database is empty for an initialized installation — restore required'),
    );
    this.name = 'DatabaseRecoveryRequiredError';
    this.reason = reason;
  }
}

export function isDatabaseOpen(): boolean {
  return Boolean(db);
}

// Database backup, restore, and wipe operations must not overlap. The lock is
// a FIFO promise chain so a rejected operation cannot strand later work.
let databaseMaintenanceTail: Promise<void> = Promise.resolve();
let databaseMaintenanceActive = false;
let activeDatabaseRequests = 0;
let maintenanceRequestWaiters: (() => void)[] = [];
let maintenanceDrainWaiters: (() => void)[] = [];
const databaseMaintenanceStartListeners = new Set<() => void>();
const databaseMaintenanceEndListeners = new Set<() => void>();

function releaseMaintenanceDrainWaiters(): void {
  if (activeDatabaseRequests !== 0) return;
  const waiters = maintenanceDrainWaiters;
  maintenanceDrainWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function releaseMaintenanceRequestWaiters(): void {
  if (activeDatabaseRequests !== 0 || databaseMaintenanceActive) return;
  const waiters = maintenanceRequestWaiters;
  maintenanceRequestWaiters = [];
  waiters.forEach((resolve) => resolve());
}

export function withDatabaseRequest<T>(operation: () => T | Promise<T>): Promise<T> {
  const run = (): Promise<T> => {
    // Reserve the request synchronously. A maintenance lock scheduled in the
    // same turn must observe this request before it starts replacing the DB.
    activeDatabaseRequests += 1;
    return Promise.resolve()
      .then(operation)
      .finally(() => {
        activeDatabaseRequests = Math.max(0, activeDatabaseRequests - 1);
        releaseMaintenanceDrainWaiters();
        releaseMaintenanceRequestWaiters();
      });
  };
  if (!databaseMaintenanceActive) return run();
  return new Promise<T>((resolve, reject) => {
    maintenanceRequestWaiters.push(() => {
      run().then(resolve, reject);
    });
  });
}

export function registerDatabaseMaintenanceStartListener(listener: () => void): () => void {
  databaseMaintenanceStartListeners.add(listener);
  return () => databaseMaintenanceStartListeners.delete(listener);
}

export function registerDatabaseMaintenanceEndListener(listener: () => void): () => void {
  databaseMaintenanceEndListeners.add(listener);
  return () => databaseMaintenanceEndListeners.delete(listener);
}

export function isDatabaseMaintenanceActive(): boolean {
  return databaseMaintenanceActive;
}

const DATABASE_MAINTENANCE_ROUTES = new Set([
  'POST /api/db/import',
  'POST /api/db/backup',
  'GET /api/db/download',
  'POST /api/db-tools/initialize',
]);

function isDatabaseMaintenanceRoute(req: Request): boolean {
  return DATABASE_MAINTENANCE_ROUTES.has(`${req.method} ${req.path}`);
}

export function databaseMaintenanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // A later request must still be rejected here, before authentication or
  // route middleware can query a database handle that the active operation may
  // close and replace.
  if (databaseMaintenanceActive) {
    res.status(503).json({ error: 'Database maintenance in progress' });
    return;
  }

  // These handlers acquire the FIFO lock themselves. Do not count the lock
  // owner as an active database request: its response cannot finish until the
  // handler returns, so counting it would make the handler wait for itself.
  if (isDatabaseMaintenanceRoute(req)) {
    next();
    return;
  }

  activeDatabaseRequests += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeDatabaseRequests = Math.max(0, activeDatabaseRequests - 1);
    releaseMaintenanceDrainWaiters();
    releaseMaintenanceRequestWaiters();
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

export function withDatabaseMaintenanceLock<T>(operation: () => T | Promise<T>): Promise<T> {
  const previous = databaseMaintenanceTail;
  let release!: () => void;
  databaseMaintenanceTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  return previous
    .then(async () => {
      databaseMaintenanceActive = true;
      for (const listener of databaseMaintenanceStartListeners) {
        try {
          listener();
        } catch (error) {
          console.error('[DB] Maintenance listener failed:', error);
        }
      }
      // Maintenance routes are excluded from activeDatabaseRequests by the
      // middleware above. Any remaining active requests were already in flight
      // before maintenance began and must drain first.
      if (activeDatabaseRequests > 0) {
        await new Promise<void>((resolve) => maintenanceDrainWaiters.push(resolve));
      }
      try {
        return await operation();
      } finally {
        databaseMaintenanceActive = false;
        for (const listener of databaseMaintenanceEndListeners) {
          try {
            listener();
          } catch (error) {
            console.error('[DB] Maintenance end listener failed:', error);
          }
        }
        releaseMaintenanceRequestWaiters();
      }
    })
    .finally(release);
}

const DEFAULT_CLOUD_SERVER_URL = 'https://blue.flopos.com/';

function randomSecret(): string {
  return crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function getSettingValue(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string | null } | undefined;
  return row?.value ?? null;
}

export function upsertSettings(entries: Record<string, string | undefined | null>): void {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  for (const [key, val] of Object.entries(entries)) {
    if (val !== undefined) stmt.run(key, val ?? '', now());
  }
}

function upsertSetting(key: string, value: string): void {
  db.prepare(
    `
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `,
  ).run(key, value, now());
}

function insertSettingIfMissing(key: string, value: string): void {
  db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    key,
    value,
    now(),
  );
}

export function getDbHealth(): { ok: boolean; error?: string } {
  if (!db) return { ok: false, error: 'Database not initialized' };
  if (dbHealthError) return { ok: false, error: dbHealthError };
  return { ok: true };
}

export function getDbPath(): string {
  const userDataPath = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '../');
  return path.join(userDataPath, 'flo.db');
}

export function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'backups');
}

type ReplacementJournal = {
  phase: 'prepared' | 'committed';
  recoveryPath: string;
  dbPath: string;
  baselineForeignKeyViolations?: string[];
};

function syncFile(filePath: string): void {
  // Windows does not allow fsync on a read-only file handle (it reports
  // EPERM). All callers pass application-owned database, journal, or backup
  // files, so use a writable handle for portable durability flushing.
  const fd = fs.openSync(filePath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeReplacementJournal(journalPath: string, journal: ReplacementJournal): void {
  const tempPath = `${journalPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(journal), { encoding: 'utf8', mode: 0o600 });
  syncFile(tempPath);
  fs.renameSync(tempPath, journalPath);
  if (!syncDirectory(path.dirname(journalPath)) && process.platform !== 'win32') {
    throw new Error('Could not durably record database replacement journal');
  }
}

function isLiveDatabaseTarget(candidatePath: string, dbPath: string): boolean {
  const normalize = (value: string) =>
    process.platform === 'win32' || process.platform === 'darwin' ? value.toLowerCase() : value;
  if (normalize(path.resolve(candidatePath)) === normalize(path.resolve(dbPath))) return true;
  try {
    const candidateStat = fs.statSync(candidatePath);
    const dbStat = fs.statSync(dbPath);
    if (candidateStat.dev === dbStat.dev && candidateStat.ino === dbStat.ino) return true;
  } catch {}
  try {
    const candidateReal = path.join(
      fs.realpathSync(path.dirname(candidatePath)),
      path.basename(candidatePath),
    );
    return normalize(candidateReal) === normalize(fs.realpathSync(dbPath));
  } catch {
    return false;
  }
}

function pathEntryExists(filePath: string): boolean {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function syncDirectory(directoryPath: string): boolean {
  try {
    const fd = fs.openSync(directoryPath, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch {
    // Directory fsync is unavailable on some Windows filesystems.
    return false;
  }
}

function removeReplacementArtifacts(journalPath: string, recoveryPath: string): void {
  for (const filePath of [
    journalPath,
    `${journalPath}.tmp`,
    recoveryPath,
    `${recoveryPath}-wal`,
    `${recoveryPath}-shm`,
  ]) {
    try {
      if (pathEntryExists(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
  syncDirectory(path.dirname(journalPath));
}

let recoverySchemaReference: Map<string, string[]> | null = null;
let buildingIdealSchema = false;

function getRecoverySchemaReference(): Map<string, string[]> {
  if (recoverySchemaReference) return recoverySchemaReference;
  const idealDb = buildIdealSchemaDb();
  try {
    recoverySchemaReference = new Map(
      getTables(idealDb).map((table) => [table, getColumns(idealDb, table)]),
    );
    return recoverySchemaReference;
  } finally {
    idealDb.close();
  }
}

function normalizedSchemaDefinitions(dbInstance: Database.Database): Map<string, string> {
  const definitions = dbInstance
    .prepare(
      `
    SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name <> '_flo_meta'
  `,
    )
    .all() as { type: string; name: string; tbl_name: string; sql: string }[];
  return new Map(
    definitions.map((row) => [
      `${row.type}:${row.name}`,
      row.sql.replace(/\s+/g, ' ').trim().toLowerCase(),
    ]),
  );
}

function isHealthyDatabaseFile(
  filePath: string,
  allowedForeignKeyViolations: Set<string> | null | undefined = undefined,
  requireMetadata = true,
): boolean {
  try {
    const candidate = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity =
      (candidate.prepare('PRAGMA integrity_check').get() as { integrity_check: string })
        .integrity_check === 'ok';
    const foreignKeyViolations = getForeignKeyViolationKeys(candidate);
    const foreignKeysClean =
      allowedForeignKeyViolations === null ||
      (allowedForeignKeyViolations
        ? [...foreignKeyViolations].every((key) => allowedForeignKeyViolations.has(key))
        : foreignKeyViolations.size === 0);
    const schemaVersion = Number(candidate.pragma('user_version', { simple: true }));
    let metadata: { value: string } | undefined;
    try {
      metadata = candidate
        .prepare("SELECT value FROM _flo_meta WHERE key = 'schema_version'")
        .get() as { value: string } | undefined;
    } catch {}
    const tables = new Set(getTables(candidate));
    const expectedSchema = getRecoverySchemaReference();
    const columnsValid = [...expectedSchema.entries()].every(([table, columns]) => {
      const available = new Set(getColumns(candidate, table));
      return columns.every((column) => available.has(column));
    });
    const supportedVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version || 0;
    const idealDb = buildIdealSchemaDb();
    let definitionsValid = false;
    try {
      const expectedDefinitions = normalizedSchemaDefinitions(idealDb);
      const actualDefinitions = normalizedSchemaDefinitions(candidate);
      definitionsValid =
        expectedDefinitions.size === actualDefinitions.size &&
        [...expectedDefinitions].every(([key, sql]) => actualDefinitions.get(key) === sql);
    } finally {
      idealDb.close();
    }
    candidate.close();
    return (
      integrity &&
      foreignKeysClean &&
      schemaVersion > 0 &&
      schemaVersion <= supportedVersion &&
      (!requireMetadata || metadata?.value === String(schemaVersion)) &&
      tables.size === expectedSchema.size &&
      [...expectedSchema.keys()].every((table) => tables.has(table)) &&
      columnsValid &&
      definitionsValid
    );
  } catch {
    return false;
  }
}

function removeOlderReplacementJournals(
  journals: string[],
  dbPath: string,
  backupDir: string,
): void {
  const backupRoot = path.resolve(backupDir);
  for (const journalPath of journals) {
    try {
      const journalStat = fs.lstatSync(journalPath);
      if (journalStat.isSymbolicLink() || !journalStat.isFile())
        throw new Error('journal is not a regular file');
      const journal = JSON.parse(
        fs.readFileSync(journalPath, 'utf8'),
      ) as Partial<ReplacementJournal>;
      if (
        (journal.phase !== 'prepared' && journal.phase !== 'committed') ||
        typeof journal.recoveryPath !== 'string' ||
        journal.dbPath !== dbPath ||
        path.dirname(journal.recoveryPath) !== backupRoot ||
        `${path.basename(journalPath, '.json')}.db` !== path.basename(journal.recoveryPath)
      ) {
        throw new Error('invalid stale replacement journal');
      }
      removeReplacementArtifacts(journalPath, journal.recoveryPath);
    } catch (error) {
      // The newest journal has already established the recovery decision. Do
      // not let an unrelated stale/corrupt older journal brick every startup;
      // remove only that journal and its same-basename snapshot.
      const fallbackRecovery = path.join(backupRoot, `${path.basename(journalPath, '.json')}.db`);
      removeReplacementArtifacts(journalPath, fallbackRecovery);
      console.warn(`[DB] Removed stale invalid replacement journal: ${journalPath}`);
    }
  }
}

function recoverInterruptedDatabaseReplacement(dbPath: string, backupDir: string): void {
  let journals: string[] = [];
  try {
    journals = fs
      .readdirSync(backupDir)
      .filter((name) => /^(?:flo-restore|flo-reset)-recovery-.+\.json$/.test(name))
      .map((name) => path.join(backupDir, name))
      .sort((a, b) => fs.lstatSync(b).mtimeMs - fs.lstatSync(a).mtimeMs);
  } catch (error) {
    throw new Error(
      `Could not inspect database replacement journals: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  for (const journalPath of journals) {
    const fallbackRecovery = path.join(
      path.resolve(backupDir),
      `${path.basename(journalPath, '.json')}.db`,
    );
    let journalStat: fs.Stats;
    try {
      journalStat = fs.lstatSync(journalPath);
    } catch {
      removeReplacementArtifacts(journalPath, fallbackRecovery);
      continue;
    }
    if (journalStat.isSymbolicLink() || !journalStat.isFile()) {
      removeReplacementArtifacts(journalPath, fallbackRecovery);
      continue;
    }
    let journal: ReplacementJournal;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(journalPath, 'utf8'),
      ) as Partial<ReplacementJournal>;
      if (
        (parsed.phase !== 'prepared' && parsed.phase !== 'committed') ||
        typeof parsed.recoveryPath !== 'string' ||
        typeof parsed.dbPath !== 'string' ||
        !path.isAbsolute(parsed.recoveryPath) ||
        !path.isAbsolute(parsed.dbPath) ||
        (parsed.baselineForeignKeyViolations !== undefined &&
          (!Array.isArray(parsed.baselineForeignKeyViolations) ||
            parsed.baselineForeignKeyViolations.some((key) => typeof key !== 'string')))
      ) {
        throw new Error('invalid phase or paths');
      }
      journal = parsed as ReplacementJournal;
    } catch (error) {
      throw new Error(
        `Interrupted database replacement journal is invalid: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    const recoveryPath = journal.recoveryPath;
    const backupRoot = path.resolve(backupDir);
    const recoveryRoot = path.dirname(recoveryPath);
    const journalBase = path.basename(journalPath, '.json');
    const recoveryNameValid = `${journalBase}.db` === path.basename(recoveryPath);
    if (journal.dbPath !== dbPath || recoveryRoot !== backupRoot || !recoveryNameValid) {
      throw new Error('Interrupted database replacement recovery snapshot could not be validated');
    }
    // Journals written by this version carry the exact legacy FK baseline.
    // Older journals predate that field, so retain their compatibility behavior
    // rather than bricking an installation during an upgrade.
    const allowedForeignKeyViolations =
      journal.baselineForeignKeyViolations === undefined
        ? null
        : new Set(journal.baselineForeignKeyViolations);
    // Replacement snapshots are copies of the live database, not backup
    // artifacts; the live database intentionally has no _flo_meta table.
    const requireMetadata = false;
    // A committed replacement is already durable in the live path. Finalize
    // its journal before touching the old snapshot; legacy installs may have
    // pre-existing FK violations that are intentionally preserved.
    if (
      journal.phase === 'committed' &&
      isHealthyDatabaseFile(dbPath, allowedForeignKeyViolations, requireMetadata)
    ) {
      removeReplacementArtifacts(journalPath, recoveryPath);
      removeOlderReplacementJournals(journals.slice(1), dbPath, backupDir);
      console.warn(`[DB] Finalized committed database replacement journal: ${journalPath}`);
      return;
    }
    let recoveryStat: fs.Stats;
    try {
      recoveryStat = fs.lstatSync(recoveryPath);
    } catch {
      throw new Error('Interrupted database replacement snapshot is missing');
    }
    const recoverySidecars =
      pathEntryExists(`${recoveryPath}-wal`) || pathEntryExists(`${recoveryPath}-shm`);
    if (
      recoveryStat.isSymbolicLink() ||
      !recoveryStat.isFile() ||
      recoverySidecars ||
      !isHealthyDatabaseFile(recoveryPath, allowedForeignKeyViolations, requireMetadata)
    ) {
      throw new Error('Interrupted database replacement recovery snapshot could not be validated');
    }
    const failures = removeDatabaseFiles(dbPath);
    if (failures.length > 0)
      throw new Error(`Could not clear interrupted database replacement: ${failures.join(', ')}`);
    fs.copyFileSync(recoveryPath, dbPath);
    syncFile(dbPath);
    if (!syncDirectory(path.dirname(dbPath)) && process.platform !== 'win32') {
      throw new Error('Could not durably install recovered database');
    }
    removeReplacementArtifacts(journalPath, recoveryPath);
    removeOlderReplacementJournals(journals.slice(1), dbPath, backupDir);
    console.warn(`[DB] Recovered database from interrupted replacement snapshot: ${recoveryPath}`);
    return;
  }
}

export type InitDatabaseOptions = {
  recoverInterruptedReplacement?: boolean;
  /**
   * Factory-reset only: allow creating a new empty DB while the installation
   * marker is still present. Marker is cleared only after durable commit.
   */
  allowCreateDespiteMarker?: boolean;
};

export function initDatabase(
  recoverInterruptedReplacement: boolean | InitDatabaseOptions = true,
): void {
  const opts: InitDatabaseOptions =
    typeof recoverInterruptedReplacement === 'boolean'
      ? { recoverInterruptedReplacement }
      : recoverInterruptedReplacement;
  const shouldRecoverInterrupted = opts.recoverInterruptedReplacement !== false;
  const allowCreateDespiteMarker = opts.allowCreateDespiteMarker === true;

  const dbPath = getDbPath();
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  if (shouldRecoverInterrupted) recoverInterruptedDatabaseReplacement(dbPath, backupDir);

  const dbExists = pathEntryExists(dbPath);
  // Marker + missing DB is RECOVERY unless this is an in-progress factory reset
  // that intentionally recreates an empty DB before clearing the marker.
  if (!dbExists && isInstallationInitialized() && !allowCreateDespiteMarker) {
    setRecoveryRequired('missing_database');
    throw new DatabaseRecoveryRequiredError('missing_database');
  }

  console.log(`[DB] Opening database at: ${dbPath}`);
  dbHealthError = null;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = OFF'); // Off during migrations

  runMigrations();

  db.pragma('foreign_keys = ON');

  runStartupIntegrityCheck();
  repairSequences();
  autoRepairPaymentDetails();
  autoRepairDefaultPrinter();

  // REC-01: marker + empty operational café must not look like first install.
  try {
    const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    if (isInstallationInitialized() && userCount === 0) {
      setRecoveryRequired('empty_database');
      console.error('[DB] REC-01: installation marker present but users=0 — recovery required');
    } else if (userCount > 0) {
      // Safe one-time backfill for pre-marker installs; never mark empty DBs.
      if (!isInstallationInitialized()) {
        markInstallationInitialized();
        console.log('[DB] Backfilled installation marker for existing café');
      } else {
        clearRecoveryRequired();
      }
    }
  } catch (err: unknown) {
    // Schema too new / missing users table is handled elsewhere; do not swallow mismatch.
    if (err instanceof DatabaseRecoveryRequiredError) throw err;
  }
}

export function ensureCloudIdentity(): { posHash: string; deviceSecret: string } {
  let deviceSecret = getSettingValue('cloud_device_secret');
  if (!deviceSecret) {
    deviceSecret = randomSecret();
    upsertSetting('cloud_device_secret', deviceSecret);
  }

  let posHash = getSettingValue('cloud_pos_hash');
  if (!posHash) {
    posHash = `pos_${sha256Hex(deviceSecret).slice(0, 40)}`;
    upsertSetting('cloud_pos_hash', posHash);
  }

  insertSettingIfMissing('cloud_device_created_at', now());
  return { posHash, deviceSecret };
}

/** Locally-cached RevFlo pairing code (plaintext) — FloAdmin only ever returns it once. */
export function getCachedPairingCode(): { code: string; expiresAt: string } | null {
  const code = getSettingValue('mobile_pairing_code');
  const expiresAt = getSettingValue('mobile_pairing_code_expires_at');
  if (!code || !expiresAt) return null;
  if (new Date(expiresAt).getTime() <= Date.now()) return null;
  return { code, expiresAt };
}

export function setCachedPairingCode(code: string, expiresAt: string): void {
  upsertSetting('mobile_pairing_code', code);
  upsertSetting('mobile_pairing_code_expires_at', expiresAt);
}

/** Random UUID, generated once and persisted — never derived from store/device identity. */
export function ensureTelemetryAnonId(): string {
  let anonId = getSettingValue('telemetry_anon_id');
  if (!anonId) {
    anonId = crypto.randomUUID();
    upsertSetting('telemetry_anon_id', anonId);
  }
  return anonId;
}

/**
 * Anonymous usage telemetry requires explicit opt-in (M2).
 * Returns true only when telemetry_enabled === 'true'.
 */
export function isTelemetryEnabled(): boolean {
  const value = getSettingValue('telemetry_enabled');
  if (value !== 'true' && value !== 'false') {
    return false;
  }
  return value === 'true';
}

/**
 * Store-attributed diagnostics requires explicit opt-in (M2).
 * Returns true only when diagnostics_consent === 'true'.
 * Missing, 'pending', or any other value → fail closed (no transmission).
 */
export function isDiagnosticsConsentEnabled(): boolean {
  const value = getSettingValue('diagnostics_consent');
  if (value !== 'true' && value !== 'false') {
    return false;
  }
  return value === 'true';
}

/**
 * Kitchen Display System on/off switch (issue #133). Defaults to enabled
 * (missing/anything but the literal 'false') so pre-existing installs that
 * predate this setting keep their current always-on behavior.
 */
export function isKdsEnabled(): boolean {
  return getSettingValue('kds_enabled') !== 'false';
}

/**
 * Server App on/off switch. Defaults to enabled for new and upgraded installs,
 * while still allowing owners to hide the tableside ordering surface entirely.
 */
export function isServerAppEnabled(): boolean {
  return getSettingValue('server_app_enabled') !== 'false';
}

/**
 * KOT ticket printing on/off switch (issue #133) — coarser than
 * `auto_print_kot` (which only gates *automatic* printing on order
 * placement). When this is off, no KOT print command may be sent,
 * automatic or manual. Defaults to enabled, same reasoning as isKdsEnabled.
 */
export function isKotPrintingEnabled(): boolean {
  return getSettingValue('kot_printing_enabled') !== 'false';
}

export function upsertTelemetryLastPing(): void {
  upsertSetting('telemetry_last_ping_at', now());
}

/** Atomic multi-statement mutation. Use for anything touching >1 row or >1 table. */
export function withTxn<T>(fn: () => T): T {
  return db.transaction(fn)();
}

/** Safely append an object to a JSON-array column. Creates the array if missing/invalid. */
export function appendJsonArray(
  table: string,
  idColumn: string,
  idValue: any,
  column: string,
  value: any,
): void {
  // Validate identifiers to prevent SQL injection
  if (!isSafeIdentifier(table) || !isSafeIdentifier(idColumn) || !isSafeIdentifier(column)) {
    throw new Error(`Invalid identifier: table=${table}, idColumn=${idColumn}, column=${column}`);
  }
  const row = db
    .prepare(`SELECT ${column} AS v FROM ${table} WHERE ${idColumn} = ?`)
    .get(idValue) as any;
  let arr: unknown[] = [];
  if (row && row.v) {
    try {
      const parsed = JSON.parse(row.v);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      arr = [];
    }
  }
  arr.push(value);
  db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`).run(
    JSON.stringify(arr),
    idValue,
  );
}

/** Runs on every startup. Logs loud warnings but never throws — DB stays available even if dirty. */
function runStartupIntegrityCheck(): void {
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const bad = integrity.filter((r) => r.integrity_check !== 'ok');
    if (bad.length > 0) {
      const msg = bad.map((r) => r.integrity_check).join('; ');
      console.error('[DB] ⚠ integrity_check reported issues:', msg);
      dbHealthError = `Database integrity error: ${msg}`;
    } else {
      console.log('[DB] integrity_check: ok');
    }

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all() as any[];
    if (fkViolations.length > 0) {
      console.error(
        `[DB] ⚠ ${fkViolations.length} foreign-key violation(s):`,
        fkViolations.slice(0, 5),
      );
    } else {
      console.log('[DB] foreign_key_check: clean');
    }
  } catch (err: unknown) {
    console.error('[DB] Startup integrity check failed:', err.message);
  }
}

/** Re-seeds the sequences table from existing order_number and bill_number data.
 *  Fixes UNIQUE constraint collisions caused by migration v10 dropping and recreating
 *  the sequences table, which reset counters while old numbered rows still existed. */
function repairSequences(): void {
  try {
    const collectSequenceMax = (
      table: 'orders' | 'bills',
      numberColumn: string,
      pattern: RegExp,
    ) => {
      const rows = db
        .prepare(`SELECT ${numberColumn} AS value FROM ${table} WHERE ${numberColumn} IS NOT NULL`)
        .all() as { value: string }[];
      const maxByDate = new Map<string, number>();

      for (const row of rows) {
        const match = String(row.value).match(pattern);
        if (!match) continue;
        const date = match[1];
        const sequence = Number.parseInt(match[2], 10);
        if (!Number.isFinite(sequence)) continue;
        maxByDate.set(date, Math.max(maxByDate.get(date) || 0, sequence));
      }

      return Array.from(maxByDate, ([date, max_val]) => ({ date, max_val }));
    };

    // Extract max sequence per date from order_numbers (format: ORD-YYYYMMDD-NNNN)
    const orderRows = collectSequenceMax('orders', 'order_number', /^ORD-(\d{8})-(\d+)$/);

    for (const row of orderRows) {
      if (!row.date || !row.max_val) continue;
      const existing = db
        .prepare(`SELECT current_value FROM sequences WHERE name = 'orders' AND date = ?`)
        .get(row.date) as any;
      if (!existing) {
        db.prepare(`INSERT INTO sequences (name, date, current_value) VALUES ('orders', ?, ?)`).run(
          row.date,
          row.max_val,
        );
      } else if (existing.current_value < row.max_val) {
        db.prepare(`UPDATE sequences SET current_value = ? WHERE name = 'orders' AND date = ?`).run(
          row.max_val,
          row.date,
        );
      }
    }

    // Extract max sequence per date from bill_numbers (format: INV-YYYYMMDD-NNNN)
    const billRows = collectSequenceMax('bills', 'bill_number', /^INV-(\d{8})-(\d+)$/);

    for (const row of billRows) {
      if (!row.date || !row.max_val) continue;
      const existing = db
        .prepare(`SELECT current_value FROM sequences WHERE name = 'bills' AND date = ?`)
        .get(row.date) as any;
      if (!existing) {
        db.prepare(`INSERT INTO sequences (name, date, current_value) VALUES ('bills', ?, ?)`).run(
          row.date,
          row.max_val,
        );
      } else if (existing.current_value < row.max_val) {
        db.prepare(`UPDATE sequences SET current_value = ? WHERE name = 'bills' AND date = ?`).run(
          row.max_val,
          row.date,
        );
      }
    }
  } catch (err) {
    console.error('[DB] repairSequences failed:', err);
  }
}

/** Idempotent auto-repair for the pre-fix payment_details corruption: `{A},{A}` → `[A]`.
 *  Only runs when rows are detected as malformed AND the deduped sum matches `paid_amount`. */
function autoRepairPaymentDetails(): void {
  try {
    const rows = db
      .prepare(
        `SELECT id, payment_details, paid_amount FROM bills WHERE payment_details IS NOT NULL AND payment_details != ''`,
      )
      .all() as any[];
    const toFix: { id: number; value: string }[] = [];

    for (const row of rows) {
      try {
        JSON.parse(row.payment_details);
        continue;
      } catch {}

      const wrapped = '[' + String(row.payment_details).replace(/\}\s*,\s*\{/g, '},{') + ']';
      let parsed: any[];
      try {
        parsed = JSON.parse(wrapped);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;

      const deduped: unknown[] = [];
      for (const p of parsed) {
        const prev = deduped[deduped.length - 1];
        if (
          prev &&
          prev.method === p.method &&
          prev.amount === p.amount &&
          prev.timestamp === p.timestamp
        )
          continue;
        deduped.push(p);
      }

      const dedupedSum = deduped.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const rawSum = parsed.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const chosen =
        Math.abs(dedupedSum - row.paid_amount) <= 0.02
          ? deduped
          : Math.abs(rawSum - row.paid_amount) <= 0.02
            ? parsed
            : null;
      if (!chosen) continue;

      toFix.push({ id: row.id, value: JSON.stringify(chosen) });
    }

    if (toFix.length === 0) return;

    const stmt = db.prepare(
      `UPDATE bills SET payment_details = ?, updated_at = datetime('now') WHERE id = ?`,
    );
    const tx = db.transaction((rows: { id: number; value: string }[]) => {
      for (const r of rows) stmt.run(r.value, r.id);
    });
    tx(toFix);
    console.log(`[DB] auto-repaired payment_details on ${toFix.length} bill(s)`);
  } catch (err: unknown) {
    console.error('[DB] autoRepairPaymentDetails failed:', err.message);
  }
}

/** Keep printer selection deterministic if an older install ended up with multiple defaults. */
function autoRepairDefaultPrinter(): void {
  try {
    const defaults = db
      .prepare(
        `
      SELECT id FROM printers
      WHERE is_default = 1
      ORDER BY CASE WHEN id = 'printer-1' AND name = 'Thermal Printer' THEN 1 ELSE 0 END ASC,
               COALESCE(updated_at, created_at, '') DESC,
               COALESCE(created_at, '') DESC,
               name COLLATE NOCASE ASC,
               id ASC
    `,
      )
      .all() as { id: string }[];

    if (defaults.length <= 1) return;

    const keepId = defaults[0].id;
    db.prepare(
      `
      UPDATE printers
      SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END,
          updated_at = CASE WHEN id = ? THEN updated_at ELSE ? END
      WHERE is_default = 1
    `,
    ).run(keepId, keepId, now());

    console.log(`[DB] auto-repaired default printers; kept ${keepId}`);
  } catch (err: unknown) {
    console.error('[DB] autoRepairDefaultPrinter failed:', err.message);
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null as unknown as Database.Database;
    console.log('[DB] Database closed');
  }
}

export async function createBackupUnlocked(
  targetPath?: string,
): Promise<{ path: string; schemaVersion: number }> {
  // Internal callers must already hold withDatabaseMaintenanceLock().
  console.log('[DB] createBackup: Starting...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueSuffix = crypto.randomBytes(4).toString('hex');
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Always write to a temp path inside userData first. On MAS, the sandbox
  // only grants access to the user-selected file itself — opening the backup
  // DB in WAL mode would try to create .db-wal/.db-shm siblings next to the
  // user-selected file, which the sandbox blocks. Writing to userData first
  // avoids that restriction; we copy the final clean file to targetPath.
  const tempPath = path.join(backupDir, `flo-backup-${timestamp}-${uniqueSuffix}.db`);
  const finalPath = targetPath ? path.resolve(targetPath) : tempPath;
  const stagedTargetPath =
    finalPath !== tempPath
      ? path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.tmp-${uniqueSuffix}`)
      : null;
  let completed = false;

  const liveDatabasePath = getDbPath();
  if (
    [liveDatabasePath, `${liveDatabasePath}-wal`, `${liveDatabasePath}-shm`].some((livePath) =>
      isLiveDatabaseTarget(finalPath, livePath),
    )
  ) {
    throw new Error('Backup target cannot be the live database or its SQLite sidecars');
  }
  if (stagedTargetPath && fs.existsSync(finalPath) && fs.lstatSync(finalPath).isSymbolicLink()) {
    throw new Error('Backup target cannot be a symbolic link');
  }

  try {
    console.log('[DB] createBackup: Backing up to temp:', tempPath);
    await db.backup(tempPath);

    let currentVersion = 0;
    let backupDb: Database.Database | undefined;
    try {
      backupDb = new Database(tempPath);
      // Switch to DELETE journal mode: checkpoints WAL and removes
      // .db-wal/.db-shm so the final file is self-contained.
      backupDb.pragma('journal_mode = DELETE');
      backupDb.exec(`
        CREATE TABLE IF NOT EXISTS _flo_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      currentVersion = getCurrentSchemaVersion();
      backupDb
        .prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`)
        .run('schema_version', String(currentVersion));
      backupDb
        .prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`)
        .run('backup_created_at', new Date().toISOString());
      backupDb
        .prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`)
        .run('app_version', app.getVersion());

      // H4: verify the artifact is restore-worthy before reporting success.
      const integrity = backupDb.prepare('PRAGMA integrity_check').all() as {
        integrity_check: string;
      }[];
      if (integrity.some((row) => row.integrity_check !== 'ok')) {
        throw new Error(
          `Backup integrity check failed: ${integrity.map((row) => row.integrity_check).join('; ')}`,
        );
      }
    } finally {
      backupDb?.close();
    }

    if (stagedTargetPath) {
      fs.copyFileSync(tempPath, stagedTargetPath);
      syncFile(stagedTargetPath);
      if (!syncDirectory(path.dirname(stagedTargetPath)) && process.platform !== 'win32') {
        throw new Error('Could not durably stage backup target');
      }
      try {
        fs.renameSync(stagedTargetPath, finalPath);
      } catch (error) {
        if (process.platform !== 'win32' || !fs.existsSync(finalPath)) throw error;
        fs.unlinkSync(finalPath);
        fs.renameSync(stagedTargetPath, finalPath);
      }
      syncDirectory(path.dirname(finalPath));
      fs.unlinkSync(tempPath);
    }
    for (const sidecar of [`${finalPath}-wal`, `${finalPath}-shm`]) {
      try {
        if (pathEntryExists(sidecar)) fs.unlinkSync(sidecar);
      } catch {}
    }
    syncFile(finalPath);
    if (!syncDirectory(path.dirname(finalPath)) && process.platform !== 'win32') {
      throw new Error('Could not durably persist backup file');
    }
    if (finalPath !== tempPath) {
      console.log(`[DB] Backup saved to: ${finalPath} (schema v${currentVersion})`);
    } else {
      console.log(`[DB] Backup created: ${finalPath} (schema v${currentVersion})`);
    }

    completed = true;
    return { path: finalPath, schemaVersion: currentVersion };
  } finally {
    if (!completed) {
      for (const filePath of [
        tempPath,
        stagedTargetPath,
        `${tempPath}-wal`,
        `${tempPath}-shm`,
      ].filter((value): value is string => Boolean(value))) {
        try {
          if (pathEntryExists(filePath)) fs.unlinkSync(filePath);
        } catch {}
      }
    }
  }
}

export function createBackup(
  targetPath?: string,
): Promise<{ path: string; schemaVersion: number }> {
  return withDatabaseMaintenanceLock(() => createBackupUnlocked(targetPath));
}

function removeDatabaseFiles(dbPath: string): string[] {
  const failures: string[] = [];
  for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (pathEntryExists(filePath)) fs.unlinkSync(filePath);
    } catch (error: unknown) {
      console.warn(`[DB] Could not remove ${filePath}:`, error);
      failures.push(filePath);
    }
  }
  return failures;
}

/**
 * Creates the safety backup and resets the live database while holding the
 * same maintenance lock used by ordinary backups. On a failed wipe/reopen,
 * restore the safety backup before surfacing the error so callers never see a
 * false success or an intentionally closed database.
 *
 * REC-01: the installation marker is cleared ONLY after the empty reset DB is
 * durably committed. A crash after wipe but before clear leaves the marker in
 * place so the next boot enters RECOVERY_REQUIRED (not silent FIRST_INSTALL).
 */
export async function resetDatabaseWithBackup(options?: {
  /** Test-only: fail after empty init, before marker clear / success. */
  injectFailureAfterEmptyInit?: boolean;
}): Promise<{ backupPath: string }> {
  return withDatabaseMaintenanceLock(async () => {
    const hadMarkerAtStart = isInstallationInitialized();
    const { path: backupPath } = await createBackupUnlocked();
    const dbPath = getDbPath();
    const baselineForeignKeyViolations = getForeignKeyViolationKeys(getDatabase());
    const recoveryPath = path.join(
      getBackupDir(),
      `flo-reset-recovery-${crypto.randomBytes(8).toString('hex')}.db`,
    );
    const journalPath = recoveryPath.replace(/\.db$/, '.json');
    let replacementCompleted = false;
    let recoveryCompleted = false;

    try {
      fs.copyFileSync(backupPath, recoveryPath);
      syncFile(recoveryPath);
      writeReplacementJournal(journalPath, {
        phase: 'prepared',
        recoveryPath,
        dbPath,
        baselineForeignKeyViolations: [...baselineForeignKeyViolations],
      });
      closeDatabase();
      const failures = removeDatabaseFiles(dbPath);
      if (failures.length > 0) {
        throw new Error(`Could not remove database files: ${failures.join(', ')}`);
      }
      // Marker still on disk here: crash ⇒ RECOVERY_REQUIRED on next boot.
      // allowCreateDespiteMarker: empty recreate must not trip missing-DB recovery.
      initDatabase({ recoverInterruptedReplacement: false, allowCreateDespiteMarker: true });
      getDatabase().pragma('wal_checkpoint(TRUNCATE)');
      syncFile(dbPath);
      if (!syncDirectory(path.dirname(dbPath)) && process.platform !== 'win32') {
        throw new Error('Could not durably commit reset database');
      }
      if (options?.injectFailureAfterEmptyInit) {
        throw new Error('Injected factory-reset failure after empty init');
      }
      writeReplacementJournal(journalPath, {
        phase: 'committed',
        recoveryPath,
        dbPath,
        baselineForeignKeyViolations: [...baselineForeignKeyViolations],
      });
      // FIRST_INSTALL only after durable empty reset succeeded.
      clearInstallationMarker();
      replacementCompleted = true;
      return { backupPath };
    } catch (error: unknown) {
      // Reopen the pre-wipe snapshot so a partial filesystem failure cannot
      // leave the process serving an empty or closed database.
      try {
        closeDatabase();
        removeDatabaseFiles(dbPath);
        fs.copyFileSync(backupPath, dbPath);
        syncFile(dbPath);
        if (!syncDirectory(path.dirname(dbPath)) && process.platform !== 'win32') {
          throw new Error('Could not durably recover reset database');
        }
        initDatabase(false);
        // Marker was never cleared on the failure path; ensure it remains if
        // the install was previously initialized (belt-and-suspenders vs backfill).
        if (hadMarkerAtStart && !isInstallationInitialized()) {
          markInstallationInitialized();
        }
        recoveryCompleted = true;
      } catch (recoveryError: any) {
        throw new Error(
          `Database reset failed: ${error?.message || 'unknown error'}; ` +
            `database recovery also failed: ${recoveryError?.message || 'unknown error'}`,
        );
      }
      throw error;
    } finally {
      if (replacementCompleted || recoveryCompleted)
        removeReplacementArtifacts(journalPath, recoveryPath);
    }
  });
}

/** Reads the canonical schema_version stamp createBackup() writes into _flo_meta. */
function parseCanonicalSchemaVersion(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readBackupSchemaVersion(fullPath: string): number | null {
  let backupDb: Database.Database | undefined;
  try {
    backupDb = new Database(fullPath, { readonly: true, fileMustExist: true });
    const row = backupDb
      .prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    return row ? parseCanonicalSchemaVersion(row.value) : null;
  } catch {
    return null;
  } finally {
    backupDb?.close();
  }
}

/**
 * Lists backups in the managed backups/ directory, newest first. Only
 * backups written by createBackup()/syncBackupBeforeMigration() live here —
 * a backup saved to a user-chosen custom path (via the Export Backup /
 * "choose location" flow) intentionally does not appear here, same as it
 * never has for the existing File > Export Backup menu action. See #120.
 */
export function listBackups(): {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'manual' | 'auto';
  schemaVersion: number | null;
}[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith('flo-backup-') && fileName.endsWith('.db'))
    .filter((fileName) => {
      try {
        return fs.lstatSync(path.join(backupDir, fileName)).isFile();
      } catch {
        return false;
      }
    })
    .map((fileName) => {
      const fullPath = path.join(backupDir, fileName);
      const stat = fs.statSync(fullPath);
      return {
        fileName,
        path: fullPath,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        kind: (fileName.includes('-pre-v') ? 'auto' : 'manual') as 'manual' | 'auto',
        schemaVersion: readBackupSchemaVersion(fullPath),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Deletes one backup from the managed backups/ directory by file name.
 * fileName is validated against the exact naming scheme createBackup() uses
 * and resolved only inside backupDir, so a path-traversal fileName (e.g.
 * `../../flo.db`) can't escape the backups folder or delete the live DB.
 */
export function deleteBackup(fileName: string): void {
  if (!/^flo-backup-[\w.-]+\.db$/.test(fileName)) {
    throw new Error('Invalid backup file name');
  }
  const backupDir = getBackupDir();
  const fullPath = path.join(backupDir, fileName);
  if (path.dirname(fullPath) !== backupDir) {
    throw new Error('Invalid backup file name');
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error('Backup not found');
  }
  fs.unlinkSync(fullPath);
}

function getSchemaDefinitions(dbInstance: Database.Database): Map<string, string> {
  const rows = dbInstance
    .prepare(
      `
    SELECT type, name, sql
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
      AND name <> '_flo_meta'
  `,
    )
    .all() as { type: string; name: string; sql: string | null }[];
  return new Map(
    rows.map((row) => [`${row.type}:${row.name}`, (row.sql || '').replace(/\s+/g, ' ').trim()]),
  );
}

function getColumns(dbInstance: Database.Database, tableName: string): string[] {
  try {
    const columns = dbInstance.prepare(`PRAGMA table_info(${tableName})`).all() as {
      name: string;
    }[];
    return columns.map((col) => col.name);
  } catch {
    return [];
  }
}

export function getTables(dbInstance: Database.Database): string[] {
  try {
    const tables = dbInstance
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table' 
      AND name NOT LIKE 'sqlite_%' AND name <> '_flo_meta'
    `,
      )
      .all() as { name: string }[];
    return tables.map((t) => t.name);
  } catch {
    return [];
  }
}

export interface RestoreResult {
  success: boolean;
  mode: 'direct' | 'data_only' | 'full';
  backupSchemaVersion: number;
  currentSchemaVersion: number;
  tablesRestored: number;
  error?: string;
}

function validateDirectBackup(
  backupPath: string,
  currentDb: Database.Database,
  currentVersion: number,
  baselineForeignKeyViolations: Set<string> = new Set(),
): string | null {
  let backupDb: Database.Database | undefined;
  try {
    const sourceStat = fs.lstatSync(backupPath);
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile())
      return 'Direct restore source must be a regular file';
    if (pathEntryExists(`${backupPath}-wal`) || pathEntryExists(`${backupPath}-shm`))
      return 'Direct restore source must not have SQLite sidecars';
    backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    const metaRow = backupDb
      .prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    const metadataVersion = metaRow ? (parseCanonicalSchemaVersion(metaRow.value) ?? 0) : 0;
    const pragmaVersion = Number(backupDb.pragma('user_version', { simple: true }));
    if (metadataVersion !== currentVersion || pragmaVersion !== currentVersion) {
      return `Direct restore requires matching metadata/header schema v${currentVersion}`;
    }

    const integrity = backupDb.prepare('PRAGMA integrity_check').all() as {
      integrity_check: string;
    }[];
    if (integrity.some((row) => row.integrity_check !== 'ok')) {
      return `Backup integrity check failed: ${integrity.map((row) => row.integrity_check).join('; ')}`;
    }
    const backupForeignKeyViolations = getForeignKeyViolationKeys(backupDb);
    const newForeignKeyViolations = [...backupForeignKeyViolations].filter(
      (key) => !baselineForeignKeyViolations.has(key),
    );
    if (newForeignKeyViolations.length > 0) {
      return `Backup contains ${newForeignKeyViolations.length} new foreign-key violation(s)`;
    }

    const currentTables = getTables(currentDb);
    const backupTables = new Set(getTables(backupDb));
    const missingTables = currentTables.filter((tableName) => !backupTables.has(tableName));
    if (missingTables.length > 0) {
      return `Backup is missing required table(s): ${missingTables.join(', ')}`;
    }

    for (const tableName of currentTables) {
      const backupColumns = new Set(getColumns(backupDb, tableName));
      const missingColumns = getColumns(currentDb, tableName).filter(
        (column) => !backupColumns.has(column),
      );
      if (missingColumns.length > 0) {
        return `Backup table ${tableName} is missing required column(s): ${missingColumns.join(', ')}`;
      }
    }

    const currentSchema = getSchemaDefinitions(currentDb);
    const backupSchema = getSchemaDefinitions(backupDb);
    for (const [key, definition] of currentSchema) {
      if (backupSchema.get(key) !== definition) {
        return `Backup schema object ${key} is missing or differs from the current definition`;
      }
    }
    for (const key of backupSchema.keys()) {
      if (!currentSchema.has(key)) {
        return `Backup contains unapproved schema object ${key}`;
      }
    }
    return null;
  } catch (error: unknown) {
    return `Backup validation failed: ${error?.message || 'unknown error'}`;
  } finally {
    backupDb?.close();
  }
}

type RevocationRow = { token_hash: string; expires_at: number; revoked_at: string };
export type UserStationSecurityState = {
  user_id: string;
  station_id: string;
  is_active: number;
  category_ids: string | null;
};
export type KitchenStationSecurityState = {
  id: string;
  is_active: number;
  category_ids: string | null;
};

export function captureKitchenStationSecurityState(
  dbInstance: Database.Database,
): KitchenStationSecurityState[] {
  try {
    return dbInstance
      .prepare('SELECT id, is_active, category_ids FROM kitchen_stations')
      .all() as KitchenStationSecurityState[];
  } catch {
    return [];
  }
}

export type KdsEnabledSettingState = { present: boolean; value: string | null };
export type RestoreProtectedSettingState = { key: string; present: boolean; value: string | null };
export type RestoreOutboxState = {
  cloud: Record<string, unknown>[];
  support: Record<string, unknown>[];
  diagnostics: Record<string, unknown>[];
};
const RESTORE_PROTECTED_SETTING_KEYS = [
  // jwt_secret removed — signing secret is safeStorage userData/jwt-secret.enc (not in DB backups)
  'jwt_secret_storage',
  'cloud_api_key',
  'cloud_device_secret',
  'cloud_pos_hash',
  'telemetry_enabled',
  'diagnostics_consent',
  'mobile_pairing_code',
  'mobile_pairing_code_expires_at',
];

export function captureRestoreProtectedSettings(
  dbInstance: Database.Database,
): RestoreProtectedSettingState[] {
  const fixedRows = dbInstance
    .prepare(
      `SELECT key, value FROM settings WHERE key IN (${RESTORE_PROTECTED_SETTING_KEYS.map(() => '?').join(',')})`,
    )
    .all(...RESTORE_PROTECTED_SETTING_KEYS) as { key: string; value: string | null }[];
  const cloudRows = dbInstance
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'cloud_%'")
    .all() as { key: string; value: string | null }[];
  const byKey = new Map([...fixedRows, ...cloudRows].map((row) => [row.key, row.value]));
  const keys = [
    ...new Set([...RESTORE_PROTECTED_SETTING_KEYS, ...cloudRows.map((row) => row.key)]),
  ];
  const deviceSecret = byKey.get('cloud_device_secret');
  return keys.map((key) => ({
    key,
    // Pairing codes are installation-local, short-lived credentials. Never
    // carry one across a restore, even if the live installation had one.
    // A position hash without its device secret is also unsafe to preserve.
    present:
      !key.startsWith('mobile_pairing_code') &&
      !(key === 'cloud_pos_hash' && !deviceSecret) &&
      byKey.has(key),
    value: byKey.get(key) ?? null,
  }));
}

export function mergeRestoreProtectedSettings(
  dbInstance: Database.Database,
  states: RestoreProtectedSettingState[],
): void {
  const upsert = dbInstance.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  // Cloud identity/configuration is installation-local. Remove every backup
  // cloud key first so a future or backup-only key cannot cross installations.
  dbInstance.prepare("DELETE FROM settings WHERE key LIKE 'cloud_%'").run();
  for (const state of states) {
    if (state.present) upsert.run(state.key, state.value, now());
    else if (!state.key.startsWith('cloud_'))
      dbInstance.prepare('DELETE FROM settings WHERE key = ?').run(state.key);
  }
  // P0.2: JWT signing secret must never land in SQLite from a DB backup.
  // Secure secret lives in userData/jwt-secret.enc (same machine) or recovery.
  dbInstance.prepare('DELETE FROM settings WHERE key = ?').run('jwt_secret');
  const hasDeviceSecret = states.some(
    (state) => state.key === 'cloud_device_secret' && state.present,
  );
  const hasPosHash = states.some((state) => state.key === 'cloud_pos_hash' && state.present);
  if (!hasDeviceSecret || !hasPosHash) ensureCloudIdentity();
}

export function captureRestoreOutboxState(dbInstance: Database.Database): RestoreOutboxState {
  const pending = (table: string) =>
    dbInstance
      .prepare(`SELECT * FROM ${table} WHERE status IN ('pending', 'failed', 'sending')`)
      .all() as Record<string, unknown>[];
  return {
    cloud: pending('cloud_sync_outbox'),
    support: pending('support_ticket_outbox'),
    diagnostics: pending('store_diagnostics_outbox'),
  };
}

export function mergeRestoreOutboxState(
  dbInstance: Database.Database,
  state: RestoreOutboxState,
): void {
  dbInstance.exec(
    'DELETE FROM cloud_sync_outbox; DELETE FROM support_ticket_outbox; DELETE FROM store_diagnostics_outbox',
  );
  const cloud = dbInstance.prepare(`INSERT OR REPLACE INTO cloud_sync_outbox
    (id, event_type, entity_type, entity_id, payload, status, attempt_count, next_attempt_at, last_error, delivered_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of state.cloud)
    cloud.run(
      row.id,
      row.event_type,
      row.entity_type,
      row.entity_id,
      row.payload,
      row.status === 'sending' ? 'failed' : row.status,
      row.attempt_count || 0,
      row.next_attempt_at || now(),
      row.last_error || null,
      row.delivered_at || null,
      row.created_at || now(),
      row.updated_at || now(),
    );
  const support = dbInstance.prepare(`INSERT OR REPLACE INTO support_ticket_outbox
    (client_ticket_id, payload, status, support_code, attempt_count, next_attempt_at, last_error, created_at, updated_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of state.support)
    support.run(
      row.client_ticket_id,
      row.payload,
      row.status === 'sending' ? 'failed' : row.status,
      row.support_code || null,
      row.attempt_count || 0,
      row.next_attempt_at || now(),
      row.last_error || null,
      row.created_at || now(),
      row.updated_at || now(),
      row.delivered_at || null,
    );
  const diagnostics = dbInstance.prepare(`INSERT OR REPLACE INTO store_diagnostics_outbox
    (event_id, payload, status, attempt_count, next_attempt_at, last_error, created_at, updated_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of state.diagnostics)
    diagnostics.run(
      row.event_id,
      row.payload,
      row.status === 'sending' ? 'failed' : row.status,
      row.attempt_count || 0,
      row.next_attempt_at || now(),
      row.last_error || null,
      row.created_at || now(),
      row.updated_at || now(),
      row.delivered_at || null,
    );
}

export function captureKdsEnabledSetting(dbInstance: Database.Database): KdsEnabledSettingState {
  const row = dbInstance.prepare('SELECT value FROM settings WHERE key = ?').get('kds_enabled') as
    { value: string | null } | undefined;
  // A missing setting has always meant enabled; preserve that effective
  // security posture instead of letting an older backup disable KDS.
  return { present: true, value: row?.value ?? 'true' };
}

export function mergeKdsEnabledSetting(
  dbInstance: Database.Database,
  state: KdsEnabledSettingState,
): void {
  if (!state.present) return;
  dbInstance
    .prepare(
      `
    INSERT INTO settings (key, value, updated_at) VALUES ('kds_enabled', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `,
    )
    .run(state.value, now());
}

export function captureUserStationSecurityState(
  dbInstance: Database.Database,
): UserStationSecurityState[] {
  try {
    return dbInstance
      .prepare(
        `
      SELECT su.user_id, su.station_id, ks.is_active, ks.category_ids
      FROM station_users su
      JOIN kitchen_stations ks ON ks.id = su.station_id
    `,
      )
      .all() as UserStationSecurityState[];
  } catch {
    return [];
  }
}

export function mergeUserStationSecurityState(
  dbInstance: Database.Database,
  rows: UserStationSecurityState[],
  userIds: string[],
  preservedStations: KitchenStationSecurityState[] = [],
): void {
  const preservedIds = new Set(userIds);
  const currentStation = dbInstance.prepare('SELECT 1 FROM kitchen_stations WHERE id = ?');
  const missingStations = preservedStations
    .filter((station) => !currentStation.get(station.id))
    .map((station) => station.id);
  if (missingStations.length > 0) {
    throw new Error(
      `Restore cannot preserve current kitchen station(s): ${missingStations.join(', ')}`,
    );
  }
  const restoreStationSecurity = dbInstance.prepare(
    'UPDATE kitchen_stations SET is_active = ?, category_ids = ?, updated_at = ? WHERE id = ?',
  );
  for (const station of preservedStations) {
    restoreStationSecurity.run(station.is_active, station.category_ids, now(), station.id);
  }
  const stationState = dbInstance.prepare(
    'SELECT is_active, category_ids FROM kitchen_stations WHERE id = ?',
  );
  const invalidStations = rows
    .filter((row) => preservedIds.has(row.user_id))
    .filter((row) => {
      const restored = stationState.get(row.station_id) as
        { is_active: number; category_ids: string | null } | undefined;
      return (
        !restored ||
        restored.is_active !== row.is_active ||
        restored.category_ids !== row.category_ids
      );
    })
    .map((row) => `${row.user_id}:${row.station_id}`);
  if (invalidStations.length > 0) {
    throw new Error(
      `Restore cannot preserve current station security state(s): ${invalidStations.join(', ')}`,
    );
  }

  const currentUsers = dbInstance.prepare('SELECT id FROM users').all() as { id: string }[];
  for (const user of currentUsers) {
    dbInstance.prepare('DELETE FROM station_users WHERE user_id = ?').run(user.id);
  }
  const insert = dbInstance.prepare(
    'INSERT INTO station_users (user_id, station_id, created_at) VALUES (?, ?, ?)',
  );
  for (const row of rows) {
    if (preservedIds.has(row.user_id)) insert.run(row.user_id, row.station_id, now());
  }
}

export type UserSecurityState = {
  id: string;
  name: string;
  email: string | null;
  password: string;
  pin: string | null;
  pin_hash: string | null;
  role: string;
  category_ids: string | null;
  is_active: number;
  tokens_valid_after: string | null;
  station_assignments_configured: number;
};

export function getUserKdsStationIds(
  dbInstance: Database.Database,
  userId: string,
): string[] | null {
  try {
    return (
      dbInstance
        .prepare(
          `
      SELECT su.station_id
      FROM station_users su
      JOIN kitchen_stations ks ON ks.id = su.station_id
      WHERE su.user_id = ? AND ks.is_active = 1
    `,
        )
        .all(userId) as { station_id: string }[]
    ).map((row) => String(row.station_id));
  } catch {
    return null;
  }
}

export function getKdsStationCategoryIds(
  dbInstance: Database.Database,
  stationIds: string[],
): string[] | null {
  if (stationIds.length === 0) return [];
  try {
    const placeholders = stationIds.map(() => '?').join(',');
    const rows = dbInstance
      .prepare(
        `SELECT category_ids FROM kitchen_stations WHERE is_active = 1 AND id IN (${placeholders})`,
      )
      .all(...stationIds) as { category_ids: string | null }[];
    const categories = new Set<string>();
    for (const row of rows) {
      if (!row.category_ids) continue;
      try {
        const parsed = JSON.parse(row.category_ids);
        if (Array.isArray(parsed))
          for (const categoryId of parsed)
            if (categoryId != null) categories.add(String(categoryId));
      } catch {}
    }
    return [...categories];
  } catch {
    return null;
  }
}

export type KdsStationRoutingScope = {
  tablelessCategoryIds: string[];
  categoryIdsByStation: Record<string, string[] | null>;
  hasUnrestrictedStation: boolean;
};

export function getKdsStationRoutingScope(
  dbInstance: Database.Database,
  stationIds: string[],
  userCategoryIds: string[],
): KdsStationRoutingScope | null {
  if (stationIds.length === 0)
    return { tablelessCategoryIds: [], categoryIdsByStation: {}, hasUnrestrictedStation: false };
  try {
    const placeholders = stationIds.map(() => '?').join(',');
    const rows = dbInstance
      .prepare(
        `
      SELECT id, category_ids FROM kitchen_stations
      WHERE is_active = 1 AND id IN (${placeholders})
    `,
      )
      .all(...stationIds) as { id: string; category_ids: string | null }[];
    const byStation: Record<string, string[] | null> = {};
    const tableless = new Set<string>();
    let hasUnrestrictedStation = false;
    for (const stationId of stationIds) {
      const row = rows.find((candidate) => String(candidate.id) === String(stationId));
      let stationCategories: string[] = [];
      if (row?.category_ids) {
        try {
          const parsed = JSON.parse(row.category_ids);
          if (!Array.isArray(parsed)) return null;
          stationCategories = parsed.filter((id) => id != null).map(String);
        } catch {
          return null;
        }
      }
      const allowed =
        stationCategories.length > 0
          ? stationCategories.filter(
              (id) => userCategoryIds.length === 0 || userCategoryIds.includes(id),
            )
          : userCategoryIds.length > 0
            ? [...userCategoryIds]
            : null;
      byStation[String(stationId)] = allowed;
      if (allowed === null) hasUnrestrictedStation = true;
      if (allowed !== null) allowed.forEach((id) => tableless.add(id));
    }
    return {
      tablelessCategoryIds: [...tableless],
      categoryIdsByStation: byStation,
      hasUnrestrictedStation,
    };
  } catch {
    return null;
  }
}

export function getKdsStationRoutingCategoryIds(
  dbInstance: Database.Database,
  stationIds: string[],
  userCategoryIds: string[],
): string[] | null {
  return (
    getKdsStationRoutingScope(dbInstance, stationIds, userCategoryIds)?.tablelessCategoryIds ?? null
  );
}

export function isKdsStationItemAllowed(
  stationIds: string[],
  stationCategoryIds: string[],
  orderStationId: string | null | undefined,
  itemCategoryId: string | null | undefined,
  orderStationCategoryIds?: string[] | null,
  hasUnrestrictedStation = false,
): boolean {
  if (stationIds.length === 0) return true;
  if (orderStationId) {
    if (!stationIds.includes(String(orderStationId))) return false;
    if (orderStationCategoryIds === undefined) return true;
    if (orderStationCategoryIds === null) return true;
    return !!itemCategoryId && orderStationCategoryIds.includes(String(itemCategoryId));
  }
  return (
    hasUnrestrictedStation ||
    (!!itemCategoryId && stationCategoryIds.includes(String(itemCategoryId)))
  );
}

export function hasUserKdsStationAssignments(
  dbInstance: Database.Database,
  userId: string,
): boolean | null {
  try {
    const row = dbInstance
      .prepare(
        `
      SELECT station_assignments_configured,
             EXISTS (SELECT 1 FROM station_users WHERE user_id = ?) AS assigned
      FROM users WHERE id = ?
    `,
      )
      .get(userId, userId) as
      { station_assignments_configured: number; assigned: number } | undefined;
    if (!row) return null;
    return row.station_assignments_configured === 1 || row.assigned === 1;
  } catch {
    return null;
  }
}

export function captureUserSecurityState(dbInstance: Database.Database): UserSecurityState[] {
  try {
    return dbInstance
      .prepare(
        'SELECT id, name, email, password, pin, pin_hash, role, category_ids, is_active, tokens_valid_after, station_assignments_configured FROM users',
      )
      .all() as UserSecurityState[];
  } catch {
    return [];
  }
}

export function mergeUserSecurityState(
  dbInstance: Database.Database,
  rows: UserSecurityState[],
): void {
  for (const row of rows) {
    const restored = dbInstance
      .prepare(
        'SELECT id, is_active, tokens_valid_after, station_assignments_configured FROM users WHERE id = ?',
      )
      .get(row.id) as UserSecurityState | undefined;
    if (!restored) continue;
    const currentEpoch = row.tokens_valid_after;
    const restoredEpoch = restored.tokens_valid_after;
    const currentParsedTime = currentEpoch ? parseDbTimestamp(currentEpoch).getTime() : Number.NaN;
    const restoredParsedTime = restoredEpoch
      ? parseDbTimestamp(restoredEpoch).getTime()
      : Number.NaN;
    const currentTime = Number.isFinite(currentParsedTime)
      ? currentParsedTime
      : Number.NEGATIVE_INFINITY;
    const restoredTime = Number.isFinite(restoredParsedTime)
      ? restoredParsedTime
      : Number.NEGATIVE_INFINITY;
    const tokensValidAfter = currentTime >= restoredTime ? currentEpoch : restoredEpoch;
    dbInstance
      .prepare(
        `
      UPDATE users
      SET name = ?, email = ?, password = ?, pin = ?, pin_hash = ?, role = ?, category_ids = ?,
          is_active = ?, tokens_valid_after = ?, station_assignments_configured = ?
      WHERE id = ?
    `,
      )
      .run(
        row.name,
        row.email,
        row.password,
        row.pin,
        row.pin_hash,
        row.role,
        row.category_ids,
        row.is_active,
        tokensValidAfter,
        row.station_assignments_configured || 0,
        row.id,
      );
  }

  // Accounts introduced only by an older snapshot must not become a new
  // login path without an explicit owner reactivation.
  const preservedIds = new Set(rows.map((row) => row.id));
  const restoredUsers = dbInstance.prepare('SELECT id FROM users').all() as { id: string }[];
  const restoredIds = new Set(restoredUsers.map((user) => user.id));
  const disableRestoredOnly = dbInstance.prepare(
    'UPDATE users SET is_active = 0, tokens_valid_after = ? WHERE id = ?',
  );
  for (const user of restoredUsers) {
    if (!preservedIds.has(user.id)) disableRestoredOnly.run(now(), user.id);
  }

  const insertPreservedUser = dbInstance.prepare(`
    INSERT INTO users (id, name, email, password, pin, pin_hash, role, category_ids, is_active, tokens_valid_after, station_assignments_configured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    if (restoredIds.has(row.id)) continue;
    const emailConflict = row.email
      ? (dbInstance.prepare('SELECT id FROM users WHERE email = ?').get(row.email) as
          { id: string } | undefined)
      : undefined;
    if (emailConflict)
      dbInstance.prepare('UPDATE users SET email = NULL WHERE id = ?').run(emailConflict.id);
    insertPreservedUser.run(
      row.id,
      row.name,
      row.email,
      row.password,
      row.pin,
      row.pin_hash,
      row.role,
      row.category_ids,
      row.is_active,
      row.tokens_valid_after,
      row.station_assignments_configured || 0,
      now(),
      now(),
    );
  }
}

function readRevocations(dbInstance: Database.Database): RevocationRow[] {
  try {
    return dbInstance
      .prepare('SELECT token_hash, expires_at, revoked_at FROM revoked_tokens')
      .all() as RevocationRow[];
  } catch {
    return [];
  }
}

function mergeRevocations(dbInstance: Database.Database, rows: RevocationRow[]): void {
  if (rows.length === 0) return;
  const merge = dbInstance.prepare(`
    INSERT INTO revoked_tokens (token_hash, expires_at, revoked_at)
    VALUES (?, ?, ?)
    ON CONFLICT(token_hash) DO UPDATE SET
      expires_at = MAX(revoked_tokens.expires_at, excluded.expires_at),
      revoked_at = MIN(revoked_tokens.revoked_at, excluded.revoked_at)
  `);
  for (const row of rows) merge.run(row.token_hash, row.expires_at, row.revoked_at);
}

/**
 * REC-01: restore when flo.db is absent (recovery mode). Does not create an
 * empty operational café first — only installs a validated backup file.
 */
function restoreBackupWithNoLiveDatabase(
  backupPath: string,
  forceDirect: boolean,
  backupSchemaVersion: number,
  pragmaVersion: number,
  metadataStampPresent: boolean,
  metadataVersion: number,
  supportedVersion: number,
): RestoreResult {
  if (metadataStampPresent && (metadataVersion <= 0 || metadataVersion !== pragmaVersion)) {
    return {
      success: false,
      mode: forceDirect ? 'direct' : 'data_only',
      backupSchemaVersion,
      currentSchemaVersion: supportedVersion,
      tablesRestored: 0,
      error: 'Backup schema metadata does not match the SQLite header',
    };
  }
  if (pragmaVersion > supportedVersion) {
    return {
      success: false,
      mode: 'direct',
      backupSchemaVersion,
      currentSchemaVersion: supportedVersion,
      tablesRestored: 0,
      error: `Direct restore rejected: backup schema v${pragmaVersion} is newer than supported schema v${supportedVersion}`,
    };
  }

  let probe: Database.Database | undefined;
  try {
    probe = new Database(backupPath, { readonly: true, fileMustExist: true });
    const integrity = probe.prepare('PRAGMA integrity_check').all() as {
      integrity_check: string;
    }[];
    if (integrity.some((row) => row.integrity_check !== 'ok')) {
      return {
        success: false,
        mode: 'direct',
        backupSchemaVersion,
        currentSchemaVersion: supportedVersion,
        tablesRestored: 0,
        error: 'Backup failed integrity validation',
      };
    }
  } catch (error: unknown) {
    return {
      success: false,
      mode: 'direct',
      backupSchemaVersion,
      currentSchemaVersion: supportedVersion,
      tablesRestored: 0,
      error: error?.message || 'Invalid or corrupt backup file',
    };
  } finally {
    probe?.close();
  }

  const dbPath = getDbPath();
  try {
    removeDatabaseFiles(dbPath);
    fs.copyFileSync(backupPath, dbPath);
    syncFile(dbPath);
    initDatabase(false);
    const freshDb = getDatabase();
    const integrity = freshDb.prepare('PRAGMA integrity_check').all() as {
      integrity_check: string;
    }[];
    if (integrity.some((row) => row.integrity_check !== 'ok')) {
      closeDatabase();
      removeDatabaseFiles(dbPath);
      setRecoveryRequired('missing_database');
      return {
        success: false,
        mode: 'direct',
        backupSchemaVersion,
        currentSchemaVersion: supportedVersion,
        tablesRestored: 0,
        error: 'Restored database failed integrity validation',
      };
    }
    const userCount = (freshDb.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    if (userCount > 0) {
      markInstallationInitialized();
    }
    clearRecoveryRequired();
    return {
      success: true,
      mode: 'direct',
      backupSchemaVersion,
      currentSchemaVersion: getCurrentSchemaVersion(),
      tablesRestored: getTables(freshDb).length,
    };
  } catch (error: unknown) {
    try {
      closeDatabase();
    } catch {
      /* ignore */
    }
    try {
      removeDatabaseFiles(dbPath);
    } catch {
      /* ignore */
    }
    if (isInstallationInitialized()) setRecoveryRequired('missing_database');
    return {
      success: false,
      mode: 'direct',
      backupSchemaVersion,
      currentSchemaVersion: supportedVersion,
      tablesRestored: 0,
      error: error?.message || 'Restore failed',
    };
  }
}

export function restoreBackup(backupPath: string, forceDirect: boolean = false): RestoreResult {
  console.log('[DB] restoreBackup: Starting restore from:', backupPath);
  const supportedVersion = getSupportedSchemaVersion();
  try {
    backupPath = materializeRestoreSource(backupPath, getDbPath());
  } catch (error: unknown) {
    const currentVersion = isDatabaseOpen() ? getCurrentSchemaVersion() : supportedVersion;
    return {
      success: false,
      mode: forceDirect ? 'direct' : 'data_only',
      backupSchemaVersion: 0,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: error?.message || 'Invalid restore source',
    };
  }

  let metadataVersion = 0;
  let metadataStampPresent = false;
  let pragmaVersion = 0;
  let backupDb: Database.Database | undefined;
  try {
    backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    const metaRow = backupDb
      .prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    metadataStampPresent = Boolean(metaRow);
    metadataVersion = metaRow ? (parseCanonicalSchemaVersion(metaRow.value) ?? 0) : 0;
    pragmaVersion = Number(backupDb.pragma('user_version', { simple: true }));
  } catch (error: unknown) {
    // Corrupt / non-SQLite files must fail closed without touching the live DB.
    const currentVersion = isDatabaseOpen() ? getCurrentSchemaVersion() : supportedVersion;
    return {
      success: false,
      mode: forceDirect ? 'direct' : 'data_only',
      backupSchemaVersion: 0,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: error?.message || 'Invalid or corrupt backup file',
    };
  } finally {
    backupDb?.close();
  }

  // The SQLite header is authoritative for what initDatabase() will open. A
  // forged/stale _flo_meta stamp must not let forceDirect replace the live DB
  // with a database this build cannot migrate or serve.
  const backupSchemaVersion =
    Number.isFinite(metadataVersion) && metadataVersion > 0 ? metadataVersion : pragmaVersion;

  // REC-01 recovery: no live DB open — validate backup and install into empty slot.
  if (!isDatabaseOpen()) {
    return restoreBackupWithNoLiveDatabase(
      backupPath,
      forceDirect,
      backupSchemaVersion,
      pragmaVersion,
      metadataStampPresent,
      metadataVersion,
      supportedVersion,
    );
  }

  const currentDb = getDatabase();
  const currentVersion = getCurrentSchemaVersion();
  // Never let restoring an older snapshot resurrect a token that was revoked
  // after that snapshot was created.
  const preservedRevocations = readRevocations(currentDb);
  const preservedUserSecurity = captureUserSecurityState(currentDb);
  const preservedUserStations = captureUserStationSecurityState(currentDb);
  const preservedStationSecurity = captureKitchenStationSecurityState(currentDb);
  const preservedKdsEnabled = captureKdsEnabledSetting(currentDb);
  const preservedProtectedSettings = captureRestoreProtectedSettings(currentDb);
  const preservedOutboxes = captureRestoreOutboxState(currentDb);

  console.log(
    `[DB] Backup schema version: ${backupSchemaVersion}, SQLite: ${pragmaVersion}, Current: ${currentVersion}`,
  );

  if (metadataStampPresent && (metadataVersion <= 0 || metadataVersion !== pragmaVersion)) {
    return {
      success: false,
      mode: forceDirect ? 'direct' : 'data_only',
      backupSchemaVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: 'Backup schema metadata does not match the SQLite header',
    };
  }

  if (forceDirect && pragmaVersion > currentVersion) {
    return {
      success: false,
      mode: 'direct',
      backupSchemaVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: `Direct restore rejected: backup schema v${pragmaVersion} is newer than supported schema v${currentVersion}`,
    };
  }

  if (forceDirect || backupSchemaVersion === currentVersion) {
    const baselineForeignKeyViolations = getForeignKeyViolationKeys(currentDb);
    const validationError = validateDirectBackup(
      backupPath,
      currentDb,
      currentVersion,
      baselineForeignKeyViolations,
    );
    if (validationError) {
      return {
        success: false,
        mode: 'direct',
        backupSchemaVersion,
        currentSchemaVersion: currentVersion,
        tablesRestored: 0,
        error: validationError,
      };
    }

    console.log('[DB] restoreBackup: Direct restore (same schema version)');
    const dbPath = getDbPath();
    const recoveryPath = path.join(
      getBackupDir(),
      `flo-restore-recovery-${crypto.randomBytes(8).toString('hex')}.db`,
    );
    const journalPath = recoveryPath.replace(/\.db$/, '.json');

    let recoveryCopyReady = false;
    let recoveryCompleted = false;
    try {
      // Checkpoint the live WAL before making a synchronous recovery copy.
      currentDb.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(dbPath, recoveryPath);
      syncFile(recoveryPath);
      writeReplacementJournal(journalPath, {
        phase: 'prepared',
        recoveryPath,
        dbPath,
        baselineForeignKeyViolations: [...baselineForeignKeyViolations],
      });
      recoveryCopyReady = true;
      closeDatabase();
      const removeFailures = removeDatabaseFiles(dbPath);
      if (removeFailures.length > 0) {
        throw new Error(`Could not remove database files: ${removeFailures.join(', ')}`);
      }
      fs.copyFileSync(backupPath, dbPath);
      initDatabase(false);

      const freshDb = getDatabase();
      mergeUserSecurityState(freshDb, preservedUserSecurity);
      mergeUserStationSecurityState(
        freshDb,
        preservedUserStations,
        preservedUserSecurity.map((row) => row.id),
        preservedStationSecurity,
      );
      mergeKdsEnabledSetting(freshDb, preservedKdsEnabled);
      mergeRestoreProtectedSettings(freshDb, preservedProtectedSettings);
      freshDb.prepare('DELETE FROM kds_pairing_tokens').run();
      mergeRestoreOutboxState(freshDb, preservedOutboxes);
      mergeRevocations(freshDb, preservedRevocations);
      const integrity = freshDb.prepare('PRAGMA integrity_check').all() as {
        integrity_check: string;
      }[];
      const newForeignKeyViolations = [...getForeignKeyViolationKeys(freshDb)].filter(
        (key) => !baselineForeignKeyViolations.has(key),
      );
      if (
        integrity.some((row) => row.integrity_check !== 'ok') ||
        newForeignKeyViolations.length > 0
      ) {
        throw new Error('Restored database failed integrity validation');
      }
      freshDb.pragma('wal_checkpoint(TRUNCATE)');
      syncFile(dbPath);
      if (!syncDirectory(path.dirname(dbPath)) && process.platform !== 'win32') {
        throw new Error('Could not durably commit restored database');
      }
      writeReplacementJournal(journalPath, {
        phase: 'committed',
        recoveryPath,
        dbPath,
        baselineForeignKeyViolations: [...baselineForeignKeyViolations],
      });
      const userCount = (freshDb.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number })
        .c;
      if (userCount > 0) markInstallationInitialized();
      clearRecoveryRequired();
      return {
        success: true,
        mode: 'direct',
        backupSchemaVersion,
        currentSchemaVersion: currentVersion,
        tablesRestored: getTables(freshDb).length,
      };
    } catch (error: unknown) {
      // A corrupt/incompatible same-version file must not strand the live
      // database. Restore the checkpointed safety copy before rethrowing.
      if (!recoveryCopyReady) throw error;
      try {
        closeDatabase();
        const recoveryRemoveFailures = removeDatabaseFiles(dbPath);
        if (recoveryRemoveFailures.length > 0) {
          throw new Error(
            `Could not remove database files during recovery: ${recoveryRemoveFailures.join(', ')}`,
          );
        }
        fs.copyFileSync(recoveryPath, dbPath);
        syncFile(dbPath);
        if (!syncDirectory(path.dirname(dbPath)) && process.platform !== 'win32') {
          throw new Error('Could not durably recover direct-restore database');
        }
        initDatabase(false);
        recoveryCompleted = true;
      } catch (recoveryError: any) {
        throw new Error(
          `Direct restore failed: ${error?.message || 'unknown error'}; ` +
            `live database recovery failed: ${recoveryError?.message || 'unknown error'}`,
        );
      }
      throw error;
    } finally {
      if (recoveryCompleted) {
        removeReplacementArtifacts(journalPath, recoveryPath);
      } else if (
        isHealthyDatabaseFile(dbPath, baselineForeignKeyViolations, false) &&
        isHealthyDatabaseFile(recoveryPath, baselineForeignKeyViolations, false)
      ) {
        // A committed journal is finalized here; an uncommitted journal is
        // intentionally retained if recovery itself failed.
        try {
          const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as ReplacementJournal;
          if (journal.phase === 'committed') removeReplacementArtifacts(journalPath, recoveryPath);
        } catch {}
      }
    }
  }

  console.log('[DB] restoreBackup: Data-only restore (schema version mismatch)');
  return dataOnlyRestore(
    backupPath,
    backupSchemaVersion,
    currentVersion,
    preservedRevocations,
    preservedUserSecurity,
    preservedUserStations,
    preservedStationSecurity,
    preservedKdsEnabled,
    preservedProtectedSettings,
    preservedOutboxes,
  );
}

/** Return stable keys for existing FK violations so legacy dirty data can be preserved without accepting new damage. */
export function getForeignKeyViolationKeys(dbInstance: Database.Database): Set<string> {
  const rows = dbInstance.prepare('PRAGMA foreign_key_check').all() as {
    table: string;
    rowid: number | string | null;
    parent: string;
    fkid: number;
  }[];
  const keys = new Set<string>();
  for (const row of rows) {
    let identity: unknown = row.rowid;
    try {
      const tableInfo = dbInstance
        .prepare(`PRAGMA table_info("${row.table.replace(/"/g, '""')}")`)
        .all() as { name: string; pk: number }[];
      const primaryKeys = tableInfo.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
      const columns = primaryKeys.map((column) => `"${column.name.replace(/"/g, '""')}"`);
      const foreignKey = (
        dbInstance.prepare(`PRAGMA foreign_key_list("${row.table.replace(/"/g, '""')}")`).all() as {
          id: number;
          from: string;
        }[]
      )
        .filter((entry) => entry.id === row.fkid)
        .map((entry) => entry.from);
      const selectedColumns = [
        ...new Set([...columns, ...foreignKey.map((column) => `"${column.replace(/"/g, '""')}"`)]),
      ];
      if (selectedColumns.length > 0 && row.rowid != null) {
        const values = dbInstance
          .prepare(
            `SELECT ${selectedColumns.join(', ')} FROM "${row.table.replace(/"/g, '""')}" WHERE rowid = ?`,
          )
          .get(row.rowid) as Record<string, unknown> | undefined;
        if (values)
          identity = {
            primary: primaryKeys.map((column) => values[column.name]),
            foreign: foreignKey.map((column) => values[column]),
          };
      }
    } catch {}
    keys.add(JSON.stringify([row.table, identity, row.parent, row.fkid]));
  }
  return keys;
}

/** Return true only if the string is a safe SQL identifier (letters, digits, underscore). */
export function isSafeIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

function materializeRestoreSource(sourcePath: string, livePath: string): string {
  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile())
    throw new Error('Restore source must be a regular file');
  if (pathEntryExists(`${sourcePath}-wal`) || pathEntryExists(`${sourcePath}-shm`))
    throw new Error('Restore source must not have SQLite sidecars');
  if (
    [livePath, `${livePath}-wal`, `${livePath}-shm`].some((liveTarget) =>
      isLiveDatabaseTarget(sourcePath, liveTarget),
    )
  ) {
    throw new Error('Restore source cannot be the live database or its SQLite sidecars');
  }
  const sourceFd = fs.openSync(
    sourcePath,
    fs.constants.O_RDONLY | ((fs.constants as any).O_NOFOLLOW || 0),
  );
  try {
    const openedStat = fs.fstatSync(sourceFd);
    if (
      openedStat.dev !== sourceStat.dev ||
      openedStat.ino !== sourceStat.ino ||
      openedStat.size !== sourceStat.size
    ) {
      throw new Error('Restore source changed while it was being opened');
    }
    if (pathEntryExists(livePath)) {
      const liveStat = fs.lstatSync(livePath);
      if (openedStat.dev === liveStat.dev && openedStat.ino === liveStat.ino) {
        throw new Error('Restore source cannot be the live database');
      }
    }
    const sourceBytes = fs.readFileSync(sourceFd);
    const finalStat = fs.fstatSync(sourceFd);
    if (
      finalStat.dev !== openedStat.dev ||
      finalStat.ino !== openedStat.ino ||
      finalStat.size !== openedStat.size ||
      finalStat.mtimeMs !== openedStat.mtimeMs
    ) {
      throw new Error('Restore source changed while it was being read');
    }
    if (pathEntryExists(`${sourcePath}-wal`) || pathEntryExists(`${sourcePath}-shm`)) {
      throw new Error('Restore source acquired SQLite sidecars while it was being read');
    }
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-restore-source-'));
    const snapshotPath = path.join(snapshotDir, 'source.db');
    fs.writeFileSync(snapshotPath, sourceBytes, { flag: 'wx', mode: 0o600 });
    setImmediate(() => {
      try {
        fs.rmSync(snapshotDir, { recursive: true, force: true });
      } catch {}
    });
    return snapshotPath;
  } finally {
    fs.closeSync(sourceFd);
  }
}

function dataOnlyRestore(
  backupPath: string,
  backupVersion: number,
  currentVersion: number,
  preservedRevocations: RevocationRow[] = [],
  preservedUserSecurity: UserSecurityState[] = [],
  preservedUserStations: UserStationSecurityState[] = [],
  preservedStationSecurity: KitchenStationSecurityState[] = [],
  preservedKdsEnabled: KdsEnabledSettingState = { present: false, value: null },
  preservedProtectedSettings: RestoreProtectedSettingState[] = [],
  preservedOutboxes: RestoreOutboxState = { cloud: [], support: [], diagnostics: [] },
): RestoreResult {
  const livePath = getDbPath();
  if (
    [livePath, `${livePath}-wal`, `${livePath}-shm`].some((liveTarget) =>
      isLiveDatabaseTarget(backupPath, liveTarget),
    )
  ) {
    return {
      success: false,
      mode: 'data_only',
      backupSchemaVersion: backupVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: 'Data-only restore source cannot be the live database or its SQLite sidecars',
    };
  }
  try {
    backupPath = materializeRestoreSource(backupPath, livePath);
  } catch (error: unknown) {
    return {
      success: false,
      mode: 'data_only',
      backupSchemaVersion: backupVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: error?.message || 'Invalid data-only restore source',
    };
  }
  let backupDb: Database.Database | undefined;
  let backupTables: string[] = [];
  const backupColumns = new Map<string, string[]>();
  try {
    backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    backupTables = getTables(backupDb);
    for (const tableName of backupTables) {
      if (isSafeIdentifier(tableName))
        backupColumns.set(tableName, getColumns(backupDb, tableName));
    }
  } finally {
    backupDb?.close();
  }

  const currentDb = getDatabase();
  const baselineForeignKeyViolations = getForeignKeyViolationKeys(currentDb);
  const currentTables = getTables(currentDb);
  const commonTables = backupTables.filter((tableName) => currentTables.includes(tableName));
  const previousForeignKeys = Number(currentDb.pragma('foreign_keys', { simple: true })) === 1;
  let attached = false;
  let inTransaction = false;
  let tablesRestored = 0;

  // Existing failed versions of this function could strand this alias on the
  // long-lived connection. Remove it before attempting a fresh restore.
  try {
    const attachedDatabases = currentDb.prepare('PRAGMA database_list').all() as { name: string }[];
    if (attachedDatabases.some((entry) => entry.name === '_restore_src')) {
      currentDb.exec('DETACH DATABASE _restore_src');
    }
  } catch (error: unknown) {
    return {
      success: false,
      mode: 'data_only',
      backupSchemaVersion: backupVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: `Could not clear a previous restore attachment: ${error?.message || 'unknown error'}`,
    };
  }

  try {
    // FK enforcement must be disabled before BEGIN. With it off, deleting a
    // common parent does not cascade-delete current-only child tables that an
    // older backup does not contain. The final check below protects commit.
    currentDb.pragma('foreign_keys = OFF');
    const safeBackupPath = backupPath.replace(/'/g, "''");
    currentDb.exec(`ATTACH DATABASE '${safeBackupPath}' AS _restore_src`);
    attached = true;
    currentDb.exec('BEGIN IMMEDIATE');
    inTransaction = true;

    for (const tableName of commonTables) {
      if (!isSafeIdentifier(tableName)) {
        console.warn(`[DB] dataOnlyRestore: skipping unsafe table: ${JSON.stringify(tableName)}`);
        continue;
      }

      const currentColumns = getColumns(currentDb, tableName);
      const commonColumns = (backupColumns.get(tableName) || [])
        .filter((column) => currentColumns.includes(column))
        .filter((column) => {
          if (isSafeIdentifier(column)) return true;
          console.warn(
            `[DB] dataOnlyRestore: skipping unsafe column: ${JSON.stringify(column)} in ${tableName}`,
          );
          return false;
        });

      if (commonColumns.length === 0) continue;

      const columnList = commonColumns.join(', ');
      currentDb.exec(`DELETE FROM ${tableName}`);
      currentDb.exec(
        `INSERT INTO ${tableName} (${columnList}) SELECT ${columnList} FROM _restore_src.${tableName}`,
      );

      tablesRestored++;
      console.log(`[DB] Restored ${tableName}: ${commonColumns.length} columns`);
    }

    mergeUserSecurityState(currentDb, preservedUserSecurity);
    mergeUserStationSecurityState(
      currentDb,
      preservedUserStations,
      preservedUserSecurity.map((row) => row.id),
      preservedStationSecurity,
    );
    mergeKdsEnabledSetting(currentDb, preservedKdsEnabled);
    mergeRestoreProtectedSettings(currentDb, preservedProtectedSettings);
    currentDb.prepare('DELETE FROM kds_pairing_tokens').run();
    mergeRestoreOutboxState(currentDb, preservedOutboxes);
    mergeRevocations(currentDb, preservedRevocations);
    const newForeignKeyViolations = [...getForeignKeyViolationKeys(currentDb)].filter(
      (key) => !baselineForeignKeyViolations.has(key),
    );
    if (newForeignKeyViolations.length > 0) {
      throw new Error(
        `Restore would introduce ${newForeignKeyViolations.length} new foreign-key violation(s)`,
      );
    }

    // SQLite does not allow DETACH while a write transaction is active.
    // Commit only after the integrity check, then detach the already-closed
    // source handle immediately so the long-lived connection stays clean.
    currentDb.exec('COMMIT');
    inTransaction = false;
    try {
      currentDb.exec('DETACH DATABASE _restore_src');
      attached = false;
    } catch (detachError: any) {
      // Once committed, a detach failure cannot be rolled back. Reopening the
      // main connection drops every attachment and gives the caller a clean,
      // usable handle instead of reporting a false failure with live data
      // already changed.
      try {
        closeDatabase();
        initDatabase(false);
        attached = false;
      } catch (recoveryError: any) {
        throw new Error(
          `Restore committed but source cleanup failed: ${detachError?.message || 'unknown error'}; ` +
            `database reopen also failed: ${recoveryError?.message || 'unknown error'}`,
        );
      }
    }

    const restoredUsers = (
      getDatabase().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
    ).c;
    if (restoredUsers > 0) markInstallationInitialized();
    clearRecoveryRequired();

    return {
      success: true,
      mode: 'data_only',
      backupSchemaVersion: backupVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored,
    };
  } catch (error: unknown) {
    let cleanupFailure: unknown = null;
    if (inTransaction) {
      try {
        currentDb.exec('ROLLBACK');
      } catch (rollbackError) {
        cleanupFailure = rollbackError;
      }
      inTransaction = false;
    }
    if (attached) {
      try {
        currentDb.exec('DETACH DATABASE _restore_src');
        attached = false;
      } catch (detachError) {
        cleanupFailure = cleanupFailure || detachError;
      }
    }
    if (cleanupFailure) {
      try {
        closeDatabase();
        initDatabase(false);
        attached = false;
      } catch (recoveryError: any) {
        error = new Error(
          `${error?.message || 'Restore failed'}; cleanup failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : 'unknown error'}; ` +
            `database reopen failed: ${recoveryError?.message || 'unknown error'}`,
        );
      }
    }
    console.error('[DB] dataOnlyRestore failed:', error);
    return {
      success: false,
      mode: 'data_only',
      backupSchemaVersion: backupVersion,
      currentSchemaVersion: currentVersion,
      tablesRestored: 0,
      error: error?.message || 'Restore failed',
    };
  } finally {
    if (attached) {
      try {
        currentDb.exec('DETACH DATABASE _restore_src');
      } catch {}
    }
    try {
      getDatabase().pragma(`foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'}`);
    } catch {}
  }
}

export function getSchemaVersionFromBackup(backupPath: string): number | null {
  let backupDb: Database.Database | undefined;
  try {
    backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    const metaRow = backupDb
      .prepare(`SELECT value FROM _flo_meta WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    if (!metaRow) return null;
    const version = Number.parseInt(metaRow.value, 10);
    return Number.isFinite(version) && version >= 0 ? version : null;
  } catch {
    return null;
  } finally {
    backupDb?.close();
  }
}

export function getCurrentSchemaVersion(): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Highest schema version this build can migrate/serve (safe when no live DB). */
export function getSupportedSchemaVersion(): number {
  return MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
}

/**
 * Builds a throwaway in-memory database by running the exact same
 * createSchema()+MIGRATIONS pipeline a real fresh install takes. This is the
 * "ideal" schema reference for the DB health check — deriving it from the
 * live migration pipeline (instead of hand-maintaining a second schema spec)
 * guarantees it can never drift from what main/db.ts actually produces.
 *
 * Temporarily swaps the module-level `db` binding since createSchema()/
 * runMigrations() operate on it directly. Safe because better-sqlite3 is
 * fully synchronous and Node is single-threaded — nothing else can observe
 * the swapped binding as long as this function doesn't yield to the event loop.
 * Caller owns the returned handle and must call .close() on it.
 */
export function buildIdealSchemaDb(): Database.Database {
  const idealDb = new Database(':memory:');
  idealDb.pragma('foreign_keys = OFF'); // Off during migrations
  const previousDb = db;
  db = idealDb;
  try {
    buildingIdealSchema = true;
    runMigrations();
  } finally {
    buildingIdealSchema = false;
    db = previousDb;
  }
  idealDb.pragma('foreign_keys = ON');
  return idealDb;
}

function bindMigrationHost(): void {
  setMigrationHost({
    getDb: () => db,
    getColumns,
    insertSettingIfMissing,
    getSettingValue,
    createSchema,
    createCloudSyncSchema,
    createTaxPackSchema,
    createWhatsAppSchema,
    seedInstallDefaults,
    seedCloudSyncDefaults,
    seedWhatsAppDefaults,
    loadInstallDefaults: seedInstallDefaults,
    sha256Hex,
  });
}

function syncBackupBeforeMigration(fromVersion: number, toVersion: number): void {
  if (buildingIdealSchema) return;
  let targetPath = '';
  let completed = false;
  try {
    const dbPath = getDbPath();
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    targetPath = path.join(
      backupDir,
      `flo-backup-${timestamp}-pre-v${fromVersion}-to-v${toVersion}.db`,
    );

    if (fs.existsSync(dbPath)) {
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(dbPath, targetPath);
    } else {
      // A brand-new install has no source file yet; keep the backup contract
      // by creating an empty SQLite file with migration metadata below.
      fs.writeFileSync(targetPath, '');
    }

    let backupDb: Database.Database | undefined;
    try {
      backupDb = new Database(targetPath);
      backupDb.pragma('journal_mode = DELETE');
      backupDb.exec(`
        CREATE TABLE IF NOT EXISTS _flo_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      // This snapshot predates the migration about to run. Keep both the
      // metadata stamp and SQLite header aligned with that older version so
      // restoring it cannot be misclassified as a current-schema backup.
      backupDb.pragma(`user_version = ${fromVersion}`);
      backupDb
        .prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`)
        .run('schema_version', String(fromVersion));
      backupDb
        .prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`)
        .run('backup_created_at', new Date().toISOString());
      backupDb
        .prepare(`INSERT OR REPLACE INTO _flo_meta (key, value) VALUES (?, ?)`)
        .run('app_version', app.getVersion());
    } finally {
      backupDb?.close();
    }
    syncFile(targetPath);
    if (!syncDirectory(path.dirname(targetPath)) && process.platform !== 'win32') {
      throw new Error('Could not durably persist pre-migration backup');
    }

    completed = true;
    console.log(
      `[DB] Auto-backup before migrating v${fromVersion} → v${toVersion} created at ${targetPath}`,
    );
  } catch (err: unknown) {
    console.error(`[DB] Auto-backup before migration failed:`, err.message);
    throw new Error(
      `Pre-migration backup failed; refusing to migrate the database: ${err.message}`,
    );
  } finally {
    if (!completed && targetPath) {
      for (const filePath of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) {
        try {
          if (pathEntryExists(filePath)) fs.unlinkSync(filePath);
        } catch {}
      }
    }
  }
}

export class SchemaVersionMismatchError extends Error {
  constructor(
    public readonly dbVersion: number,
    public readonly appVersion: number,
  ) {
    super(
      `Database schema (v${dbVersion}) is newer than this app version supports (v${appVersion}). ` +
        `This usually means another device or a previous update already upgraded this database. ` +
        `Please update OPERAVIA to the latest version before continuing.`,
    );
    this.name = 'SchemaVersionMismatchError';
  }
}

function runMigrations(): void {
  bindMigrationHost();
  const current = getCurrentSchemaVersion();
  const target = MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;

  if (current > target) {
    // The database has already been migrated by a newer build than this one
    // (shared/synced DB, or a stale install/shortcut still pointing at this
    // binary). Proceeding would let old queries reference columns a later
    // migration already dropped (e.g. order_items.addons, #133) — fail loudly
    // at startup instead of mid-transaction during business hours.
    throw new SchemaVersionMismatchError(current, target);
  }

  if (current === target) {
    console.log(`[DB] Schema up to date (v${current})`);
    return;
  }

  console.log(`[DB] Schema: v${current} → v${target}`);

  // Back up once, up front, before running the whole pending batch — not just
  // before specific hand-picked versions. An install that's been stuck for a
  // long time (broken auto-update, offline for months, etc.) can jump through
  // a dozen+ migrations in a single run; every one of them deserves the same
  // protection, not just the couple we happened to remember to flag by number.
  //
  // Deliberately unconditional, including current === 0: that's NOT a
  // reliable signal for "nothing to protect" — real old installs can report
  // user_version 0 if they predate this app's version-tracking pragma (see
  // tests/fixtures/upgrade-snapshots/pre-migration-scheme-v1.5.0.db), and
  // those are exactly the installs with the most pending migrations and the
  // most at stake. A brand-new install just backs up an empty/tiny file.
  console.log(`[DB] Triggering auto-backup before migrating v${current} → v${target}...`);
  syncBackupBeforeMigration(current, target);

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    console.log(`[DB] Applying migration v${migration.version}: ${migration.name}`);
    db.transaction(() => {
      migration.up();
      db.pragma(`user_version = ${migration.version}`);
    })();
    console.log(`[DB] Migration v${migration.version} complete`);
  }
}

// createSchema() only runs for migration v1, i.e. brand-new installs — for
// any existing install this is a no-op (CREATE TABLE IF NOT EXISTS). If you
// add a column directly to a CREATE TABLE below, existing installs never
// get it unless you also add a guarded ALTER migration for it (see v23/v29
// in MIGRATIONS above for the pattern, and specs/DatabaseMigrations.md).
// tests/upgrade-path.test.ts exists specifically to catch this class of bug.
function createSchema(): void {
  db.exec(`
    -- ── Master data tables ──────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      parent_id TEXT,
      slug TEXT,
      color TEXT,
      icon TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      cost REAL DEFAULT 0,
      price_cents INTEGER,
      cost_cents INTEGER,
      sku TEXT,
      barcode TEXT,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      track_inventory INTEGER DEFAULT 0,
      stock_quantity REAL DEFAULT 0,
      inventory_unit TEXT DEFAULT 'pcs',
      low_stock_threshold REAL DEFAULT 5,
      tax_type TEXT DEFAULT 'none',
      tax_rate REAL DEFAULT 0,
      tax_category_id TEXT DEFAULT NULL,
      tax_behavior TEXT DEFAULT 'country_default',
      -- Stays DEFAULT 0 so a fresh install and an upgraded one have an
      -- identical products table. SQLite cannot alter a column default without
      -- rebuilding the table, so changing it here would drift every upgraded
      -- install away from the ideal schema and light up schema-health forever.
      -- The tri-state does not depend on the default: every insert path passes
      -- cb_percent explicitly, and NULL is written as NULL.
      cb_percent REAL DEFAULT 0,
      tags TEXT,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS addon_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_required INTEGER DEFAULT 0,
      min_selection INTEGER DEFAULT 0,
      max_selection INTEGER DEFAULT 1,
      allow_multiple_quantities INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS addons (
      id TEXT PRIMARY KEY,
      addon_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      tax_category_id TEXT DEFAULT NULL,
      tax_behavior TEXT DEFAULT 'country_default',
      inherit_parent_tax_category INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (addon_group_id) REFERENCES addon_groups(id)
    );

    CREATE TABLE IF NOT EXISTS addon_group_product (
      product_id TEXT NOT NULL,
      addon_group_id TEXT NOT NULL,
      PRIMARY KEY (product_id, addon_group_id)
    );

    CREATE TABLE IF NOT EXISTS kitchen_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category_ids TEXT,
      printer_id TEXT,
      printer_ip TEXT,
      printer_port INTEGER DEFAULT 9100,
      printer_name TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS station_users (
      user_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, station_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (station_id) REFERENCES kitchen_stations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      floor TEXT,
      section TEXT,
      position_x REAL,
      position_y REAL,
      kitchen_station_id TEXT,
      assigned_waiter_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      country_code TEXT DEFAULT '+91',
      address TEXT,
      notes TEXT,
      tag_counts TEXT DEFAULT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Users (authentication + roles) ──────────────────────────────────
    -- Roles: owner, manager, cashier, waiter, chef
    -- KDS is operated by the chef role.

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier'
        CHECK (role IN ('owner', 'manager', 'cashier', 'waiter', 'chef')),
      pin TEXT,
      pin_hash TEXT,
      category_ids TEXT,
      is_active INTEGER DEFAULT 1,
      terms_accepted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Transactional tables ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      table_id TEXT,
      customer_id TEXT,
      user_id TEXT,
      type TEXT DEFAULT 'takeaway',
      guest_count INTEGER,
      special_instructions TEXT,
      packaging_charge REAL DEFAULT 0,
      delivery_charge REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      tax_breakdown TEXT,
      tax_snapshot TEXT DEFAULT NULL,
      packaging_tax_category_id TEXT DEFAULT NULL,
      delivery_tax_category_id TEXT DEFAULT NULL,
      service_charge_tax_category_id TEXT DEFAULT NULL,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT,
      discount_value REAL,
      discount_reason TEXT,
      round_off REAL DEFAULT 0,
      total REAL DEFAULT 0,
      subtotal_cents INTEGER,
      tax_amount_cents INTEGER,
      discount_amount_cents INTEGER,
      delivery_charge_cents INTEGER,
      packaging_charge_cents INTEGER,
      total_cents INTEGER,
      cooking_started_at TEXT,
      ready_at TEXT,
      served_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      cancellation_reason TEXT,
      kitchen_priority INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL,
      tax_amount REAL DEFAULT 0,
      tax_breakdown TEXT,
      tax_snapshot TEXT DEFAULT NULL,
      tax_type TEXT,
      discount_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      unit_price_cents INTEGER,
      subtotal_cents INTEGER,
      tax_amount_cents INTEGER,
      discount_amount_cents INTEGER,
      total_cents INTEGER,
      variant_selection TEXT,
      modifier_selection TEXT,
      addons TEXT,
      special_instructions TEXT,
      status TEXT DEFAULT 'pending',
      preparing_started_at TEXT,
      ready_at TEXT,
      served_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      order_id INTEGER NOT NULL,
      customer_id TEXT,
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      tax_breakdown TEXT,
      tax_snapshot TEXT DEFAULT NULL,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT,
      discount_value REAL,
      discount_reason TEXT,
      delivery_charge REAL DEFAULT 0,
      packaging_charge REAL DEFAULT 0,
      round_off REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      subtotal_cents INTEGER,
      tax_amount_cents INTEGER,
      discount_amount_cents INTEGER,
      total_cents INTEGER,
      paid_amount_cents INTEGER,
      balance_cents INTEGER,
      payment_status TEXT DEFAULT 'unpaid',
      payment_details TEXT,
      paid_at TEXT,
      printed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT NOT NULL,
      bill_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Config tables ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kds_pairing_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      station_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      connection_type TEXT NOT NULL CHECK (connection_type IN ('network', 'usb', 'webusb')),
      ip_address TEXT,
      port INTEGER DEFAULT 9100,
      is_default INTEGER DEFAULT 0,
      paper_width TEXT DEFAULT '80mm',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS country_packs (
      id TEXT PRIMARY KEY,
      publisher TEXT NOT NULL,
      country TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      active_version_id TEXT,
      status TEXT NOT NULL DEFAULT 'installed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS country_pack_versions (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      manifest_json TEXT NOT NULL,
      pack_json TEXT NOT NULL,
      digest TEXT,
      signature TEXT,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      min_flo_version TEXT NOT NULL,
      published_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'staged',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pack_id, version)
    );

    CREATE TABLE IF NOT EXISTS tax_categories (
      id TEXT PRIMARY KEY,
      pack_version_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      label TEXT NOT NULL,
      default_behavior TEXT,
      definition_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pack_version_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS tax_rules (
      id TEXT PRIMARY KEY,
      pack_version_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      label TEXT NOT NULL,
      calculation_type TEXT NOT NULL,
      rate TEXT,
      amount TEXT,
      applies_per TEXT,
      base_rule_ids TEXT,
      definition_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pack_version_id, rule_id)
    );

    CREATE TABLE IF NOT EXISTS tax_overrides (
      id TEXT PRIMARY KEY,
      pack_version_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      field_name TEXT NOT NULL,
      value_json TEXT NOT NULL,
      created_by_user_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tax_config_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      pack_id TEXT,
      pack_version_id TEXT,
      override_id TEXT,
      actor_user_id TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Indexes ──────────────────────────────────────────────────────────

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_user       ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_bills_order       ON bills(order_id);
    CREATE INDEX IF NOT EXISTS idx_country_pack_versions_pack ON country_pack_versions(pack_id);
    CREATE INDEX IF NOT EXISTS idx_tax_categories_pack_version ON tax_categories(pack_version_id);
    CREATE INDEX IF NOT EXISTS idx_tax_rules_pack_version ON tax_rules(pack_version_id);
    CREATE INDEX IF NOT EXISTS idx_tax_overrides_pack_version ON tax_overrides(pack_version_id);

    -- R4 Inventory OS (migration v78 also creates these for upgrades)
    CREATE TABLE IF NOT EXISTS stock_adjust_idempotency (
      user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      product_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT,
      applied_at TEXT
    );
    CREATE TABLE IF NOT EXISTS inventory_count_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      system_qty REAL NOT NULL,
      counted_qty REAL NOT NULL,
      variance REAL NOT NULL,
      applied_movement_id INTEGER,
      UNIQUE(count_id, product_id),
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_count
      ON inventory_count_lines(count_id);
    CREATE INDEX IF NOT EXISTS idx_stock_adjust_idempotency_product
      ON stock_adjust_idempotency(product_id);

    -- R5 BOM / Recipes / Food Cost (migration v79 also creates these for upgrades)
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      yield_qty REAL NOT NULL DEFAULT 1,
      yield_unit TEXT NOT NULL DEFAULT 'pcs',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_one_active_per_product
      ON recipes(product_id) WHERE is_active = 1;
    CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      ingredient_product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      prep_loss_bps INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(recipe_id, ingredient_product_id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id)
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe
      ON recipe_ingredients(recipe_id);

    CREATE TABLE IF NOT EXISTS recipe_consumptions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_item_id INTEGER NOT NULL UNIQUE,
      recipe_id TEXT NOT NULL,
      recipe_name TEXT NOT NULL,
      menu_product_id TEXT NOT NULL,
      portions REAL NOT NULL,
      yield_qty REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'consumed',
      actor_user_id TEXT,
      created_at TEXT NOT NULL,
      reversed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_consumptions_order
      ON recipe_consumptions(order_id);

    CREATE TABLE IF NOT EXISTS recipe_consumption_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumption_id TEXT NOT NULL,
      ingredient_product_id TEXT NOT NULL,
      ingredient_name TEXT,
      quantity_delta REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_cost_cents INTEGER,
      line_cost_cents INTEGER,
      inventory_movement_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (consumption_id) REFERENCES recipe_consumptions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_consumption_lines_consumption
      ON recipe_consumption_lines(consumption_id);

    -- R6 Purchasing & Supplier OS (migration v80 also creates these for upgrades)
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

    CREATE TABLE IF NOT EXISTS supplier_products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      supplier_sku TEXT,
      purchase_unit TEXT NOT NULL,
      last_purchase_cost_cents INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(supplier_id, product_id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier
      ON supplier_products(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_products_product
      ON supplier_products(product_id);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      po_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL
        CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
      order_date TEXT,
      expected_date TEXT,
      notes TEXT,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
      ON purchase_orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
      ON purchase_orders(status);

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      purchase_unit TEXT NOT NULL,
      ordered_qty REAL NOT NULL,
      unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      line_total_cents INTEGER NOT NULL DEFAULT 0,
      received_qty REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po
      ON purchase_order_lines(purchase_order_id);

    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      received_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_po
      ON purchase_receipts(purchase_order_id);

    CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      po_line_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      purchase_unit TEXT NOT NULL,
      unit_cost_cents INTEGER NOT NULL DEFAULT 0,
      inventory_qty REAL NOT NULL,
      movement_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id),
      FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_receipt
      ON purchase_receipt_lines(receipt_id);

    CREATE TABLE IF NOT EXISTS purchase_receive_idempotency (
      user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      purchase_order_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, idempotency_key)
    );
  `);
}

function createTaxPackSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS country_packs (
      id TEXT PRIMARY KEY,
      publisher TEXT NOT NULL,
      country TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      active_version_id TEXT,
      status TEXT NOT NULL DEFAULT 'installed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS country_pack_versions (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      manifest_json TEXT NOT NULL,
      pack_json TEXT NOT NULL,
      digest TEXT,
      signature TEXT,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      min_flo_version TEXT NOT NULL,
      published_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'staged',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pack_id, version)
    );

    CREATE TABLE IF NOT EXISTS tax_categories (
      id TEXT PRIMARY KEY,
      pack_version_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      label TEXT NOT NULL,
      default_behavior TEXT,
      definition_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pack_version_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS tax_rules (
      id TEXT PRIMARY KEY,
      pack_version_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      label TEXT NOT NULL,
      calculation_type TEXT NOT NULL,
      rate TEXT,
      amount TEXT,
      applies_per TEXT,
      base_rule_ids TEXT,
      definition_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pack_version_id, rule_id)
    );

    CREATE TABLE IF NOT EXISTS tax_overrides (
      id TEXT PRIMARY KEY,
      pack_version_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      field_name TEXT NOT NULL,
      value_json TEXT NOT NULL,
      created_by_user_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tax_config_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      pack_id TEXT,
      pack_version_id TEXT,
      override_id TEXT,
      actor_user_id TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_country_pack_versions_pack ON country_pack_versions(pack_id);
    CREATE INDEX IF NOT EXISTS idx_tax_categories_pack_version ON tax_categories(pack_version_id);
    CREATE INDEX IF NOT EXISTS idx_tax_rules_pack_version ON tax_rules(pack_version_id);
    CREATE INDEX IF NOT EXISTS idx_tax_overrides_pack_version ON tax_overrides(pack_version_id);
  `);
}

function createCloudSyncSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'delivered', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_error TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_status
      ON cloud_sync_outbox(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_entity
      ON cloud_sync_outbox(entity_type, entity_id);
  `);
}

function createWhatsAppSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER REFERENCES bills(id),
      customer_id TEXT REFERENCES customers(id),
      phone_e164 TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
      kind TEXT NOT NULL DEFAULT 'manual_reply'
        CHECK (kind IN ('bill_receipt','manual_reply','auto_followup')),
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','seen','typing','sent','delivered','read','failed')),
      body TEXT NOT NULL,
      external_message_id TEXT,
      error TEXT,
      queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      seen_at TEXT,
      typing_at TEXT,
      sent_at TEXT,
      delivered_at TEXT,
      read_at TEXT,
      failed_at TEXT,
      created_by_user_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone
      ON whatsapp_messages(phone_e164, queued_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status
      ON whatsapp_messages(status, queued_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_bill
      ON whatsapp_messages(bill_id);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_inbound_unread
      ON whatsapp_messages(direction, status, queued_at DESC)
      WHERE direction = 'inbound' AND status NOT IN ('read','failed');

    CREATE TABLE IF NOT EXISTS whatsapp_blocklist (
      phone_e164 TEXT PRIMARY KEY,
      reason TEXT,
      blocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      blocked_by_user_id TEXT
    );
  `);
}

function seedCloudSyncDefaults(): void {
  createCloudSyncSchema();

  const serverUrl = getSettingValue('cloud_server_url');
  if (!serverUrl) upsertSetting('cloud_server_url', DEFAULT_CLOUD_SERVER_URL);

  // Mirrors FloAdmin's own `stores` table defaults (sync + reports on, orders off —
  // see specs/floadmin.md § api surface). Harmless pre-claim: every send path in
  // cloud-sync.ts is gated on api_key being present, which only exists after a
  // human claims the store on FloAdmin, so nothing transmits before then.
  insertSettingIfMissing('cloud_sync_enabled', '1');
  insertSettingIfMissing('cloud_orders_enabled', '0');
  insertSettingIfMissing('cloud_reports_enabled', '1');
  insertSettingIfMissing('cloud_command_polling_enabled', '1');
  insertSettingIfMissing('cloud_connected', 'false');
  insertSettingIfMissing('cloud_registration_status', 'unregistered');

  ensureCloudIdentity();
}

function seedWhatsAppDefaults(): void {
  insertSettingIfMissing('whatsapp_enabled', 'false');
  insertSettingIfMissing('whatsapp_activated_by_user_id', '');
  insertSettingIfMissing('whatsapp_activated_at', '');
  insertSettingIfMissing('whatsapp_disclosure_version_acknowledged', '');
  insertSettingIfMissing('whatsapp_connected_phone', '');
  insertSettingIfMissing('whatsapp_disclosure_version', '1');
  // On by default — no one asks Flo to send a paid bill into a group chat.
  // Operators who do want group processing have to opt in explicitly.
  insertSettingIfMissing('whatsapp_filter_groups', 'true');
}

function seedInstallDefaults(): void {
  const insert = (key: string, value: string) =>
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);

  insert('business_name', '');
  insert('business_type', 'restaurant');
  insert('country', 'IN');
  insert('currency', 'INR');
  insert('currency_symbol', '₹');
  insert('timezone', 'Asia/Kolkata');
  insert('address', '');
  insert('phone', '');
  insert('email', '');
  insert('business_address', '');
  insert('business_phone', '');
  insert('instagram_handle', '');
  insert('tax_registered', 'false');
  insert('tax_registration_number', '');
  insert('state_code', '');
  insert('tax_scheme', 'regular');
  insert('taxes_enabled', 'false');
  insert('billing_type', 'postpaid');
  insert('tables_required', 'true');
  insert('service_model', 'finedine');
  insert('setup_profile', '');
  insert('cloud_server_url', DEFAULT_CLOUD_SERVER_URL);
  insert('cloud_connected', 'false');
  insert('cloud_sync_enabled', '1');
  insert('cloud_orders_enabled', '0');
  insert('cloud_reports_enabled', '1');
  insert('cloud_command_polling_enabled', '1');
  insert('cloud_registration_status', 'unregistered');
  insert(
    'telemetry_scope',
    'usage_stats,country,app_version,platform,session_duration,feature_usage,error_diagnostics',
  );
  // M2: telemetry_enabled and diagnostics_consent are NOT seeded — NOT_DECIDED
  // until the owner explicitly opts in during setup or Settings → Privacy.
  insert('kds_enabled', 'true');
  insert('server_app_enabled', 'true');
  insert('kot_printing_enabled', 'true');
  insert('printer_trim_decimals', 'false');
  insert('bill_template', 'classic');
  insert('bill_footer_message', '');
  insert('bill_show_name', 'true');
  insert('bill_show_address', 'true');
  insert('bill_show_phone', 'true');
  insert('bill_show_tax_id', 'false');
  insert('bill_show_tax_breakdown', 'true');
  insert('bill_show_customer_name', 'true');
  insert('bill_show_customer_phone', 'true');
  insert('bill_show_table_number', 'true');
  insert('order_number_prefix', 'ORD');
  insert('order_number_include_date', 'true');
  insert('order_number_reset_daily', 'true');

  seedCloudSyncDefaults();

  console.log('[DB] Install defaults loaded; first-run setup pending');
}

const SHORT_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateShortId(table: string, length = 6): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let id = '';
    for (let i = 0; i < length; i++)
      id += SHORT_ID_CHARS[Math.floor(Math.random() * SHORT_ID_CHARS.length)];
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) return id;
  }
  throw new Error(`generateShortId: could not find unique id for ${table} after 20 attempts`);
}

/** Atomically get the next sequence value for a given name and date. */
function getNextSequence(name: string, date: string): number {
  return db.transaction(() => {
    // Try to update existing row
    const updated = db
      .prepare(
        `
      UPDATE sequences SET current_value = current_value + 1
      WHERE name = ? AND date = ?
    `,
      )
      .run(name, date);

    if (updated.changes === 0) {
      // Row doesn't exist for today, insert it
      try {
        db.prepare(
          `
          INSERT INTO sequences (name, date, current_value) VALUES (?, ?, 1)
        `,
        ).run(name, date);
        return 1;
      } catch {
        // Another concurrent insert won the race, try update again
        const retry = db
          .prepare(
            `
          UPDATE sequences SET current_value = current_value + 1
          WHERE name = ? AND date = ?
        `,
          )
          .run(name, date);
        if (retry.changes === 0) {
          throw new Error(`Failed to generate sequence for ${name}`);
        }
      }
    }

    const row = db
      .prepare('SELECT current_value FROM sequences WHERE name = ? AND date = ?')
      .get(name, date) as any;
    return row?.current_value ?? 0;
  })();
}

/** YYYYMMDD for "now" in the given IANA timezone (falls back to UTC if the zone is invalid). */
export function dateStampInTimezone(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}${get('month')}${get('day')}`;
  } catch {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}

export function generateOrderNumber(): string {
  const prefix = getSettingValue('order_number_prefix') ?? 'ORD';
  const includeDate = getSettingValue('order_number_include_date') !== 'false';
  const resetDaily = getSettingValue('order_number_reset_daily') !== 'false';
  const timezone = getSettingValue('timezone') || 'Asia/Kolkata';

  // The sequence "bucket": a per-day counter when the series resets at store
  // midnight, or a single fixed bucket when the series is meant to keep
  // climbing indefinitely.
  const bucket = resetDaily ? dateStampInTimezone(timezone) : 'ALL';
  const next = getNextSequence('orders', bucket);

  const dateSegment = includeDate ? dateStampInTimezone(timezone) : '';
  return [prefix, dateSegment, String(next).padStart(4, '0')].filter(Boolean).join('-');
}

export function generateBillNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const next = getNextSequence('bills', date);
  return `INV-${date}-${String(next).padStart(4, '0')}`;
}

export function verifyPin(
  storedHash: string | null | undefined,
  inputPin: string | number,
): boolean {
  if (!storedHash || !inputPin) return false;
  return bcrypt.compareSync(String(inputPin), storedHash);
}

// Issue #150: a voided in-progress item stays on the KDS board, struck
// through, for this long after voiding — long enough for kitchen staff to
// notice it's been pulled — then drops off like a served item would.
export const KDS_VOIDED_ITEM_VISIBILITY_MS = 15 * 60 * 1000;

/**
 * Whether a voided order item should still appear on a KDS surface. Only
 * ever called for status='voided' rows; every other status is a normal
 * KDS-visibility decision the caller already makes. The synthetic negative
 * `void_adjustment` bill line this same void flow inserts (main/routes/index.ts)
 * is never a kitchen item and callers should exclude it before this check
 * even runs, not route it through here.
 */
export function isVoidedItemKdsVisible(voidedAt: string | null | undefined): boolean {
  if (!voidedAt) return true;
  return Date.now() - parseDbTimestamp(voidedAt).getTime() < KDS_VOIDED_ITEM_VISIBILITY_MS;
}

/** Remove customer/payment/order-financial fields from category-scoped KDS payloads. */
export function projectKdsOrder(order: any, restricted: boolean): any {
  if (!restricted) return order;
  const allowedFields = [
    'id',
    'order_number',
    'type',
    'guest_count',
    'special_instructions',
    'status',
    'kitchen_priority',
    'kitchen_station_id',
    'station_name',
    'created_at',
    'updated_at',
    'table_name',
    'table_number',
    'floor',
    'section',
  ];
  return Object.fromEntries(
    allowedFields.filter((field) => field in order).map((field) => [field, order[field]]),
  );
}

/** Keep category-scoped KDS lines limited to kitchen-operational fields. */
export function projectKdsItem(item: any, restricted: boolean): any {
  if (!restricted) return item;
  const allowedFields = [
    'id',
    'order_id',
    'product_id',
    'product_name',
    'product_sku',
    'quantity',
    'status',
    'special_instructions',
    'preparing_started_at',
    'ready_at',
    'served_at',
    'created_at',
    'updated_at',
    'order_number',
    'type',
    'table_name',
    'order_status',
    'order_notes',
    'order_time',
  ];
  const projected = Object.fromEntries(
    allowedFields.filter((field) => field in item).map((field) => [field, item[field]]),
  );
  if (Array.isArray(item.addons)) {
    projected.addons = item.addons.map((addon: any) => {
      const safeAddon: Record<string, unknown> = {};
      for (const field of ['id', 'name', 'quantity']) {
        if (field in addon) safeAddon[field] = addon[field];
      }
      return safeAddon;
    });
  }
  return projected;
}

/** Avoid exposing printer/network credentials in restricted KDS station metadata. */
export function projectKdsStation(
  station: any,
  restricted: boolean,
  userCategoryIds: string[] = [],
): any {
  if (!restricted) return station;
  const allowedFields = ['id', 'name', 'description', 'category_ids', 'sort_order', 'is_active'];
  const projected = Object.fromEntries(
    allowedFields.filter((field) => field in station).map((field) => [field, station[field]]),
  );
  if (typeof projected.category_ids === 'string' && userCategoryIds.length > 0) {
    try {
      const parsed = JSON.parse(projected.category_ids);
      if (Array.isArray(parsed))
        projected.category_ids = JSON.stringify(
          parsed.filter((id) => userCategoryIds.includes(String(id))),
        );
    } catch {
      projected.category_ids = '[]';
    }
  }
  return projected;
}

// R4.1 re-exports (extracted modules; public API unchanged)
export {
  now,
  parseDbTimestamp,
  utcTodayDate,
  utcDayBounds,
  businessDateInTimezone,
  localDayBoundsUtc,
} from './database/time';
export {
  insertOrderItemAddons,
  parseItemJson,
  attachEffectiveAddons,
  parseRowJson,
} from './database/order-row';

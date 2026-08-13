/**
 * Durable installation marker outside SQLite (REC-01).
 * Distinguishes FIRST_INSTALL from an existing café with a missing/empty DB.
 * Contains no secrets — only minimal state metadata.
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export const INSTALL_STATE_FILE = 'install-state.json';
export const INSTALL_STATE_VERSION = 1;

export type InstallLifecycleState = 'FIRST_INSTALL' | 'ACTIVE' | 'RECOVERY_REQUIRED';

export type RecoveryReason = 'missing_database' | 'empty_database' | 'corrupt_database';

export type InstallStateSnapshot = {
  state: InstallLifecycleState;
  reason: RecoveryReason | null;
  markerPresent: boolean;
};

type MarkerPayload = {
  version: number;
  initializedAt: string;
};

let recoveryOverride: { active: boolean; reason: RecoveryReason | null } = {
  active: false,
  reason: null,
};

export function getInstallStateFilePath(): string {
  return path.join(app.getPath('userData'), INSTALL_STATE_FILE);
}

export function isInstallationInitialized(): boolean {
  return fs.existsSync(getInstallStateFilePath());
}

export function readInstallationMarker(): MarkerPayload | null {
  try {
    const raw = fs.readFileSync(getInstallStateFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as MarkerPayload;
    if (!parsed || typeof parsed.version !== 'number' || typeof parsed.initializedAt !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function markInstallationInitialized(at: Date = new Date()): void {
  const payload: MarkerPayload = {
    version: INSTALL_STATE_VERSION,
    initializedAt: at.toISOString(),
  };
  const target = getInstallStateFilePath();
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, target);
  clearRecoveryRequired();
}

export function clearInstallationMarker(): void {
  try {
    if (fs.existsSync(getInstallStateFilePath())) {
      fs.unlinkSync(getInstallStateFilePath());
    }
  } catch {
    /* ignore */
  }
  clearRecoveryRequired();
}

/** Enter RECOVERY_REQUIRED until restore succeeds or factory reset clears the marker. */
export function setRecoveryRequired(reason: RecoveryReason): void {
  recoveryOverride = { active: true, reason };
}

export function clearRecoveryRequired(): void {
  recoveryOverride = { active: false, reason: null };
}

export function isRecoveryRequired(): boolean {
  return recoveryOverride.active;
}

export function getRecoveryReason(): RecoveryReason | null {
  return recoveryOverride.reason;
}

/**
 * Derive lifecycle state from marker + optional runtime recovery latch.
 * Callers supply whether a live operational DB is present/usable.
 */
export function getInstallState(options?: {
  databasePresent?: boolean;
  operationalUsers?: number | null;
}): InstallStateSnapshot {
  const markerPresent = isInstallationInitialized();
  if (recoveryOverride.active) {
    return {
      state: 'RECOVERY_REQUIRED',
      reason: recoveryOverride.reason,
      markerPresent,
    };
  }
  if (!markerPresent) {
    return { state: 'FIRST_INSTALL', reason: null, markerPresent: false };
  }
  const dbPresent = options?.databasePresent;
  if (dbPresent === false) {
    return { state: 'RECOVERY_REQUIRED', reason: 'missing_database', markerPresent: true };
  }
  if (typeof options?.operationalUsers === 'number' && options.operationalUsers <= 0) {
    return { state: 'RECOVERY_REQUIRED', reason: 'empty_database', markerPresent: true };
  }
  return { state: 'ACTIVE', reason: null, markerPresent: true };
}

/** Test helper — reset in-memory recovery latch (marker file untouched). */
export function resetInstallStateCacheForTests(): void {
  clearRecoveryRequired();
}

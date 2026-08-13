/**
 * Privileged updater install gate for `restart-and-install` IPC.
 * Authorization: owner/manager JWT only (no Master PIN).
 */
import { logAuditEvent, type AuditLogInput } from '../services/audit-log';
import { authorizeOwnerManagerJwt } from './ipc-auth';

export type RestartAndInstallDeps = {
  updateDownloaded: boolean;
  fromVersion?: string | null;
  toVersion?: string | null;
  quitAndInstall: () => void;
  markQuitting?: () => void;
  /** Injectable for tests; defaults to logAuditEvent. */
  audit?: (input: AuditLogInput) => number;
};

export type RestartAndInstallResult = {
  success: boolean;
  error?: string;
};

function writeAudit(
  audit: ((input: AuditLogInput) => number) | undefined,
  input: AuditLogInput,
): void {
  const writer = audit ?? logAuditEvent;
  try {
    writer(input);
  } catch (err) {
    // Never block install/reject path on audit failure.
    console.error('[Update] Failed to write restart audit event:', err);
  }
}

/**
 * Authorize + optionally install a previously downloaded update.
 * Does not change electron-updater feed/signing/download configuration.
 */
export function handleRestartAndInstall(
  token: string | undefined | null,
  deps: RestartAndInstallDeps,
): RestartAndInstallResult {
  const auth = authorizeOwnerManagerJwt(token);
  if (!auth.ok) {
    writeAudit(deps.audit, {
      actorUserId: null,
      action: 'updater.restart_and_install',
      entityType: 'app',
      entityId: deps.toVersion || 'app',
      result: 'failure',
      reason: auth.code,
      metadata: {
        updateDownloaded: deps.updateDownloaded,
        fromVersion: deps.fromVersion ?? null,
        toVersion: deps.toVersion ?? null,
      },
    });
    return { success: false, error: auth.error };
  }

  if (!deps.updateDownloaded) {
    writeAudit(deps.audit, {
      actorUserId: auth.userId,
      action: 'updater.restart_and_install',
      entityType: 'app',
      entityId: deps.toVersion || 'app',
      result: 'failure',
      reason: 'update_not_ready',
      metadata: {
        role: auth.role,
        updateDownloaded: false,
        fromVersion: deps.fromVersion ?? null,
        toVersion: deps.toVersion ?? null,
      },
    });
    return { success: false, error: 'Update not ready' };
  }

  writeAudit(deps.audit, {
    actorUserId: auth.userId,
    action: 'updater.restart_and_install',
    entityType: 'app',
    entityId: deps.toVersion || 'app',
    result: 'success',
    metadata: {
      role: auth.role,
      updateDownloaded: true,
      fromVersion: deps.fromVersion ?? null,
      toVersion: deps.toVersion ?? null,
    },
  });

  deps.markQuitting?.();
  deps.quitAndInstall();
  return { success: true };
}

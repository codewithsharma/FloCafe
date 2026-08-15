/**
 * Electron IPC — desktop-native bridge only (P0.6 Phase B1 Hybrid D).
 * Business ops (DB tools, settings, printers, reports) use authenticated HTTP.
 */

import { ipcMain, dialog, app } from 'electron';
import * as path from 'path';
import {
  createBackup,
  restoreBackup,
  getCurrentSchemaVersion,
  getSupportedSchemaVersion,
  getSchemaVersionFromBackup,
  withDatabaseMaintenanceLock,
  getBackupDir,
  getDbPath,
  isDatabaseOpen,
} from './db';
import { clearInMemoryRevokedTokens, clearUserAuthCache } from './middleware/security';
import { clearJWTSecretCache } from './routes/auth';
import { authorizeMasterPin, isMasterPinAvailable, isMasterPinSet } from './services/master-pin';
import { logAuditEvent } from './services/audit-log';
import { resolveManagedBackupPath, validateExternalRestorePath } from './security/restore-path';
import {
  isRecoveryRequired,
  markInstallationInitialized,
  clearRecoveryRequired,
} from './services/install-state';

function auditRestore(
  result: {
    success: boolean;
    mode?: string;
    backupVersion?: number | null;
    tablesRestored?: number;
    error?: string;
  },
  backupPath: string,
): void {
  try {
    logAuditEvent({
      actorUserId: null,
      action: result.success ? 'restore.completed' : 'restore.failed',
      entityType: 'database',
      entityId: path.basename(backupPath),
      result: result.success ? 'success' : 'failure',
      reason: result.error || null,
      metadata: {
        mode: result.mode || null,
        backup_schema_version: result.backupVersion ?? null,
        tables_restored: result.tablesRestored ?? null,
      },
    });
  } catch (error) {
    console.warn('[IPC] restore audit failed:', error);
  }
}

async function performRestore(backupPath: string): Promise<{
  success: boolean;
  mode?: string;
  backupVersion?: number | null;
  currentVersion?: number;
  tablesRestored?: number;
  message?: string;
  error?: string;
  relaunch?: boolean;
}> {
  const backupVersion = getSchemaVersionFromBackup(backupPath);

  if (backupVersion === null) {
    return {
      success: false,
      error:
        'Invalid backup file: missing schema version metadata. This backup may have been created with an older version of FloDesktop.',
    };
  }

  const currentVersion = isDatabaseOpen() ? getCurrentSchemaVersion() : getSupportedSchemaVersion();
  const versionMismatch = backupVersion !== currentVersion;
  const wasRecovery = isRecoveryRequired() || !isDatabaseOpen();

  if (versionMismatch) {
    const confirmResult = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Restore Anyway', 'Cancel'],
      defaultId: 1,
      title: 'Schema Version Mismatch',
      message: `Backup was created with Schema v${backupVersion}`,
      detail: `Current database uses Schema v${currentVersion}.\n\nRestoring will import data only (common fields) to preserve new database structure.\n\nDo you want to continue?`,
    });

    if (confirmResult.response !== 0) {
      return { success: false, error: 'Cancelled' };
    }

    if (!isDatabaseOpen()) {
      return {
        success: false,
        error:
          'Cannot perform data-only restore while the operational database is missing. Use a same-schema backup, or reinstall matching app version.',
      };
    }

    const restoreResult = await withDatabaseMaintenanceLock(() => restoreBackup(backupPath, false));
    clearUserAuthCache();
    clearInMemoryRevokedTokens();
    clearJWTSecretCache();
    if (restoreResult.success) {
      markInstallationInitialized();
      clearRecoveryRequired();
    }
    const payload = {
      success: restoreResult.success,
      mode: restoreResult.mode,
      backupVersion,
      currentVersion: isDatabaseOpen() ? getCurrentSchemaVersion() : currentVersion,
      tablesRestored: restoreResult.tablesRestored,
      message: restoreResult.success
        ? `Restored ${restoreResult.tablesRestored} tables (data-only mode due to version mismatch)`
        : `Restore failed: ${restoreResult.error}`,
      error: restoreResult.error,
      relaunch: restoreResult.success && wasRecovery,
    };
    auditRestore(payload, backupPath);
    return payload;
  }

  const restoreResult = await withDatabaseMaintenanceLock(() => restoreBackup(backupPath, true));
  clearUserAuthCache();
  clearInMemoryRevokedTokens();
  clearJWTSecretCache();
  if (restoreResult.success) {
    markInstallationInitialized();
    clearRecoveryRequired();
  }
  const payload = {
    success: restoreResult.success,
    mode: restoreResult.mode,
    backupVersion,
    currentVersion: isDatabaseOpen() ? getCurrentSchemaVersion() : currentVersion,
    tablesRestored: restoreResult.tablesRestored,
    message: restoreResult.success
      ? 'Database restored successfully'
      : `Restore failed: ${restoreResult.error}`,
    error: restoreResult.error,
    relaunch: restoreResult.success && wasRecovery,
  };
  auditRestore(payload, backupPath);
  return payload;
}

export function registerIpcHandlers(): void {
  ipcMain.handle('backup-database', async (_event, pin?: string) => {
    const auth = authorizeMasterPin(pin, 'ipc:backup');
    if (!auth.ok) return { success: false, error: auth.error };

    try {
      console.log('[IPC] backup-database: Starting...');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const result = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `flo-backup-${timestamp}.db`),
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const { path: backupPath, schemaVersion } = await createBackup(result.filePath);

      console.log('[IPC] backup-database: Complete:', backupPath);
      return {
        success: true,
        path: backupPath,
        schemaVersion,
        message: `Backup saved (Schema v${schemaVersion})`,
      };
    } catch (error: any) {
      console.error('[IPC] backup-database: Error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Restore: Master PIN required.
   * - fileName: managed backup under userData/backups (basename only)
   * - omitted: OS open dialog; path validated by main (never trust renderer absolutes)
   */
  ipcMain.handle('restore-backup', async (_event, pin?: string, fileName?: string) => {
    const auth = authorizeMasterPin(pin, 'ipc:restore');
    if (!auth.ok) return { success: false, error: auth.error };

    try {
      let backupPath: string;

      if (typeof fileName === 'string' && fileName.length > 0) {
        backupPath = resolveManagedBackupPath(getBackupDir(), fileName);
      } else {
        const result = await dialog.showOpenDialog({
          filters: [{ name: 'SQLite Database', extensions: ['db'] }],
          properties: ['openFile'],
        });

        if (result.canceled || !result.filePaths.length) {
          return { success: false, error: 'Cancelled' };
        }
        backupPath = validateExternalRestorePath(result.filePaths[0], getDbPath());
      }

      const restoreOutcome = await performRestore(backupPath);
      if (restoreOutcome.success && restoreOutcome.relaunch) {
        setImmediate(() => {
          app.relaunch();
          app.exit(0);
        });
      }
      return restoreOutcome;
    } catch (error: any) {
      console.error('[IPC] restore-backup: Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('master-pin-status', async () => ({
    available: isMasterPinAvailable(),
    isSet: isMasterPinSet(),
  }));

  ipcMain.handle('get-app-info', async () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
  }));
}

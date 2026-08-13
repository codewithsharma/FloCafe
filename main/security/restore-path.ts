/**
 * P0.6 Phase B1 — restore source path hardening.
 *
 * Managed restores: basename under userData/backups only (same naming as createBackup).
 * External restores: OS file-picker path validated as a regular .db file (no symlink/dir).
 * Renderer must never supply arbitrary absolute filesystem paths.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Matches createBackup() / deleteBackup() naming. */
export const MANAGED_BACKUP_FILENAME_RE = /^flo-backup-[\w.-]+\.db$/;

function assertNoPathSeparators(fileName: string): void {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    throw new Error('Invalid backup file name');
  }
  if (fileName === '.' || fileName === '..' || fileName.includes('..')) {
    throw new Error('Invalid backup file name');
  }
}

/**
 * Resolve a managed backup fileName strictly inside backupDir.
 * Rejects traversal, absolute paths, and non-matching names.
 */
export function resolveManagedBackupPath(backupDir: string, fileName: string): string {
  if (typeof fileName !== 'string' || !fileName) {
    throw new Error('Invalid backup file name');
  }
  assertNoPathSeparators(fileName);
  if (!MANAGED_BACKUP_FILENAME_RE.test(fileName)) {
    throw new Error('Invalid backup file name');
  }

  const resolvedDir = path.resolve(backupDir);
  const fullPath = path.resolve(resolvedDir, fileName);
  if (path.dirname(fullPath) !== resolvedDir) {
    throw new Error('Invalid backup file name');
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error('Backup not found');
  }

  const st = fs.lstatSync(fullPath);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error('Backup must be a regular file');
  }
  return fullPath;
}

/**
 * Validate a path selected by the main-process OS file picker (never trust raw renderer paths).
 */
export function validateExternalRestorePath(candidatePath: string, liveDbPath: string): string {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
    throw new Error('Backup path is required');
  }

  const resolved = path.resolve(candidatePath);
  if (!fs.existsSync(resolved)) {
    throw new Error('Backup file no longer exists');
  }

  const st = fs.lstatSync(resolved);
  if (st.isSymbolicLink()) {
    throw new Error('Restore source must not be a symbolic link');
  }
  if (st.isDirectory() || !st.isFile()) {
    throw new Error('Restore source must be a regular file');
  }
  if (path.extname(resolved).toLowerCase() !== '.db') {
    throw new Error('Unsupported backup file type (expected .db)');
  }

  const liveResolved = path.resolve(liveDbPath);
  if (resolved === liveResolved) {
    throw new Error('Restore source cannot be the live database');
  }
  // Case-insensitive compare on Windows/macOS
  if (process.platform === 'win32' || process.platform === 'darwin') {
    if (resolved.toLowerCase() === liveResolved.toLowerCase()) {
      throw new Error('Restore source cannot be the live database');
    }
  }

  return resolved;
}

'use client';

import { useState } from 'react';
import { MasterPinPrompt } from '@/components/settings/MasterPinPrompt';

/**
 * REC-01 recovery screen — not first-run setup.
 * Restore reuses Electron IPC Master PIN restore (no second restore path).
 */
export default function RecoveryPage() {
  const [pinOpen, setPinOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRestore = async (pin: string) => {
    setBusy(true);
    setMessage(null);
    try {
      if (!window.electronAPI?.restoreBackup) {
        return { success: false, error: 'Restore is only available in the desktop app.' };
      }
      const result = await window.electronAPI.restoreBackup(pin);
      if (result.success) {
        setMessage('Backup restored. Restarting…');
        setPinOpen(false);
        return { success: true };
      }
      return { success: false, error: result.error || 'Restore failed' };
    } catch (err: unknown) {
      return { success: false, error: (err as Error)?.message || 'Restore failed' };
    } finally {
      setBusy(false);
    }
  };

  const handleExit = async () => {
    try {
      await window.electronAPI?.recoveryQuit?.();
    } catch {
      window.close();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-flo-bg px-6">
      <div className="w-full max-w-lg space-y-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-flo-text">
          DATABASE RECOVERY REQUIRED
        </h1>
        <p className="text-sm leading-relaxed text-flo-text-secondary">
          This installation already contains café data, but the operational database is missing or
          unusable. Your business data has <strong>not</strong> been initialized as a new database.
        </p>
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          STOP. Do not complete first-time setup. Do not take payments. Restore the correct backup.
        </p>
        {message ? <p className="text-sm text-flo-brand-700">{message}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPinOpen(true)}
            className="rounded-md bg-flo-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-flo-brand-700 disabled:opacity-60"
          >
            Restore Backup
          </button>
          <a
            href="https://flopos.com/support"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-flo-border px-4 py-2.5 text-sm font-medium text-flo-text hover:bg-flo-surface"
          >
            Recovery / Support
          </a>
          <button
            type="button"
            onClick={handleExit}
            className="rounded-md border border-flo-border px-4 py-2.5 text-sm font-medium text-flo-text hover:bg-flo-surface"
          >
            Exit
          </button>
        </div>
      </div>

      <MasterPinPrompt
        open={pinOpen}
        mode="verify"
        title="Confirm restore"
        description="Enter the Master PIN to restore a backup. Choose a .db file from this café."
        onCancel={() => setPinOpen(false)}
        onSubmit={handleRestore}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import type { Table } from '@/lib/types';

export interface TransferTableDialogProps {
  open: boolean;
  sourceTable: Table | null;
  tables: Table[];
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
}

export function TransferTableDialog({
  open,
  sourceTable,
  tables,
  onDone,
  onOpenChange,
}: TransferTableDialogProps) {
  const { t } = useI18n();
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const targets = tables.filter(
    (tbl) => tbl.id !== sourceTable?.id && tbl.is_active && tbl.status === 'available',
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) setTargetId('');
    onOpenChange(next);
  };

  const handleTransfer = async () => {
    if (!sourceTable || !targetId) return;
    setSaving(true);
    try {
      await api.post(`/tables/${sourceTable.id}/move-order`, {
        target_table_id: targetId,
      });
      toast.success(t('tables.transferSuccess'));
      setTargetId('');
      onDone();
      onOpenChange(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(
        e.response?.data?.error || e.response?.data?.message || t('tables.transferFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!sourceTable) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('tables.transfer')} · {sourceTable.name}
          </DialogTitle>
        </DialogHeader>

        <div>
          <label className="block text-small font-medium text-flo-text mb-1">
            {t('tables.selectTarget')}
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full px-3 py-2 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 min-h-11 bg-flo-surface text-flo-text"
          >
            <option value="">{t('tables.selectTarget')}</option>
            {targets.map((tbl) => (
              <option key={tbl.id} value={tbl.id}>
                {tbl.name}
                {tbl.section ? ` · ${tbl.section}` : ''}
              </option>
            ))}
          </select>
          {targets.length === 0 && (
            <p className="mt-2 text-caption text-flo-text-muted">
              {t('tables.noAvailableTargets')}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="flex-1 min-h-11"
          >
            {t('tables.cancel')}
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={saving || !targetId}
            className="flex-1 min-h-11"
          >
            {saving ? t('tables.transferring') : t('tables.transfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

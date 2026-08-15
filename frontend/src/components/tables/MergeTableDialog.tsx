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

export interface MergeTableDialogProps {
  open: boolean;
  survivingTable: Table | null;
  tables: Table[];
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
}

export function MergeTableDialog({
  open,
  survivingTable,
  tables,
  onDone,
  onOpenChange,
}: MergeTableDialogProps) {
  const { t } = useI18n();
  const [sourceId, setSourceId] = useState('');
  const [saving, setSaving] = useState(false);

  const sources = tables.filter(
    (tbl) => tbl.id !== survivingTable?.id && tbl.is_active && tbl.status === 'occupied',
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) setSourceId('');
    onOpenChange(next);
  };

  const handleMerge = async () => {
    if (!survivingTable || !sourceId) return;
    setSaving(true);
    try {
      await api.post(`/tables/${survivingTable.id}/merge`, {
        source_table_id: sourceId,
      });
      toast.success(t('tables.mergeSuccess'));
      setSourceId('');
      onDone();
      onOpenChange(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(e.response?.data?.error || e.response?.data?.message || t('tables.mergeFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!survivingTable) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('tables.merge')} · {survivingTable.name}
          </DialogTitle>
        </DialogHeader>

        <div>
          <label className="block text-small font-medium text-flo-text mb-1">
            {t('tables.selectSource')}
          </label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full px-3 py-2 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 min-h-11 bg-flo-surface text-flo-text"
          >
            <option value="">{t('tables.selectSource')}</option>
            {sources.map((tbl) => (
              <option key={tbl.id} value={tbl.id}>
                {tbl.name}
                {tbl.section ? ` · ${tbl.section}` : ''}
              </option>
            ))}
          </select>
          {sources.length === 0 && (
            <p className="mt-2 text-caption text-flo-text-muted">{t('tables.noOccupiedSources')}</p>
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
          <Button onClick={handleMerge} disabled={saving || !sourceId} className="flex-1 min-h-11">
            {saving ? t('tables.merging') : t('tables.merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

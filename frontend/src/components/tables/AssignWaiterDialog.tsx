'use client';

import { useEffect, useState } from 'react';
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
import type { Staff, Table } from '@/lib/types';

const ASSIGNABLE_ROLES = new Set(['waiter', 'cashier', 'manager', 'owner']);

export interface AssignWaiterDialogProps {
  open: boolean;
  table: Table | null;
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
}

export function AssignWaiterDialog({ open, table, onDone, onOpenChange }: AssignWaiterDialogProps) {
  const { t } = useI18n();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [waiterId, setWaiterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncedOpen, setSyncedOpen] = useState(open);

  if (open !== syncedOpen) {
    setSyncedOpen(open);
    setWaiterId(open ? (table?.assigned_waiter_id ?? '') : '');
    setLoading(open);
    if (!open) setStaff([]);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get('/staff')
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data.staff || []) as Staff[];
        setStaff(list.filter((s) => s.is_active && ASSIGNABLE_ROLES.has(s.role)));
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t('tables.staffLoadFailed'));
        setStaff([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const handleSave = async () => {
    if (!table) return;
    setSaving(true);
    try {
      await api.post(`/tables/${table.id}/assign-waiter`, {
        waiter_user_id: waiterId || null,
      });
      toast.success(waiterId ? t('tables.assignWaiterSuccess') : t('tables.clearWaiterSuccess'));
      onDone();
      onOpenChange(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(
        e.response?.data?.error || e.response?.data?.message || t('tables.assignWaiterFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!table) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('tables.assignWaiter')} · {table.name}
          </DialogTitle>
        </DialogHeader>

        <div>
          <label className="block text-small font-medium text-flo-text mb-1">
            {t('tables.selectWaiter')}
          </label>
          <select
            value={waiterId}
            onChange={(e) => setWaiterId(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 min-h-11 bg-flo-surface text-flo-text disabled:opacity-60"
          >
            <option value="">{t('tables.unassigned')}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="flex-1 min-h-11"
          >
            {t('tables.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="flex-1 min-h-11">
            {saving ? t('tables.saving') : t('tables.assignWaiter')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

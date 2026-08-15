'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import type { Table } from '@/lib/types';
import { Button } from '@/components/ui/button';

export interface TableQrDialogProps {
  table: Table | null;
  onClose: () => void;
}

export function TableQrDialog({ table, onClose }: TableQrDialogProps) {
  const { t } = useI18n();
  const [guestPath, setGuestPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!table) return;
    let cancelled = false;
    setLoading(true);
    api
      .get(`/tables/${table.id}/qr`)
      .then((res) => {
        if (!cancelled) setGuestPath(res.data.guest_path || null);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('tables.qrLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [table, t]);

  if (!table) return null;

  const fullUrl =
    typeof window !== 'undefined' && guestPath
      ? `${window.location.origin}${guestPath}`
      : guestPath || '';

  const rotate = async () => {
    try {
      const res = await api.post(`/tables/${table.id}/qr-token/rotate`);
      setGuestPath(res.data.guest_path || null);
      toast.success(t('tables.qrRotated'));
    } catch {
      toast.error(t('tables.qrRotateFailed'));
    }
  };

  const copy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success(t('tables.qrCopied'));
    } catch {
      toast.error(t('tables.qrCopyFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-flo-lg bg-flo-surface border border-flo-border p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t('tables.qrTitle', { name: table.name })}</h2>
        <p className="text-small text-flo-text-secondary">{t('tables.qrPayAtCounter')}</p>
        {loading ? (
          <p className="text-small text-flo-text-muted">{t('common.loading')}</p>
        ) : (
          <code className="block text-caption break-all bg-flo-bg p-2 rounded-flo-md">
            {fullUrl}
          </code>
        )}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="min-h-11">
            {t('tables.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void rotate()}
            className="min-h-11"
          >
            {t('tables.qrRotate')}
          </Button>
          <Button
            type="button"
            onClick={() => void copy()}
            className="min-h-11"
            disabled={!fullUrl}
          >
            {t('tables.qrCopy')}
          </Button>
        </div>
      </div>
    </div>
  );
}

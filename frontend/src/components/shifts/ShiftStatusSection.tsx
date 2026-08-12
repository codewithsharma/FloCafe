'use client';

import { useEffect, useState } from 'react';
import { Clock, CircleDot, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import type { UseShiftResult } from '@/hooks/useShift';
import OpenShiftModal from '@/components/shifts/OpenShiftModal';
import CloseShiftModal from '@/components/shifts/CloseShiftModal';
import ForceCloseShiftModal from '@/components/shifts/ForceCloseShiftModal';
import {
  DEFAULT_SHIFT_STALE_HOURS,
  fetchShiftStaleHours,
  isShiftStale,
} from '@/lib/shifts';

type ShiftStatusSectionProps = UseShiftResult & {
  canForceClose?: boolean;
};

/**
 * M4-E2 — compact shift indicator for the dashboard StatusBar.
 * M4-E3 — stale-shift banner and manager force-close.
 * Shift state is supplied by the parent (single useShift() instance).
 */
export default function ShiftStatusSection({
  enabled,
  shift,
  loading,
  error,
  refresh,
  canForceClose = false,
}: ShiftStatusSectionProps) {
  const { t } = useI18n();
  const { formatTime } = useFormatDate();
  const formatCurrency = useFormatCurrency();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [forceCloseModal, setForceCloseModal] = useState(false);
  const [staleHours, setStaleHours] = useState(DEFAULT_SHIFT_STALE_HOURS);

  useEffect(() => {
    if (!enabled || !shift) return;
    let cancelled = false;
    void fetchShiftStaleHours().then((hours) => {
      if (!cancelled) setStaleHours(hours);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, shift]);

  if (!enabled) return null;
  if (loading && !shift && !error) {
    return (
      <div className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-muted-foreground ring-1 ring-inset ring-border/70">
        <CircleDot size={13} className="animate-pulse" />
        <span>{t('shift.loading')}</span>
      </div>
    );
  }

  const hasActiveShift = Boolean(shift);
  const shiftIsStale = hasActiveShift && shift ? isShiftStale(shift.opened_at, staleHours) : false;
  const pillClass = hasActiveShift
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800'
    : 'bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800';

  return (
    <>
      {shiftIsStale && (
        <div className="inline-flex h-6 max-w-[14rem] items-center gap-1.5 rounded-full bg-amber-100 px-2.5 text-[10px] font-medium text-amber-900 ring-1 ring-inset ring-amber-300/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-700 sm:max-w-none">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{t('shift.staleWarning', { hours: staleHours })}</span>
          {canForceClose && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-5 shrink-0 px-1.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-200/80 dark:text-amber-100 dark:hover:bg-amber-900/60"
              onClick={() => setForceCloseModal(true)}
            >
              {t('shift.forceCloseAction')}
            </Button>
          )}
        </div>
      )}

      <div className={`inline-flex h-6 items-center gap-2 rounded-full px-2.5 font-medium ring-1 ring-inset ${pillClass}`}>
        <CircleDot size={13} />
        <span>
          {hasActiveShift ? t('shift.statusOpen') : t('shift.statusNotOpen')}
        </span>
        {hasActiveShift && shift && (
          <span className="hidden items-center gap-1 text-[10px] font-normal opacity-90 sm:inline-flex" title={shift.terminal_id}>
            <Clock size={11} />
            {formatTime(shift.opened_at)}
            <span aria-hidden="true">·</span>
            {formatCurrency(shift.opening_float_cents / 100)}
          </span>
        )}
        {!hasActiveShift && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-2 text-[10px] font-semibold hover:bg-amber-100/80 dark:hover:bg-amber-900/40"
            onClick={() => setOpenModal(true)}
          >
            {t('shift.openAction')}
          </Button>
        )}
        {hasActiveShift && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-2 text-[10px] font-semibold hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40"
            onClick={() => setCloseModal(true)}
          >
            {t('shift.closeAction')}
          </Button>
        )}
      </div>

      {error?.code === 'invalid_terminal' && (
        <span className="hidden text-amber-700 sm:inline" title={error.message}>
          {t('shift.invalidTerminal')}
        </span>
      )}
      {error && error.code !== 'invalid_terminal' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] text-red-600"
          onClick={() => void refresh()}
        >
          {t('shift.retry')}
        </Button>
      )}

      <OpenShiftModal
        open={openModal}
        onOpenChange={setOpenModal}
        onSuccess={refresh}
      />
      <CloseShiftModal
        open={closeModal}
        shift={shift}
        onOpenChange={setCloseModal}
        onSuccess={refresh}
      />
      <ForceCloseShiftModal
        open={forceCloseModal}
        shift={shift}
        onOpenChange={setForceCloseModal}
        onSuccess={refresh}
      />
    </>
  );
}

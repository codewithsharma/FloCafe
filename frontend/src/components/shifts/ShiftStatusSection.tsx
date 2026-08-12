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
      <div className="inline-flex h-6 items-center gap-1.5 rounded-full bg-flo-bg px-2.5 text-flo-text-secondary ring-1 ring-inset ring-flo-border">
        <CircleDot size={13} className="animate-pulse" />
        <span>{t('shift.loading')}</span>
      </div>
    );
  }

  const hasActiveShift = Boolean(shift);
  const shiftIsStale = hasActiveShift && shift ? isShiftStale(shift.opened_at, staleHours) : false;
  const pillClass = hasActiveShift
    ? 'bg-flo-success-subtle text-flo-success ring-flo-success/30'
    : 'bg-flo-warning-subtle text-flo-warning ring-flo-warning/30';

  return (
    <>
      {shiftIsStale && (
        <div className="inline-flex h-6 max-w-[14rem] items-center gap-1.5 rounded-full bg-flo-warning-subtle px-2.5 text-[10px] font-medium text-flo-warning ring-1 ring-inset ring-flo-warning/40 sm:max-w-none">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{t('shift.staleWarning', { hours: staleHours })}</span>
          {canForceClose && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-5 shrink-0 px-1.5 text-[10px] font-semibold text-flo-warning hover:bg-flo-warning/15"
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
            className="h-5 px-2 text-[10px] font-semibold hover:bg-flo-warning/15"
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
            className="h-5 px-2 text-[10px] font-semibold hover:bg-flo-success/15"
            onClick={() => setCloseModal(true)}
          >
            {t('shift.closeAction')}
          </Button>
        )}
      </div>

      {error?.code === 'invalid_terminal' && (
        <span className="hidden text-flo-warning sm:inline" title={error.message}>
          {t('shift.invalidTerminal')}
        </span>
      )}
      {error && error.code !== 'invalid_terminal' && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] text-flo-danger"
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { parseCurrencyInputToCents } from '@/lib/money';
import {
  fetchReconciliationPreview,
  formatVarianceLabel,
  mapShiftMutationError,
  type ReconciliationPreview,
} from '@/lib/shifts';

interface ShiftReconciliationPreviewStripProps {
  shiftId: number | null;
  active: boolean;
  countedCash: string;
  showLiveVariance: boolean;
}

export default function ShiftReconciliationPreviewStrip({
  shiftId,
  active,
  countedCash,
  showLiveVariance,
}: ShiftReconciliationPreviewStripProps) {
  const { t } = useI18n();
  const formatCurrency = useFormatCurrency();
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !shiftId) {
      // Reset when the host modal closes so the next open starts clean.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on deactivate
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchReconciliationPreview(shiftId)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(mapShiftMutationError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, shiftId]);

  const liveVarianceCents = useMemo(() => {
    if (!showLiveVariance || preview == null) return null;
    const parsed = parseCurrencyInputToCents(countedCash);
    if (!parsed.ok) return null;
    return parsed.cents - preview.expected_cash_cents;
  }, [countedCash, preview, showLiveVariance]);

  const varianceLabel = formatVarianceLabel(liveVarianceCents);

  if (!active || !shiftId) return null;

  if (loading) {
    return (
      <p className="text-sm text-flo-text-secondary">{t('shift.previewLoading')}</p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-flo-danger">{error}</p>
    );
  }

  if (!preview) return null;

  return (
    <div className="space-y-2 rounded-flo-md border border-flo-border bg-flo-bg p-3 text-sm">
      <div className="flex justify-between gap-4">
        <span className="text-flo-text-secondary">{t('shift.openingFloat')}</span>
        <span className="font-medium text-flo-text">
          {formatCurrency(preview.opening_float_cents / 100)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-flo-text-secondary">{t('shift.cashPayments')}</span>
        <span className="font-medium text-flo-text">
          {formatCurrency(preview.summary.cash_payment_total_cents / 100)}
        </span>
      </div>
      <div className="flex justify-between gap-4 border-t border-flo-border pt-2">
        <span className="font-medium text-flo-text">{t('shift.expectedCash')}</span>
        <span className="font-semibold text-flo-text">
          {formatCurrency(preview.expected_cash_cents / 100)}
        </span>
      </div>
      {showLiveVariance && liveVarianceCents != null && varianceLabel && (
        <div className="flex justify-between gap-4 border-t border-flo-border pt-2">
          <span className="font-medium text-flo-text">{t('shift.variance')}</span>
          <span className={
            varianceLabel === 'over'
              ? 'font-semibold text-flo-success'
              : varianceLabel === 'short'
                ? 'font-semibold text-flo-danger'
                : 'font-semibold text-flo-text-secondary'
          }>
            {formatCurrency(Math.abs(liveVarianceCents) / 100)}
            {' '}
            {varianceLabel === 'over'
              ? t('shift.varianceOver')
              : varianceLabel === 'short'
                ? t('shift.varianceShort')
                : t('shift.varianceBalanced')}
          </span>
        </div>
      )}
      {!showLiveVariance && (
        <p className="border-t border-flo-border pt-2 text-xs text-flo-text-secondary">
          {t('shift.varianceUnknown')}
        </p>
      )}
    </div>
  );
}

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
      <p className="text-sm text-gray-500">{t('shift.previewLoading')}</p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600">{error}</p>
    );
  }

  if (!preview) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-2">
      <div className="flex justify-between gap-4">
        <span className="text-gray-600">{t('shift.openingFloat')}</span>
        <span className="font-medium text-gray-900">
          {formatCurrency(preview.opening_float_cents / 100)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-600">{t('shift.cashPayments')}</span>
        <span className="font-medium text-gray-900">
          {formatCurrency(preview.summary.cash_payment_total_cents / 100)}
        </span>
      </div>
      <div className="flex justify-between gap-4 border-t border-gray-200 pt-2">
        <span className="text-gray-700 font-medium">{t('shift.expectedCash')}</span>
        <span className="font-semibold text-gray-900">
          {formatCurrency(preview.expected_cash_cents / 100)}
        </span>
      </div>
      {showLiveVariance && liveVarianceCents != null && varianceLabel && (
        <div className="flex justify-between gap-4 border-t border-gray-200 pt-2">
          <span className="text-gray-700 font-medium">{t('shift.variance')}</span>
          <span className={
            varianceLabel === 'over'
              ? 'font-semibold text-emerald-700'
              : varianceLabel === 'short'
                ? 'font-semibold text-red-700'
                : 'font-semibold text-gray-700'
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
        <p className="text-xs text-gray-500 border-t border-gray-200 pt-2">
          {t('shift.varianceUnknown')}
        </p>
      )}
    </div>
  );
}

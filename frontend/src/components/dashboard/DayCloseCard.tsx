'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useAuthStore } from '@/store/auth';
import {
  formatVarianceLabel,
  getDayClose,
  postDayClose,
  type DayCloseSummary,
} from '@/lib/day-close';
import toast from 'react-hot-toast';

interface DayCloseCardProps {
  businessDate: string;
}

function centsToDisplay(cents: number | null, formatCurrency: (n: number) => string): string {
  if (cents === null) return '—';
  return formatCurrency(cents / 100);
}

export default function DayCloseCard({ businessDate }: DayCloseCardProps) {
  const { t } = useI18n();
  const formatCurrency = useFormatCurrency();
  const role = useAuthStore((s) => s.currentTenant?.role);
  const canManage = role === 'owner' || role === 'manager';

  const [summary, setSummary] = useState<DayCloseSummary | null>(null);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canManage || !businessDate) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch loading for selected business date
    setLoading(true);
    void getDayClose(businessDate)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setSummary(result.summary);
          setClosed(true);
        } else {
          setSummary(null);
          setClosed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setClosed(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessDate, canManage]);

  if (!canManage) return null;

  async function handleClose(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await postDayClose(businessDate);
      setSummary(result.summary);
      setClosed(true);
      toast.success(t('dayClose.closeSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('dayClose.closeError'));
    } finally {
      setSubmitting(false);
    }
  }

  const varianceLabel = formatVarianceLabel(summary?.variance_cents_total ?? null);
  const varianceKey =
    varianceLabel === 'over'
      ? 'shift.varianceOver'
      : varianceLabel === 'short'
        ? 'shift.varianceShort'
        : varianceLabel === 'balanced'
          ? 'shift.varianceBalanced'
          : null;

  return (
    <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('dayClose.title')}</h2>
          <p className="text-sm text-gray-500">
            {t('dayClose.businessDate')}: {businessDate}
          </p>
        </div>
        {!closed && !loading && (
          <button
            type="button"
            onClick={() => void handleClose()}
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {submitting ? t('dayClose.closing') : t('dayClose.closeAction')}
          </button>
        )}
        {closed && (
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            {t('dayClose.closedBadge')}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('dayClose.loading')}</p>
      ) : summary ? (
        <div className="space-y-3">
          {summary.open_shifts_warning && (
            <p role="alert" className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {t('dayClose.openShiftsWarning')}
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-gray-500">{t('shift.expectedCash')}</p>
              <p className="text-base font-semibold text-gray-900">
                {centsToDisplay(summary.expected_cash_cents_total, formatCurrency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('shift.countedCash')}</p>
              <p className="text-base font-semibold text-gray-900">
                {centsToDisplay(summary.counted_cash_cents_total, formatCurrency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('shift.variance')}</p>
              <p className="text-base font-semibold text-gray-900">
                {centsToDisplay(summary.variance_cents_total, formatCurrency)}
                {varianceKey ? (
                  <span className="ml-1 text-xs font-medium text-gray-500">({t(varianceKey)})</span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('dayClose.cashCollected')}</p>
              <p className="text-base font-semibold text-gray-900">
                {centsToDisplay(summary.cash_payment_total_cents, formatCurrency)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {t('dayClose.shiftCount')}: {summary.shift_count}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">{t('dayClose.notClosedYet')}</p>
      )}
    </div>
  );
}

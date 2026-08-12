'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { listShifts, formatVarianceLabel, type Shift } from '@/lib/shifts';

const PAGE_SIZE = 25;

export default function ShiftHistoryPanel() {
  const { t } = useI18n();
  const { formatDateTime } = useFormatDate();
  const formatCurrency = useFormatCurrency();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await listShifts({ limit: PAGE_SIZE, offset: nextOffset });
      setDisabled(false);
      setShifts((prev) => (append ? [...prev, ...result.shifts] : result.shifts));
      setOffset(nextOffset + result.shifts.length);
      setHasMore(result.shifts.length === PAGE_SIZE);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 503) {
        setDisabled(true);
        setShifts([]);
        setHasMore(false);
        return;
      }
      setError(t('shift.historyLoadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listShifts({ limit: PAGE_SIZE, offset: 0 });
        if (cancelled) return;
        setDisabled(false);
        setShifts(result.shifts);
        setOffset(result.shifts.length);
        setHasMore(result.shifts.length === PAGE_SIZE);
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 503) {
          setDisabled(true);
          setShifts([]);
          setHasMore(false);
          return;
        }
        setError(t('shift.historyLoadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (disabled) {
    return (
      <div className="max-w-4xl pb-6">
        <div className="rounded-flo-lg border border-flo-border bg-flo-surface p-6 text-sm text-flo-text-secondary">
          {t('shift.historyDisabled')}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4 pb-6">
      <div className="flex items-center gap-2">
        <Clock size={20} className="text-flo-text-secondary" />
        <h2 className="font-semibold text-flo-text">{t('shift.historyTitle')}</h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto min-h-11"
          onClick={() => void loadPage(0, false)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1">{t('shift.historyRefresh')}</span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-flo-danger">{error}</p>
      )}

      <div className="overflow-x-auto rounded-flo-lg border border-flo-border bg-flo-surface">
        <table className="min-w-full text-sm">
          <thead className="border-b border-flo-border bg-flo-bg text-left text-xs uppercase tracking-wide text-flo-text-secondary">
            <tr>
              <th className="px-4 py-3">{t('shift.historyColId')}</th>
              <th className="px-4 py-3">{t('shift.historyColStatus')}</th>
              <th className="px-4 py-3">{t('shift.historyColTerminal')}</th>
              <th className="px-4 py-3">{t('shift.historyColOpened')}</th>
              <th className="px-4 py-3">{t('shift.historyColClosed')}</th>
              <th className="px-4 py-3 text-right">{t('shift.historyColFloat')}</th>
              <th className="px-4 py-3 text-right">{t('shift.historyColExpected')}</th>
              <th className="px-4 py-3 text-right">{t('shift.historyColCounted')}</th>
              <th className="px-4 py-3 text-right">{t('shift.historyColVariance')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && shifts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-flo-text-secondary">
                  {t('shift.loading')}
                </td>
              </tr>
            ) : shifts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-flo-text-secondary">
                  {t('shift.historyEmpty')}
                </td>
              </tr>
            ) : (
              shifts.map((shift) => (
                <tr key={shift.id} className="border-b border-flo-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-flo-text">#{shift.id}</td>
                  <td className="px-4 py-3">
                    <span className={shift.status === 'open'
                      ? 'text-flo-success'
                      : 'text-flo-text-secondary'}>
                      {shift.status === 'open' ? t('shift.statusOpenShort') : t('shift.statusClosedShort')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-flo-text-secondary" title={shift.terminal_id}>
                    {shift.terminal_id.length > 12
                      ? `${shift.terminal_id.slice(0, 8)}…`
                      : shift.terminal_id}
                  </td>
                  <td className="px-4 py-3 text-flo-text">{formatDateTime(shift.opened_at)}</td>
                  <td className="px-4 py-3 text-flo-text">
                    {shift.closed_at ? formatDateTime(shift.closed_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-flo-text">
                    {formatCurrency(shift.opening_float_cents / 100)}
                  </td>
                  <td className="px-4 py-3 text-right text-flo-text">
                    {shift.expected_cash_cents != null
                      ? formatCurrency(shift.expected_cash_cents / 100)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-flo-text">
                    {shift.counted_cash_cents != null
                      ? formatCurrency(shift.counted_cash_cents / 100)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-flo-text">
                    {shift.variance_cents != null ? (() => {
                      const label = formatVarianceLabel(shift.variance_cents);
                      const amount = formatCurrency(Math.abs(shift.variance_cents) / 100);
                      if (label === 'over') return `${amount} ${t('shift.varianceOver')}`;
                      if (label === 'short') return `${amount} ${t('shift.varianceShort')}`;
                      return t('shift.varianceBalanced');
                    })() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={loadingMore}
            onClick={() => void loadPage(offset, true)}
          >
            {loadingMore ? t('common.loading') : t('shift.historyLoadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

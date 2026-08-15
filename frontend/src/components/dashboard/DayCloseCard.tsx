'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store/auth';
import {
  downloadDayCloseZExport,
  getDayClose,
  postDayClose,
  type DayCloseRecord,
  type DayCloseSummary,
} from '@/lib/day-close';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Panel } from '@/components/flo/Panel';
import { StatusBadge } from '@/components/flo/StatusBadge';
import { MoneyDisplay } from '@/components/flo/MoneyDisplay';
import { VarianceIndicator } from '@/components/flo/VarianceIndicator';
import { LoadingState } from '@/components/flo/LoadingState';
import { Button } from '@/components/ui/button';

interface DayCloseCardProps {
  businessDate: string;
  /** Local today (YYYY-MM-DD). Close is only offered for today. */
  todayBusinessDate: string;
}

export default function DayCloseCard({ businessDate, todayBusinessDate }: DayCloseCardProps) {
  const { t } = useI18n();
  const role = useAuthStore((s) => s.currentTenant?.role);
  const canManage = role === 'owner' || role === 'manager';
  const isToday = businessDate === todayBusinessDate;

  const [summary, setSummary] = useState<DayCloseSummary | null>(null);
  const [dayCloseRecord, setDayCloseRecord] = useState<DayCloseRecord | null>(null);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
          setDayCloseRecord(result.day_close);
          setClosed(true);
        } else {
          setSummary(null);
          setDayCloseRecord(null);
          setClosed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setDayCloseRecord(null);
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
    if (!window.confirm(t('dayClose.confirmClose'))) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await postDayClose(businessDate);
      setSummary(result.summary);
      setDayCloseRecord(result.day_close);
      setClosed(true);
      toast.success(t('dayClose.closeSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('dayClose.closeError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadZ(): Promise<void> {
    if (!summary) return;
    setDownloading(true);
    try {
      await downloadDayCloseZExport(businessDate);
      toast.success(t('dayClose.downloadZSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('dayClose.downloadZFailed'));
    } finally {
      setDownloading(false);
    }
  }

  async function handlePrintZ(): Promise<void> {
    if (!summary) return;
    setPrinting(true);
    try {
      await api.post('/printers/print-day-close', { business_date: businessDate });
      toast.success(t('dayClose.printZSuccess'));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('dayClose.printZFailed');
      toast.error(message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Panel
      className="mb-6"
      title={t('dayClose.title')}
      description={`${t('dayClose.businessDate')}: ${businessDate}`}
      actions={
        !closed && !loading && isToday ? (
          <Button
            type="button"
            onClick={() => void handleClose()}
            disabled={submitting}
            className="min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700"
          >
            {submitting ? t('dayClose.closing') : t('dayClose.closeAction')}
          </Button>
        ) : closed ? (
          <StatusBadge variant="success">{t('dayClose.closedBadge')}</StatusBadge>
        ) : null
      }
    >
      <p className="text-caption text-flo-text-muted mb-3">{t('dayClose.cashZClarity')}</p>
      {loading ? (
        <LoadingState label={t('dayClose.loading')} className="min-h-[120px]" />
      ) : summary ? (
        <div className="space-y-4">
          {summary.open_shifts_warning && (
            <p
              role="alert"
              className="text-body text-flo-warning bg-flo-warning-subtle rounded-flo-md px-3 py-2"
            >
              {t('dayClose.openShiftsWarning')}
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('dayClose.openingFloat')}</p>
              <MoneyDisplay cents={summary.opening_float_cents_total ?? 0} size="lg" />
            </div>
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('shift.expectedCash')}</p>
              <MoneyDisplay cents={summary.expected_cash_cents_total ?? 0} size="lg" />
            </div>
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('shift.countedCash')}</p>
              {summary.counted_cash_cents_total !== null ? (
                <MoneyDisplay cents={summary.counted_cash_cents_total} size="lg" />
              ) : (
                <span className="text-numeric-lg text-flo-text-muted">—</span>
              )}
            </div>
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('shift.variance')}</p>
              <VarianceIndicator cents={summary.variance_cents_total} />
            </div>
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('dayClose.cashIn')}</p>
              <MoneyDisplay cents={summary.cash_payment_total_cents} size="lg" />
            </div>
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('dayClose.cashRefunds')}</p>
              <MoneyDisplay cents={summary.cash_refund_total_cents ?? 0} size="lg" />
            </div>
            <div>
              <p className="text-caption text-flo-text-muted mb-1">{t('dayClose.netCash')}</p>
              <MoneyDisplay
                cents={summary.net_cash_movement_cents ?? summary.cash_payment_total_cents}
                size="lg"
              />
            </div>
          </div>
          <p className="text-caption text-flo-text-muted">
            {t('dayClose.shiftCount')}: {summary.shift_count}
          </p>
          {summary.shifts?.length ? (
            <div className="space-y-2">
              <p className="text-caption text-flo-text-muted">{t('dayClose.perShift')}</p>
              <ul className="space-y-1">
                {summary.shifts.map((shift) => (
                  <li
                    key={shift.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-body border-b border-flo-border/40 py-1"
                  >
                    <span>
                      #{shift.id} · {shift.terminal_id}
                    </span>
                    <MoneyDisplay cents={shift.net_cash_movement_cents} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {closed ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={printing}
                onClick={() => void handlePrintZ()}
              >
                {printing ? t('dayClose.printingZ') : t('dayClose.printZ')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={downloading}
                onClick={() => void handleDownloadZ()}
              >
                {downloading ? t('dayClose.downloadingZ') : t('dayClose.downloadZ')}
              </Button>
            </div>
          ) : null}
          {dayCloseRecord ? (
            <p className="text-caption text-flo-text-muted">
              {t('dayClose.closedAt')}: {dayCloseRecord.created_at}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-body text-flo-text-secondary">
          {isToday ? t('dayClose.notClosedYet') : t('dayClose.noCloseForDate')}
        </p>
      )}
    </Panel>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import {
  fetchPrinterHealth,
  retryPrintJob,
  type PrintHealthJob,
  type PrintHealthPayload,
} from '@/lib/printer-health';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/flo';

type Props = {
  enabled: boolean;
};

export function PrinterHealthPanel({ enabled }: Props) {
  const { t } = useI18n();
  const [health, setHealth] = useState<PrintHealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPrinterHealth();
      setHealth(next);
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : t('settings.printHealthLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [enabled, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async (job: PrintHealthJob) => {
    if (!job.retryable || job.exhausted || retryingId) return;
    setRetryingId(job.id);
    try {
      const result = await retryPrintJob(job.id);
      if (result.success) {
        toast.success(t('settings.printHealthRetrySuccess'));
      } else {
        toast.error(t('settings.printHealthRetryFailed'));
      }
      await load();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { error?: string; code?: string } } }).response?.data
                ?.error || t('settings.printHealthRetryFailed'),
            )
          : err instanceof Error
            ? err.message
            : t('settings.printHealthRetryFailed');
      toast.error(message);
      await load();
    } finally {
      setRetryingId(null);
    }
  };

  const overallLabel =
    health?.overall === 'healthy'
      ? t('settings.printHealthHealthy')
      : health?.overall === 'degraded'
        ? t('settings.printHealthDegraded')
        : health?.overall === 'error'
          ? t('settings.printHealthError')
          : t('settings.printHealthUnknown');

  return (
    <div className="rounded-xl border border-flo-border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-flo-text text-sm">{t('settings.printHealthTitle')}</h3>
          <p className="text-xs text-flo-text-muted mt-0.5">{t('settings.printHealthHint')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || !!retryingId}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('settings.refresh')}
        </Button>
      </div>

      {loading && !health ? (
        <div className="flex items-center gap-2 text-sm text-flo-text-muted py-4">
          <Loader2 size={16} className="animate-spin" />
          {t('settings.printHealthLoading')}
        </div>
      ) : error ? (
        <EmptyState title={error} className="min-h-[80px] py-4" />
      ) : !health ? (
        <EmptyState title={t('settings.printHealthEmpty')} className="min-h-[80px] py-4" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                health.overall === 'healthy'
                  ? 'bg-green-500/10 text-green-700'
                  : health.overall === 'degraded'
                    ? 'bg-amber-500/10 text-amber-800'
                    : health.overall === 'error'
                      ? 'bg-red-500/10 text-red-700'
                      : 'bg-flo-surface-muted text-flo-text-secondary'
              }`}
            >
              {health.overall === 'healthy' ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              {overallLabel}
            </span>
            <span className="text-xs text-flo-text-secondary">
              {t('settings.printHealthOpenJobs')}: {health.queue.open_count}
            </span>
            <span className="text-xs text-flo-text-secondary">
              {t('settings.printHealthRetryable')}: {health.queue.retryable_count}
            </span>
            <span className="text-xs text-flo-text-secondary">
              {t('settings.printHealthExhausted')}: {health.queue.exhausted_count}
            </span>
            <span className="text-xs text-flo-text-secondary">
              {t('settings.printHealthDefaultPrinter')}:{' '}
              {health.default_printer.present
                ? health.default_printer.name || t('settings.printHealthDefaultYes')
                : t('settings.printHealthDefaultMissing')}
            </span>
          </div>

          {health.jobs.length === 0 ? (
            <p className="text-sm text-flo-text-muted">{t('settings.printHealthNoJobs')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-flo-border text-flo-text-muted text-xs">
                    <th className="py-2 pr-3">{t('settings.printHealthColJob')}</th>
                    <th className="py-2 pr-3">{t('settings.printHealthColStatus')}</th>
                    <th className="py-2 pr-3">{t('settings.printHealthColAttempts')}</th>
                    <th className="py-2 pr-3">{t('settings.printHealthColError')}</th>
                    <th className="py-2 text-right">{t('settings.printHealthColAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {health.jobs.map((job) => {
                    const busy = retryingId === job.id;
                    const canRetry = job.retryable && !job.exhausted && !retryingId;
                    return (
                      <tr key={job.id} className="border-b border-flo-border/60 align-top">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-flo-text">
                            {job.job_type === 'bill'
                              ? t('settings.printHealthBillJob')
                              : job.job_type}
                          </div>
                          <div className="text-xs text-flo-text-muted">
                            {job.bill_id != null
                              ? `${t('settings.printHealthBillId')} ${job.bill_id}`
                              : job.id.slice(0, 8)}
                            {job.has_prior_print_log
                              ? ` · ${t('settings.printHealthPriorLog')}`
                              : ''}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-flo-text-secondary">{job.status}</td>
                        <td className="py-2 pr-3 text-numeric">
                          {job.attempts}/{job.max_attempts}
                        </td>
                        <td className="py-2 pr-3 text-xs text-flo-text-muted max-w-[220px]">
                          {job.last_error || '—'}
                        </td>
                        <td className="py-2 text-right">
                          {job.exhausted ? (
                            <span className="text-xs text-flo-text-muted">
                              {t('settings.printHealthExhaustedLabel')}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canRetry || busy}
                              onClick={() => void handleRetry(job)}
                            >
                              {busy ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  {t('settings.printHealthRetrying')}
                                </>
                              ) : (
                                t('settings.printHealthRetry')
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

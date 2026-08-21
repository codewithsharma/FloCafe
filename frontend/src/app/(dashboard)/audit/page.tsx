'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, LoadingState, Panel } from '@/components/flo';
import { useI18n } from '@/hooks/useI18n';
import {
  downloadAuditLogsCsv,
  formatAuditMetadata,
  listAuditLogs,
  type AuditLogRow,
} from '@/lib/audit-logs';

export default function AuditLogsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const filters = {
    action: action || undefined,
    entity_type: entityType || undefined,
    actor_user_id: actorUserId || undefined,
    since: since || undefined,
    until: until || undefined,
    limit: 100,
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAuditLogs(filters)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 403) {
          setError(t('audit.unauthorized'));
        } else {
          setError(t('audit.failedToLoad'));
          toast.error(t('audit.failedToLoad'));
        }
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey drives reload
  }, [action, entityType, actorUserId, since, until, refreshKey, t]);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadAuditLogsCsv(filters);
      toast.success(t('audit.exported'));
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error(t('audit.exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('audit.title')}
        description={t('audit.subtitle')}
        actions={
          <Button type="button" onClick={handleExport} disabled={exporting || !!error}>
            <Download className="mr-2 h-4 w-4" />
            {t('audit.exportCsv')}
          </Button>
        }
      />

      <Panel className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label htmlFor="audit-action">{t('audit.filterAction')}</Label>
          <Input
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="payment.received"
          />
        </div>
        <div>
          <Label htmlFor="audit-entity">{t('audit.filterEntity')}</Label>
          <Input
            id="audit-entity"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="expense"
          />
        </div>
        <div>
          <Label htmlFor="audit-actor">{t('audit.filterActor')}</Label>
          <Input
            id="audit-actor"
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            placeholder="user id"
          />
        </div>
        <div>
          <Label htmlFor="audit-since">{t('audit.filterSince')}</Label>
          <Input
            id="audit-since"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            placeholder="2026-01-01T00:00:00.000Z"
          />
        </div>
        <div>
          <Label htmlFor="audit-until">{t('audit.filterUntil')}</Label>
          <Input
            id="audit-until"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            placeholder="2026-12-31T23:59:59.999Z"
          />
        </div>
      </Panel>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('audit.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3">{t('audit.colTime')}</th>
                <th className="py-2 pr-3">{t('audit.colActor')}</th>
                <th className="py-2 pr-3">{t('audit.colAction')}</th>
                <th className="py-2 pr-3">{t('audit.colEntity')}</th>
                <th className="py-2 pr-3">{t('audit.colResult')}</th>
                <th className="py-2">{t('audit.colMetadata')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{row.created_at}</td>
                  <td className="py-2 pr-3">{row.actor_name || row.actor_user_id || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.action}</td>
                  <td className="py-2 pr-3">
                    {[row.entity_type, row.entity_id].filter(Boolean).join(' · ') || '—'}
                    {row.reason ? (
                      <div className="text-xs text-muted-foreground">{row.reason}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{row.result}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {formatAuditMetadata(row.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

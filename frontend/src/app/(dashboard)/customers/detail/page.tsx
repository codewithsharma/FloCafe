'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { PageHeader, Panel, LoadingState, MoneyDisplay, StatusBadge } from '@/components/flo';
import { Button } from '@/components/ui/button';
import {
  createCustomerNote,
  deleteCustomerNote,
  fetchCustomerCrm,
  updateCustomerNote,
} from '@/lib/crm';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';

type CrmPayload = {
  profile: Record<string, unknown>;
  orders: Record<string, unknown>;
  spending: {
    total_spend_cents: number;
    average_order_cents: number;
    refunded_cents: number;
    net_spend_cents: number;
  };
  preferences: Record<string, unknown>;
  loyalty: { enabled: boolean; balance_points: number; recent_ledger: unknown[] };
  notes: Array<Record<string, unknown>>;
  segments: Array<{ id: string; label: string; reason: string }>;
  activity: Array<{ at: string; kind: string; summary: string }>;
};

export default function CustomerCrmDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const canNoteWrite = role === 'owner' || role === 'manager' || role === 'cashier';
  const canNoteManage = role === 'owner' || role === 'manager';
  const formatCurrency = useFormatCurrency();

  const [crm, setCrm] = useState<CrmPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteBody, setNoteBody] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const data = await fetchCustomerCrm(id);
    setCrm(data);
  }, [id]);

  useEffect(() => {
    if (role === 'chef') {
      router.replace('/pos');
      return;
    }
    if (!id) {
      router.replace('/customers');
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        await refresh();
      } catch {
        toast.error(t('customer.ledgerLoadFailed'));
        router.replace('/customers');
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [id, role, refresh, router, t]);

  if (loading || !crm) {
    return <LoadingState />;
  }

  const profile = crm.profile;
  const spending = crm.spending;
  const orders = crm.orders as {
    total_orders?: number;
    cancelled_orders?: number;
    preferred_order_type?: string | null;
    recent_orders?: Array<Record<string, unknown>>;
    frequency?: { orders_per_30_days?: number } | null;
  };
  const prefs = crm.preferences as {
    favorite_items?: Array<{ name: string; quantity: number }>;
    favorite_categories?: Array<{ name: string; quantity: number }>;
    preferred_order_type?: string | null;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={String(profile.name || 'Customer')}
        description={String(profile.phone || profile.email || '')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge variant={Number(profile.is_active) === 1 ? 'success' : 'secondary'}>
          {String(profile.status || '')}
        </StatusBadge>
        {crm.segments.map((s) => (
          <StatusBadge key={s.id} variant="info" title={s.reason}>
            {s.label}
          </StatusBadge>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Profile">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-flo-text-muted">Phone</dt>
              <dd>{String(profile.phone || '—')}</dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Email</dt>
              <dd>{String(profile.email || '—')}</dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Notes</dt>
              <dd className="whitespace-pre-wrap">{String(profile.notes || '—')}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Spending">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-flo-text-muted">Total spend</dt>
              <dd>
                <MoneyDisplay cents={spending.total_spend_cents} />
              </dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Average order</dt>
              <dd>
                <MoneyDisplay cents={spending.average_order_cents} />
              </dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Refunded</dt>
              <dd>
                <MoneyDisplay cents={spending.refunded_cents} />
              </dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Net spend</dt>
              <dd>
                <MoneyDisplay cents={spending.net_spend_cents} />
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Orders">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-flo-text-muted">Total orders</dt>
              <dd>{orders.total_orders ?? 0}</dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Cancelled</dt>
              <dd>{orders.cancelled_orders ?? 0}</dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Preferred type</dt>
              <dd>{orders.preferred_order_type || '—'}</dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Frequency / 30d</dt>
              <dd>{orders.frequency?.orders_per_30_days ?? '—'}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Loyalty">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-flo-text-muted">Enabled</dt>
              <dd>{crm.loyalty.enabled ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-flo-text-muted">Balance</dt>
              <dd>{crm.loyalty.balance_points} pts</dd>
            </div>
          </dl>
          <ul className="mt-3 space-y-1 text-xs text-flo-text-secondary max-h-40 overflow-auto">
            {(crm.loyalty.recent_ledger || []).slice(0, 8).map((row: any) => (
              <li key={String(row.id)}>
                {row.type} {row.amount} — {row.description || ''}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Preferences">
          <p className="text-sm text-flo-text-muted mb-2">
            Preferred type: {prefs.preferred_order_type || '—'}
          </p>
          <p className="text-xs font-medium mb-1">Favorite items</p>
          <ul className="text-sm space-y-1 mb-3">
            {(prefs.favorite_items || []).slice(0, 5).map((i) => (
              <li key={i.name}>
                {i.name} × {i.quantity}
              </li>
            ))}
            {(prefs.favorite_items || []).length === 0 && <li>—</li>}
          </ul>
          <p className="text-xs font-medium mb-1">Favorite categories</p>
          <ul className="text-sm space-y-1">
            {(prefs.favorite_categories || []).slice(0, 5).map((c) => (
              <li key={c.name}>
                {c.name} × {c.quantity}
              </li>
            ))}
            {(prefs.favorite_categories || []).length === 0 && <li>—</li>}
          </ul>
        </Panel>

        <Panel title="Recent orders">
          <ul className="text-sm space-y-2 max-h-56 overflow-auto">
            {(orders.recent_orders || []).map((o) => (
              <li key={String(o.id)} className="flex justify-between gap-2">
                <span>
                  {String(o.order_number || o.id)} · {String(o.status)}
                </span>
                <span>
                  {formatCurrency(
                    typeof o.total_cents === 'number'
                      ? Number(o.total_cents) / 100
                      : Number(o.total || 0),
                  )}
                </span>
              </li>
            ))}
            {(orders.recent_orders || []).length === 0 && <li>—</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Notes">
        {canNoteWrite && (
          <form
            className="flex gap-2 mb-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!noteBody.trim()) return;
              setBusy(true);
              try {
                await createCustomerNote(id, noteBody.trim());
                setNoteBody('');
                await refresh();
                toast.success('Note saved');
              } catch {
                toast.error('Could not save note');
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className="flex-1 rounded-md border border-flo-border bg-flo-surface px-3 py-2 text-sm"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add an operational note"
              maxLength={4000}
            />
            <Button type="submit" disabled={busy || !noteBody.trim()}>
              Add
            </Button>
          </form>
        )}
        <ul className="space-y-3">
          {(crm.notes || []).map((n) => (
            <li key={String(n.id)} className="rounded-md border border-flo-border p-3 text-sm">
              <p className="whitespace-pre-wrap">{String(n.body)}</p>
              <p className="text-xs text-flo-text-muted mt-1">{String(n.created_at)}</p>
              {canNoteManage && (
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const next = window.prompt('Update note', String(n.body));
                      if (next == null || !next.trim()) return;
                      setBusy(true);
                      try {
                        await updateCustomerNote(id, String(n.id), next.trim());
                        await refresh();
                      } catch {
                        toast.error('Update failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm('Delete this note?')) return;
                      setBusy(true);
                      try {
                        await deleteCustomerNote(id, String(n.id));
                        await refresh();
                      } catch {
                        toast.error('Delete failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
          {(crm.notes || []).length === 0 && (
            <li className="text-sm text-flo-text-muted">No audited notes yet.</li>
          )}
        </ul>
      </Panel>

      <Panel title="Activity">
        <ul className="text-sm space-y-1 max-h-64 overflow-auto">
          {(crm.activity || []).map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <span className="text-flo-text-muted">{a.at}</span> · {a.kind}: {a.summary}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

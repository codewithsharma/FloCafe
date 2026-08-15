'use client';

import {
  Edit,
  History,
  Search,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Wallet,
  RotateCcw,
  UserMinus,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Panel, EmptyState, MoneyDisplay, StatusBadge } from '@/components/flo';
import type { Customer } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { parseDbTimestamp } from '@/lib/utils';
import { activeStatusVariant } from '@/lib/flo-display';
import { cn } from '@/lib/utils';

function SortIcon({
  field,
  sortField,
  sortOrder,
}: {
  field: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
}) {
  if (sortField !== field) {
    return (
      <span className="text-flo-text-muted w-3 inline-block ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
        ↕
      </span>
    );
  }
  return sortOrder === 'asc' ? (
    <TrendingUp size={12} className="inline ml-1 text-flo-text-secondary" />
  ) : (
    <TrendingDown size={12} className="inline ml-1 text-flo-text-secondary" />
  );
}

function isCustomerActive(c: Customer): boolean {
  if (c.is_active === undefined || c.is_active === null) return true;
  return Number(c.is_active) === 1;
}

export interface CustomersTableProps {
  customers: Customer[];
  search: string;
  onSearchChange: (value: string) => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onEdit: (customer: Customer) => void;
  onOpenLedger: (customer: Customer) => void;
  onAdd: () => void;
  /** Owner/manager deliberate locate workflow */
  canShowInactive?: boolean;
  showInactive?: boolean;
  onShowInactiveChange?: (value: boolean) => void;
  onReactivate?: (customer: Customer) => void;
  reactivatingId?: string | number | null;
  onDeactivate?: (customer: Customer) => void;
  deactivatingId?: string | number | null;
}

function formatPhone(c: Customer): string {
  if (!c.phone) return '—';
  if (c.country_code && !c.phone.startsWith(c.country_code)) {
    return `${c.country_code}${c.phone}`;
  }
  return c.phone;
}

function formatVisitDate(d: string): string {
  try {
    return parseDbTimestamp(d).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

export function CustomersTable({
  customers,
  search,
  onSearchChange,
  sortField,
  sortOrder,
  onSort,
  onEdit,
  onOpenLedger,
  onAdd,
  canShowInactive = false,
  showInactive = false,
  onShowInactiveChange,
  onReactivate,
  reactivatingId = null,
  onDeactivate,
  deactivatingId = null,
}: CustomersTableProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted"
            aria-hidden
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('customer.search')}
            aria-label={t('customer.search')}
            className="w-full pl-10 pr-4 py-2.5 min-h-11 bg-flo-surface border border-flo-border rounded-flo-md text-flo-text outline-none focus:ring-2 focus:ring-flo-brand-500"
          />
        </div>
        {canShowInactive && onShowInactiveChange ? (
          <label className="inline-flex items-center gap-2 min-h-11 text-small text-flo-text-secondary whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              className="size-4 accent-flo-brand-600"
              checked={showInactive}
              onChange={(e) => onShowInactiveChange(e.target.checked)}
            />
            {showInactive ? t('customers.hideInactive') : t('customers.showInactive')}
          </label>
        ) : null}
      </div>

      <Panel className="overflow-hidden p-0 md:p-0">
        {customers.length === 0 ? (
          <EmptyState
            title={t('customers.empty')}
            action={<Button onClick={onAdd}>{t('customer.add')}</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-flo-bg">
                  <tr>
                    <th
                      className="text-left p-4 text-caption font-medium text-flo-text-secondary uppercase cursor-pointer hover:bg-flo-brand-50 group transition-colors"
                      onClick={() => onSort('name')}
                    >
                      {t('customers.columnCustomer')}{' '}
                      <SortIcon field="name" sortField={sortField} sortOrder={sortOrder} />
                    </th>
                    <th
                      className="text-left p-4 text-caption font-medium text-flo-text-secondary uppercase cursor-pointer hover:bg-flo-brand-50 group transition-colors"
                      onClick={() => onSort('phone')}
                    >
                      {t('customer.phone')}{' '}
                      <SortIcon field="phone" sortField={sortField} sortOrder={sortOrder} />
                    </th>
                    <th
                      className="text-center p-4 text-caption font-medium text-flo-text-secondary uppercase cursor-pointer hover:bg-flo-brand-50 group transition-colors"
                      onClick={() => onSort('last_visit')}
                    >
                      Last Visit{' '}
                      <SortIcon field="last_visit" sortField={sortField} sortOrder={sortOrder} />
                    </th>
                    <th
                      className="text-center p-4 text-caption font-medium text-flo-text-secondary uppercase cursor-pointer hover:bg-flo-brand-50 group transition-colors"
                      onClick={() => onSort('visits')}
                    >
                      {t('customer.visits')}{' '}
                      <SortIcon field="visits" sortField={sortField} sortOrder={sortOrder} />
                    </th>
                    <th
                      className="text-right p-4 text-caption font-medium text-flo-text-secondary uppercase cursor-pointer hover:bg-flo-brand-50 group transition-colors"
                      onClick={() => onSort('spent')}
                    >
                      {t('customer.totalSpent')}{' '}
                      <SortIcon field="spent" sortField={sortField} sortOrder={sortOrder} />
                    </th>
                    <th
                      className="text-right p-4 text-caption font-medium text-flo-text-secondary uppercase cursor-pointer hover:bg-flo-brand-50 group transition-colors"
                      onClick={() => onSort('loyalty')}
                    >
                      {t('customer.loyalty')}{' '}
                      <SortIcon field="loyalty" sortField={sortField} sortOrder={sortOrder} />
                    </th>
                    <th className="text-center p-4 text-caption font-medium text-flo-text-secondary uppercase">
                      {t('customers.columnActions')}
                    </th>
                    <th className="text-center p-4 text-caption font-medium text-flo-text-secondary uppercase">
                      {t('customers.columnLedger')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-flo-border">
                  {customers.map((c) => {
                    const active = isCustomerActive(c);
                    const busy =
                      (reactivatingId != null && String(reactivatingId) === String(c.id)) ||
                      (deactivatingId != null && String(deactivatingId) === String(c.id));
                    return (
                      <tr key={c.id} className={cn('hover:bg-flo-bg/80', !active && 'opacity-60')}>
                        <td className="p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-flo-text">{c.name}</p>
                            {!active ? (
                              <StatusBadge variant={activeStatusVariant(false)} dot>
                                {t('common.inactive')}
                              </StatusBadge>
                            ) : null}
                          </div>
                          <p className="text-caption text-flo-text-muted">{c.email || '—'}</p>
                        </td>
                        <td className="p-4 text-small text-flo-text-secondary">
                          <div className="flex items-center gap-2">
                            <span>{formatPhone(c)}</span>
                            {c.phone && !c.phone.startsWith('+') && (
                              <div
                                className="text-flo-danger flex items-center"
                                title="Invalid format"
                              >
                                <AlertCircle size={16} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center text-small text-flo-text-muted whitespace-nowrap">
                          {c.last_visit_at ? formatVisitDate(c.last_visit_at) : '—'}
                        </td>
                        <td className="p-4 text-center text-small text-numeric text-flo-text">
                          {c.visits_count}
                        </td>
                        <td className="p-4 text-right">
                          <MoneyDisplay
                            cents={
                              c.total_spent_cents != null
                                ? Number(c.total_spent_cents)
                                : Math.round(Number(c.total_spent || 0) * 100)
                            }
                            size="sm"
                          />
                        </td>
                        <td className="p-4 text-right">
                          {Number(c.wallet_balance) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-flo-brand-700 font-semibold text-small">
                              <Wallet size={13} />
                              {Number(c.wallet_balance).toLocaleString()} {t('customer.ptsSuffix')}
                            </span>
                          ) : (
                            <span className="text-flo-text-muted text-small">—</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            {active && onDeactivate ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11 min-w-11 text-flo-danger"
                                disabled={busy}
                                onClick={() => onDeactivate(c)}
                                aria-label={t('customer.deactivate')}
                                title={t('customer.deactivate')}
                              >
                                <UserMinus size={14} aria-hidden />
                              </Button>
                            ) : null}
                            {!active && onReactivate ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11 min-w-11 text-flo-success"
                                disabled={busy}
                                onClick={() => onReactivate(c)}
                                aria-label={t('customer.reactivate')}
                                title={t('customer.reactivate')}
                              >
                                <RotateCcw size={14} aria-hidden />
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="sm" className="min-h-11 min-w-11" asChild>
                              <Link
                                href={`/customers/detail/?id=${encodeURIComponent(String(c.id))}`}
                                aria-label="Customer 360"
                                title="Customer 360"
                              >
                                <UserRound size={14} aria-hidden />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-11 min-w-11"
                              onClick={() => onEdit(c)}
                              aria-label={t('common.edit')}
                            >
                              <Edit size={14} aria-hidden />
                            </Button>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 min-w-11"
                            onClick={() => onOpenLedger(c)}
                            title={t('customer.viewLedgerTitle')}
                            aria-label={t('customer.viewLedgerTitle')}
                          >
                            <History size={14} aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {customers.length >= 200 && (
              <p className="text-center text-caption text-flo-text-muted py-3">
                {t('customers.first200')}
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

'use client';

import { Edit, History, Search, TrendingDown, TrendingUp, AlertCircle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, EmptyState, MoneyDisplay } from '@/components/flo';
import type { Customer } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { parseDbTimestamp } from '@/lib/utils';

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
}: CustomersTableProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="relative">
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

      <Panel className="overflow-hidden p-0 md:p-0">
        {customers.length === 0 ? (
          <EmptyState
            title={t('customers.empty')}
            action={
              <Button onClick={onAdd}>
                {t('customer.add')}
              </Button>
            }
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
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-flo-bg/80">
                      <td className="p-4">
                        <p className="font-medium text-flo-text">{c.name}</p>
                        <p className="text-caption text-flo-text-muted">{c.email || '—'}</p>
                      </td>
                      <td className="p-4 text-small text-flo-text-secondary">
                        <div className="flex items-center gap-2">
                          <span>{formatPhone(c)}</span>
                          {c.phone && !c.phone.startsWith('+') && (
                            <div className="text-flo-danger flex items-center" title="Invalid format">
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
                          cents={Math.round(Number(c.total_spent || 0) * 100)}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 min-w-11"
                          onClick={() => onEdit(c)}
                          aria-label={t('common.edit')}
                        >
                          <Edit size={14} aria-hidden />
                        </Button>
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
                  ))}
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

'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, EmptyState } from '@/components/flo';
import type { Customer } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { parseDbTimestamp } from '@/lib/utils';

export interface LedgerTransaction {
  id: number;
  type: string;
  amount: number;
  description: string;
  created_at: string;
  expires_at?: string;
}

export interface LedgerData {
  balance: number;
  transactions: LedgerTransaction[];
}

export interface CustomerLedgerDialogProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  data: LedgerData | null;
}

function formatDate(d: string): string {
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

export function CustomerLedgerDialog({
  customer,
  open,
  onOpenChange,
  loading,
  data,
}: CustomerLedgerDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-flo-border">
          <DialogTitle className="text-flo-text">{t('customers.loyaltyLedger')}</DialogTitle>
          {customer ? (
            <p className="text-small text-flo-text-secondary">{customer.name}</p>
          ) : null}
        </DialogHeader>

        {loading ? (
          <LoadingState label={t('customer.loadingLedger')} />
        ) : data ? (
          <>
            <div className="flex items-center gap-6 px-6 py-4 bg-flo-bg border-b border-flo-border">
              <div>
                <p className="text-caption text-flo-text-muted mb-0.5">{t('customers.totalBalance')}</p>
                <p className="text-numeric-lg text-flo-text">
                  {data.balance}{' '}
                  <span className="text-small font-normal text-flo-text-secondary">
                    {t('customer.ptsSuffix')}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {data.transactions.length === 0 ? (
                <EmptyState title={t('customers.noTransactions')} className="min-h-[160px]" />
              ) : (
                <table className="w-full text-small">
                  <thead className="bg-flo-bg sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-caption font-medium text-flo-text-secondary">
                        {t('customers.columnDate')}
                      </th>
                      <th className="text-left px-4 py-2.5 text-caption font-medium text-flo-text-secondary">
                        {t('customers.columnDescription')}
                      </th>
                      <th className="text-right px-4 py-2.5 text-caption font-medium text-flo-text-secondary">
                        {t('customers.columnPoints')}
                      </th>
                      <th className="text-right px-4 py-2.5 text-caption font-medium text-flo-text-secondary">
                        {t('customers.columnExpires')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-flo-border">
                    {data.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-flo-bg/80">
                        <td className="px-4 py-3 text-flo-text-secondary whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="px-4 py-3 text-flo-text">{tx.description || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              tx.type === 'credit' ? 'text-flo-success' : 'text-flo-danger'
                            }`}
                          >
                            {tx.type === 'credit' ? (
                              <TrendingUp size={12} />
                            ) : (
                              <TrendingDown size={12} />
                            )}
                            {tx.type === 'credit' ? '+' : '-'}
                            {tx.amount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-caption text-flo-text-muted whitespace-nowrap">
                          {tx.expires_at ? formatDate(tx.expires_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

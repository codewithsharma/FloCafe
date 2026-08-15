'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CircleDollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { isModuleEnabled } from '@/lib/modules';
import { fetchInventoryValuation, type InventoryValuationReport } from '@/lib/inventory-valuation';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';

export default function InventoryValuationPage() {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const router = useRouter();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const [report, setReport] = useState<InventoryValuationReport | null>(null);
  const [loading, setLoading] = useState(() => Boolean(isOwnerOrManager && inventoryEnabled));

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [isOwnerOrManager, router]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchInventoryValuation(signal);
    setReport(data);
  }, []);

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        setLoading(true);
        await load(controller.signal);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(t('inventoryValuation.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isOwnerOrManager, inventoryEnabled, load, t]);

  if (!isOwnerOrManager) {
    return <PageHeader title={t('inventoryValuation.title')} />;
  }

  if (!inventoryEnabled) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('inventoryValuation.title')} />
        <EmptyState
          title={t('inventoryValuation.moduleDisabled')}
          action={
            <Button variant="outline" asChild>
              <Link href="/products">{t('inventoryValuation.backToProducts')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loading) {
    return <LoadingState label={t('inventoryValuation.title')} className="min-h-[16rem]" />;
  }

  const lines = report?.lines ?? [];
  const totals = report?.totals;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('inventoryValuation.title')}
        description={t('inventoryValuation.disclaimer')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/products">
              <ArrowLeft size={16} className="mr-1" />
              {t('inventoryValuation.backToProducts')}
            </Link>
          </Button>
        }
      />

      {lines.length === 0 ? (
        <EmptyState
          icon={<CircleDollarSign className="size-10" strokeWidth={1.5} />}
          title={t('inventoryValuation.emptyTitle')}
          description={t('inventoryValuation.emptyDescription')}
        />
      ) : (
        <Panel className="overflow-x-auto">
          <table data-testid="inventory-valuation-table" className="w-full text-small">
            <thead>
              <tr className="text-left text-flo-text-muted border-b border-flo-border">
                <th className="p-2">{t('inventoryValuation.columnProduct')}</th>
                <th className="p-2">{t('inventoryValuation.columnSku')}</th>
                <th className="p-2 text-right">{t('inventoryValuation.columnQty')}</th>
                <th className="p-2 text-right">{t('inventoryValuation.columnCost')}</th>
                <th className="p-2 text-right">{t('inventoryValuation.columnValue')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.product_id} className="border-b border-flo-border/60">
                  <td className="p-2">
                    {line.name}
                    {line.zero_cost ? (
                      <span className="ml-2 text-caption text-flo-text-muted">
                        {t('inventoryValuation.zeroCost')}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 font-mono text-caption">{line.sku || '—'}</td>
                  <td className="p-2 text-right">{line.on_hand_qty}</td>
                  <td className="p-2 text-right">{fmt(line.unit_cost)}</td>
                  <td className="p-2 text-right">{fmt(line.extended_cost)}</td>
                </tr>
              ))}
            </tbody>
            {totals ? (
              <tfoot>
                <tr className="font-medium">
                  <td className="p-2" colSpan={2}>
                    {t('inventoryValuation.total')}
                  </td>
                  <td className="p-2 text-right">{totals.on_hand_qty}</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{fmt(totals.extended_cost)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </Panel>
      )}
    </div>
  );
}

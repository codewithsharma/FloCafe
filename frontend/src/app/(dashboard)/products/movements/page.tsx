'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { isModuleEnabled } from '@/lib/modules';
import { parseDbTimestamp } from '@/lib/utils';
import type { Product } from '@/lib/types';
import {
  buildMovementsQuery,
  formatMovementReference,
  formatQuantityDelta,
  type InventoryMovement,
  type InventoryMovementsResponse,
} from '@/lib/inventory-movements';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';

const PAGE_LIMIT = 50;

function formatMovementDate(value: string): string {
  try {
    return parseDbTimestamp(value).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function InventoryMovementsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState(() => searchParams?.get('product_id') || '');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(() =>
    Boolean(isOwnerOrManager && inventoryEnabled),
  );
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace('/pos');
    }
  }, [isOwnerOrManager, router]);

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        setLoadingProducts(true);
        const res = await api.get('/products', { signal: controller.signal });
        const list = (res.data.products || []) as Product[];
        setProducts(list);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(t('inventoryMovements.loadProductsFailed'));
      } finally {
        setLoadingProducts(false);
      }
    })();
    return () => controller.abort();
  }, [isOwnerOrManager, inventoryEnabled, t]);

  const loadMovements = useCallback(
    async (opts: { append: boolean; beforeId?: number | null }) => {
      const trimmed = productId.trim();
      if (!trimmed) {
        setMovements([]);
        setNextCursor(null);
        setError(null);
        return;
      }
      if (opts.append) setLoadingMore(true);
      else setLoadingMovements(true);
      setError(null);
      try {
        const params = buildMovementsQuery({
          productId: trimmed,
          limit: PAGE_LIMIT,
          beforeId: opts.beforeId ?? null,
        });
        const res = await api.get<InventoryMovementsResponse>('/inventory/movements', { params });
        const rows = res.data.movements || [];
        setMovements((prev) => (opts.append ? [...prev, ...rows] : rows));
        setNextCursor(res.data.nextCursor ?? null);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          t('inventoryMovements.loadFailed');
        setError(message);
        if (!opts.append) setMovements([]);
        setNextCursor(null);
        toast.error(message);
      } finally {
        setLoadingMovements(false);
        setLoadingMore(false);
      }
    },
    [productId, t],
  );

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ledger for selected product
    void loadMovements({ append: false });
  }, [isOwnerOrManager, inventoryEnabled, loadMovements]);

  if (!isOwnerOrManager) {
    return <LoadingState label={t('inventoryMovements.title')} className="min-h-[16rem]" />;
  }

  if (!inventoryEnabled) {
    return (
      <div>
        <PageHeader title={t('inventoryMovements.title')} />
        <EmptyState title={t('inventoryMovements.moduleDisabled')} />
      </div>
    );
  }

  const selectedProduct = products.find((p) => String(p.id) === String(productId));

  return (
    <div>
      <PageHeader title={t('inventoryMovements.title')} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/products">
            <ArrowLeft size={16} className="mr-1" />
            {t('inventoryMovements.backToProducts')}
          </Link>
        </Button>
      </div>

      <Panel className="mb-4 p-4">
        <label className="block text-caption font-medium text-flo-text-muted uppercase mb-2">
          {t('inventoryMovements.productFilter')}
        </label>
        {loadingProducts ? (
          <LoadingState label={t('inventoryMovements.loadingProducts')} className="min-h-[3rem]" />
        ) : (
          <select
            className="w-full max-w-md rounded-flo-md border border-flo-border bg-flo-surface px-3 py-2 text-flo-text"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">{t('inventoryMovements.selectProduct')}</option>
            {products.map((product) => (
              <option key={product.id} value={String(product.id)}>
                {product.name}
                {product.sku ? ` (${product.sku})` : ''}
              </option>
            ))}
          </select>
        )}
        {selectedProduct ? (
          <p className="mt-2 text-small text-flo-text-secondary">
            {t('inventoryMovements.currentStock')}:{' '}
            <span className="font-semibold text-flo-text">
              {selectedProduct.track_inventory
                ? (selectedProduct.stock_quantity ?? 0)
                : t('inventoryMovements.notTracked')}
            </span>
          </p>
        ) : null}
      </Panel>

      {!productId.trim() ? (
        <EmptyState
          title={t('inventoryMovements.pickProduct')}
          description={t('inventoryMovements.pickProductHint')}
          icon={<History className="size-10" strokeWidth={1.5} />}
        />
      ) : loadingMovements ? (
        <LoadingState label={t('inventoryMovements.loading')} className="min-h-[12rem]" />
      ) : error && movements.length === 0 ? (
        <EmptyState title={t('inventoryMovements.errorTitle')} description={error} />
      ) : movements.length === 0 ? (
        <EmptyState title={t('inventoryMovements.empty')} />
      ) : (
        <Panel className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-flo-bg border-b border-flo-border">
                <tr>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryMovements.columnDate')}
                  </th>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryMovements.columnType')}
                  </th>
                  <th className="text-right p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryMovements.columnDelta')}
                  </th>
                  <th className="text-right p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryMovements.columnStockAfter')}
                  </th>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryMovements.columnReason')}
                  </th>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryMovements.columnReference')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-flo-border">
                {movements.map((row) => (
                  <tr key={row.id} className="hover:bg-flo-bg/60">
                    <td className="p-4 text-flo-text-secondary whitespace-nowrap">
                      {formatMovementDate(row.created_at)}
                    </td>
                    <td className="p-4 text-flo-text font-medium">{row.movement_type}</td>
                    <td
                      className={`p-4 text-right font-semibold whitespace-nowrap ${
                        row.quantity_delta < 0
                          ? 'text-flo-danger'
                          : row.quantity_delta > 0
                            ? 'text-flo-success'
                            : 'text-flo-text'
                      }`}
                    >
                      {formatQuantityDelta(row.quantity_delta)}
                    </td>
                    <td className="p-4 text-right text-flo-text whitespace-nowrap">
                      {row.stock_after}
                    </td>
                    <td className="p-4 text-flo-text">{row.reason || '—'}</td>
                    <td className="p-4 text-flo-text-secondary font-mono text-caption">
                      {formatMovementReference(row.reference_type, row.reference_id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor != null ? (
            <div className="border-t border-flo-border p-4 flex justify-center">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMovements({ append: true, beforeId: nextCursor })}
              >
                {loadingMore
                  ? t('inventoryMovements.loadingMore')
                  : t('inventoryMovements.loadMore')}
              </Button>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}

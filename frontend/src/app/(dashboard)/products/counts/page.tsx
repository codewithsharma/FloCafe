'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { isModuleEnabled } from '@/lib/modules';
import { parseDbTimestamp } from '@/lib/utils';
import type { Product } from '@/lib/types';
import {
  applyInventoryCount,
  createInventoryCount,
  getInventoryCount,
  listInventoryCounts,
  submitInventoryCount,
  upsertInventoryCountLine,
  type InventoryCount,
  type InventoryCountLine,
} from '@/lib/inventory-counts';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';

function formatCountDate(value: string | null): string {
  if (!value) return '—';
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

export default function InventoryCountsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InventoryCount | null>(null);
  const [lines, setLines] = useState<InventoryCountLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingList, setLoadingList] = useState(() =>
    Boolean(isOwnerOrManager && inventoryEnabled),
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lineProductId, setLineProductId] = useState('');
  const [lineCountedQty, setLineCountedQty] = useState('');

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [isOwnerOrManager, router]);

  const refreshList = useCallback(async (signal?: AbortSignal) => {
    const rows = await listInventoryCounts(signal);
    setCounts(rows);
  }, []);

  const loadDetail = useCallback(
    async (countId: string, signal?: AbortSignal) => {
      setLoadingDetail(true);
      try {
        const data = await getInventoryCount(countId, signal);
        setDetail(data.count);
        setLines(data.lines);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          t('inventoryCounts.loadDetailFailed');
        toast.error(message);
        setDetail(null);
        setLines([]);
      } finally {
        setLoadingDetail(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        setLoadingList(true);
        await refreshList(controller.signal);
        const res = await api.get('/products', { signal: controller.signal });
        setProducts((res.data.products || []) as Product[]);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(t('inventoryCounts.loadFailed'));
      } finally {
        setLoadingList(false);
      }
    })();
    return () => controller.abort();
  }, [isOwnerOrManager, inventoryEnabled, refreshList, t]);

  useEffect(() => {
    if (!selectedId || !isOwnerOrManager || !inventoryEnabled) {
      setDetail(null);
      setLines([]);
      return;
    }
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [selectedId, isOwnerOrManager, inventoryEnabled, loadDetail]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const count = await createInventoryCount();
      toast.success(t('inventoryCounts.createSuccess'));
      await refreshList();
      setSelectedId(count.id);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('inventoryCounts.createFailed');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddLine = async () => {
    if (!selectedId || !detail || detail.status !== 'draft') return;
    const productId = lineProductId.trim();
    const qty = Number(lineCountedQty.trim());
    if (!productId || !Number.isFinite(qty) || qty < 0) {
      toast.error(t('inventoryCounts.invalidLine'));
      return;
    }
    setBusy(true);
    try {
      await upsertInventoryCountLine(selectedId, {
        product_id: productId,
        counted_qty: qty,
      });
      toast.success(t('inventoryCounts.lineSaved'));
      setLineProductId('');
      setLineCountedQty('');
      await loadDetail(selectedId);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('inventoryCounts.lineFailed');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await submitInventoryCount(selectedId);
      toast.success(t('inventoryCounts.submitSuccess'));
      await refreshList();
      await loadDetail(selectedId);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('inventoryCounts.submitFailed');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await applyInventoryCount(selectedId);
      toast.success(t('inventoryCounts.applySuccess'));
      await refreshList();
      await loadDetail(selectedId);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('inventoryCounts.applyFailed');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const productName = (productId: string): string => {
    const found = products.find((p) => String(p.id) === String(productId));
    return found?.name || productId;
  };

  const trackedProducts = products.filter((p) => p.track_inventory);
  const inputClass =
    'w-full max-w-xs rounded-flo-md border border-flo-border bg-flo-surface px-3 py-2 text-flo-text';

  if (!isOwnerOrManager) {
    return <LoadingState label={t('inventoryCounts.title')} className="min-h-[16rem]" />;
  }

  if (!inventoryEnabled) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('inventoryCounts.title')} />
        <EmptyState
          title={t('inventoryCounts.moduleDisabled')}
          action={
            <Button variant="outline" asChild>
              <Link href="/products">{t('inventoryCounts.backToProducts')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loadingList) {
    return <LoadingState label={t('inventoryCounts.title')} className="min-h-[16rem]" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('inventoryCounts.title')}
        description={t('inventoryCounts.description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/products">
                <ArrowLeft size={16} className="mr-1" />
                {t('inventoryCounts.backToProducts')}
              </Link>
            </Button>
            <Button disabled={busy} onClick={() => void handleCreate()}>
              <Plus size={16} className="mr-1" />
              {t('inventoryCounts.create')}
            </Button>
          </div>
        }
      />

      {counts.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-10" strokeWidth={1.5} />}
          title={t('inventoryCounts.emptyTitle')}
          description={t('inventoryCounts.emptyDescription')}
        />
      ) : (
        <Panel className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-flo-bg border-b border-flo-border">
                <tr>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryCounts.columnId')}
                  </th>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryCounts.columnStatus')}
                  </th>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryCounts.columnCreated')}
                  </th>
                  <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">
                    {t('inventoryCounts.columnActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-flo-border">
                {counts.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedId === row.id ? 'bg-flo-bg/80' : 'hover:bg-flo-bg/60'}
                  >
                    <td className="p-4 font-mono text-caption text-flo-text">{row.id}</td>
                    <td className="p-4 text-flo-text font-medium">{row.status}</td>
                    <td className="p-4 text-flo-text-secondary whitespace-nowrap">
                      {formatCountDate(row.created_at)}
                    </td>
                    <td className="p-4">
                      <Button variant="outline" size="sm" onClick={() => setSelectedId(row.id)}>
                        {t('inventoryCounts.open')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {selectedId ? (
        <Panel className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-flo-text font-medium">
                {t('inventoryCounts.detailTitle')}:{' '}
                <span className="font-mono text-caption">{selectedId}</span>
              </h2>
              {detail ? (
                <p className="text-caption text-flo-text-muted mt-1">
                  {t('inventoryCounts.columnStatus')}: {detail.status}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {detail?.status === 'draft' ? (
                <Button disabled={busy || lines.length === 0} onClick={() => void handleSubmit()}>
                  {t('inventoryCounts.submit')}
                </Button>
              ) : null}
              {detail?.status === 'submitted' ? (
                <Button disabled={busy} onClick={() => void handleApply()}>
                  {t('inventoryCounts.apply')}
                </Button>
              ) : null}
            </div>
          </div>

          {loadingDetail ? (
            <LoadingState label={t('inventoryCounts.loadingDetail')} className="min-h-[8rem]" />
          ) : (
            <>
              {detail?.status === 'draft' ? (
                <div className="flex flex-wrap items-end gap-3 border-b border-flo-border pb-4">
                  <div>
                    <label
                      htmlFor="countLineProduct"
                      className="block text-caption font-medium text-flo-text-muted uppercase mb-1"
                    >
                      {t('inventoryCounts.product')}
                    </label>
                    <select
                      id="countLineProduct"
                      className={inputClass}
                      value={lineProductId}
                      onChange={(e) => setLineProductId(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">{t('inventoryCounts.selectProduct')}</option>
                      {trackedProducts.map((product) => (
                        <option key={product.id} value={String(product.id)}>
                          {product.name}
                          {product.sku ? ` (${product.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="countLineQty"
                      className="block text-caption font-medium text-flo-text-muted uppercase mb-1"
                    >
                      {t('inventoryCounts.countedQty')}
                    </label>
                    <input
                      id="countLineQty"
                      type="text"
                      inputMode="decimal"
                      className={inputClass}
                      value={lineCountedQty}
                      onChange={(e) => setLineCountedQty(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <Button disabled={busy} onClick={() => void handleAddLine()}>
                    {t('inventoryCounts.addLine')}
                  </Button>
                </div>
              ) : null}

              {lines.length === 0 ? (
                <EmptyState title={t('inventoryCounts.noLines')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-small">
                    <thead>
                      <tr className="text-left text-flo-text-muted border-b border-flo-border">
                        <th className="p-2">{t('inventoryCounts.columnProduct')}</th>
                        <th className="p-2 text-right">{t('inventoryCounts.columnSystem')}</th>
                        <th className="p-2 text-right">{t('inventoryCounts.columnCounted')}</th>
                        <th className="p-2 text-right">{t('inventoryCounts.columnVariance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id} className="border-b border-flo-border/60">
                          <td className="p-2 text-flo-text">{productName(line.product_id)}</td>
                          <td className="p-2 text-right">{line.system_qty}</td>
                          <td className="p-2 text-right">{line.counted_qty}</td>
                          <td
                            className={`p-2 text-right font-semibold ${
                              line.variance < 0
                                ? 'text-flo-danger'
                                : line.variance > 0
                                  ? 'text-flo-success'
                                  : 'text-flo-text'
                            }`}
                          >
                            {line.variance > 0 ? `+${line.variance}` : line.variance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

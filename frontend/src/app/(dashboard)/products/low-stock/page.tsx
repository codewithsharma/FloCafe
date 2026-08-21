'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { isModuleEnabled } from '@/lib/modules';
import type { Product } from '@/lib/types';
import { fetchLowStockProducts } from '@/lib/low-stock';
import {
  canSubmitStockAdjust,
  parseStockAdjustQuantity,
  postProductStockAdjust,
  type StockAdjustAction,
  type WastageReason,
} from '@/lib/stock-adjust';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';
import { LowStockTable } from '@/components/products/LowStockTable';
import { StockAdjustmentDialog } from '@/components/products/StockAdjustmentDialog';

export default function LowStockPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(() => Boolean(isOwnerOrManager && inventoryEnabled));
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [stockAdjustAction, setStockAdjustAction] = useState<StockAdjustAction>('increase');
  const [stockAdjustQuantity, setStockAdjustQuantity] = useState('');
  const [stockAdjustWastageReason, setStockAdjustWastageReason] = useState<WastageReason>('OTHER');
  const [stockAdjusting, setStockAdjusting] = useState(false);
  const stockAdjustIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [isOwnerOrManager, router]);

  const loadLowStock = useCallback(async (signal?: AbortSignal) => {
    const rows = await fetchLowStockProducts(signal);
    setProducts(rows);
  }, []);

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        setLoading(true);
        await loadLowStock(controller.signal);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(t('lowStock.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isOwnerOrManager, inventoryEnabled, loadLowStock, t]);

  const openStockAdjust = (product: Product) => {
    if (!isOwnerOrManager || !product.track_inventory) return;
    stockAdjustIdempotencyKeyRef.current = null;
    setStockAdjustProduct(product);
    setStockAdjustAction('increase');
    setStockAdjustQuantity('');
    setStockAdjustWastageReason('OTHER');
  };

  const handleStockAdjust = async () => {
    if (!stockAdjustProduct) return;
    const quantity = parseStockAdjustQuantity(stockAdjustQuantity);
    if (quantity === null || !canSubmitStockAdjust(stockAdjustAction, stockAdjustQuantity)) return;
    if (!stockAdjustIdempotencyKeyRef.current) {
      stockAdjustIdempotencyKeyRef.current = crypto.randomUUID();
    }
    setStockAdjusting(true);
    try {
      const updated = await postProductStockAdjust(
        stockAdjustProduct.id,
        {
          action: stockAdjustAction,
          quantity,
          ...(stockAdjustAction === 'wastage' ? { wastage_reason: stockAdjustWastageReason } : {}),
        },
        stockAdjustIdempotencyKeyRef.current,
      );
      toast.success(t('stockAdjust.success'));
      stockAdjustIdempotencyKeyRef.current = null;
      setStockAdjustProduct(null);
      setStockAdjustQuantity('');
      setStockAdjustWastageReason('OTHER');
      const threshold = Number(
        updated.low_stock_threshold ?? stockAdjustProduct.low_stock_threshold ?? 0,
      );
      const stillLow =
        Boolean(updated.track_inventory ?? stockAdjustProduct.track_inventory) &&
        Number(updated.stock_quantity) <= threshold;
      setProducts((prev) => {
        if (!stillLow) return prev.filter((p) => p.id !== stockAdjustProduct.id);
        return prev.map((p) =>
          p.id === stockAdjustProduct.id
            ? {
                ...p,
                stock_quantity: Number(updated.stock_quantity ?? p.stock_quantity),
              }
            : p,
        );
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('stockAdjust.failed');
      toast.error(message);
    } finally {
      setStockAdjusting(false);
    }
  };

  if (!isOwnerOrManager) return null;

  if (!inventoryEnabled) {
    return (
      <div>
        <PageHeader title={t('lowStock.title')} />
        <Panel className="p-6">
          <p className="text-small text-flo-text-secondary">
            {t('inventoryMovements.moduleDisabled')}
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/products">{t('lowStock.backToProducts')}</Link>
          </Button>
        </Panel>
      </div>
    );
  }

  if (loading) {
    return <LoadingState label={t('lowStock.title')} className="min-h-[16rem]" />;
  }

  return (
    <div>
      <PageHeader
        title={t('lowStock.title')}
        description={t('lowStock.description')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/products">
              <ArrowLeft size={16} className="mr-1" />
              {t('lowStock.backToProducts')}
            </Link>
          </Button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="size-10" strokeWidth={1.5} />}
          title={t('lowStock.emptyTitle')}
          description={t('lowStock.emptyDescription')}
        />
      ) : (
        <LowStockTable
          products={products}
          isOwnerOrManager={isOwnerOrManager}
          onAdjustStock={openStockAdjust}
        />
      )}

      <StockAdjustmentDialog
        open={stockAdjustProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            stockAdjustIdempotencyKeyRef.current = null;
            setStockAdjustProduct(null);
            setStockAdjustQuantity('');
            setStockAdjustWastageReason('OTHER');
          }
        }}
        product={stockAdjustProduct}
        action={stockAdjustAction}
        onActionChange={setStockAdjustAction}
        quantity={stockAdjustQuantity}
        onQuantityChange={setStockAdjustQuantity}
        wastageReason={stockAdjustWastageReason}
        onWastageReasonChange={setStockAdjustWastageReason}
        onConfirm={handleStockAdjust}
        submitting={stockAdjusting}
      />
    </div>
  );
}

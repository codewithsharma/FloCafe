'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Plus, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { isModuleEnabled } from '@/lib/modules';
import { parseCurrencyInputToCents } from '@/lib/money';
import type { Product } from '@/lib/types';
import {
  addSupplierProduct,
  createPurchaseOrder,
  createSupplier,
  deactivateSupplier,
  formatPurchaseCents,
  getPurchaseOrder,
  listPurchaseOrderReceipts,
  listPurchaseOrders,
  listSupplierProducts,
  listSuppliers,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
  type PurchaseReceipt,
  type Supplier,
  type SupplierProductMapping,
} from '@/lib/purchasing';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const PURCHASE_UNITS = ['pcs', 'box', 'pack', 'kg', 'g', 'L', 'ml'] as const;
const PO_STATUSES: Array<PurchaseOrderStatus | ''> = [
  '',
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
];

type HubTab = 'suppliers' | 'orders';

const inputClass =
  'w-full rounded-flo-md border border-flo-border bg-flo-surface px-3 py-2 text-flo-text text-sm';

function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

export default function PurchasingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const fmt = useFormatCurrency();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const [tab, setTab] = useState<HubTab>('suppliers');
  const [loading, setLoading] = useState(() => Boolean(isOwnerOrManager && inventoryEnabled));
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<SupplierProductMapping[]>([]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');

  const [mapProductId, setMapProductId] = useState('');
  const [mapSku, setMapSku] = useState('');
  const [mapUnit, setMapUnit] = useState<string>('kg');
  const [mapCost, setMapCost] = useState('');

  const [poStatusFilter, setPoStatusFilter] = useState<PurchaseOrderStatus | ''>('');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [poDetail, setPoDetail] = useState<PurchaseOrder | null>(null);
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>([]);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loadingPoDetail, setLoadingPoDetail] = useState(false);

  const [poSupplierId, setPoSupplierId] = useState('');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poLineProductId, setPoLineProductId] = useState('');
  const [poLineUnit, setPoLineUnit] = useState('kg');
  const [poLineQty, setPoLineQty] = useState('');
  const [poLineCost, setPoLineCost] = useState('');
  const [poDraftLines, setPoDraftLines] = useState<
    Array<{
      product_id: string;
      purchase_unit: string;
      ordered_qty: number;
      unit_cost_cents: number;
      name?: string;
    }>
  >([]);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveQtyByLine, setReceiveQtyByLine] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [isOwnerOrManager, router]);

  const productName = useCallback(
    (productId: string): string => {
      const found = products.find((p) => String(p.id) === String(productId));
      return found?.name || productId;
    },
    [products],
  );

  const supplierNameById = useCallback(
    (id: string): string => {
      const found = suppliers.find((s) => s.id === id);
      return found?.name || id;
    },
    [suppliers],
  );

  const trackedProducts = useMemo(() => products.filter((p) => p.track_inventory), [products]);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => Number(s.is_active) === 1),
    [suppliers],
  );

  const refreshSuppliers = useCallback(async (signal?: AbortSignal) => {
    const rows = await listSuppliers(signal);
    setSuppliers(rows);
  }, []);

  const refreshOrders = useCallback(
    async (signal?: AbortSignal) => {
      const rows = await listPurchaseOrders({
        status: poStatusFilter || undefined,
        signal,
      });
      setPurchaseOrders(rows);
    },
    [poStatusFilter],
  );

  const loadMappings = useCallback(async (supplierId: string, signal?: AbortSignal) => {
    const rows = await listSupplierProducts(supplierId, signal);
    setMappings(rows);
  }, []);

  const loadPoDetail = useCallback(
    async (poId: string, signal?: AbortSignal) => {
      setLoadingPoDetail(true);
      try {
        const data = await getPurchaseOrder(poId, signal);
        setPoDetail(data.purchase_order);
        setPoLines(data.lines);
        const receiptRows = await listPurchaseOrderReceipts(poId, signal);
        setReceipts(receiptRows);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(apiError(err, t('purchasing.loadPoFailed')));
        setPoDetail(null);
        setPoLines([]);
        setReceipts([]);
      } finally {
        setLoadingPoDetail(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const ac = new AbortController();
    void (async () => {
      try {
        setLoading(true);
        const [, prodRes] = await Promise.all([
          refreshSuppliers(ac.signal),
          api.get('/products', { signal: ac.signal }),
        ]);
        setProducts((prodRes.data.products || []) as Product[]);
        await refreshOrders(ac.signal);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(apiError(err, t('purchasing.loadFailed')));
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [isOwnerOrManager, inventoryEnabled, refreshSuppliers, refreshOrders, t]);

  useEffect(() => {
    if (!selectedSupplierId || !isOwnerOrManager || !inventoryEnabled) {
      setMappings([]);
      return;
    }
    const ac = new AbortController();
    void loadMappings(selectedSupplierId, ac.signal).catch((err: unknown) => {
      if ((err as { name?: string })?.name === 'CanceledError') return;
      toast.error(apiError(err, t('purchasing.loadMappingsFailed')));
    });
    return () => ac.abort();
  }, [selectedSupplierId, isOwnerOrManager, inventoryEnabled, loadMappings, t]);

  useEffect(() => {
    if (!selectedPoId || !isOwnerOrManager || !inventoryEnabled) {
      setPoDetail(null);
      setPoLines([]);
      setReceipts([]);
      return;
    }
    const ac = new AbortController();
    void loadPoDetail(selectedPoId, ac.signal);
    return () => ac.abort();
  }, [selectedPoId, isOwnerOrManager, inventoryEnabled, loadPoDetail]);

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled || tab !== 'orders') return;
    const ac = new AbortController();
    void refreshOrders(ac.signal).catch((err: unknown) => {
      if ((err as { name?: string })?.name === 'CanceledError') return;
      toast.error(apiError(err, t('purchasing.loadFailed')));
    });
    return () => ac.abort();
  }, [poStatusFilter, tab, isOwnerOrManager, inventoryEnabled, refreshOrders, t]);

  async function handleCreateSupplier() {
    if (!supplierName.trim()) {
      toast.error(t('purchasing.supplierNameRequired'));
      return;
    }
    setBusy(true);
    try {
      const created = await createSupplier({
        name: supplierName.trim(),
        contact_name: supplierContact.trim() || null,
        phone: supplierPhone.trim() || null,
        email: supplierEmail.trim() || null,
        notes: supplierNotes.trim() || null,
      });
      toast.success(t('purchasing.supplierCreated'));
      setSupplierName('');
      setSupplierContact('');
      setSupplierPhone('');
      setSupplierEmail('');
      setSupplierNotes('');
      await refreshSuppliers();
      setSelectedSupplierId(created.id);
    } catch (err: unknown) {
      toast.error(apiError(err, t('purchasing.supplierCreateFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivateSupplier(id: string) {
    setBusy(true);
    try {
      await deactivateSupplier(id);
      toast.success(t('purchasing.supplierDeactivated'));
      await refreshSuppliers();
      if (selectedSupplierId === id) {
        await loadMappings(id);
      }
    } catch (err: unknown) {
      toast.error(apiError(err, t('purchasing.supplierDeactivateFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMapping() {
    if (!selectedSupplierId || !mapProductId) {
      toast.error(t('purchasing.mappingInvalid'));
      return;
    }
    let costCents: number | null = null;
    if (mapCost.trim()) {
      const parsed = parseCurrencyInputToCents(mapCost);
      if (!parsed.ok) {
        toast.error(t('purchasing.invalidCost'));
        return;
      }
      costCents = parsed.cents;
    }
    setBusy(true);
    try {
      await addSupplierProduct(selectedSupplierId, {
        product_id: mapProductId,
        supplier_sku: mapSku.trim() || null,
        purchase_unit: mapUnit,
        last_purchase_cost_cents: costCents,
      });
      toast.success(t('purchasing.mappingAdded'));
      setMapProductId('');
      setMapSku('');
      setMapCost('');
      await loadMappings(selectedSupplierId);
    } catch (err: unknown) {
      toast.error(apiError(err, t('purchasing.mappingFailed')));
    } finally {
      setBusy(false);
    }
  }

  function addPoDraftLine() {
    const qty = Number(poLineQty);
    const costParsed = parseCurrencyInputToCents(poLineCost);
    if (!poLineProductId || !(qty > 0) || !costParsed.ok) {
      toast.error(t('purchasing.poLineInvalid'));
      return;
    }
    setPoDraftLines((prev) => [
      ...prev.filter((l) => l.product_id !== poLineProductId),
      {
        product_id: poLineProductId,
        purchase_unit: poLineUnit,
        ordered_qty: qty,
        unit_cost_cents: costParsed.cents,
        name: productName(poLineProductId),
      },
    ]);
    setPoLineProductId('');
    setPoLineQty('');
    setPoLineCost('');
  }

  async function handleCreatePo() {
    if (!poSupplierId || poDraftLines.length === 0) {
      toast.error(t('purchasing.poCreateInvalid'));
      return;
    }
    setBusy(true);
    try {
      const created = await createPurchaseOrder({
        supplier_id: poSupplierId,
        expected_date: poExpectedDate.trim() || null,
        notes: poNotes.trim() || null,
        lines: poDraftLines.map((l) => ({
          product_id: l.product_id,
          purchase_unit: l.purchase_unit,
          ordered_qty: l.ordered_qty,
          unit_cost_cents: l.unit_cost_cents,
        })),
      });
      toast.success(t('purchasing.poCreated'));
      setPoSupplierId('');
      setPoExpectedDate('');
      setPoNotes('');
      setPoDraftLines([]);
      await refreshOrders();
      setSelectedPoId(created.purchase_order.id);
      setTab('orders');
    } catch (err: unknown) {
      toast.error(apiError(err, t('purchasing.poCreateFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handlePoStatus(status: 'ordered' | 'cancelled') {
    if (!selectedPoId) return;
    setBusy(true);
    try {
      await setPurchaseOrderStatus(selectedPoId, status);
      toast.success(status === 'ordered' ? t('purchasing.poOrdered') : t('purchasing.poCancelled'));
      await refreshOrders();
      await loadPoDetail(selectedPoId);
    } catch (err: unknown) {
      toast.error(apiError(err, t('purchasing.poStatusFailed')));
    } finally {
      setBusy(false);
    }
  }

  function openReceiveDialog() {
    const initial: Record<string, string> = {};
    for (const line of poLines) {
      const remaining = Number(line.remaining_qty);
      if (remaining > 0) {
        initial[line.id] = String(remaining);
      }
    }
    setReceiveQtyByLine(initial);
    setReceiveOpen(true);
  }

  async function handleReceive() {
    if (!selectedPoId) return;
    const lines = Object.entries(receiveQtyByLine)
      .map(([po_line_id, raw]) => ({ po_line_id, quantity: Number(raw) }))
      .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);
    if (lines.length === 0) {
      toast.error(t('purchasing.receiveInvalid'));
      return;
    }
    setBusy(true);
    try {
      await receivePurchaseOrder(selectedPoId, { lines }, crypto.randomUUID());
      toast.success(t('purchasing.receiveSuccess'));
      setReceiveOpen(false);
      await refreshOrders();
      await loadPoDetail(selectedPoId);
    } catch (err: unknown) {
      toast.error(apiError(err, t('purchasing.receiveFailed')));
    } finally {
      setBusy(false);
    }
  }

  const money = (cents: number | null | undefined): string => {
    if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
    try {
      return fmt(cents / 100);
    } catch {
      return formatPurchaseCents(cents);
    }
  };

  if (!isOwnerOrManager) {
    return <LoadingState label={t('purchasing.title')} className="min-h-[16rem]" />;
  }

  if (!inventoryEnabled) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title={t('purchasing.title')} />
        <EmptyState
          title={t('purchasing.moduleDisabled')}
          action={
            <Button asChild variant="outline">
              <Link href="/products">{t('purchasing.backToProducts')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loading) {
    return <LoadingState label={t('purchasing.title')} className="min-h-[16rem]" />;
  }

  const canReceive = poDetail?.status === 'ordered' || poDetail?.status === 'partially_received';
  const canOrder = poDetail?.status === 'draft';
  const canCancel = poDetail?.status === 'draft' || poDetail?.status === 'ordered';

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title={t('purchasing.title')}
        description={t('purchasing.description')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/products">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('purchasing.backToProducts')}
            </Link>
          </Button>
        }
      />

      <div className="flex gap-2 border-b border-flo-border pb-2">
        <Button
          size="sm"
          variant={tab === 'suppliers' ? 'default' : 'outline'}
          onClick={() => setTab('suppliers')}
        >
          <Truck className="mr-1 h-4 w-4" />
          {t('purchasing.tabSuppliers')}
        </Button>
        <Button
          size="sm"
          variant={tab === 'orders' ? 'default' : 'outline'}
          onClick={() => setTab('orders')}
        >
          <Package className="mr-1 h-4 w-4" />
          {t('purchasing.tabOrders')}
        </Button>
      </div>

      {tab === 'suppliers' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t('purchasing.suppliersList')}</h2>
            {suppliers.length === 0 ? (
              <EmptyState
                icon={<Truck className="size-10" strokeWidth={1.5} />}
                title={t('purchasing.suppliersEmpty')}
                description={t('purchasing.suppliersEmptyDesc')}
              />
            ) : (
              <ul className="divide-y rounded-md border border-flo-border">
                {suppliers.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedSupplierId(row.id)}
                    >
                      <div className="truncate font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {Number(row.is_active) === 1
                          ? t('purchasing.active')
                          : t('purchasing.inactive')}
                        {row.contact_name ? ` · ${row.contact_name}` : ''}
                      </div>
                    </button>
                    {Number(row.is_active) === 1 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void handleDeactivateSupplier(row.id)}
                      >
                        {t('purchasing.deactivate')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t('purchasing.createSupplier')}</h2>
            <label className="block text-xs">
              {t('purchasing.name')}
              <input
                className={`${inputClass} mt-1`}
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {t('purchasing.contact')}
              <input
                className={`${inputClass} mt-1`}
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {t('purchasing.phone')}
              <input
                className={`${inputClass} mt-1`}
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {t('purchasing.email')}
              <input
                className={`${inputClass} mt-1`}
                value={supplierEmail}
                onChange={(e) => setSupplierEmail(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {t('purchasing.notes')}
              <input
                className={`${inputClass} mt-1`}
                value={supplierNotes}
                onChange={(e) => setSupplierNotes(e.target.value)}
              />
            </label>
            <Button disabled={busy} onClick={() => void handleCreateSupplier()}>
              <Plus className="mr-1 h-4 w-4" />
              {t('purchasing.createSupplier')}
            </Button>
          </Panel>

          {selectedSupplierId ? (
            <Panel className="space-y-3 p-4 lg:col-span-2">
              <h2 className="text-sm font-semibold">
                {t('purchasing.mappingsTitle')}: {supplierNameById(selectedSupplierId)}
              </h2>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  className={inputClass}
                  value={mapProductId}
                  onChange={(e) => setMapProductId(e.target.value)}
                >
                  <option value="">{t('purchasing.selectProduct')}</option>
                  {trackedProducts.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder={t('purchasing.supplierSku')}
                  value={mapSku}
                  onChange={(e) => setMapSku(e.target.value)}
                />
                <select
                  className={inputClass}
                  value={mapUnit}
                  onChange={(e) => setMapUnit(e.target.value)}
                >
                  {PURCHASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder={t('purchasing.unitCost')}
                  value={mapCost}
                  onChange={(e) => setMapCost(e.target.value)}
                />
                <Button size="sm" disabled={busy} onClick={() => void handleAddMapping()}>
                  {t('purchasing.addMapping')}
                </Button>
              </div>
              {mappings.length === 0 ? (
                <EmptyState title={t('purchasing.mappingsEmpty')} />
              ) : (
                <ul className="divide-y rounded-md border border-flo-border text-sm">
                  {mappings.map((m) => (
                    <li
                      key={`${m.supplier_id}-${m.product_id}-${m.supplier_sku || ''}`}
                      className="px-3 py-2"
                    >
                      {m.product_name || productName(m.product_id)} · {m.purchase_unit}
                      {m.supplier_sku ? ` · ${m.supplier_sku}` : ''}
                      {m.last_purchase_cost_cents != null
                        ? ` · ${money(m.last_purchase_cost_cents)}`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t('purchasing.ordersList')}</h2>
                <select
                  className={`${inputClass} max-w-[12rem]`}
                  value={poStatusFilter}
                  onChange={(e) =>
                    setPoStatusFilter((e.target.value || '') as PurchaseOrderStatus | '')
                  }
                >
                  {PO_STATUSES.map((s) => (
                    <option key={s || 'all'} value={s}>
                      {s ? s : t('purchasing.allStatuses')}
                    </option>
                  ))}
                </select>
              </div>
              {purchaseOrders.length === 0 ? (
                <EmptyState
                  icon={<Package className="size-10" strokeWidth={1.5} />}
                  title={t('purchasing.ordersEmpty')}
                  description={t('purchasing.ordersEmptyDesc')}
                />
              ) : (
                <ul className="divide-y rounded-md border border-flo-border">
                  {purchaseOrders.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left ${
                          selectedPoId === row.id ? 'bg-flo-bg/80' : 'hover:bg-flo-bg/60'
                        }`}
                        onClick={() => setSelectedPoId(row.id)}
                      >
                        <div className="font-medium">{row.po_number || row.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.status} · {row.supplier_name || supplierNameById(row.supplier_id)} ·{' '}
                          {money(row.subtotal_cents)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t('purchasing.createPo')}</h2>
              <label className="block text-xs">
                {t('purchasing.supplier')}
                <select
                  className={`${inputClass} mt-1`}
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                >
                  <option value="">{t('purchasing.selectSupplier')}</option>
                  {activeSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                {t('purchasing.expectedDate')}
                <input
                  type="date"
                  className={`${inputClass} mt-1`}
                  value={poExpectedDate}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                />
              </label>
              <label className="block text-xs">
                {t('purchasing.notes')}
                <input
                  className={`${inputClass} mt-1`}
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <select
                  className={inputClass}
                  value={poLineProductId}
                  onChange={(e) => setPoLineProductId(e.target.value)}
                >
                  <option value="">{t('purchasing.selectProduct')}</option>
                  {trackedProducts.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={poLineUnit}
                  onChange={(e) => setPoLineUnit(e.target.value)}
                >
                  {PURCHASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder={t('purchasing.qty')}
                  value={poLineQty}
                  onChange={(e) => setPoLineQty(e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder={t('purchasing.unitCost')}
                  value={poLineCost}
                  onChange={(e) => setPoLineCost(e.target.value)}
                />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addPoDraftLine}>
                <Plus className="mr-1 h-4 w-4" />
                {t('purchasing.addLine')}
              </Button>
              {poDraftLines.length > 0 ? (
                <ul className="text-sm">
                  {poDraftLines.map((l) => (
                    <li key={l.product_id}>
                      {l.name || l.product_id}: {l.ordered_qty} {l.purchase_unit} @{' '}
                      {money(l.unit_cost_cents)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button disabled={busy} onClick={() => void handleCreatePo()}>
                {t('purchasing.createPo')}
              </Button>
            </Panel>
          </div>

          {selectedPoId ? (
            <Panel className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {t('purchasing.poDetail')}: {poDetail?.po_number || selectedPoId}
                  </h2>
                  {poDetail ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {poDetail.status} ·{' '}
                      {poDetail.supplier_name || supplierNameById(poDetail.supplier_id)} ·{' '}
                      {money(poDetail.subtotal_cents)}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canOrder ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void handlePoStatus('ordered')}
                    >
                      {t('purchasing.markOrdered')}
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handlePoStatus('cancelled')}
                    >
                      {t('purchasing.cancelPo')}
                    </Button>
                  ) : null}
                  {canReceive ? (
                    <Button size="sm" disabled={busy} onClick={openReceiveDialog}>
                      {t('purchasing.receive')}
                    </Button>
                  ) : null}
                </div>
              </div>

              {loadingPoDetail ? (
                <LoadingState label={t('purchasing.loadingPo')} className="min-h-[8rem]" />
              ) : poLines.length === 0 ? (
                <EmptyState title={t('purchasing.noLines')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-flo-border text-left text-muted-foreground">
                        <th className="p-2">{t('purchasing.product')}</th>
                        <th className="p-2 text-right">{t('purchasing.ordered')}</th>
                        <th className="p-2 text-right">{t('purchasing.received')}</th>
                        <th className="p-2 text-right">{t('purchasing.remaining')}</th>
                        <th className="p-2 text-right">{t('purchasing.unitCost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poLines.map((line) => (
                        <tr key={line.id} className="border-b border-flo-border/60">
                          <td className="p-2">
                            {line.product_name || productName(line.product_id)} (
                            {line.purchase_unit})
                          </td>
                          <td className="p-2 text-right">{line.ordered_qty}</td>
                          <td className="p-2 text-right">{line.received_qty}</td>
                          <td className="p-2 text-right font-medium">{line.remaining_qty}</td>
                          <td className="p-2 text-right">{money(line.unit_cost_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {receipts.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t('purchasing.receipts')}: {receipts.map((r) => r.id).join(', ')}
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      )}

      <Dialog open={receiveOpen} onOpenChange={(open) => !busy && setReceiveOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('purchasing.receiveTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{t('purchasing.receiveHint')}</p>
            {poLines
              .filter((l) => Number(l.remaining_qty) > 0)
              .map((line) => (
                <div
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-flo-border pb-2"
                >
                  <div className="text-sm">
                    <div className="font-medium">
                      {line.product_name || productName(line.product_id)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('purchasing.remaining')}: {line.remaining_qty} {line.purchase_unit}
                    </div>
                  </div>
                  <input
                    className={`${inputClass} max-w-[8rem]`}
                    inputMode="decimal"
                    value={receiveQtyByLine[line.id] ?? ''}
                    onChange={(e) =>
                      setReceiveQtyByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReceiveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void handleReceive()}>
              {t('purchasing.confirmReceive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

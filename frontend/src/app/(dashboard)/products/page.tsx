'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { Plus, FileSpreadsheet } from 'lucide-react';
import type { Product, Category, AddonGroup } from '@/lib/types';
import {
  ProductsTabBar,
  ProductsTable,
  CategoriesTable,
  AddonGroupsTable,
  ProductFormDialog,
  CategoryFormDialog,
  CategoryDeleteDialog,
  AddonGroupDialog,
  CsvImportDialog,
  BulkTaxDialog,
  parseProductsTab,
  type ProductsTabType,
} from '@/components/products';
import { PageHeader, LoadingState } from '@/components/flo';
import { getCurrencySymbol, getCountryByCode } from '@/lib/countries';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useConfirm } from '@/hooks/use-confirm';
import { useI18n } from '@/hooks/useI18n';

export default function ProductsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { currentTenant } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProductsTabType>(() => parseProductsTab(searchParams?.get('tab')) ?? 'products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [globalCashbackPercent, setGlobalCashbackPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const [editingAddonGroup, setEditingAddonGroup] = useState<AddonGroup | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '', is_active: true });
  const [addonForm, setAddonForm] = useState({ name: '', description: '', is_required: false, allow_multiple_quantities: false, min_selection: 0, max_selection: 10 });
  const [showAddonModal, setShowAddonModal] = useState(false);

  const [addonList, setAddonList] = useState<{ id?: number | string; name: string; price: number; is_active?: boolean }[]>([]);
  const [form, setForm] = useState({
    name: '', category_id: '', price: '', cost_price: '', cb_percent: '', sku: '', barcode: '',
    tax_category_id: '', tax_behavior: 'country_default', description: '',
    track_inventory: false, stock_quantity: '0', low_stock_threshold: '5', is_active: true,
    tags: [] as string[],
    customTag: '',
    addon_group_ids: [] as (number | string)[],
    image_url: null as string | null,
  });
  const [imageTouched, setImageTouched] = useState(false);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvType, setCsvType] = useState<'categories' | 'products' | 'addons'>('categories');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<Record<string, unknown> | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [catDeleteModal, setCatDeleteModal] = useState<{ open: boolean; id: number | null; name: string; productCount: number }>({ open: false, id: null, name: '', productCount: 0 });
  const [catReassignTo, setCatReassignTo] = useState<string>('');

  const [taxCategories, setTaxCategories] = useState<{ id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[]>([]);
  const [defaultTaxCategoryId, setDefaultTaxCategoryId] = useState('');
  const [showBulkTaxModal, setShowBulkTaxModal] = useState(false);
  const [bulkTaxCategoryId, setBulkTaxCategoryId] = useState('');
  const [bulkTaxApplying, setBulkTaxApplying] = useState(false);

  const currency = getCurrencySymbol(currentTenant?.currency || 'INR', getCountryByCode(currentTenant?.country ?? 'IN')?.locale);
  const fmt = useFormatCurrency();
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const isOwnerOrManager = currentTenant?.role === 'owner' || currentTenant?.role === 'manager';

  const fetchData = async () => {
    try {
      const requests: Promise<{ data: Record<string, unknown> }>[] = [
        api.get('/products'),
        api.get('/categories'),
      ];
      if (isRestaurant) requests.push(api.get('/addon-groups'));
      const [prodRes, catRes, agRes] = await Promise.all(requests);
      setProducts((prodRes.data.products as Product[]) || []);
      setCategories((catRes.data.categories as Category[]) || []);
      if (agRes) setAddonGroups((agRes.data.addon_groups as AddonGroup[]) || []);
    } catch {
      toast.error(t('products.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const requests: Promise<{ data: Record<string, unknown> }>[] = [
      api.get('/products', { signal: controller.signal }),
      api.get('/categories', { signal: controller.signal }),
    ];
    if (isRestaurant) requests.push(api.get('/addon-groups', { signal: controller.signal }));
    Promise.all(requests)
      .then(([prodRes, catRes, agRes]) => {
        setProducts((prodRes.data.products as Product[]) || []);
        setCategories((catRes.data.categories as Category[]) || []);
        if (agRes) setAddonGroups((agRes.data.addon_groups as AddonGroup[]) || []);
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))) toast.error(t('products.failedToLoad'));
      })
      .finally(() => { setLoading(false); });
    api.get('/tax/categories', { signal: controller.signal })
      .then((res) => {
        const data = res.data as { categories?: { id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[]; default_category_id?: string | null };
        setTaxCategories(data.categories || []);
        setDefaultTaxCategoryId(data.default_category_id || '');
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))) setTaxCategories([]);
      });
    api.get('/settings/loyalty', { signal: controller.signal })
      .then((res) => {
        setLoyaltyEnabled(!!res.data.loyalty_enabled);
        setGlobalCashbackPercent(Number(res.data.global_cashback_percent) || 0);
      })
      .catch(() => {});
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCsvModal = (type: 'categories' | 'products' | 'addons') => {
    setCsvType(type);
    setCsvFile(null);
    setCsvResult(null);
    setShowCsvModal(true);
  };

  const downloadCsv = async (path: string, filename: string) => {
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('common.downloadFailed'));
    }
  };

  const legacyProducts = products.filter((p) => !p.tax_category_id && p.is_active);

  const handleBulkTaxAssign = async () => {
    if (!bulkTaxCategoryId || legacyProducts.length === 0) return;
    setBulkTaxApplying(true);
    try {
      const results = await Promise.allSettled(
        legacyProducts.map((p) => api.put(`/products/${p.id}`, { tax_category_id: bulkTaxCategoryId })),
      );
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        toast.error(`Assigned category to ${results.length - failedCount} of ${results.length} products — ${failedCount} failed`);
      } else {
        toast.success(`Tax category assigned to ${results.length} product(s)`);
      }
      setShowBulkTaxModal(false);
      fetchData();
    } finally {
      setBulkTaxApplying(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const text = await csvFile.text();
      const res = await api.post(`/menu-csv/import/${csvType}`, { csv: text });
      setCsvResult(res.data);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('common.importFailed');
      toast.error(msg);
    } finally {
      setCsvUploading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '', category_id: '', price: '', cost_price: '', cb_percent: '', sku: '', barcode: '',
      tax_category_id: '', tax_behavior: 'country_default', description: '',
      track_inventory: false, stock_quantity: '0', low_stock_threshold: '5', is_active: true,
      tags: [], customTag: '', addon_group_ids: [], image_url: null,
    });
    setImageTouched(false);
    setEditingProduct(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setForm((current) => ({ ...current, tax_category_id: defaultTaxCategoryId }));
    setShowForm(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category_id: product.category_id != null ? String(product.category_id) : '',
      price: String(product.price),
      cost_price: String(product.cost_price || ''),
      cb_percent: product.cb_percent === null || product.cb_percent === undefined ? '' : String(product.cb_percent),
      sku: product.sku || '',
      barcode: product.barcode || '',
      tax_category_id: product.tax_category_id || '',
      tax_behavior: product.tax_behavior || 'country_default',
      description: product.description || '',
      track_inventory: product.track_inventory,
      stock_quantity: String(product.stock_quantity || '0'),
      low_stock_threshold: String(product.low_stock_threshold ?? '5'),
      is_active: product.is_active,
      tags: Array.isArray(product.tags) ? product.tags : [],
      customTag: '',
      addon_group_ids: product.addon_groups?.map((g) => g.id) || [],
      image_url: product.has_image ? 'EXISTING' : null,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loyaltyEnabled && form.cb_percent !== '') {
      const parsed = Number(form.cb_percent);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        toast.error('Please enter a valid loyalty cashback rate (0–100%)');
        return;
      }
    }
    try {
      const cbPercentVal: number | null = form.cb_percent === '' ? null : Number(form.cb_percent);

      const payload: Record<string, unknown> = {
        name: form.name,
        category_id: form.category_id || null,
        price: Number(form.price),
        cost_price: form.cost_price ? Number(form.cost_price) : null,
        cb_percent: cbPercentVal,
        sku: form.sku || null,
        barcode: form.barcode || null,
        tax_category_id: form.tax_category_id || null,
        tax_behavior: form.tax_category_id ? form.tax_behavior : 'country_default',
        description: form.description || null,
        track_inventory: form.track_inventory,
        stock_quantity: Number(form.stock_quantity),
        low_stock_threshold: Number(form.low_stock_threshold),
        is_active: form.is_active,
        tags: form.tags.length > 0 ? form.tags : null,
        addon_group_ids: form.addon_group_ids,
      };

      // Only include image_url when the user actually touched the image field
      // (avoids sending 50KB payloads when the image wasn't changed)
      if (imageTouched) {
        payload.image_url = form.image_url; // Can be a data URI or null (to clear)
      }

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success(t('products.updated'));
      } else {
        await api.post('/products', payload);
        toast.success(t('products.created'));
      }
      resetForm();
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { errors?: Record<string, string[]>; error?: string } } };
      const firstError = error.response?.data?.errors
        ? Object.values(error.response.data.errors)[0]?.[0]
        : error.response?.data?.error || t('products.failedToSave');
      toast.error(firstError);
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirm(t('products.deleteConfirm'), { destructive: true, confirmLabel: t('common.delete') })) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success(t('products.deleted'));
      fetchData();
    } catch {
      toast.error(t('common.failedToDelete'));
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({ name: '', description: '', color: '', is_active: true });
    setEditingCategory(null);
    setShowForm(false);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, description: cat.description || '', color: cat.color || '', is_active: cat.is_active });
    setShowForm(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: categoryForm.name, description: categoryForm.description || null, color: categoryForm.color || null, is_active: categoryForm.is_active };
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, payload);
        toast.success(t('products.categoryUpdated'));
      } else {
        await api.post('/categories', payload);
        toast.success(t('products.categoryCreated'));
      }
      resetCategoryForm();
      fetchData();
    } catch (err) {
      console.error('[Category] Save error:', err);
      toast.error(t('products.failedToSaveCategory'));
    }
  };

  const handleCategoryDelete = async (id: number, name: string) => {
    const productCount = products.filter(p => p.category_id === id).length;
    if (productCount > 0) {
      setCatReassignTo('');
      setCatDeleteModal({ open: true, id, name, productCount });
      return;
    }

    try {
      await api.delete(`/categories/${id}`);
      toast.success(t('products.categoryDeleted'));
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; productCount?: number } } };
      if (e?.response?.status === 400 && e?.response?.data?.productCount) {
        setCatReassignTo('');
        setCatDeleteModal({ open: true, id, name, productCount: e.response.data.productCount });
      } else {
        toast.error(e?.response?.data?.error || t('common.failedToDelete'));
      }
    }
  };

  const handleCategoryReassignDelete = async () => {
    if (!catDeleteModal.id || !catReassignTo) return;
    try {
      await api.delete(`/categories/${catDeleteModal.id}?action=reassign&reassign_to=${catReassignTo}`);
      toast.success(t('products.reassignAndDelete'));
      setCatDeleteModal({ open: false, id: null, name: '', productCount: 0 });
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || t('common.failedToDelete'));
    }
  };

  const handleCategoryForceDelete = async () => {
    if (!catDeleteModal.id) return;
    try {
      await api.delete(`/categories/${catDeleteModal.id}?action=delete_all`);
      toast.success(t('products.categoryAndProductsDeleted'));
      setCatDeleteModal({ open: false, id: null, name: '', productCount: 0 });
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || t('common.failedToDelete'));
    }
  };

  const resetAddonForm = () => {
    setAddonForm({ name: '', description: '', is_required: false, allow_multiple_quantities: false, min_selection: 0, max_selection: 10 });
    setEditingAddonGroup(null);
    setShowAddonModal(false);
    setAddonList([]);
  };

  const openEditAddonGroup = (group: AddonGroup) => {
    setEditingAddonGroup(group);
    setAddonForm({ name: group.name, description: group.description || '', is_required: Boolean(group.is_required), allow_multiple_quantities: Boolean(group.allow_multiple_quantities), min_selection: group.min_selection, max_selection: group.max_selection });
    setAddonList(group.addons?.map((a) => ({ id: a.id, name: a.name, price: a.price, is_active: Boolean(a.is_active) })) || []);
    setShowAddonModal(true);
  };

  const handleAddonGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: addonForm.name, description: addonForm.description || null, is_required: addonForm.is_required, allow_multiple_quantities: addonForm.allow_multiple_quantities, min_selection: addonForm.min_selection, max_selection: addonForm.max_selection, addons: addonList };
      if (editingAddonGroup) {
        await api.put(`/addon-groups/${editingAddonGroup.id}`, payload);
        toast.success(t('products.addonGroupUpdated'));
      } else {
        await api.post('/addon-groups', payload);
        toast.success(t('products.addonGroupCreated'));
      }
      resetAddonForm();
      fetchData();
    } catch { toast.error(t('products.failedToSaveAddonGroup')); }
  };

  const handleAddonGroupDelete = async (id: number | string) => {
    if (!await confirm(t('products.deleteAddonGroupConfirm'), { destructive: true, confirmLabel: t('common.delete') })) return;
    try {
      await api.delete(`/addon-groups/${id}`);
      toast.success(t('products.addonGroupDeleted'));
      fetchData();
    } catch { toast.error(t('common.failedToDelete')); }
  };

  const addAddonItem = () => setAddonList((prev) => [...prev, { name: '', price: 0 }]);
  const updateAddonItem = (idx: number, field: string, value: string | number) => setAddonList((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  const removeAddonItem = (idx: number) => setAddonList((prev) => prev.filter((_, i) => i !== idx));

  if (loading) {
    return <LoadingState label={t('products.title')} className="min-h-[16rem]" />;
  }

  return (
    <div>
      <PageHeader title={t('products.title')} />

      <ProductsTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRestaurant={isRestaurant}
        labels={{
          products: t('products.tabProducts'),
          categories: t('products.tabCategories'),
          addonGroups: t('products.tabAddonGroups'),
        }}
      />

      {activeTab === 'products' && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            {isOwnerOrManager && taxCategories.length > 0 && (
              <Button variant="outline" onClick={() => { setBulkTaxCategoryId(''); setShowBulkTaxModal(true); }}>
                Assign tax category
              </Button>
            )}
            <Button variant="outline" onClick={() => openCsvModal('products')}>
              <FileSpreadsheet size={16} className="mr-1" /> CSV
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-1" /> {t('products.addProduct')}
            </Button>
          </div>

      {/* Product Table */}
      <ProductsTable
        products={products}
        categories={categories}
        taxCategories={taxCategories}
        loyaltyEnabled={loyaltyEnabled}
        globalCashbackPercent={globalCashbackPercent}
        isOwnerOrManager={isOwnerOrManager}
        fmt={fmt}
        t={t}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <ProductFormDialog
        open={activeTab === 'products' && showForm}
        onOpenChange={(open) => !open && resetForm()}
        editing={editingProduct}
        form={form}
        onFormChange={setForm}
        onImageTouched={() => setImageTouched(true)}
        onSubmit={handleSubmit}
        categories={categories}
        addonGroups={addonGroups}
        taxCategories={taxCategories}
        loyaltyEnabled={loyaltyEnabled}
        globalCashbackPercent={globalCashbackPercent}
        isRestaurant={isRestaurant}
        currency={currency}
      />
        </>
      )}

      {activeTab === 'categories' && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" onClick={() => openCsvModal('categories')}>
              <FileSpreadsheet size={16} className="mr-1" /> CSV
            </Button>
            <Button onClick={() => { resetCategoryForm(); setShowForm(true); }}>
              <Plus size={16} className="mr-1" /> {t('products.addCategory')}
            </Button>
          </div>
          <CategoriesTable
            categories={categories}
            isOwnerOrManager={isOwnerOrManager}
            t={t}
            onEdit={openEditCategory}
            onDelete={handleCategoryDelete}
          />

          <CategoryFormDialog
            open={showForm}
            onOpenChange={(open) => !open && resetCategoryForm()}
            editing={!!editingCategory}
            form={categoryForm}
            onFormChange={setCategoryForm}
            onSubmit={handleCategorySubmit}
          />
        </>
      )}

      {activeTab === 'addons' && isRestaurant && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" onClick={() => openCsvModal('addons')}>
              <FileSpreadsheet size={16} className="mr-1" /> CSV
            </Button>
            <Button onClick={() => { resetAddonForm(); setShowAddonModal(true); }}>
              <Plus size={16} className="mr-1" /> {t('products.addAddonGroup')}
            </Button>
          </div>
          <AddonGroupsTable
            addonGroups={addonGroups}
            isOwnerOrManager={isOwnerOrManager}
            t={t}
            onEdit={openEditAddonGroup}
            onDelete={handleAddonGroupDelete}
          />

          <AddonGroupDialog
            open={showAddonModal}
            onOpenChange={(open) => !open && resetAddonForm()}
            editing={!!editingAddonGroup}
            form={addonForm}
            onFormChange={setAddonForm}
            addonList={addonList}
            onAddAddonItem={addAddonItem}
            onUpdateAddonItem={updateAddonItem}
            onRemoveAddonItem={removeAddonItem}
            onSubmit={handleAddonGroupSubmit}
          />
        </>
      )}

      <BulkTaxDialog
        open={showBulkTaxModal}
        onOpenChange={setShowBulkTaxModal}
        legacyProductCount={legacyProducts.length}
        taxCategories={taxCategories}
        bulkTaxCategoryId={bulkTaxCategoryId}
        onBulkTaxCategoryIdChange={setBulkTaxCategoryId}
        onApply={handleBulkTaxAssign}
        applying={bulkTaxApplying}
      />

      <CsvImportDialog
        open={showCsvModal}
        onOpenChange={setShowCsvModal}
        csvType={csvType}
        csvFile={csvFile}
        onCsvFileChange={(file) => {
          setCsvFile(file);
          setCsvResult(null);
        }}
        csvResult={csvResult}
        csvUploading={csvUploading}
        onDownload={downloadCsv}
        onUpload={handleCsvUpload}
      />

      <CategoryDeleteDialog
        open={catDeleteModal.open}
        onOpenChange={(open) => !open && setCatDeleteModal({ open: false, id: null, name: '', productCount: 0 })}
        categoryName={catDeleteModal.name}
        productCount={catDeleteModal.productCount}
        categories={categories}
        categoryId={catDeleteModal.id}
        reassignTo={catReassignTo}
        onReassignToChange={setCatReassignTo}
        onReassignDelete={handleCategoryReassignDelete}
        onForceDelete={handleCategoryForceDelete}
      />

      {ConfirmDialog}
    </div>
  );
}

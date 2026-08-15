'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChefHat, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { isModuleEnabled } from '@/lib/modules';
import type { Product } from '@/lib/types';
import {
  createRecipe,
  formatCents,
  getRecipeCost,
  listRecipes,
  replaceRecipeIngredients,
  setRecipeActive,
  type Recipe,
  type RecipeCostResult,
  type RecipeIngredient,
} from '@/lib/recipes';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';

const UNITS = ['pcs', 'box', 'pack', 'kg', 'g', 'L', 'ml'] as const;

export default function RecipesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const [recipes, setRecipes] = useState<Array<Recipe & { ingredients?: RecipeIngredient[] }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(() => Boolean(isOwnerOrManager && inventoryEnabled));
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cost, setCost] = useState<RecipeCostResult | null>(null);

  const [menuProductId, setMenuProductId] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [ingProductId, setIngProductId] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingUnit, setIngUnit] = useState<string>('g');
  const [draftLines, setDraftLines] = useState<
    Array<{ ingredient_product_id: string; quantity: number; unit: string; name?: string }>
  >([]);

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace('/pos');
    }
  }, [isOwnerOrManager, router]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const rows = await listRecipes(signal);
    setRecipes(rows);
  }, []);

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const [_, prodRes] = await Promise.all([
          refresh(ac.signal),
          api.get<Product[]>('/products', { signal: ac.signal }),
        ]);
        setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        toast.error(t('recipes.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [isOwnerOrManager, inventoryEnabled, refresh, t]);

  useEffect(() => {
    if (!selectedId) {
      setCost(null);
      return;
    }
    const ac = new AbortController();
    getRecipeCost(selectedId, ac.signal)
      .then(setCost)
      .catch(() => setCost(null));
    return () => ac.abort();
  }, [selectedId, recipes]);

  const selected = recipes.find((r) => r.id === selectedId) || null;

  async function handleCreate() {
    if (!menuProductId || !recipeName.trim() || draftLines.length === 0) {
      toast.error(t('recipes.createInvalid'));
      return;
    }
    const yq = Number(yieldQty);
    if (!(yq > 0)) {
      toast.error(t('recipes.createInvalid'));
      return;
    }
    setBusy(true);
    try {
      const created = await createRecipe({
        product_id: menuProductId,
        name: recipeName.trim(),
        yield_qty: yq,
        ingredients: draftLines.map((l, i) => ({
          ingredient_product_id: l.ingredient_product_id,
          quantity: l.quantity,
          unit: l.unit,
          position: i,
        })),
      });
      toast.success(t('recipes.createSuccess'));
      setMenuProductId('');
      setRecipeName('');
      setDraftLines([]);
      setSelectedId(created.recipe.id);
      await refresh();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          t('recipes.createFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  function addDraftLine() {
    const qty = Number(ingQty);
    if (!ingProductId || !(qty > 0)) {
      toast.error(t('recipes.lineInvalid'));
      return;
    }
    const prod = products.find((p) => String(p.id) === String(ingProductId));
    setDraftLines((prev) => [
      ...prev.filter((l) => l.ingredient_product_id !== ingProductId),
      {
        ingredient_product_id: ingProductId,
        quantity: qty,
        unit: ingUnit,
        name: prod?.name,
      },
    ]);
    setIngProductId('');
    setIngQty('');
  }

  async function saveSelectedIngredients() {
    if (!selected) return;
    const lines = (selected.ingredients || []).map((l, i) => ({
      ingredient_product_id: l.ingredient_product_id,
      quantity: Number(l.quantity),
      unit: l.unit,
      prep_loss_bps: Number(l.prep_loss_bps) || 0,
      position: i,
    }));
    setBusy(true);
    try {
      await replaceRecipeIngredients(selected.id, lines);
      toast.success(t('recipes.ingredientsSaved'));
      await refresh();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          t('recipes.saveFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(recipe: Recipe) {
    setBusy(true);
    try {
      await setRecipeActive(recipe.id, !recipe.is_active);
      await refresh();
    } catch {
      toast.error(t('recipes.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!isOwnerOrManager) {
    return <LoadingState label={t('recipes.title')} className="min-h-[16rem]" />;
  }

  if (!inventoryEnabled) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title={t('recipes.title')} />
        <EmptyState
          title={t('recipes.moduleDisabled')}
          action={
            <Button asChild variant="outline">
              <Link href="/products">{t('recipes.backToProducts')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loading) {
    return <LoadingState label={t('recipes.title')} className="min-h-[16rem]" />;
  }

  return (
    <div className="space-y-6 p-4">
      <PageHeader
        title={t('recipes.title')}
        description={t('recipes.description')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/products">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('recipes.backToProducts')}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('recipes.listTitle')}</h2>
          {recipes.length === 0 ? (
            <EmptyState
              icon={<ChefHat className="size-10" strokeWidth={1.5} />}
              title={t('recipes.emptyTitle')}
              description={t('recipes.emptyDescription')}
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {recipes.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <div className="truncate font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.is_active ? t('recipes.active') : t('recipes.inactive')} · yield{' '}
                      {row.yield_qty} {row.yield_unit}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => toggleActive(row)}
                  >
                    {row.is_active ? t('recipes.deactivate') : t('recipes.activate')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('recipes.createTitle')}</h2>
          <label className="block text-xs">
            {t('recipes.menuItem')}
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={menuProductId}
              onChange={(e) => setMenuProductId(e.target.value)}
            >
              <option value="">{t('recipes.selectProduct')}</option>
              {products.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            {t('recipes.name')}
            <input
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            {t('recipes.yield')}
            <input
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={yieldQty}
              onChange={(e) => setYieldQty(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={ingProductId}
              onChange={(e) => setIngProductId(e.target.value)}
            >
              <option value="">{t('recipes.ingredient')}</option>
              {products.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              placeholder={t('recipes.quantity')}
              value={ingQty}
              onChange={(e) => setIngQty(e.target.value)}
            />
            <select
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={ingUnit}
              onChange={(e) => setIngUnit(e.target.value)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={addDraftLine}>
            <Plus className="mr-1 h-4 w-4" />
            {t('recipes.addIngredient')}
          </Button>
          {draftLines.length > 0 && (
            <ul className="text-sm">
              {draftLines.map((l) => (
                <li key={l.ingredient_product_id}>
                  {l.name || l.ingredient_product_id}: {l.quantity} {l.unit}
                </li>
              ))}
            </ul>
          )}
          <Button disabled={busy} onClick={handleCreate}>
            {t('recipes.create')}
          </Button>
        </Panel>
      </div>

      {selected && (
        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">
            {t('recipes.detailTitle')}: {selected.name}
          </h2>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{t('recipes.costTitle')}</div>
            {!cost && <div className="text-muted-foreground">{t('recipes.costLoading')}</div>}
            {cost?.status === 'insufficient_data' && (
              <div className="text-amber-700 dark:text-amber-400">
                {t('recipes.costInsufficient')}
              </div>
            )}
            {cost?.status === 'ok' && (
              <div className="mt-1 space-y-1">
                <div>
                  {t('recipes.batchCost')}: {formatCents(cost.batchCostCents)}
                </div>
                <div>
                  {t('recipes.portionCost')}: {formatCents(cost.portionCostCents)}
                </div>
                <div>
                  {t('recipes.foodCostPct')}:{' '}
                  {cost.foodCostPercent == null ? '—' : `${cost.foodCostPercent}%`}
                </div>
              </div>
            )}
          </div>
          <ul className="divide-y rounded-md border text-sm">
            {(selected.ingredients || []).map((ing) => (
              <li key={ing.id} className="px-3 py-2">
                {ing.ingredient_name || ing.ingredient_product_id}: {ing.quantity} {ing.unit}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" disabled={busy} onClick={saveSelectedIngredients}>
            {t('recipes.saveIngredients')}
          </Button>
        </Panel>
      )}
    </div>
  );
}

'use client';

import { getLandingPageForRole } from '@/lib/rbac';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { isModuleEnabled } from '@/lib/modules';
import { parseDbTimestamp } from '@/lib/utils';
import { formatCents, listRecipeConsumptions, type RecipeConsumption } from '@/lib/recipes';
import { PageHeader, Panel, LoadingState, EmptyState } from '@/components/flo';
import { Button } from '@/components/ui/button';

const DEFAULT_LIMIT = 50;
const LIMIT_OPTIONS = [25, 50, 100, 200] as const;

function formatWhen(value: string): string {
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

function formatQtyDelta(delta: number): string {
  if (!Number.isFinite(delta)) return '—';
  const abs = Math.abs(delta);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(4).replace(/\.?0+$/, '');
  return delta < 0 ? `−${formatted}` : formatted;
}

export default function RecipeConsumptionsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const inventoryEnabled = isModuleEnabled('inventory');

  const initialOrder = searchParams?.get('order_id') || '';
  const [orderIdDraft, setOrderIdDraft] = useState(initialOrder);
  const [appliedOrderId, setAppliedOrderId] = useState(initialOrder);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [rows, setRows] = useState<RecipeConsumption[]>([]);
  const [loading, setLoading] = useState(() => Boolean(isOwnerOrManager && inventoryEnabled));
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isOwnerOrManager) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [isOwnerOrManager, router, currentTenant?.role]);

  useEffect(() => {
    if (!isOwnerOrManager || !inventoryEnabled) return;
    const ac = new AbortController();
    let cancelled = false;

    void (async () => {
      // Defer so setState is not synchronous inside the effect (React Compiler rule).
      await Promise.resolve();
      if (cancelled || ac.signal.aborted) return;
      setLoading(true);
      setError(null);
      try {
        const consumptions = await listRecipeConsumptions({
          orderId: appliedOrderId.trim() || undefined,
          limit,
          signal: ac.signal,
        });
        if (cancelled || ac.signal.aborted) return;
        setRows(consumptions);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError' || cancelled) return;
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          t('recipeConsumptions.loadFailed');
        setError(message);
        setRows([]);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [isOwnerOrManager, inventoryEnabled, appliedOrderId, limit, reloadToken, t]);

  const applyFilters = useCallback(() => {
    setAppliedOrderId(orderIdDraft.trim());
    setReloadToken((n) => n + 1);
  }, [orderIdDraft]);

  if (!isOwnerOrManager) {
    return <LoadingState />;
  }

  if (!inventoryEnabled) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={t('recipeConsumptions.title')}
          description={t('recipeConsumptions.description')}
        />
        <EmptyState
          title={t('recipes.moduleDisabled')}
          description={t('recipeConsumptions.moduleDisabledHint')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products/recipes">
            <ArrowLeft size={16} className="mr-1" /> {t('recipeConsumptions.backToRecipes')}
          </Link>
        </Button>
      </div>

      <PageHeader
        title={t('recipeConsumptions.title')}
        description={t('recipeConsumptions.description')}
      />

      <Panel className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('recipeConsumptions.filterOrder')}</span>
            <input
              className="h-9 min-w-[12rem] rounded-md border bg-background px-3"
              value={orderIdDraft}
              onChange={(e) => setOrderIdDraft(e.target.value)}
              placeholder={t('recipeConsumptions.orderPlaceholder')}
              aria-label={t('recipeConsumptions.filterOrder')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('recipeConsumptions.limit')}</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label={t('recipeConsumptions.limit')}
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" onClick={applyFilters} disabled={loading}>
            {t('recipeConsumptions.refresh')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('recipeConsumptions.filterHint')}</p>
      </Panel>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <Panel className="space-y-3 p-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={applyFilters}>
            {t('recipeConsumptions.retry')}
          </Button>
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('recipeConsumptions.emptyTitle')}
          description={t('recipeConsumptions.emptyDescription')}
          icon={<History className="h-10 w-10 text-muted-foreground" />}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Panel key={row.id} className="overflow-hidden">
              <div className="space-y-1 border-b bg-muted/30 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">
                    {t('recipeConsumptions.order')}: {row.order_id}
                  </span>
                  <span className="text-muted-foreground">
                    {t('recipeConsumptions.orderItem')}: {row.order_item_id}
                  </span>
                  <span
                    className={
                      row.status === 'reversed'
                        ? 'rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                        : 'rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
                    }
                  >
                    {row.status === 'reversed'
                      ? t('recipeConsumptions.statusReversed')
                      : t('recipeConsumptions.statusConsumed')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    {t('recipeConsumptions.recipe')}: {row.recipe_name || row.recipe_id}
                  </span>
                  <span>
                    {t('recipeConsumptions.portions')}: {row.portions}
                  </span>
                  <span>
                    {t('recipeConsumptions.when')}: {formatWhen(row.created_at)}
                  </span>
                  {row.actor_user_id ? (
                    <span>
                      {t('recipeConsumptions.actor')}: {row.actor_user_id}
                    </span>
                  ) : null}
                  {row.reversed_at ? (
                    <span>
                      {t('recipeConsumptions.reversedAt')}: {formatWhen(row.reversed_at)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">
                        {t('recipeConsumptions.ingredient')}
                      </th>
                      <th className="px-4 py-2 font-medium">{t('recipeConsumptions.qty')}</th>
                      <th className="px-4 py-2 font-medium">{t('recipeConsumptions.unit')}</th>
                      <th className="px-4 py-2 font-medium">{t('recipeConsumptions.unitCost')}</th>
                      <th className="px-4 py-2 font-medium">{t('recipeConsumptions.lineCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(row.lines || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-muted-foreground">
                          {t('recipeConsumptions.noLines')}
                        </td>
                      </tr>
                    ) : (
                      (row.lines || []).map((line) => (
                        <tr key={line.id} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            {line.ingredient_name || line.ingredient_product_id}
                          </td>
                          <td className="px-4 py-2 tabular-nums">
                            {formatQtyDelta(Number(line.quantity_delta))}
                          </td>
                          <td className="px-4 py-2">{line.unit}</td>
                          <td className="px-4 py-2 tabular-nums">
                            {formatCents(line.unit_cost_cents)}
                          </td>
                          <td className="px-4 py-2 tabular-nums">
                            {formatCents(line.line_cost_cents)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

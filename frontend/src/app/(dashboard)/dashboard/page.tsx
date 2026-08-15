'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import {
  Banknote,
  ChefHat,
  Clock,
  LayoutGrid,
  BarChart3,
  Wrench,
  ArrowRight,
  TrendingUp,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { usePlatformComposition } from '@/hooks/usePlatformComposition';
import toast from 'react-hot-toast';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import {
  PageHeader,
  Panel,
  MetricCard,
  AttentionStrip,
  LoadingState,
  type AttentionItem,
} from '@/components/flo';
import { isModuleEnabled } from '@/lib/modules';
import { fetchLowStockProducts } from '@/lib/low-stock';

interface DailyStats {
  sales: number;
  grossSales?: number;
  refunds?: number;
  netSales?: number;
  runningOrders: number;
  pendingOrders: number;
  tablesOccupied: number;
}

export default function DashboardPage() {
  const { currentTenant } = useAuthStore();
  const { data: composition } = usePlatformComposition(!!currentTenant);
  const verticalId = composition?.verticalId;
  const { t } = useI18n();
  const router = useRouter();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const isOwner = currentTenant?.role === 'owner';
  const fmt = useFormatCurrency();

  useEffect(() => {
    if (currentTenant && !isOwner) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [currentTenant, isOwner, router]);

  useEffect(() => {
    if (!isOwner) return;
    const controller = new AbortController();
    api
      .get('/reports/daily-stats', { signal: controller.signal })
      .then((res) => {
        setStats(res.data);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))
          return;
        toast.error(t('common.somethingWrong'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner || !isModuleEnabled('inventory', verticalId)) {
      return;
    }
    const controller = new AbortController();
    fetchLowStockProducts(controller.signal)
      .then((rows) => setLowStockCount(rows.length))
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))
          return;
      });
    return () => controller.abort();
  }, [isOwner, verticalId]);

  const attentionItems = useMemo((): AttentionItem[] => {
    if (!stats) return [];
    const items: AttentionItem[] = [];
    if (stats.pendingOrders > 0) {
      items.push({
        id: 'pending',
        label: t('dashboard.pendingOrders'),
        detail: String(stats.pendingOrders),
        href: '/orders',
        variant: 'warning',
        icon: Clock,
      });
    }
    if (stats.runningOrders > 0) {
      items.push({
        id: 'running',
        label: t('dashboard.runningOrders'),
        detail: String(stats.runningOrders),
        href: '/orders',
        variant: 'info',
        icon: ChefHat,
      });
    }
    if (stats.tablesOccupied > 0 && isModuleEnabled('tables', verticalId)) {
      items.push({
        id: 'tables',
        label: t('dashboard.tablesOccupied'),
        detail: String(stats.tablesOccupied),
        href: '/tables',
        variant: 'info',
        icon: LayoutGrid,
      });
    }
    if (lowStockCount > 0 && isModuleEnabled('inventory', verticalId)) {
      items.push({
        id: 'low-stock',
        label: t('lowStock.attentionLabel'),
        detail: String(lowStockCount),
        href: '/products/low-stock',
        variant: 'warning',
        icon: AlertTriangle,
      });
    }
    return items;
  }, [stats, t, verticalId, lowStockCount]);

  if (!isOwner) return null;

  const metricTiles = [
    {
      label: t('dashboard.grossSales'),
      value: fmt(stats?.grossSales ?? 0),
      icon: Banknote,
      href: '/reports',
      variant: 'success' as const,
    },
    {
      label: t('dashboard.refunds'),
      value: fmt(stats?.refunds ?? 0),
      icon: Wallet,
      href: '/reports',
      variant: 'warning' as const,
    },
    {
      label: t('dashboard.netSales'),
      value: fmt(stats?.netSales ?? stats?.sales ?? 0),
      icon: TrendingUp,
      href: '/reports',
      variant: 'info' as const,
    },
    {
      label: t('dashboard.runningOrders'),
      value: stats?.runningOrders ?? 0,
      icon: ChefHat,
      href: '/orders',
      variant: 'info' as const,
    },
    {
      label: t('dashboard.pendingOrders'),
      value: stats?.pendingOrders ?? 0,
      icon: Clock,
      href: '/orders',
      variant: 'warning' as const,
    },
    ...(isModuleEnabled('tables', verticalId)
      ? [
          {
            label: t('dashboard.tablesOccupied'),
            value: stats?.tablesOccupied ?? 0,
            icon: LayoutGrid,
            href: '/tables',
            variant: 'default' as const,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title={t('flo.home.title')} description={t('flo.home.todayDescription')} />

      {loading ? (
        <LoadingState className="py-20" />
      ) : (
        <>
          <AttentionStrip items={attentionItems} title={t('flo.home.needsAttention')} />

          <section className="mb-6" aria-label={t('flo.home.todayPerformance')}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {metricTiles.map((tile) => (
                <MetricCard
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  icon={tile.icon}
                  href={tile.href}
                  variant={tile.variant}
                />
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <BarChart3 className="size-4 text-flo-text-muted" aria-hidden />
                  {t('flo.home.openReports')}
                </span>
              }
              description={t('flo.reports.description')}
              actions={
                <Link
                  href="/reports"
                  className="inline-flex min-h-11 items-center gap-1 text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2 rounded-flo-sm"
                >
                  {t('flo.home.viewReports')} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            >
              <p className="text-body text-flo-text-muted">{t('flo.home.reportsHint')}</p>
            </Panel>

            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <Wrench className="size-4 text-flo-text-muted" aria-hidden />
                  {t('flo.home.openOperations')}
                </span>
              }
              description={t('flo.operations.description')}
              actions={
                <Link
                  href="/operations"
                  className="inline-flex min-h-11 items-center gap-1 text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2 rounded-flo-sm"
                >
                  {t('flo.home.viewOperations')} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            >
              <p className="text-body text-flo-text-muted">{t('flo.home.operationsHint')}</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

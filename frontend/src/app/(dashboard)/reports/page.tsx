'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import {
  Banknote,
  ChefHat,
  Clock,
  LayoutGrid,
  TrendingUp,
  ClipboardList,
  ArrowRight,
  Timer,
  Trophy,
  Tags,
  BarChart3,
  Wallet,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import toast from 'react-hot-toast';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { getCountryByCode } from '@/lib/countries';
import { PAYMENT_METHODS } from '@/lib/payment-methods';
import { isModuleEnabled } from '@/lib/modules';
import {
  PageHeader,
  Panel,
  MetricCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/flo';
import type { StatusBadgeVariant } from '@/lib/flo-display';
import { Input } from '@/components/ui/input';

interface PaymentMethodBreakdown {
  method: string | null;
  count: number;
  total: number;
}

interface DailyStats {
  sales: number;
  runningOrders: number;
  pendingOrders: number;
  tablesOccupied: number;
  paymentMethods: PaymentMethodBreakdown[];
}

interface DaySummary {
  date: string;
  orders: { count: number; total: number };
  bills: { count: number; total: number; collected: number };
  customers: { new: number };
  paymentMethods: PaymentMethodBreakdown[];
}

interface TopProduct {
  product_id: number;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

interface RecentOrder {
  id: number;
  order_number: string;
  status: string;
  total: number;
  customer_name: string | null;
  table_name: string | null;
  created_at: string;
}

interface TopStaff {
  user_id: string;
  name: string;
  role: string;
  revenue: number;
  orderCount: number;
}

interface TopCategory {
  category_id: string | null;
  name: string;
  quantity: number;
  revenue: number;
}

interface HourBucket {
  hour: number;
  orderCount: number;
}

interface DayBucket {
  dayIndex: number;
  orderCount: number;
}

interface Insights {
  windowDays: number;
  aov: number;
  avgPrepTimeMinutes: number | null;
  topStaff: TopStaff[];
  topCategories: TopCategory[];
  busiestHour: HourBucket | null;
  idlestHour: HourBucket | null;
  busiestDayOfWeek: DayBucket | null;
  idlestDayOfWeek: DayBucket | null;
}

const orderStatusVariant: Record<string, StatusBadgeVariant> = {
  pending: 'warning',
  preparing: 'info',
  ready: 'success',
  served: 'default',
  completed: 'secondary',
  cancelled: 'danger',
};

function getLocalDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatHourLabel(hour: number, locale: string): string {
  const reference = new Date(Date.UTC(2000, 0, 1, hour));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(reference);
}

function formatWeekdayLabel(dayIndex: number, locale: string): string {
  const reference = new Date(2000, 0, 2 + dayIndex);
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(reference);
}

function localizeTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? `{${k}}`));
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium"
    >
      {label} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

export default function ReportsPage() {
  const { currentTenant } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  const role = currentTenant?.role;
  const canView = role === 'owner' || role === 'manager';
  const fmt = useFormatCurrency();
  const locale = currentTenant?.country ? (getCountryByCode(currentTenant.country)?.locale ?? 'en-US') : 'en-US';
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayLocal = getLocalDateString(new Date(), timeZone);
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const isToday = selectedDate === todayLocal;

  useEffect(() => {
    if (currentTenant && !canView) {
      router.replace('/pos');
    }
  }, [currentTenant, canView, router]);

  const syncKey = `${canView}:${selectedDate}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (canView) setLoading(true);
  }

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    Promise.all([
      isToday ? api.get('/reports/daily-stats', { signal: controller.signal }) : api.get('/reports/summary', { params: { date: selectedDate }, signal: controller.signal }),
      api.get('/reports/topProducts', { params: { start_date: selectedDate, end_date: selectedDate, limit: 5 }, signal: controller.signal }),
      api.get('/reports/recentOrders', { params: { date: selectedDate, limit: 6 }, signal: controller.signal }),
      api.get('/reports/insights', { params: { days: 30 }, signal: controller.signal }),
    ])
      .then(([statsRes, topRes, recentRes, insightsRes]) => {
        setStats(isToday ? statsRes.data : null);
        setDaySummary(isToday ? null : statsRes.data.summary);
        setTopProducts(topRes.data.topProducts || []);
        setRecentOrders(recentRes.data.recentOrders || []);
        setInsights(insightsRes.data);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
        toast.error(t('common.somethingWrong'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedDate]);

  if (!canView) return null;

  const paymentMethods = isToday ? (stats?.paymentMethods ?? []) : (daySummary?.paymentMethods ?? []);
  const paymentMethodsTotal = paymentMethods.reduce((sum, pm) => sum + Number(pm.total), 0);

  const dateScopedTiles = isToday
    ? [
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
        ...(isModuleEnabled('tables')
          ? [{
              label: t('dashboard.tablesOccupied'),
              value: stats?.tablesOccupied ?? 0,
              icon: LayoutGrid,
              href: '/tables',
              variant: 'default' as const,
            }]
          : []),
      ]
    : [
        {
          label: t('dashboard.orders'),
          value: daySummary?.orders.count ?? 0,
          icon: ChefHat,
          href: '/orders',
          variant: 'info' as const,
        },
        {
          label: t('dashboard.newCustomers'),
          value: daySummary?.customers.new ?? 0,
          icon: Clock,
          href: '/customers',
          variant: 'default' as const,
        },
      ];

  const metricTiles = [
    {
      label: isToday ? t('dashboard.todaySales') : t('dashboard.sales'),
      value: fmt(isToday ? (stats?.sales ?? 0) : (daySummary?.bills.collected ?? 0)),
      icon: Banknote,
      href: '/orders',
      variant: 'success' as const,
    },
    ...dateScopedTiles,
    {
      label: t('dashboard.aov'),
      value: fmt(insights?.aov ?? 0),
      icon: TrendingUp,
      href: '/orders',
      variant: 'default' as const,
    },
    {
      label: t('dashboard.avgPrepTime'),
      value: insights?.avgPrepTimeMinutes != null
        ? localizeTemplate(t('dashboard.minutesValue'), { minutes: insights.avgPrepTimeMinutes })
        : '—',
      icon: Timer,
      href: '/orders',
      variant: 'default' as const,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('flo.reports.title')}
        description={isToday ? t('flo.reports.todayDescription') : t('flo.reports.dateDescription', { date: selectedDate })}
        actions={
          <Input
            type="date"
            value={selectedDate}
            max={todayLocal}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="min-h-11 w-auto border-flo-border"
            aria-label={t('dashboard.selectDate')}
          />
        }
      />

      {loading ? (
        <LoadingState className="py-20" />
      ) : (
        <>
          <section className="mb-6" aria-label={t('flo.reports.performance')}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <ClipboardList className="size-4 text-flo-text-muted" aria-hidden />
                  {isToday ? t('dashboard.recentOrders') : t('dashboard.orders')}
                </span>
              }
              actions={<PanelLink href="/orders" label={t('dashboard.viewAll')} />}
              className="overflow-hidden"
            >
              {recentOrders.length === 0 ? (
                <EmptyState title={t('dashboard.noOrdersYet')} className="min-h-[160px] py-6" />
              ) : (
                <ul className="divide-y divide-flo-border -mx-4 md:-mx-6 px-0">
                  {recentOrders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href="/orders"
                        className="flex min-h-11 items-center justify-between gap-3 px-4 md:px-6 py-2.5 hover:bg-flo-bg transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body font-medium text-flo-text">#{order.order_number}</span>
                            <StatusBadge variant={orderStatusVariant[order.status] ?? 'secondary'}>
                              {t(`orders.${order.status}` as 'orders.pending' | 'orders.preparing' | 'orders.ready' | 'orders.served' | 'orders.completed' | 'orders.cancelled')}
                            </StatusBadge>
                          </div>
                          <p className="text-caption text-flo-text-muted truncate">
                            {order.customer_name || order.table_name || t('dashboard.walkIn')}
                          </p>
                        </div>
                        <span className="text-numeric text-flo-text shrink-0">{fmt(Number(order.total))}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <TrendingUp className="size-4 text-flo-text-muted" aria-hidden />
                  {t('dashboard.topProductsToday')}
                </span>
              }
              actions={<PanelLink href="/products" label={t('dashboard.viewAll')} />}
            >
              {topProducts.length === 0 ? (
                <EmptyState title={t('dashboard.noSalesYet')} className="min-h-[160px] py-6" />
              ) : (
                <ul className="divide-y divide-flo-border -mx-4 md:-mx-6">
                  {topProducts.map((product) => (
                    <li key={product.product_id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
                      <div className="min-w-0">
                        <span className="text-body font-medium text-flo-text">{product.product_name}</span>
                        <p className="text-caption text-flo-text-muted">
                          {localizeTemplate(t('dashboard.productSoldOrders'), { quantity: product.total_quantity, orders: product.order_count })}
                        </p>
                      </div>
                      <span className="text-numeric text-flo-text shrink-0">{fmt(Number(product.total_revenue))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <Trophy className="size-4 text-flo-text-muted" aria-hidden />
                  {t('dashboard.topStaff')}
                </span>
              }
              actions={<PanelLink href="/staff" label={t('dashboard.viewAll')} />}
            >
              {(insights?.topStaff.length ?? 0) === 0 ? (
                <EmptyState title={t('dashboard.noSalesYet')} className="min-h-[160px] py-6" />
              ) : (
                <ul className="divide-y divide-flo-border -mx-4 md:-mx-6">
                  {insights!.topStaff.map((staff) => (
                    <li key={staff.user_id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
                      <div className="min-w-0">
                        <span className="text-body font-medium text-flo-text">{staff.name}</span>
                        <p className="text-caption text-flo-text-muted">
                          {localizeTemplate(t('dashboard.staffOrderCount'), { orders: staff.orderCount })}
                        </p>
                      </div>
                      <span className="text-numeric text-flo-text shrink-0">{fmt(Number(staff.revenue))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <Tags className="size-4 text-flo-text-muted" aria-hidden />
                  {t('dashboard.topCategories')}
                </span>
              }
            >
              {(insights?.topCategories.length ?? 0) === 0 ? (
                <EmptyState title={t('dashboard.noSalesYet')} className="min-h-[160px] py-6" />
              ) : (
                <ul className="divide-y divide-flo-border -mx-4 md:-mx-6">
                  {insights!.topCategories.map((category) => (
                    <li key={category.category_id ?? category.name} className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
                      <div className="min-w-0">
                        <span className="text-body font-medium text-flo-text">{category.name}</span>
                        <p className="text-caption text-flo-text-muted">
                          {localizeTemplate(t('dashboard.categoryQuantitySold'), { quantity: category.quantity })}
                        </p>
                      </div>
                      <span className="text-numeric text-flo-text shrink-0">{fmt(Number(category.revenue))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            className="mt-4"
            title={
              <span className="inline-flex items-center gap-2">
                <Wallet className="size-4 text-flo-text-muted" aria-hidden />
                {t('dashboard.paymentMethods')}
              </span>
            }
          >
            {paymentMethods.length === 0 ? (
              <EmptyState title={t('dashboard.noPaymentsYet')} className="min-h-[120px] py-6" />
            ) : (
              <div className="space-y-4">
                {paymentMethods.map((pm) => {
                  const meta = PAYMENT_METHODS.find((m) => m.key === pm.method);
                  const Icon = meta?.icon ?? Wallet;
                  const label = meta ? t(meta.labelKey) : pm.method === 'wallet' ? t('pos.methodWallet') : String(pm.method || t('common.unknown'));
                  const percent = paymentMethodsTotal > 0 ? Math.round((Number(pm.total) / paymentMethodsTotal) * 100) : 0;
                  return (
                    <div key={pm.method ?? 'unknown'}>
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="size-4 shrink-0 text-flo-text-muted" aria-hidden />
                          <span className="text-body font-medium text-flo-text truncate">{label}</span>
                        </div>
                        <span className="text-numeric text-flo-text shrink-0">{fmt(Number(pm.total))}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-flo-surface-muted rounded-full overflow-hidden">
                          <div className="h-full bg-flo-brand-600 rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-caption text-flo-text-muted shrink-0 tabular-nums">
                          {localizeTemplate(t('dashboard.paymentMethodCount'), { count: pm.count, percent })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            className="mt-4"
            title={
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="size-4 text-flo-text-muted" aria-hidden />
                {t('dashboard.businessPatterns')}
              </span>
            }
            description={localizeTemplate(t('dashboard.businessPatternsHint'), { days: insights?.windowDays ?? 30 })}
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: t('dashboard.busiestHour'), bucket: insights?.busiestHour, format: (h: number) => formatHourLabel(h, locale) },
                { label: t('dashboard.idlestHour'), bucket: insights?.idlestHour, format: (h: number) => formatHourLabel(h, locale) },
                { label: t('dashboard.busiestDay'), bucket: insights?.busiestDayOfWeek, format: (d: number) => formatWeekdayLabel(d, locale) },
                { label: t('dashboard.idlestDay'), bucket: insights?.idlestDayOfWeek, format: (d: number) => formatWeekdayLabel(d, locale) },
              ].map(({ label, bucket, format }) => (
                <div key={label}>
                  <p className="text-caption text-flo-text-muted mb-1">{label}</p>
                  <p className="text-h3 text-flo-text">
                    {bucket
                      ? 'hour' in bucket
                        ? format(bucket.hour)
                        : format(bucket.dayIndex)
                      : t('dashboard.notEnoughData')}
                  </p>
                  {bucket ? (
                    <p className="text-caption text-flo-text-muted">
                      {localizeTemplate(t('dashboard.ordersCount'), { count: bucket.orderCount })}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

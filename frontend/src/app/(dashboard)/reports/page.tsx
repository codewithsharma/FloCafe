'use client';
import { getLandingPageForRole } from '@/lib/rbac';

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
  BadgePercent,
  Users,
  Download,
  Loader2,
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
import { Button } from '@/components/ui/button';
import { downloadBillsCsvExport } from '@/lib/accounting-csv-export';
import { reportsCsvRangeError } from '@/lib/reports-date-range';
import {
  downloadTaxComponentsCsv,
  fetchTaxComponents,
  type TaxComponentsPayload,
} from '@/lib/tax-components-report';
import {
  downloadExpensesCsv,
  fetchOpsFinance,
  type OpsFinancePayload,
} from '@/lib/ops-finance-report';
import { fetchFoodCostReport, type FoodCostPayload } from '@/lib/food-cost-report';
import {
  downloadVoidsCsv,
  fetchVoidCancelReport,
  type VoidCancelPayload,
} from '@/lib/void-cancel-report';
import {
  downloadPaymentsCsv,
  fetchPaymentReport,
  type PaymentReportPayload,
} from '@/lib/payment-report';
import {
  downloadDiscountsCsv,
  fetchDiscountReport,
  type DiscountReportPayload,
} from '@/lib/discount-report';
import { downloadStaffCsv, fetchStaffReport, type StaffReportPayload } from '@/lib/staff-report';

interface PaymentMethodBreakdown {
  method: string | null;
  count: number;
  total: number;
}

interface DailyStats {
  sales: number;
  grossSales?: number;
  refunds?: number;
  netSales?: number;
  runningOrders: number;
  pendingOrders: number;
  tablesOccupied: number;
  paymentMethods: PaymentMethodBreakdown[];
}

interface DaySummary {
  date: string;
  orders: { count: number; total: number };
  bills: {
    count: number;
    total: number;
    collected: number;
    grossSales?: number;
    refunds?: number;
    netSales?: number;
  };
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
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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
  const [taxComponents, setTaxComponents] = useState<TaxComponentsPayload | null>(null);
  const [opsFinance, setOpsFinance] = useState<OpsFinancePayload | null>(null);
  const [foodCost, setFoodCost] = useState<FoodCostPayload | null>(null);
  const [voidsReport, setVoidsReport] = useState<VoidCancelPayload | null>(null);
  const [paymentReport, setPaymentReport] = useState<PaymentReportPayload | null>(null);
  const [discountReport, setDiscountReport] = useState<DiscountReportPayload | null>(null);
  const [staffReport, setStaffReport] = useState<StaffReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingTaxCsv, setExportingTaxCsv] = useState(false);
  const [exportingExpensesCsv, setExportingExpensesCsv] = useState(false);
  const [exportingVoidsCsv, setExportingVoidsCsv] = useState(false);
  const [exportingPaymentsCsv, setExportingPaymentsCsv] = useState(false);
  const [exportingDiscountsCsv, setExportingDiscountsCsv] = useState(false);
  const [exportingStaffCsv, setExportingStaffCsv] = useState(false);

  const role = currentTenant?.role;
  const canView = role === 'owner' || role === 'manager';
  const fmt = useFormatCurrency();
  const locale = currentTenant?.country
    ? (getCountryByCode(currentTenant.country)?.locale ?? 'en-US')
    : 'en-US';
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayLocal = getLocalDateString(new Date(), timeZone);
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [endDate, setEndDate] = useState(todayLocal);
  const isToday = selectedDate === todayLocal;

  useEffect(() => {
    if (currentTenant && !canView) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [currentTenant, canView, router]);

  const syncKey = `${canView}:${selectedDate}:${endDate}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (canView) setLoading(true);
  }

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    Promise.all([
      isToday
        ? api.get('/reports/daily-stats', { signal: controller.signal })
        : api.get('/reports/summary', {
            params: { date: selectedDate },
            signal: controller.signal,
          }),
      api.get('/reports/topProducts', {
        params: { start_date: selectedDate, end_date: endDate, limit: 5 },
        signal: controller.signal,
      }),
      api.get('/reports/recentOrders', {
        params: { date: selectedDate, limit: 6 },
        signal: controller.signal,
      }),
      api.get('/reports/insights', { params: { days: 30 }, signal: controller.signal }),
      fetchTaxComponents(selectedDate, endDate),
      fetchOpsFinance(selectedDate, endDate),
      fetchFoodCostReport(selectedDate, endDate),
      fetchVoidCancelReport(selectedDate, endDate),
      fetchPaymentReport(selectedDate, endDate),
      fetchDiscountReport(selectedDate, endDate),
      fetchStaffReport(selectedDate, endDate),
    ])
      .then(
        ([
          statsRes,
          topRes,
          recentRes,
          insightsRes,
          taxRes,
          opsRes,
          foodRes,
          voidsRes,
          paymentsRes,
          discountsRes,
          staffRes,
        ]) => {
          setStats(isToday ? statsRes.data : null);
          setDaySummary(isToday ? null : statsRes.data.summary);
          setTopProducts(topRes.data.topProducts || []);
          setRecentOrders(recentRes.data.recentOrders || []);
          setInsights(insightsRes.data);
          setTaxComponents(taxRes);
          setOpsFinance(opsRes);
          setFoodCost(foodRes);
          setVoidsReport(voidsRes);
          setPaymentReport(paymentsRes);
          setDiscountReport(discountsRes);
          setStaffReport(staffRes);
        },
      )
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
  }, [canView, selectedDate, endDate]);

  if (!canView) return null;

  const handleExportCsv = async () => {
    const rangeError = reportsCsvRangeError(selectedDate, endDate);
    if (rangeError) {
      toast.error(t('reports.exportRangeTooLong'));
      return;
    }
    setExportingCsv(true);
    try {
      await downloadBillsCsvExport(selectedDate, endDate);
      toast.success(t('reports.exportCsvSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.exportCsvFailed'));
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportTaxCsv = async () => {
    setExportingTaxCsv(true);
    try {
      await downloadTaxComponentsCsv(selectedDate, endDate);
      toast.success(t('reports.taxExportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.taxExportFailed'));
    } finally {
      setExportingTaxCsv(false);
    }
  };

  const handleExportExpensesCsv = async () => {
    setExportingExpensesCsv(true);
    try {
      await downloadExpensesCsv(selectedDate, endDate);
      toast.success(t('reports.expensesExportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.expensesExportFailed'));
    } finally {
      setExportingExpensesCsv(false);
    }
  };

  const handleExportVoidsCsv = async () => {
    setExportingVoidsCsv(true);
    try {
      await downloadVoidsCsv(selectedDate, endDate);
      toast.success(t('reports.voidsExportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.voidsExportFailed'));
    } finally {
      setExportingVoidsCsv(false);
    }
  };

  const handleExportPaymentsCsv = async () => {
    setExportingPaymentsCsv(true);
    try {
      await downloadPaymentsCsv(selectedDate, endDate);
      toast.success(t('reports.paymentsExportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.paymentsExportFailed'));
    } finally {
      setExportingPaymentsCsv(false);
    }
  };

  const handleExportDiscountsCsv = async () => {
    setExportingDiscountsCsv(true);
    try {
      await downloadDiscountsCsv(selectedDate, endDate);
      toast.success(t('reports.discountsExportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.discountsExportFailed'));
    } finally {
      setExportingDiscountsCsv(false);
    }
  };

  const handleExportStaffCsv = async () => {
    setExportingStaffCsv(true);
    try {
      await downloadStaffCsv(selectedDate, endDate);
      toast.success(t('reports.staffExportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reports.staffExportFailed'));
    } finally {
      setExportingStaffCsv(false);
    }
  };

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

  const grossSales = isToday ? (stats?.grossSales ?? 0) : (daySummary?.bills.grossSales ?? 0);
  const refundsTotal = isToday ? (stats?.refunds ?? 0) : (daySummary?.bills.refunds ?? 0);
  const netSales = isToday
    ? (stats?.netSales ?? stats?.sales ?? 0)
    : (daySummary?.bills.netSales ?? daySummary?.bills.collected ?? 0);

  const metricTiles = [
    {
      label: t('dashboard.grossSales'),
      value: fmt(grossSales),
      icon: Banknote,
      href: '/orders',
      variant: 'success' as const,
    },
    {
      label: t('dashboard.refunds'),
      value: fmt(refundsTotal),
      icon: Wallet,
      href: '/orders',
      variant: 'warning' as const,
    },
    {
      label: t('dashboard.netSales'),
      value: fmt(netSales),
      icon: TrendingUp,
      href: '/orders',
      variant: 'info' as const,
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
      value:
        insights?.avgPrepTimeMinutes != null
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
        description={
          isToday
            ? t('flo.reports.todayDescription')
            : t('flo.reports.dateDescription', { date: selectedDate })
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              max={todayLocal}
              onChange={(e) => {
                if (!e.target.value) return;
                setSelectedDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
              className="min-h-11 w-auto border-flo-border"
              aria-label={t('reports.exportStartDate')}
            />
            <Input
              type="date"
              value={endDate}
              min={selectedDate}
              max={todayLocal}
              onChange={(e) => e.target.value && setEndDate(e.target.value)}
              className="min-h-11 w-auto border-flo-border"
              aria-label={t('reports.exportEndDate')}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleExportCsv()}
              disabled={exportingCsv || loading}
              className="min-h-11"
            >
              {exportingCsv ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" aria-hidden />
                  {t('reports.exportingCsv')}
                </>
              ) : (
                <>
                  <Download className="size-4 mr-2" aria-hidden />
                  {t('reports.exportCsv')}
                </>
              )}
            </Button>
          </div>
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

          <section className="mb-6" aria-label={t('reports.opsFinanceTitle')}>
            <Panel
              title={t('reports.opsFinanceTitle')}
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportExpensesCsv()}
                  disabled={exportingExpensesCsv || loading}
                  className="min-h-11"
                >
                  {exportingExpensesCsv ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" aria-hidden />
                      {t('reports.expensesExporting')}
                    </>
                  ) : (
                    <>
                      <Download className="size-4 mr-2" aria-hidden />
                      {t('reports.expensesExportCsv')}
                    </>
                  )}
                </Button>
              }
            >
              {!opsFinance ? (
                <EmptyState title={t('reports.opsFinanceEmpty')} className="min-h-[120px] py-6" />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.opsGross')}
                      </p>
                      <p className="text-numeric-lg">{fmt(opsFinance.sales.grossSales)}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.opsRefunds')}
                      </p>
                      <p className="text-numeric-lg">{fmt(opsFinance.sales.refunds)}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">{t('reports.opsNet')}</p>
                      <p className="text-numeric-lg">{fmt(opsFinance.sales.netSales)}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.opsExpenses')}
                      </p>
                      <p className="text-numeric-lg">
                        {fmt(opsFinance.expenses.posted_total_cents / 100)}
                      </p>
                    </div>
                  </div>
                  <p className="text-caption text-flo-text-muted">
                    {t('reports.opsNetAfterExpenses', {
                      amount: fmt(opsFinance.net_after_expenses),
                    })}
                  </p>
                  {opsFinance.expenses.by_category.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 pr-3">{t('reports.opsColCategory')}</th>
                            <th className="py-2 pr-3">{t('reports.opsColCount')}</th>
                            <th className="py-2">{t('reports.opsColAmount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {opsFinance.expenses.by_category.map((row) => (
                            <tr key={row.category} className="border-b border-border/60">
                              <td className="py-2 pr-3">{row.category}</td>
                              <td className="py-2 pr-3">{row.count}</td>
                              <td className="py-2">{fmt(row.amount_cents / 100)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-body text-flo-text-secondary">
                      {t('reports.opsFinanceNoExpenses')}
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </section>

          <section className="mb-6" aria-label={t('reports.foodCostTitle')}>
            <Panel title={t('reports.foodCostTitle')}>
              {!foodCost ? (
                <EmptyState title={t('reports.foodCostEmpty')} className="min-h-[120px] py-6" />
              ) : (
                <div className="space-y-4">
                  <p className="text-caption text-flo-text-muted">{t('reports.foodCostClarity')}</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.foodCostNetSales')}
                      </p>
                      <p className="text-numeric-lg">{fmt(foodCost.net_sales)}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.foodCostCogs')}
                      </p>
                      <p className="text-numeric-lg">
                        {fmt(foodCost.theoretical_cogs_cents / 100)}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.foodCostPercent')}
                      </p>
                      <p className="text-numeric-lg">
                        {foodCost.food_cost_percent === null
                          ? '—'
                          : `${foodCost.food_cost_percent}%`}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.foodCostConsumptions')}
                      </p>
                      <p className="text-numeric-lg">{foodCost.consumption_count}</p>
                    </div>
                  </div>
                  {foodCost.insufficient_line_count > 0 ? (
                    <p className="text-caption text-flo-warning">
                      {t('reports.foodCostInsufficient', {
                        count: String(foodCost.insufficient_line_count),
                      })}
                    </p>
                  ) : null}
                  {foodCost.by_recipe.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 pr-3">{t('reports.foodCostColRecipe')}</th>
                            <th className="py-2 pr-3">{t('reports.foodCostColCount')}</th>
                            <th className="py-2">{t('reports.foodCostColCogs')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {foodCost.by_recipe.map((row) => (
                            <tr key={row.recipe_id} className="border-b border-border/60">
                              <td className="py-2 pr-3">{row.recipe_name}</td>
                              <td className="py-2 pr-3">{row.consumption_count}</td>
                              <td className="py-2">{fmt(row.theoretical_cogs_cents / 100)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-body text-flo-text-secondary">
                      {t('reports.foodCostNoRows')}
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </section>

          <section className="mb-6" aria-label={t('reports.voidsTitle')}>
            <Panel
              title={t('reports.voidsTitle')}
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportVoidsCsv()}
                  disabled={exportingVoidsCsv || loading}
                  className="min-h-11"
                >
                  {exportingVoidsCsv ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" aria-hidden />
                      {t('reports.voidsExporting')}
                    </>
                  ) : (
                    <>
                      <Download className="size-4 mr-2" aria-hidden />
                      {t('reports.voidsExportCsv')}
                    </>
                  )}
                </Button>
              }
            >
              {!voidsReport ? (
                <EmptyState title={t('reports.voidsEmpty')} className="min-h-[120px] py-6" />
              ) : (
                <div className="space-y-4">
                  <p className="text-caption text-flo-text-muted">{t('reports.voidsClarity')}</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.voidsTotal')}
                      </p>
                      <p className="text-numeric-lg">{voidsReport.total_count}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.voidsOrderCancelled')}
                      </p>
                      <p className="text-numeric-lg">{voidsReport.order_cancelled_count}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.voidsItemCancelled')}
                      </p>
                      <p className="text-numeric-lg">{voidsReport.item_cancelled_count}</p>
                    </div>
                    <div>
                      <p className="text-caption text-flo-text-muted mb-1">
                        {t('reports.voidsItemVoided')}
                      </p>
                      <p className="text-numeric-lg">{voidsReport.item_voided_count}</p>
                    </div>
                  </div>
                  {voidsReport.events.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="py-2 pr-3">{t('reports.voidsColWhen')}</th>
                            <th className="py-2 pr-3">{t('reports.voidsColAction')}</th>
                            <th className="py-2 pr-3">{t('reports.voidsColActor')}</th>
                            <th className="py-2">{t('reports.voidsColDetail')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {voidsReport.events.slice(0, 25).map((row) => (
                            <tr key={row.id} className="border-b border-border/60">
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {new Date(row.created_at).toLocaleString(locale, { timeZone })}
                              </td>
                              <td className="py-2 pr-3">{row.action}</td>
                              <td className="py-2 pr-3">{row.actor_name || '—'}</td>
                              <td className="py-2">
                                {row.product_name ||
                                  (row.order_id ? `Order ${row.order_id}` : row.entity_id) ||
                                  '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {voidsReport.events.length > 25 ? (
                        <p className="text-caption text-flo-text-muted mt-2">
                          {t('reports.voidsShowingFirst', { count: '25' })}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-body text-flo-text-secondary">{t('reports.voidsNoRows')}</p>
                  )}
                </div>
              )}
            </Panel>
          </section>

          <section className="mb-6" aria-label={t('reports.taxComponentsTitle')}>
            <Panel
              title={t('reports.taxComponentsTitle')}
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportTaxCsv()}
                  disabled={exportingTaxCsv || loading}
                  className="min-h-11"
                >
                  {exportingTaxCsv ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" aria-hidden />
                      {t('reports.taxExporting')}
                    </>
                  ) : (
                    <>
                      <Download className="size-4 mr-2" aria-hidden />
                      {t('reports.taxExportCsv')}
                    </>
                  )}
                </Button>
              }
            >
              {!taxComponents || taxComponents.components.length === 0 ? (
                <EmptyState
                  title={t('reports.taxComponentsEmpty')}
                  className="min-h-[120px] py-6"
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-caption text-flo-text-muted">
                    {t('reports.taxComponentsSummary', {
                      bills: String(taxComponents.billCount),
                      amount: fmt(taxComponents.taxAmount),
                    })}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 pr-3">{t('reports.taxColComponent')}</th>
                          <th className="py-2 pr-3">{t('reports.taxColRate')}</th>
                          <th className="py-2">{t('reports.taxColAmount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxComponents.components.map((row) => (
                          <tr
                            key={`${row.title}-${row.rate ?? 'n'}`}
                            className="border-b border-border/60"
                          >
                            <td className="py-2 pr-3">{row.title}</td>
                            <td className="py-2 pr-3">
                              {row.rate === null || row.rate === undefined ? '—' : `${row.rate}%`}
                            </td>
                            <td className="py-2">{fmt(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Panel>
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
                            <span className="text-body font-medium text-flo-text">
                              #{order.order_number}
                            </span>
                            <StatusBadge variant={orderStatusVariant[order.status] ?? 'secondary'}>
                              {t(
                                `orders.${order.status}` as
                                  | 'orders.pending'
                                  | 'orders.preparing'
                                  | 'orders.ready'
                                  | 'orders.served'
                                  | 'orders.completed'
                                  | 'orders.cancelled',
                              )}
                            </StatusBadge>
                          </div>
                          <p className="text-caption text-flo-text-muted truncate">
                            {order.customer_name || order.table_name || t('dashboard.walkIn')}
                          </p>
                        </div>
                        <span className="text-numeric text-flo-text shrink-0">
                          {fmt(Number(order.total))}
                        </span>
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
                    <li
                      key={product.product_id}
                      className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-body font-medium text-flo-text">
                          {product.product_name}
                        </span>
                        <p className="text-caption text-flo-text-muted">
                          {localizeTemplate(t('dashboard.productSoldOrders'), {
                            quantity: product.total_quantity,
                            orders: product.order_count,
                          })}
                        </p>
                      </div>
                      <span className="text-numeric text-flo-text shrink-0">
                        {fmt(Number(product.total_revenue))}
                      </span>
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
                    <li
                      key={staff.user_id}
                      className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-body font-medium text-flo-text">{staff.name}</span>
                        <p className="text-caption text-flo-text-muted">
                          {localizeTemplate(t('dashboard.staffOrderCount'), {
                            orders: staff.orderCount,
                          })}
                        </p>
                      </div>
                      <span className="text-numeric text-flo-text shrink-0">
                        {fmt(Number(staff.revenue))}
                      </span>
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
                    <li
                      key={category.category_id ?? category.name}
                      className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-body font-medium text-flo-text">{category.name}</span>
                        <p className="text-caption text-flo-text-muted">
                          {localizeTemplate(t('dashboard.categoryQuantitySold'), {
                            quantity: category.quantity,
                          })}
                        </p>
                      </div>
                      <span className="text-numeric text-flo-text shrink-0">
                        {fmt(Number(category.revenue))}
                      </span>
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
                {t('reports.paymentsTitle')}
              </span>
            }
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExportPaymentsCsv()}
                disabled={exportingPaymentsCsv || loading}
              >
                {exportingPaymentsCsv
                  ? t('reports.paymentsExporting')
                  : t('reports.paymentsExportCsv')}
              </Button>
            }
          >
            {!paymentReport ? (
              <EmptyState title={t('reports.paymentsEmpty')} className="min-h-[120px] py-6" />
            ) : paymentReport.payment_line_count === 0 && paymentReport.refund_count === 0 ? (
              <EmptyState title={t('reports.paymentsNoRows')} className="min-h-[120px] py-6" />
            ) : (
              <div className="space-y-4">
                <p className="text-caption text-flo-text-muted">{t('reports.paymentsClarity')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">{t('reports.paymentsGross')}</p>
                    <p className="text-numeric-lg">{fmt(paymentReport.payments_received)}</p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.paymentsRefunds')}
                    </p>
                    <p className="text-numeric-lg">{fmt(paymentReport.refunds)}</p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">{t('reports.paymentsNet')}</p>
                    <p className="text-numeric-lg">{fmt(paymentReport.net_payments)}</p>
                  </div>
                </div>
                {paymentReport.by_method.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-flo-border text-flo-text-muted">
                          <th className="py-2 pr-3">{t('reports.paymentsColMethod')}</th>
                          <th className="py-2 pr-3 text-right">{t('reports.paymentsColCount')}</th>
                          <th className="py-2 pr-3 text-right">
                            {t('reports.paymentsColReceived')}
                          </th>
                          <th className="py-2 pr-3 text-right">
                            {t('reports.paymentsColRefunds')}
                          </th>
                          <th className="py-2 text-right">{t('reports.paymentsColNet')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentReport.by_method.map((row) => {
                          const meta = PAYMENT_METHODS.find((m) => m.key === row.method);
                          const label = meta
                            ? t(meta.labelKey)
                            : row.method === 'wallet'
                              ? t('pos.methodWallet')
                              : String(row.method || t('common.unknown'));
                          return (
                            <tr key={row.method} className="border-b border-flo-border/60">
                              <td className="py-2 pr-3 font-medium text-flo-text">{label}</td>
                              <td className="py-2 pr-3 text-right text-numeric">
                                {row.payment_count}
                              </td>
                              <td className="py-2 pr-3 text-right text-numeric">
                                {fmt(row.payments_received)}
                              </td>
                              <td className="py-2 pr-3 text-right text-numeric">
                                {fmt(row.refunds)}
                              </td>
                              <td className="py-2 text-right text-numeric">
                                {fmt(row.net_payments)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="text-caption text-flo-text-muted">{t('reports.paymentsSalesNote')}</p>
              </div>
            )}
          </Panel>

          <Panel
            className="mt-4"
            title={
              <span className="inline-flex items-center gap-2">
                <BadgePercent className="size-4 text-flo-text-muted" aria-hidden />
                {t('reports.discountsTitle')}
              </span>
            }
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExportDiscountsCsv()}
                disabled={exportingDiscountsCsv || loading}
              >
                {exportingDiscountsCsv
                  ? t('reports.discountsExporting')
                  : t('reports.discountsExportCsv')}
              </Button>
            }
          >
            {!discountReport ? (
              <EmptyState title={t('reports.discountsEmpty')} className="min-h-[120px] py-6" />
            ) : discountReport.total_discounts === 0 &&
              discountReport.discounted_bill_count === 0 ? (
              <EmptyState title={t('reports.discountsNoRows')} className="min-h-[120px] py-6" />
            ) : (
              <div className="space-y-4">
                <p className="text-caption text-flo-text-muted">{t('reports.discountsClarity')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.discountsTotal')}
                    </p>
                    <p className="text-numeric-lg">{fmt(discountReport.total_discounts)}</p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.discountsOrders')}
                    </p>
                    <p className="text-numeric-lg">{discountReport.discounted_bill_count}</p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.discountsAverage')}
                    </p>
                    <p className="text-numeric-lg">{fmt(discountReport.average_discount)}</p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.discountsMerchandise')}
                    </p>
                    <p className="text-numeric-lg">{fmt(discountReport.merchandise_subtotal)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {discountReport.by_type.length > 0 ? (
                    <div className="overflow-x-auto">
                      <p className="text-caption text-flo-text-muted mb-2">
                        {t('reports.discountsByType')}
                      </p>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-flo-border text-flo-text-muted">
                            <th className="py-2 pr-3">{t('reports.discountsColType')}</th>
                            <th className="py-2 pr-3 text-right">
                              {t('reports.discountsColCount')}
                            </th>
                            <th className="py-2 text-right">{t('reports.discountsColAmount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discountReport.by_type.map((row) => (
                            <tr key={row.type} className="border-b border-flo-border/60">
                              <td className="py-2 pr-3 font-medium text-flo-text">
                                {row.type === 'percentage'
                                  ? t('reports.discountsTypePercentage')
                                  : row.type === 'amount'
                                    ? t('reports.discountsTypeFixed')
                                    : row.type}
                              </td>
                              <td className="py-2 pr-3 text-right text-numeric">{row.count}</td>
                              <td className="py-2 text-right text-numeric">{fmt(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {discountReport.by_source.length > 0 || discountReport.by_scope.length > 0 ? (
                    <div className="space-y-4">
                      {discountReport.by_source.length > 0 ? (
                        <div className="overflow-x-auto">
                          <p className="text-caption text-flo-text-muted mb-2">
                            {t('reports.discountsBySource')}
                          </p>
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-flo-border text-flo-text-muted">
                                <th className="py-2 pr-3">{t('reports.discountsColSource')}</th>
                                <th className="py-2 pr-3 text-right">
                                  {t('reports.discountsColCount')}
                                </th>
                                <th className="py-2 text-right">
                                  {t('reports.discountsColAmount')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {discountReport.by_source.map((row) => (
                                <tr key={row.source} className="border-b border-flo-border/60">
                                  <td className="py-2 pr-3 font-medium text-flo-text">
                                    {row.source === 'coupon'
                                      ? t('reports.discountsSourceCoupon')
                                      : t('reports.discountsSourceManual')}
                                  </td>
                                  <td className="py-2 pr-3 text-right text-numeric">{row.count}</td>
                                  <td className="py-2 text-right text-numeric">
                                    {fmt(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {discountReport.by_scope.length > 0 ? (
                        <div className="overflow-x-auto">
                          <p className="text-caption text-flo-text-muted mb-2">
                            {t('reports.discountsByScope')}
                          </p>
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-flo-border text-flo-text-muted">
                                <th className="py-2 pr-3">{t('reports.discountsColScope')}</th>
                                <th className="py-2 pr-3 text-right">
                                  {t('reports.discountsColCount')}
                                </th>
                                <th className="py-2 text-right">
                                  {t('reports.discountsColAmount')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {discountReport.by_scope.map((row) => (
                                <tr key={row.scope} className="border-b border-flo-border/60">
                                  <td className="py-2 pr-3 font-medium text-flo-text">
                                    {row.scope === 'order'
                                      ? t('reports.discountsScopeOrder')
                                      : t('reports.discountsScopeItem')}
                                  </td>
                                  <td className="py-2 pr-3 text-right text-numeric">{row.count}</td>
                                  <td className="py-2 text-right text-numeric">
                                    {fmt(row.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <p className="text-caption text-flo-text-muted">
                  {t('reports.discountsSalesNote')}
                </p>
              </div>
            )}
          </Panel>

          <Panel
            className="mt-4"
            title={
              <span className="inline-flex items-center gap-2">
                <Users className="size-4 text-flo-text-muted" aria-hidden />
                {t('reports.staffTitle')}
              </span>
            }
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleExportStaffCsv()}
                disabled={exportingStaffCsv || loading}
              >
                {exportingStaffCsv ? t('reports.staffExporting') : t('reports.staffExportCsv')}
              </Button>
            }
          >
            {!staffReport ? (
              <EmptyState title={t('reports.staffEmpty')} className="min-h-[120px] py-6" />
            ) : staffReport.totals.staff_count === 0 ? (
              <EmptyState title={t('reports.staffNoRows')} className="min-h-[120px] py-6" />
            ) : (
              <div className="space-y-4">
                <p className="text-caption text-flo-text-muted">{t('reports.staffClarity')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.staffOrdersCreated')}
                    </p>
                    <p className="text-numeric-lg">{staffReport.totals.orders_created}</p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">
                      {t('reports.staffSalesCreated')}
                    </p>
                    <p className="text-numeric-lg">
                      {fmt(staffReport.totals.sales_from_orders_created)}
                    </p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">{t('reports.staffPayments')}</p>
                    <p className="text-numeric-lg">
                      {fmt(staffReport.totals.payments_received_amount)}
                    </p>
                  </div>
                  <div className="rounded-flo-md border border-flo-border p-3">
                    <p className="text-caption text-flo-text-muted">{t('reports.staffRefunds')}</p>
                    <p className="text-numeric-lg">{fmt(staffReport.totals.refunds_amount)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-flo-border text-flo-text-muted">
                        <th className="py-2 pr-3">{t('reports.staffColStaff')}</th>
                        <th className="py-2 pr-3">{t('reports.staffColRole')}</th>
                        <th className="py-2 pr-3 text-right">{t('reports.staffColOrders')}</th>
                        <th className="py-2 pr-3 text-right">{t('reports.staffColSales')}</th>
                        <th className="py-2 pr-3 text-right">{t('reports.staffColPayments')}</th>
                        <th className="py-2 pr-3 text-right">{t('reports.staffColRefunds')}</th>
                        <th className="py-2 pr-3 text-right">{t('reports.staffColDiscounts')}</th>
                        <th className="py-2 pr-3 text-right">{t('reports.staffColVoids')}</th>
                        <th className="py-2 text-right">{t('reports.staffColShiftsOpened')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffReport.by_staff.map((row) => (
                        <tr key={row.staff_id} className="border-b border-flo-border/60">
                          <td className="py-2 pr-3 font-medium text-flo-text">{row.staff_name}</td>
                          <td className="py-2 pr-3 text-flo-text-secondary">{row.role}</td>
                          <td className="py-2 pr-3 text-right text-numeric">
                            {row.orders_created}
                          </td>
                          <td className="py-2 pr-3 text-right text-numeric">
                            {fmt(row.sales_from_orders_created)}
                          </td>
                          <td className="py-2 pr-3 text-right text-numeric">
                            {fmt(row.payments_received_amount)}
                          </td>
                          <td className="py-2 pr-3 text-right text-numeric">
                            {fmt(row.refunds_amount)}
                          </td>
                          <td className="py-2 pr-3 text-right text-numeric">
                            {row.discounts_applied_count}
                          </td>
                          <td className="py-2 pr-3 text-right text-numeric">
                            {row.voids_cancels_count}
                          </td>
                          <td className="py-2 text-right text-numeric">{row.shifts_opened}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-caption text-flo-text-muted">{t('reports.staffSalesNote')}</p>
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
            description={localizeTemplate(t('dashboard.businessPatternsHint'), {
              days: insights?.windowDays ?? 30,
            })}
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: t('dashboard.busiestHour'),
                  bucket: insights?.busiestHour,
                  format: (h: number) => formatHourLabel(h, locale),
                },
                {
                  label: t('dashboard.idlestHour'),
                  bucket: insights?.idlestHour,
                  format: (h: number) => formatHourLabel(h, locale),
                },
                {
                  label: t('dashboard.busiestDay'),
                  bucket: insights?.busiestDayOfWeek,
                  format: (d: number) => formatWeekdayLabel(d, locale),
                },
                {
                  label: t('dashboard.idlestDay'),
                  bucket: insights?.idlestDayOfWeek,
                  format: (d: number) => formatWeekdayLabel(d, locale),
                },
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

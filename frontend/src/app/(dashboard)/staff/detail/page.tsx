'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { PageHeader, Panel, LoadingState, StatusBadge } from '@/components/flo';
import { Button } from '@/components/ui/button';
import { staffRoleVariant } from '@/lib/flo-display';
import { fetchStaffDetail } from '@/lib/staff-workforce';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';

const ROLE_LABEL_KEY: Record<string, string> = {
  owner: 'staff.roleOwner',
  manager: 'staff.roleManager',
  cashier: 'staff.roleCashier',
  waiter: 'staff.roleWaiter',
  chef: 'staff.roleChef',
};

type StaffDetail = {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  is_active: number | boolean;
  has_pin?: number | boolean;
  created_at?: string;
  updated_at?: string;
  performance?: { orders_served?: number; total_sales?: number };
  recent_shifts?: Array<Record<string, unknown>>;
  open_shift_count?: number;
};

export default function StaffDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { currentTenant } = useAuthStore();
  const role = currentTenant?.role;
  const formatCurrency = useFormatCurrency();

  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== 'owner' && role !== 'manager') {
      router.replace(getLandingPageForRole(currentTenant?.role));
      return;
    }
    if (!id) {
      router.replace('/staff');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = (await fetchStaffDetail(id)) as StaffDetail;
        if (!cancelled) setStaff(data);
      } catch {
        toast.error(t('staff.failedToLoad'));
        router.replace('/staff');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, role, router, t]);

  if (loading || !staff) {
    return <LoadingState />;
  }

  const active = Boolean(staff.is_active);
  const shifts = staff.recent_shifts || [];
  const salesAmount = formatCurrency(Number(staff.performance?.total_sales || 0));

  return (
    <div className="space-y-4">
      <PageHeader
        title={staff.name}
        actions={
          <Button variant="outline" className="min-h-11" asChild>
            <Link href="/staff">
              <ArrowLeft size={16} className="mr-1" /> {t('common.back')}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t('staff.title')} description={staff.email || '—'}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <StatusBadge variant={staffRoleVariant(staff.role)} className="capitalize">
                {ROLE_LABEL_KEY[staff.role] ? t(ROLE_LABEL_KEY[staff.role]) : staff.role}
              </StatusBadge>
              <StatusBadge variant={active ? 'success' : 'danger'}>
                {active ? t('common.active') : t('common.inactive')}
              </StatusBadge>
            </div>
            <p className="text-flo-text-secondary">
              {t('staff.openShifts', { count: Number(staff.open_shift_count || 0) })}
            </p>
            {staff.created_at ? (
              <p className="text-flo-text-secondary">
                {t('common.created')} {String(staff.created_at)}
              </p>
            ) : null}
            {staff.updated_at ? (
              <p className="text-flo-text-secondary">
                {t('staff.updated', { date: String(staff.updated_at) })}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title={t('staff.today')}>
          <div className="space-y-1 text-sm">
            <p>
              {t('staff.ordersToday', { count: Number(staff.performance?.orders_served || 0) })}
            </p>
            <p>{t('staff.salesToday', { amount: salesAmount })}</p>
          </div>
        </Panel>
      </div>

      <Panel title={t('staff.shiftHistory')}>
        {shifts.length === 0 ? (
          <p className="text-sm text-flo-text-secondary">{t('staff.noShifts')}</p>
        ) : (
          <ul className="divide-y divide-flo-border text-sm">
            {shifts.map((s) => (
              <li key={String(s.id)} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  #{String(s.id)} · {String(s.status)} · {String(s.terminal_id)}
                </span>
                <span className="text-flo-text-secondary">{String(s.opened_at || '')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

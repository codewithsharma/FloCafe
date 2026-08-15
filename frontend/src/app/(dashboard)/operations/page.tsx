'use client';
import { getLandingPageForRole } from '@/lib/rbac';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import DayCloseCard from '@/components/dashboard/DayCloseCard';
import ShiftHistoryPanel from '@/components/shifts/ShiftHistoryPanel';
import { PageHeader, Panel } from '@/components/flo';

function getLocalDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function OperationsPage() {
  const { currentTenant } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();

  const role = currentTenant?.role;
  const canView = role === 'owner' || role === 'manager';
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayBusinessDate = getLocalDateString(new Date(), timeZone);
  const [selectedDate, setSelectedDate] = useState(todayBusinessDate);

  useEffect(() => {
    setSelectedDate(todayBusinessDate);
  }, [todayBusinessDate]);

  useEffect(() => {
    if (currentTenant && !canView) {
      router.replace(getLandingPageForRole(currentTenant?.role));
    }
  }, [currentTenant, canView, router]);

  if (!canView) return null;

  return (
    <div>
      <PageHeader title={t('flo.operations.title')} description={t('flo.operations.description')} />

      <section className="mb-4" aria-label={t('flo.operations.dayClose')}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-caption text-flo-text-muted" htmlFor="day-close-date">
            {t('dayClose.businessDate')}
          </label>
          <input
            id="day-close-date"
            type="date"
            className="min-h-11 rounded-flo-md border border-flo-border bg-flo-surface px-3 text-body"
            value={selectedDate}
            max={todayBusinessDate}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setSelectedDate(next);
            }}
          />
        </div>
        <DayCloseCard businessDate={selectedDate} todayBusinessDate={todayBusinessDate} />
      </section>

      <Panel title={t('flo.operations.shiftHistory')}>
        <ShiftHistoryPanel />
      </Panel>
    </div>
  );
}

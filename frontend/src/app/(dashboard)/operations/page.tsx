'use client';

import { useEffect } from 'react';
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
  const businessDate = getLocalDateString(new Date(), timeZone);

  useEffect(() => {
    if (currentTenant && !canView) {
      router.replace('/pos');
    }
  }, [currentTenant, canView, router]);

  if (!canView) return null;

  return (
    <div>
      <PageHeader
        title={t('flo.operations.title')}
        description={t('flo.operations.description')}
      />

      <section className="mb-4" aria-label={t('flo.operations.dayClose')}>
        <DayCloseCard businessDate={businessDate} />
      </section>

      <Panel title={t('flo.operations.shiftHistory')}>
        <ShiftHistoryPanel />
      </Panel>
    </div>
  );
}

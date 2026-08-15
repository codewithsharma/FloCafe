'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';

export function getLandingPage(): string {
  return '/pos';
}

const PUBLIC_PATHS = [
  '/kds',
  '/kds-standalone',
  '/auth/login',
  '/auth/register',
  '/auth/recover',
  '/setup',
  '/recovery',
  '/qr',
];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, currentTenant, loading, loadFromStorage } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState<boolean | null>(null);

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(p + '/'));
  const isSetupPath = pathname === '/setup' || pathname?.startsWith('/setup/');
  const isRecoveryPath = pathname === '/recovery' || pathname?.startsWith('/recovery/');
  const isKdsPath = pathname?.startsWith('/kds');

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (loading) return;

    if (!isKdsPath && (needsSetup === null || recoveryRequired === null)) {
      const controller = new AbortController();
      let active = true;
      api
        .get('/auth/setup/status', { signal: controller.signal })
        .then(({ data }) => {
          if (!active) return;
          const recovering = Boolean(data.recoveryRequired || data.recovery_required);
          setRecoveryRequired(recovering);
          setNeedsSetup(recovering ? false : Boolean(data.needsSetup));
        })
        .catch((err) => {
          if (
            !active ||
            (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))
          )
            return;
          console.error('[AuthGuard] Failed to check setup status:', err);
          // Fail closed toward recovery when unknown — never invent first-run.
          setRecoveryRequired(true);
          setNeedsSetup(false);
        });
      return () => {
        active = false;
        controller.abort();
      };
    }

    if (recoveryRequired && !isRecoveryPath) {
      router.push('/recovery');
      return;
    }

    if (recoveryRequired && isSetupPath) {
      router.push('/recovery');
      return;
    }

    if (!recoveryRequired && needsSetup && !isSetupPath) {
      router.push('/setup');
      return;
    }

    if (isPublicPath) return;

    if (!user) {
      router.push('/auth/login');
    } else if (!currentTenant) {
      router.push('/auth/login?select_tenant=true');
    }
  }, [
    loading,
    user,
    currentTenant,
    isPublicPath,
    isSetupPath,
    isRecoveryPath,
    isKdsPath,
    needsSetup,
    recoveryRequired,
    router,
  ]);

  if (isKdsPath || isSetupPath || isRecoveryPath) {
    return <>{children}</>;
  }

  if (
    loading ||
    needsSetup === null ||
    recoveryRequired === null ||
    needsSetup === true ||
    recoveryRequired === true
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-flo-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-flo-brand-600 border-t-transparent" />
          <p className="text-sm text-flo-text-secondary">{t('common.loadingScreen')}</p>
        </div>
      </div>
    );
  }

  if (isPublicPath) {
    return <>{children}</>;
  }

  if (!user || !currentTenant) return null;

  return <>{children}</>;
}

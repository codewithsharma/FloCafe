'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getLandingPage } from '@/components/layout/AuthGuard';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/flo';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import { ROLE_LABEL_KEYS, BUSINESS_TYPE_LABEL_KEYS } from '@/lib/i18n-enums';
import { Eye, EyeOff } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, selectTenant, user, tenants, currentTenant, loadFromStorage } = useAuthStore();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetch('/api/auth/setup/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.recoveryRequired || data?.recovery_required) {
          router.replace('/recovery');
          return;
        }
        if (data?.needsSetup) router.replace('/setup');
      })
      .catch(() => {});

    fetch('/api/health')
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!data) return;
        if (data.recovery_required || data.status === 'recovery_required') {
          router.replace('/recovery');
          return;
        }
        if (data.status !== 'ok') {
          setDbError(data.db || t('auth.dbErrorPrefix'));
        }
      })
      .catch(() => {});
  }, [router, t]);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const handleTenantSelect = useCallback(
    async (tenantId: number) => {
      setLoading(true);
      try {
        await selectTenant(tenantId);
      } catch {
        toast.error(t('auth.selectBusinessFailed'));
      } finally {
        setLoading(false);
      }
    },
    [selectTenant, t],
  );

  const autoSelectAttempted = useRef(false);

  useEffect(() => {
    let active = true;
    if (user && currentTenant) {
      router.push(getLandingPage(currentTenant.role));
    } else if (user && tenants.length === 1 && !autoSelectAttempted.current) {
      autoSelectAttempted.current = true;
      selectTenant(tenants[0].id)
        .catch(() => {
          if (active) toast.error(t('auth.selectBusinessFailed'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [user, tenants, currentTenant, router, selectTenant, t]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      await login(email, password, rememberMe);
      toast.success(t('auth.signInSuccess'));
    } catch (err: unknown) {
      const error = err as {
        response?: {
          status?: number;
          data?: { error?: string; attempts_remaining?: number; lockout_minutes?: number };
        };
      };
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 401) {
        const remaining = data?.attempts_remaining;
        if (remaining === 0) {
          const mins = data?.lockout_minutes ?? 15;
          setLoginError(t('auth.lockedOut').replace('{minutes}', String(mins)));
        } else if (typeof remaining === 'number' && remaining < 4) {
          setLoginError(
            t('auth.invalidCredentials') +
              ' ' +
              t('auth.attemptsRemaining').replace('{count}', String(remaining)),
          );
        } else {
          setLoginError(t('auth.invalidCredentials'));
        }
      } else if (status === 429) {
        const msg = data?.error || t('auth.lockedOut').replace('{minutes}', '15');
        setLoginError(msg);
      } else {
        const msg = data?.error || t('auth.loginFailed');
        setDbError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const shouldShowTenantSelect = !!(
    user &&
    (tenants.length > 1 || searchParams.get('select_tenant') === 'true')
  );

  if (shouldShowTenantSelect) {
    return (
      <AuthShell title={t('auth.selectBusiness')} subtitle={t('auth.selectBusinessHint')}>
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => handleTenantSelect(tenant.id)}
              disabled={loading}
              className="w-full rounded-flo-lg border border-flo-border bg-flo-surface p-4 text-left transition-colors hover:border-flo-brand-500 hover:bg-flo-brand-50/50 disabled:opacity-50 group"
            >
              <div className="font-semibold text-flo-text group-hover:text-flo-brand-700">
                {tenant.business_name}
              </div>
              <div className="text-sm text-flo-text-secondary mt-0.5">
                {t(
                  BUSINESS_TYPE_LABEL_KEYS[tenant.business_type ?? ''] ??
                    tenant.business_type ??
                    '',
                )}{' '}
                &middot; {t(ROLE_LABEL_KEYS[tenant.role ?? ''] ?? tenant.role ?? '')}
              </div>
            </button>
          ))}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      subtitle={t('auth.signInTitle')}
      alert={
        dbError ? (
          <div className="rounded-flo-lg border border-flo-danger/30 bg-flo-danger-subtle px-4 py-3 text-sm text-flo-danger">
            <strong>{t('auth.dbErrorPrefix')}</strong> {dbError}
          </div>
        ) : null
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.password')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-flo-text-secondary select-none cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
          />
          {t('auth.rememberMe')}
        </label>
        {loginError && <p className="text-sm text-flo-danger text-center">{loginError}</p>}
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
        <button
          type="button"
          onClick={() => router.push('/auth/recover')}
          className="w-full text-center text-sm text-flo-text-secondary hover:text-flo-text transition-colors"
        >
          {t('auth.forgotPasswordLink')}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

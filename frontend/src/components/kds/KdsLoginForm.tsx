'use client';

import { ChefHat } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { UseKdsConnectionResult } from '@/hooks/useKdsConnection';
import { AuthShell } from '@/components/flo';

export function KdsLoginForm({ conn }: { conn: UseKdsConnectionResult }) {
  const { t } = useI18n();
  return (
    <AuthShell
      icon={<ChefHat size={48} className="text-flo-brand-600" />}
      title={t('kds.title')}
      subtitle={t('kds.loginSubtitle')}
      footer={<p className="text-xs text-flo-text-muted text-center">{t('kds.loginHint')}</p>}
      alert={
        conn.loginError ? (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-flo-md border border-flo-danger/30 bg-flo-danger-subtle px-4 py-3 text-sm text-flo-danger"
          >
            {conn.loginError}
          </div>
        ) : undefined
      }
    >
      <form data-testid="kds-login-form" onSubmit={conn.handleLogin} className="space-y-4">
        <div>
          <label htmlFor="kds-login-email" className="mb-1 block text-sm font-medium text-flo-text">
            {t('auth.email')}
          </label>
          <input
            id="kds-login-email"
            data-testid="kds-login-email"
            type="email"
            value={conn.loginEmail}
            onChange={(e) => conn.setLoginEmail(e.target.value)}
            className="w-full min-h-11 rounded-flo-md border border-flo-border bg-flo-surface px-4 py-2 text-flo-text focus:border-flo-brand-500 focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            placeholder="chef@flo.local"
            required
          />
        </div>

        <div>
          <label
            htmlFor="kds-login-password"
            className="mb-1 block text-sm font-medium text-flo-text"
          >
            {t('auth.password')}
          </label>
          <input
            id="kds-login-password"
            data-testid="kds-login-password"
            type="password"
            value={conn.loginPassword}
            onChange={(e) => conn.setLoginPassword(e.target.value)}
            className="w-full min-h-11 rounded-flo-md border border-flo-border bg-flo-surface px-4 py-2 text-flo-text focus:border-flo-brand-500 focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            placeholder="••••••••"
            required
          />
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-flo-text-secondary">
          <input
            type="checkbox"
            checked={conn.rememberMe}
            onChange={(e) => conn.setRememberMe(e.target.checked)}
            className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
          />
          {t('auth.rememberMe')}
        </label>

        <button
          data-testid="kds-login-submit"
          type="submit"
          disabled={conn.loginLoading}
          className="w-full min-h-11 rounded-flo-md bg-flo-brand-600 py-3 font-semibold text-white hover:bg-flo-brand-700 disabled:opacity-50"
        >
          {conn.loginLoading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </AuthShell>
  );
}

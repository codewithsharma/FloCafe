'use client';

/**
 * App providers: TanStack Query + i18next.
 * Zustand stores remain separate (client/UI state).
 */

import { type ReactNode, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { QueryProvider } from '@/lib/query-client';
import { getI18nInstance, syncI18nLanguage } from '@/lib/i18n/i18next';
import { usePosSettingsStore } from '@/store/pos-settings';

function I18nLanguageSync({ children }: { children: ReactNode }) {
  const language = usePosSettingsStore((s) => s.language);
  useEffect(() => {
    syncI18nLanguage(language);
  }, [language]);
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <I18nextProvider i18n={getI18nInstance()}>
        <I18nLanguageSync>{children}</I18nLanguageSync>
      </I18nextProvider>
    </QueryProvider>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  applyTheme,
  cycleTheme,
  getStoredTheme,
  setTheme,
  type FloThemePreference,
} from '@/lib/theme';

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

/**
 * Cycles light → dark → system. Persists to localStorage `flo_theme`.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const [preference, setPreference] = useState<FloThemePreference>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const Icon = ICONS[preference];
  const labelKey =
    preference === 'light'
      ? 'flo.theme.light'
      : preference === 'dark'
        ? 'flo.theme.dark'
        : 'flo.theme.system';

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => {
          const next = cycleTheme(preference);
          setPreference(next);
          setTheme(next);
        }}
        tooltip={t('flo.theme.toggle')}
        aria-label={t('flo.theme.toggle')}
      >
        <Icon aria-hidden />
        <span>{t(labelKey)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default ThemeToggle;

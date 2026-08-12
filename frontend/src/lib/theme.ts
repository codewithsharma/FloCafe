export const FLO_THEME_KEY = 'flo_theme';

export type FloThemePreference = 'light' | 'dark' | 'system';
export type FloResolvedTheme = 'light' | 'dark';

const PREFERENCES: readonly FloThemePreference[] = ['light', 'dark', 'system'];

export function isFloThemePreference(value: unknown): value is FloThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

export function getStoredTheme(): FloThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(FLO_THEME_KEY);
    return isFloThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference: FloThemePreference): FloResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(preference: FloThemePreference): FloResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }
  return resolved;
}

export function setTheme(preference: FloThemePreference): FloResolvedTheme {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FLO_THEME_KEY, preference);
    } catch {
      // ignore quota / private mode
    }
  }
  return applyTheme(preference);
}

export function cycleTheme(current: FloThemePreference): FloThemePreference {
  const idx = PREFERENCES.indexOf(current);
  return PREFERENCES[(idx + 1) % PREFERENCES.length];
}

/** Apply stored preference (call on app load). */
export function initTheme(): FloThemePreference {
  const preference = getStoredTheme();
  applyTheme(preference);
  return preference;
}

/** Inline bootstrap for root layout — keep in sync with applyTheme/resolveTheme. */
export const FLO_THEME_BOOTSTRAP = `(function(){try{var k='flo_theme';var t=localStorage.getItem(k)||'system';var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

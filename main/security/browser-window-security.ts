/**
 * P0.6 Phase A — primary renderer BrowserWindow preferences + navigation guards.
 *
 * Keeps Chromium renderer sandbox enabled. Native modules (SQLite, printers)
 * remain in the main process and do not require sandbox:false.
 */

import type { WebContents, WebPreferences } from 'electron';
import { isAllowedRendererNavigation } from './url-allowlist';

export function getPrimaryRendererWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

export type NavigationGuardOptions = {
  getPort: () => number;
  getLocalIp?: () => string | undefined;
};

/**
 * Fail-closed main-frame navigation: only allowlisted local HTTP origins
 * (same policy as window.open local allowlist). External destinations are blocked.
 */
export function attachRendererNavigationGuards(
  webContents: WebContents,
  options: NavigationGuardOptions,
): void {
  const decide = (url: string): boolean => {
    const port = options.getPort();
    const localIp = options.getLocalIp?.();
    return isAllowedRendererNavigation(url, port, localIp);
  };

  webContents.on('will-navigate', (event, url) => {
    const targetUrl = typeof url === 'string' && url.length > 0
      ? url
      : String((event as { url?: string }).url || '');
    if (!decide(targetUrl)) {
      event.preventDefault();
      console.warn('[Security] Blocked renderer navigation to untrusted URL:', targetUrl);
    }
  });

  webContents.on('will-redirect', (event, url) => {
    const targetUrl = typeof url === 'string' && url.length > 0
      ? url
      : String((event as { url?: string }).url || '');
    if (!decide(targetUrl)) {
      event.preventDefault();
      console.warn('[Security] Blocked renderer redirect to untrusted URL:', targetUrl);
    }
  });
}
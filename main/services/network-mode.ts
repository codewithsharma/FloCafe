/**
 * LAN deployment / listen-host policy (P0.1).
 *
 * Modes (settings.network_mode):
 *   localhost — Electron-only; all HTTP servers bind 127.0.0.1
 *   kds_lan   — KDS (:3002) on LAN; POS + Server App localhost-only
 *   lan       — Staff-LAN: POS + KDS + Server App on 0.0.0.0
 *
 * Guest Wi-Fi is not a supported deployment boundary. CORS is not a security
 * boundary. JWT auth remains mandatory for financial APIs regardless of mode.
 */

import { getSettingValue } from '../db';

export const NETWORK_MODE_SETTING_KEY = 'network_mode';

export type NetworkMode = 'localhost' | 'kds_lan' | 'lan';
export type NetworkService = 'pos' | 'kds' | 'server_app';
export type ListenHost = '127.0.0.1' | '0.0.0.0';

/** Safest default that preserves Electron standalone operation. */
export const DEFAULT_NETWORK_MODE: NetworkMode = 'localhost';

export const NETWORK_MODES: readonly NetworkMode[] = ['localhost', 'kds_lan', 'lan'] as const;

export function parseNetworkMode(raw: string | null | undefined): NetworkMode {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'localhost' || value === 'kds_lan' || value === 'lan') {
    return value;
  }
  // Missing or invalid → do not silently expose 0.0.0.0
  return DEFAULT_NETWORK_MODE;
}

export function getNetworkMode(): NetworkMode {
  return parseNetworkMode(getSettingValue(NETWORK_MODE_SETTING_KEY));
}

export function resolveListenHost(mode: NetworkMode, service: NetworkService): ListenHost {
  if (mode === 'localhost') return '127.0.0.1';
  if (mode === 'kds_lan') {
    return service === 'kds' ? '0.0.0.0' : '127.0.0.1';
  }
  // lan — staff LAN: all three services may bind all interfaces
  return '0.0.0.0';
}

export function isLanPosEnabled(mode: NetworkMode = getNetworkMode()): boolean {
  return mode === 'lan';
}

export function isLanKdsEnabled(mode: NetworkMode = getNetworkMode()): boolean {
  return mode === 'kds_lan' || mode === 'lan';
}

export function isLanServerAppEnabled(mode: NetworkMode = getNetworkMode()): boolean {
  return mode === 'lan';
}

/** Bonjour only when at least one LAN-facing HTTP surface is bound. */
export function shouldAdvertiseMdns(mode: NetworkMode = getNetworkMode()): boolean {
  return mode === 'kds_lan' || mode === 'lan';
}

/**
 * Which port Bonjour should advertise as the primary HTTP service.
 * KDS-only mode advertises the KDS port so flo.local does not point at an
 * unreachable localhost-bound POS API.
 */
export function mdnsPrimaryPort(
  mode: NetworkMode,
  ports: { pos: number; kds: number; serverApp: number },
): number {
  if (mode === 'kds_lan') return ports.kds;
  return ports.pos;
}

export function networkModeRequiresRestartMessage(): string {
  return 'Network mode changes apply after restarting Operavia.';
}

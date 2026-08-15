/**
 * Pure helpers for KDS offline / recovery advertise decisions (H2).
 * Keep LAN pairing and mDNS from pointing at a dead companion process.
 */

export type NetworkModeForKds = 'localhost' | 'kds_lan' | 'lan';

export function shouldAdvertiseLanKds(params: {
  networkMode: NetworkModeForKds;
  kdsCompanionRunning: boolean;
}): boolean {
  if (!params.kdsCompanionRunning) return false;
  return params.networkMode === 'kds_lan' || params.networkMode === 'lan';
}

/** Bonjour should not advertise in kds_lan when the companion failed to bind. */
export function shouldPublishMdns(params: {
  networkMode: NetworkModeForKds;
  kdsCompanionRunning: boolean;
}): boolean {
  if (params.networkMode === 'localhost') return false;
  if (params.networkMode === 'kds_lan' && !params.kdsCompanionRunning) return false;
  return params.networkMode === 'kds_lan' || params.networkMode === 'lan';
}

export function mdnsTxtKdsFields(params: {
  kdsCompanionRunning: boolean;
  kdsPort: number;
}): { kds: string; kds_port: string } | null {
  if (!params.kdsCompanionRunning) return null;
  return { kds: '/kds', kds_port: String(params.kdsPort) };
}

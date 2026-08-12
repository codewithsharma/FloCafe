/**
 * Anonymous usage telemetry — independent of cloud sync.
 * M2: Requires explicit opt-in (telemetry_enabled === 'true') before any send.
 *
 * anon_id is a random UUID persisted locally (see db.ensureTelemetryAnonId),
 * never a store id, device id, or anything else that ties back to a business.
 */

import { app } from 'electron';
import log from 'electron-log';
import { ensureTelemetryAnonId, getSettingValue, parseDbTimestamp, upsertTelemetryLastPing } from '../db';
import { isTelemetryTransmissionAllowed } from './privacy-consent';

export const TELEMETRY_URL = 'https://telemetry.flopos.com/collect';

const REQUEST_TIMEOUT_MS = 8_000;
const DAILY_PING_INTERVAL_MS = 60 * 60_000;
const DAILY_PING_MIN_GAP_MS = 24 * 60 * 60_000;

let dailyPingTimer: ReturnType<typeof setInterval> | null = null;

export async function sendEvent(eventType: string, payload?: Record<string, unknown>): Promise<boolean> {
  if (!isTelemetryTransmissionAllowed()) return false;

  try {
    const anonId = ensureTelemetryAnonId();
    const configuredCountry = (getSettingValue('country') || '').trim().toUpperCase();
    const country = /^[A-Z]{2}$/.test(configuredCountry) ? configuredCountry : undefined;
    const response = await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anon_id: anonId,
        app: 'flocafe',
        app_version: app.getVersion(),
        event_type: eventType,
        platform: process.platform,
        ...(country ? { country } : {}),
        ...(payload ? { payload } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.debug(`[Flo] telemetry rejected with HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (e) {
    log.debug('[Flo] telemetry send failed (non-fatal):', e);
    return false;
  }
}

function maybeSendDailyPing(): void {
  if (!isTelemetryTransmissionAllowed()) return;

  const lastPingAt = getSettingValue('telemetry_last_ping_at');
  const lastPingMs = lastPingAt ? parseDbTimestamp(lastPingAt).getTime() : NaN;
  const elapsed = isNaN(lastPingMs) ? Infinity : Date.now() - lastPingMs;
  if (elapsed < DAILY_PING_MIN_GAP_MS) return;

  void sendEvent('daily_ping').then((sent) => {
    if (sent) upsertTelemetryLastPing();
  });
}

export const telemetry = {
  start(): void {
    if (dailyPingTimer) {
      clearInterval(dailyPingTimer);
      dailyPingTimer = null;
    }
    if (!isTelemetryTransmissionAllowed()) {
      return;
    }
    void sendEvent('app_launch');
    maybeSendDailyPing();
    dailyPingTimer = setInterval(maybeSendDailyPing, DAILY_PING_INTERVAL_MS);
  },
  stop(): void {
    if (dailyPingTimer) {
      clearInterval(dailyPingTimer);
      dailyPingTimer = null;
    }
  },
};

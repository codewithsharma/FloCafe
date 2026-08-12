/**
 * M2 privacy consent — explicit opt-in before telemetry/diagnostics transmission.
 *
 * Setting values:
 *   'true'    → ENABLED (explicit opt-in)
 *   'false'   → DISABLED (explicit opt-out)
 *   missing | 'pending' | other → NOT_DECIDED (fail closed — no transmission)
 */

import { getSettingValue, now, upsertSettings } from '../db';

export type ConsentState = 'not_decided' | 'enabled' | 'disabled';

export function parseConsentSetting(value: string | null | undefined): ConsentState {
  if (value === 'true') return 'enabled';
  if (value === 'false') return 'disabled';
  return 'not_decided';
}

export function getTelemetryConsentState(): ConsentState {
  return parseConsentSetting(getSettingValue('telemetry_enabled'));
}

export function getDiagnosticsConsentState(): ConsentState {
  return parseConsentSetting(getSettingValue('diagnostics_consent'));
}

/** Fail closed: transmit only on explicit 'true'. */
export function isTelemetryTransmissionAllowed(): boolean {
  return getTelemetryConsentState() === 'enabled';
}

/** Fail closed: transmit only on explicit 'true'. */
export function isDiagnosticsTransmissionAllowed(): boolean {
  return getDiagnosticsConsentState() === 'enabled';
}

export function recordTelemetryConsent(enabled: boolean): void {
  const timestamp = now();
  upsertSettings({
    telemetry_enabled: enabled ? 'true' : 'false',
    telemetry_consent_recorded_at: timestamp,
    anonymous_data_consent: enabled ? 'true' : 'false',
  });
}

export function recordDiagnosticsConsent(enabled: boolean): void {
  upsertSettings({
    diagnostics_consent: enabled ? 'true' : 'false',
    diagnostics_consent_recorded_at: now(),
  });
}

/** First-run / setup: opt-in only sets enabled; otherwise leave NOT_DECIDED. */
export function applySetupTelemetryOptIn(optIn: boolean | undefined): void {
  if (optIn === true) {
    recordTelemetryConsent(true);
  }
}

export function applySetupDiagnosticsOptIn(optIn: boolean | undefined): void {
  if (optIn === true) {
    recordDiagnosticsConsent(true);
  }
}

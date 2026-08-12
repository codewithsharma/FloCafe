import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-privacy-consent-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => '3.0.5-test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

const { initDatabase, getDatabase, closeDatabase, now, isTelemetryEnabled, isDiagnosticsConsentEnabled } = require('../main/db');
const {
  parseConsentSetting,
  getTelemetryConsentState,
  getDiagnosticsConsentState,
  isTelemetryTransmissionAllowed,
  isDiagnosticsTransmissionAllowed,
  recordTelemetryConsent,
  recordDiagnosticsConsent,
  applySetupTelemetryOptIn,
  applySetupDiagnosticsOptIn,
} = require('../main/services/privacy-consent');
const { sendEvent, telemetry, TELEMETRY_URL } = require('../main/services/telemetry');

function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now());
}

function getSetting(key: string): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

async function main() {
  console.log('M2 Privacy & Consent Tests');
  console.log('='.repeat(60));

  initDatabase();
  const db = getDatabase();

  // 1. New installation defaults — must not be enabled (pending or legacy false)
  const telemetryDefault = getSetting('telemetry_enabled');
  const diagnosticsDefault = getSetting('diagnostics_consent');
  assert.ok(
    telemetryDefault === 'pending' || telemetryDefault === 'false',
    `fresh install telemetry must not be enabled (got ${telemetryDefault})`,
  );
  assert.ok(
    diagnosticsDefault === 'pending' || diagnosticsDefault === 'false',
    `fresh install diagnostics must not be enabled (got ${diagnosticsDefault})`,
  );
  assert.ok(
    ['not_decided', 'disabled'].includes(getTelemetryConsentState()),
    `telemetry consent must not be enabled on fresh install (got ${getTelemetryConsentState()})`,
  );
  assert.ok(
    ['not_decided', 'disabled'].includes(getDiagnosticsConsentState()),
    `diagnostics consent must not be enabled on fresh install (got ${getDiagnosticsConsentState()})`,
  );
  console.log('   ✓ fresh install defaults are NOT_DECIDED');

  // 2. Fail closed — no transmission without consent
  assert.equal(isTelemetryEnabled(), false);
  assert.equal(isDiagnosticsConsentEnabled(), false);
  assert.equal(isTelemetryTransmissionAllowed(), false);
  assert.equal(isDiagnosticsTransmissionAllowed(), false);

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  assert.equal(await sendEvent('app_launch'), false, 'sendEvent blocked when NOT_DECIDED');
  assert.equal(fetchCalled, false, 'no network call when NOT_DECIDED');
  telemetry.start();
  assert.equal(fetchCalled, false, 'telemetry.start does not send when NOT_DECIDED');
  telemetry.stop();
  console.log('   ✓ fail-closed blocks transmission when NOT_DECIDED');

  // 3. Corrupted / unknown values fail closed
  setSetting('telemetry_enabled', 'maybe');
  setSetting('diagnostics_consent', '');
  assert.equal(isTelemetryTransmissionAllowed(), false);
  assert.equal(isDiagnosticsTransmissionAllowed(), false);
  console.log('   ✓ corrupted values fail closed');

  // 4. Explicit enable
  recordTelemetryConsent(true);
  assert.equal(getTelemetryConsentState(), 'enabled');
  assert.equal(isTelemetryTransmissionAllowed(), true);
  assert.ok(getSetting('telemetry_consent_recorded_at'));
  assert.equal(getSetting('anonymous_data_consent'), 'true');

  fetchCalled = false;
  globalThis.fetch = (async (url: string | URL | Request) => {
    assert.equal(String(url), TELEMETRY_URL);
    fetchCalled = true;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  assert.equal(await sendEvent('app_launch'), true);
  assert.equal(fetchCalled, true);
  console.log('   ✓ explicit enable allows telemetry transmission');

  // 5. Explicit disable
  recordTelemetryConsent(false);
  assert.equal(getTelemetryConsentState(), 'disabled');
  fetchCalled = false;
  assert.equal(await sendEvent('daily_ping'), false);
  assert.equal(fetchCalled, false);
  console.log('   ✓ explicit disable blocks telemetry');

  // 6. Diagnostics explicit enable/disable
  recordDiagnosticsConsent(true);
  assert.equal(getDiagnosticsConsentState(), 'enabled');
  assert.equal(isDiagnosticsTransmissionAllowed(), true);
  recordDiagnosticsConsent(false);
  assert.equal(getDiagnosticsConsentState(), 'disabled');
  assert.equal(isDiagnosticsTransmissionAllowed(), false);
  console.log('   ✓ diagnostics enable/disable');

  // 7. Setup opt-in helpers — only set when true
  db.prepare("DELETE FROM settings WHERE key IN ('telemetry_enabled', 'diagnostics_consent', 'telemetry_consent_recorded_at', 'diagnostics_consent_recorded_at')").run();
  applySetupTelemetryOptIn(undefined);
  applySetupDiagnosticsOptIn(false);
  assert.equal(getSetting('telemetry_enabled'), null, 'setup without opt-in leaves telemetry unset');
  applySetupTelemetryOptIn(true);
  assert.equal(getSetting('telemetry_enabled'), 'true', 'setup opt-in enables telemetry');
  console.log('   ✓ setup opt-in helpers');

  // 8. Existing installation preservation (grandfathering simulation)
  setSetting('telemetry_enabled', 'true');
  setSetting('diagnostics_consent', 'false');
  assert.equal(isTelemetryTransmissionAllowed(), true);
  assert.equal(isDiagnosticsTransmissionAllowed(), false);
  console.log('   ✓ stored true/false preferences honored');

  globalThis.fetch = originalFetch;
  closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n✅ M2 privacy consent tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

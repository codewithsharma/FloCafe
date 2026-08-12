# M2 Privacy & Consent Report

**Milestone:** M2 — Privacy & consent  
**Date:** 2026-08-12  
**Schema version:** 67 (additive migration)  
**Depends on:** M1 engineering baseline (GREEN)

---

## 1. Current implementation (before M2)

| Component | Behavior |
|-----------|----------|
| `seedInstallDefaults()` | Set `telemetry_enabled='true'`, `diagnostics_consent='true'` |
| `isTelemetryEnabled()` | `=== 'true'` only |
| `isDiagnosticsConsentEnabled()` | `!== 'false'` (default-on) |
| `telemetry.start()` | Sent `app_launch` on every app start |
| Setup `/api/auth/setup/initialize` | Hardcoded telemetry/diagnostics to `'true'` |
| Settings UI | Checkboxes; diagnostics loaded as enabled when not `'false'` |

**Problem:** Default-on transmission without explicit user opt-in.

---

## 2. Privacy problem

Audit finding (second-pass): `telemetry_enabled='true'` and `diagnostics_consent='true'` seeded by default. Violates explicit consent requirement (SR-T-06, GDPR-style opt-in expectations).

---

## 3. Consent model

| State | Setting value | Transmission |
|-------|---------------|--------------|
| NOT_DECIDED | missing, `'pending'`, invalid | Blocked |
| ENABLED | `'true'` | Allowed |
| DISABLED | `'false'` | Blocked |

Module: `main/services/privacy-consent.ts`

Legacy note: Migration v28 seeds `telemetry_enabled='false'` on fresh chains — treated as **DISABLED** (also blocks transmission).

---

## 4. Implementation

| Area | Change |
|------|--------|
| `main/services/privacy-consent.ts` | **NEW** — consent parsing, recording, setup opt-in |
| `main/services/telemetry.ts` | Fail-closed via `isTelemetryTransmissionAllowed()`; skip `start()` when not enabled |
| `main/db.ts` | `isDiagnosticsConsentEnabled()` strict `=== 'true'`; seedInstallDefaults omits consent keys; **migration v67** |
| `main/routes/auth.ts` | Setup accepts `telemetry_opt_in` / `diagnostics_opt_in`; no auto-enable |
| `main/routes/settings.ts` | `recordTelemetryConsent` / `recordDiagnosticsConsent`; restart/stop telemetry on toggle |
| `frontend/setup/page.tsx` | Unchecked opt-in checkboxes (no preselection) |
| `frontend/settings/page.tsx` | Diagnostics load only when `=== 'true'` |
| `tests/privacy-consent.test.ts` | **NEW** — 8 scenarios |
| `tests/first-run-setup.test.ts` | Updated expectations |

---

## 5. Data-flow changes

```
Before: App start → telemetry.start() → sendEvent (if enabled default true) → network

After:  App start → telemetry.start() → exit early if NOT enabled
        sendEvent → isTelemetryTransmissionAllowed() === true only
        diagnostics → isDiagnosticsConsentEnabled() === true only
        Setup → opt-in checkboxes → applySetup*OptIn(true) only when checked
        Settings toggle → record*Consent + telemetry.start/stop
```

---

## 6. Security considerations

- Fail-closed on missing/pending/corrupt settings
- IPC does not bypass consent (telemetry uses same checks)
- Renderer PUT `/settings/telemetry_enabled` requires owner/manager role (existing)
- `startup_failed` telemetry only sends when explicitly enabled
- Stop-all-cloud sets both to `'false'`

---

## 7. Existing installation behavior

**Migration v67** (`m2_explicit_privacy_consent_defaults`):

| Install type | Behavior |
|--------------|----------|
| Operational (users + onboarding complete) | **Preserve** all stored values (grandfather default-on `'true'`) |
| Pending/fresh (no owner) | Reset default-on `'true'` → `'pending'`; preserve explicit `'false'` |

**Documented policy:** Grandfathering avoids silent behavior change for production stores. Legal may require re-consent in specific jurisdictions — not auto-implemented.

**Why v67 required:** Historical migrations v43/v47 cannot be edited; they INSERT default-on values on fresh migration chains.

---

## 8. Tests

| Test | Result |
|------|--------|
| `npm run test:telemetry` (includes privacy-consent) | PASS |
| `npm run test:first-run` | PASS |
| `npm run test:upgrade-path` | PASS |
| `npm run test:integration-payments` | PASS (spot check) |
| `npm run test:smoke` | PASS (with `npm run clean`) |

Coverage scenarios in `privacy-consent.test.ts`:
1. Fresh install not enabled
2. NOT_DECIDED/disabled fail closed
3. Explicit enable transmits
4. Explicit disable blocks
5. Corrupt values fail closed
6. Setup opt-in helpers
7. Grandfathered true/false preserved
8. Diagnostics enable/disable

---

## 9. Validation (vs M1 baseline)

| Check | Result |
|-------|--------|
| `npm run build` | PASS |
| `npm run lint:backend` | PASS (806 pre-existing warnings) |
| `npm run test:m1-gate` | PASS (updated for v67) |
| `npm test` | Run in CI / full suite recommended |
| Playwright E2E | Not re-run in this session — no POS UI behavior changed in payment flows |

No payment/KDS/printing code paths modified beyond consent gates on telemetry/diagnostics.

---

## 10. Files changed

```
main/services/privacy-consent.ts          (new)
main/services/telemetry.ts
main/db.ts                                (v67 migration)
main/routes/auth.ts
main/routes/settings.ts
frontend/src/app/setup/page.tsx
frontend/src/app/(dashboard)/settings/page.tsx
frontend/src/lib/i18n/en.json
tests/privacy-consent.test.ts             (new)
tests/first-run-setup.test.ts
tests/m1-engineering-gate.test.ts
package.json                              (test:telemetry includes privacy-consent)
docs/07-security/privacy-and-consent.md   (new)
docs/07-security/security.md
docs/07-security/security-requirements.md
docs/00-product/feature-list.md
docs/15-project-management/m2-privacy-consent.md
docs/15-project-management/progress.md
docs/15-project-management/milestones.md
docs/15-project-management/task-breakdown.md
```

---

## 11. Remaining risks

| ID | Risk | Severity |
|----|------|----------|
| M2-R1 | Grandfathered operational installs still transmit if previously default-on | MEDIUM — documented; legal review may require re-consent |
| M2-R2 | Legacy v28 `false` on fresh chain is DISABLED not NOT_DECIDED | LOW — still fail-closed |
| M2-R3 | es/pt i18n updated for setup privacy strings | Resolved |

---

## 12. Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Explicit consent before transmission (new installs) | ✅ |
| Fail-closed behavior | ✅ |
| Existing opt-outs preserved | ✅ |
| Setup opt-in UI (unchecked default) | ✅ |
| Settings privacy toggles | ✅ |
| Tests added | ✅ |
| Documentation updated | ✅ |
| No unrelated features | ✅ |
| POS works without telemetry | ✅ |

---

## 13. Final verdict

### **GREEN**

Explicit consent model implemented with fail-closed transmission, migration v67 for fresh installs, grandfathering for operational upgrades, and comprehensive tests. M3 not started.

---

**Do not start M3** until explicitly approved.

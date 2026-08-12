# Privacy and Consent

## CURRENT STATE (post-M2)

FloCafe v3.0.5+ implements **explicit opt-in** before telemetry or diagnostics transmission.

### Consent model

| State | Setting value | Transmission |
|-------|---------------|--------------|
| **NOT_DECIDED** | missing, `'pending'`, or invalid | **Blocked** (fail closed) |
| **ENABLED** | `'true'` | Allowed |
| **DISABLED** | `'false'` | Blocked |

Settings keys:

- `telemetry_enabled` — anonymous usage telemetry
- `diagnostics_consent` — store-attributed diagnostics (Tier 2)
- `telemetry_consent_recorded_at` — set when owner toggles telemetry in Settings or opts in at setup
- `diagnostics_consent_recorded_at` — set when owner toggles diagnostics

Implementation: `main/services/privacy-consent.ts`

### Fail-closed behavior

Telemetry and diagnostics **do not send** when:

- Consent is NOT_DECIDED (`pending` or missing)
- Consent is DISABLED (`false`)
- Setting value is corrupted or unrecognized
- Network or initialization fails (telemetry catches errors; returns false)

Core POS (orders, payments, KDS, printing) never depends on telemetry.

### Data collection

#### Anonymous telemetry (`telemetry.flopos.com/collect`)

| Field | Content | PII |
|-------|---------|-----|
| `anon_id` | Random UUID (`telemetry_anon_id`) | No business link by design |
| `app` | `'flocafe'` | No |
| `app_version` | Electron app version | No |
| `event_type` | e.g. `app_launch`, `daily_ping`, `feature_used` | No |
| `platform` | `process.platform` | No |
| `country` | ISO country from settings (if set) | No |
| `payload` | Event-specific (errors, feature names) | Must not include customer PII per contract |

**Destination:** `https://telemetry.flopos.com/collect`  
**Retention:** UNKNOWN (server-side; not in this repository)

#### Store diagnostics (Tier 2)

| Field | Content |
|-------|---------|
| Event payload | Typed errors (printer stage, connection type, event codes) |
| Store attribution | Linked to cloud store identity when sync configured |

**Destination:** FloAdmin `/api/pos/diagnostics` (via cloud-sync outbox)  
**Requires:** `diagnostics_consent === 'true'` AND cloud sync configured

**Never includes (verified in support-ticket tests):** customer names, phones, order contents, passwords, API keys in auto-attached diagnostics preview.

### User controls

| Surface | Control |
|---------|---------|
| First-run setup | Optional unchecked opt-in checkboxes |
| Settings → Privacy | Enable/disable telemetry and diagnostics |
| Stop all cloud services | Sets both to disabled |

### Existing installation migration (v67)

**Schema v67** (`m2_explicit_privacy_consent_defaults`):

- **Operational installs** (users exist + `onboarding_completed='true'`): **preserve** stored `telemetry_enabled` / `diagnostics_consent` (grandfathering legacy default-on `'true'`)
- **Pending/fresh installs** (no owner yet): set `'pending'` (NOT_DECIDED)

**Documented policy:** Grandfathering avoids silently disabling telemetry for production stores that relied on prior default-on behavior. New installs require explicit opt-in. **Legal/product review** may require re-consent for grandfathered installs in specific jurisdictions — not implemented automatically.

## TARGET STATE

- Jurisdiction-specific consent flows (if required by legal)
- Consent audit log entries (M3 audit log milestone)

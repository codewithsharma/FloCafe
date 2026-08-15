# OPERAVIA 3.0.5 — RELEASE SIGNING READINESS

**Date:** 2026-08-15  
**Decision:** `READY FOR SIGNING — CREDENTIALS NOT AVAILABLE`  
**Git HEAD (docs pass):** current `restaurant-vertical` tip  
**Live e2e PID 47633:** not restarted

---

## Artifact

| Field             | Value                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path              | `release/mac-arm64/Operavia.app`                                                                                                                                                                                       |
| Version           | **3.0.5**                                                                                                                                                                                                              |
| Architecture      | **arm64** (Mach-O thin)                                                                                                                                                                                                |
| Bundle ID         | **com.flo.desktop**                                                                                                                                                                                                    |
| Product name      | Operavia                                                                                                                                                                                                               |
| Size              | ~413 MB                                                                                                                                                                                                                |
| Current signature | **adhoc** (`TeamIdentifier=not set`)                                                                                                                                                                                   |
| Reproducibility   | **PASS** — `npm run build` + `build:frontend` + `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` re-run this gate; KDS/expenses/audit/asar/sqlite present; secret scan clean (`E2ePass123!` / private-key markers = 0) |

---

## Signing Requirements

| Requirement                                                         | Status                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Developer ID Application certificate (keychain identity)            | **ABSENT** (0 valid identities)                                                              |
| Certificate password                                                | **ABSENT** (local)                                                                           |
| `MAC_CERTS` (GitHub secret → `CSC_LINK`)                            | **ABSENT** local; GitHub remote presence **NOT VERIFIED** (`gh` CLI unavailable)             |
| `MAC_CERTS_PASSWORD` (→ `CSC_KEY_PASSWORD`)                         | **ABSENT** local; remote **NOT VERIFIED**                                                    |
| `APPLE_API_KEY` (base64 of `.p8` in CI; file path at notarize time) | **ABSENT** local; remote **NOT VERIFIED**                                                    |
| `APPLE_API_KEY_ID`                                                  | **ABSENT** local; remote **NOT VERIFIED**                                                    |
| `APPLE_API_ISSUER`                                                  | **ABSENT** local; remote **NOT VERIFIED**                                                    |
| `APPLE_TEAM_ID`                                                     | **NOT REQUIRED** as a GitHub secret — workflow hardcodes `BKDY677XJA` for the mac build step |

Configured display identity (not a secret): `Codify Apps Private Limited (BKDY677XJA)`.

---

## Existing Workflow

| Item                         | Detail                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflow file                | `.github/workflows/release.yml` → job `release-mac`                                                                                                                                                                            |
| Credential gate              | Fail-closed if any of `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` empty                                                                                                         |
| Certificate format           | **`MAC_CERTS` / `CSC_LINK`:** electron-builder accepts **base64-encoded `.p12`** (or file link). CI maps `secrets.MAC_CERTS` → `CSC_LINK`.                                                                                     |
| Notary key format            | **`APPLE_API_KEY` secret:** **base64 of App Store Connect API `.p8`**. Step decodes to `$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8` and sets `APPLE_API_KEY` env to that **file path** for `@electron/notarize` / notarytool. |
| Notarization auth            | **API key** (not Apple ID + app-specific password) — intentional for CI                                                                                                                                                        |
| Signing + pack command (CI)  | `npm run build:frontend && npm run build && npx electron-builder --mac --x64 --arm64 --publish never` with `CSC_*` + `APPLE_*` env                                                                                             |
| Local equivalent             | `npm run build:mac` (same builder; needs identity/creds in env or keychain)                                                                                                                                                    |
| `package.json`               | `build.mac.identity` set; `build.mac.notarize: true`; hardenedRuntime + entitlements                                                                                                                                           |
| Post-build verification (CI) | Extract each `release/*.zip` → `codesign --verify --deep --strict` → `spctl --assess --type execute` → `xcrun stapler validate`; also re-download published zips and repeat                                                    |
| Workflow defects             | **None identified** — do not change `release.yml` for this gate                                                                                                                                                                |

---

## Signing Procedure

Exact safe sequence **when credentials are actually available** (CI preferred):

1. **Load credentials** — populate GitHub secrets `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (or local env equivalents). Do not commit them.
2. **Build** — `npm run build:frontend && npm run build` (CI does this inside the electron-builder step).
3. **Pack/sign/notarize** — `npx electron-builder --mac --x64 --arm64 --publish never` (or trigger `release.yml` on authorized tag/release).
4. **Verify codesign** — `codesign --verify --deep --strict --verbose=2 "$APP"`; inspect `codesign -dv --verbose=4` (must **not** say `adhoc`; expect Developer ID + TeamIdentifier).
5. **Notarize** — performed by electron-builder when `notarize: true` + API key env present.
6. **Staple** — confirmed via `xcrun stapler validate "$APP"`.
7. **Verify Gatekeeper** — `spctl --assess --type execute --verbose "$APP"`.
8. **Archive final artifact** — DMG/ZIP + `latest-mac.yml` + blockmaps; record SHA-256 on pilot sign-off.
9. **Generate release report** — update `docs/qa/FINAL-SIGNED-RC-REPORT.md` with verified results only.

**Do not** treat electron-builder exit 0 alone as notarization PASS without steps 4–7.

---

## After signed + notarized (next phase — not this host)

1. Install on a **real pilot Mac**
2. Launch; confirm Gatekeeper
3. Create Master PIN; escrow offline
4. Backup → known data → restore → relaunch → verify
5. Printer, KDS/LAN, offline, day-close
6. Execute [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md) with evidence

---

## Current Blockers

1. Local Developer ID identity / `CSC_LINK` + password — **ABSENT**
2. App Store Connect API notary credentials — **ABSENT** locally
3. Remote GitHub secret population — **NOT VERIFIED** from this environment (`gh` unavailable)
4. OPS-02 / Master PIN desktop DR / policy / executive sign-off — still pending after signing

**Signing can proceed now?** **No.**

**Exact next action:** Release owner populates GitHub secrets (or installs Developer ID + notary env on a signing Mac), then runs `release.yml` / `electron-builder --mac`, then cryptographic verification before OPS-02.

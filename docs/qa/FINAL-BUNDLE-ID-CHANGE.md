# OPERAVIA 3.0.5 — BUNDLE ID CHANGE

**Date:** 2026-08-15  
**Live e2e PID 47633:** not restarted

## Change

**Old:** `com.flo.desktop`  
**New:** `com.operavia.desktop`

## Reason

Align the macOS application identity with the OPERAVIA product name before signing/notarization.

## Configuration

| File                                       | Change                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `package.json`                             | `build.appId` → `com.operavia.desktop`; Linux AppStream `extraFiles` paths |
| `build/entitlements.mas.plist`             | application-group `BKDY677XJA.com.operavia.desktop`                        |
| `assets/com.operavia.desktop.metainfo.xml` | renamed from `com.flo.desktop…`; `<id>` updated                            |
| `scripts/update-metainfo.js`               | metainfo path                                                              |
| `scripts/afterPack.js`                     | metainfo copy paths                                                        |
| `scripts/uninstallers/uninstall-macos.sh`  | primary + legacy `BUNDLE_IDS`                                              |
| `kill-ports.js`                            | match `com.operavia.desktop` (+ keep legacy `com.flo.desktop`)             |
| `tests/release-config.test.ts`             | assert `appId` + metainfo message                                          |
| `tests/dev-tooling-scripts.test.ts`        | positive helper for new id (+ legacy)                                      |
| Current release/docs notes                 | `RELEASE-SIGNING-READINESS.md`, `local-setup.md`, branding hygiene audits  |

Historical QA/audit reports that documented prior unsigned artifacts still mention `com.flo.desktop` on purpose.

## Tests

| Suite                               | Result |
| ----------------------------------- | ------ |
| `npx tsc --noEmit`                  | PASS   |
| `tests/release-config.test.ts`      | PASS   |
| `tests/dev-tooling-scripts.test.ts` | PASS   |

## Build

| Step                                             | Result |
| ------------------------------------------------ | ------ |
| `npm run build`                                  | PASS   |
| `npm run build:frontend`                         | PASS   |
| `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` | PASS   |

## Artifact

`release/mac-arm64/Operavia.app`

## Verification

| Check                                             | Result                                     |
| ------------------------------------------------- | ------------------------------------------ |
| `CFBundleIdentifier`                              | **`com.operavia.desktop`**                 |
| Version                                           | 3.0.5                                      |
| Architecture                                      | arm64                                      |
| Product name                                      | Operavia                                   |
| frontend-out                                      | present                                    |
| KDS                                               | present                                    |
| expenses                                          | present                                    |
| audit                                             | present                                    |
| app.asar                                          | present                                    |
| better-sqlite3 `darwin-arm64.node`                | present                                    |
| packaged metainfo                                 | `assets/com.operavia.desktop.metainfo.xml` |
| Secret scan (`E2ePass123!` / private key markers) | 0 hits                                     |

## Signing

**NOT ATTEMPTED** — credentials unavailable (adhoc signature retained).

## Notarization

**NOT ATTEMPTED** — signing credentials unavailable.

## Remaining active `com.flo.desktop` (intentional)

| Location                                                                                                                | Classification                         |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `kill-ports.js` / uninstall `BUNDLE_IDS` / test positive case                                                           | Legacy cleanup / upgrade safety        |
| Docs noting the rename                                                                                                  | Documentation                          |
| `FINAL-UNSIGNED-RC-REPORT.md`, `FINAL-SIGNED-RC-REPORT.md`, `ops-02-live-pilot-rc-site-readiness.md`, CHANGELOG, audits | Historical evidence of prior artifacts |

**No active packaging `appId` still uses `com.flo.desktop`.**

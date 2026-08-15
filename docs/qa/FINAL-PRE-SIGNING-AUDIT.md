# FINAL PRE-SIGNING RELEASE AUDIT

**Date:** 2026-08-15  
**Version:** 3.0.5  
**Bundle ID:** `com.operavia.desktop`  
**Architecture:** macOS arm64  
**Artifact:** `release/mac-arm64/Operavia.app`  
**Git HEAD:** `6042fe5a181bb7efed8caf08f64be267bd776e9a` (bundle ID change) + this audit doc  
**Live e2e:** `http://localhost:3001` PID **47633** health **200** (not restarted)

---

## Final matrix

| Gate                     | Result                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| Bundle ID migration      | **PASS**                                                               |
| Active old ID references | **PASS** — none in packaging; legacy cleanup only                      |
| Build                    | **PASS**                                                               |
| Frontend build           | **PASS**                                                               |
| Pack                     | **PASS** (unsigned / adhoc)                                            |
| CFBundleIdentifier       | **PASS** = `com.operavia.desktop`                                      |
| Version                  | **PASS** = 3.0.5                                                       |
| Architecture             | **PASS** = arm64                                                       |
| Artifact integrity       | **PASS**                                                               |
| Secret scan              | **PASS** (0 hits for QA password / private keys / .p12 / .p8 / `.env`) |
| npm audit                | **PASS** (0 vulnerabilities, `--omit=dev`)                             |
| Release workflow         | **PASS** (compatible; no hardcoded old bundle ID)                      |
| Signing readiness        | **READY** (config OK; credentials **ABSENT**)                          |
| Notarization readiness   | **READY** (config OK; credentials **ABSENT**)                          |

---

## Bundle ID Audit

### Active production identity

| Location                                         | Value                                      |
| ------------------------------------------------ | ------------------------------------------ |
| `package.json` `build.appId`                     | `com.operavia.desktop`                     |
| Packaged `CFBundleIdentifier`                    | `com.operavia.desktop`                     |
| `build/entitlements.mas.plist` application-group | `BKDY677XJA.com.operavia.desktop`          |
| AppStream metainfo                               | `assets/com.operavia.desktop.metainfo.xml` |
| Linux `extraFiles` / afterPack / update-metainfo | operavia paths                             |

### Remaining `com.flo.desktop` (classified)

| Occurrence                                                                                           | Classification                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `scripts/uninstallers/uninstall-macos.sh` (in `BUNDLE_IDS` with new id)                              | **LEGACY CLEANUP**                 |
| `kill-ports.js` pattern (alongside `com.operavia.desktop`)                                           | **LEGACY CLEANUP**                 |
| `tests/dev-tooling-scripts.test.ts` positive case                                                    | **TEST EXPECTATION** (intentional) |
| Branding / local-setup notes describing the rename                                                   | **HISTORICAL / DOCUMENTATION**     |
| `FINAL-UNSIGNED-RC-REPORT.md`, `FINAL-SIGNED-RC-REPORT.md`, ops-02 pilot snapshot, CHANGELOG, audits | **HISTORICAL DOCUMENTATION**       |

**ACTIVE CONFIGURATION using `com.flo.desktop`:** **none**.

---

## Build Verification

| Command                                          | Result |
| ------------------------------------------------ | ------ |
| `npx tsc --noEmit`                               | PASS   |
| `npm run build`                                  | PASS   |
| `npm run build:frontend`                         | PASS   |
| `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` | PASS   |

`codesign -dv --verbose=4`: **Signature=adhoc**, `TeamIdentifier=not set` (expected without credentials).

---

## Artifact Verification

| Check                                                                    | Result                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| Product name                                                             | Operavia                                  |
| Version                                                                  | 3.0.5                                     |
| Bundle ID                                                                | `com.operavia.desktop`                    |
| Mach-O                                                                   | arm64                                     |
| `frontend-out`                                                           | present                                   |
| KDS / expenses / audit                                                   | present                                   |
| `app.asar` + `dist/index.js` / `dist/db.js`                              | present                                   |
| better-sqlite3 `darwin-arm64.node`                                       | present                                   |
| Backup / recovery symbols in `db.js`                                     | present                                   |
| Packaged DB path                                                         | `{userData}/flo.db` when `app.isPackaged` |
| Packaged frontend root                                                   | `resourcesPath/frontend-out`              |
| Depends on live `:3001` / `e2e-server.cjs` / repo `flo.db` when packaged | **No**                                    |

---

## Security Verification

| Check                                      | Result            |
| ------------------------------------------ | ----------------- |
| `npm audit --omit=dev`                     | 0 vulnerabilities |
| Artifact `E2ePass123!`                     | not found         |
| Private key markers                        | not found         |
| `.p12` / `.p8` in artifact                 | not found         |
| Tracked `.env` in artifact                 | not found         |
| Local signing env (`CSC_*`, `APPLE_API_*`) | **ABSENT**        |
| Keychain Developer ID identities           | **0**             |

---

## Release Workflow Verification

File: `.github/workflows/release.yml` (`release-mac`)

| Check                                       | Result                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Hardcoded `com.flo.desktop` / any bundle ID | **No** — uses `package.json` via electron-builder                         |
| `MAC_CERTS` → `CSC_LINK`                    | configured                                                                |
| `MAC_CERTS_PASSWORD` → `CSC_KEY_PASSWORD`   | configured                                                                |
| `APPLE_API_KEY` / `_ID` / `_ISSUER`         | fail-closed if missing; `.p8` decoded to file path                        |
| `APPLE_TEAM_ID`                             | hardcoded `BKDY677XJA` (not a secret)                                     |
| Build                                       | `electron-builder --mac --x64 --arm64 --publish never`                    |
| Post verify                                 | `codesign --verify --deep --strict`, `spctl --assess`, `stapler validate` |
| Compatible with `com.operavia.desktop`      | **Yes** (no workflow change required)                                     |

**Note:** Apple Developer portal App ID / certificates must authorize the new bundle ID on the credential owner’s side — outside this repository.

---

## Automated Tests

| Suite                               | Result                                          |
| ----------------------------------- | ----------------------------------------------- |
| `tests/release-config.test.ts`      | PASS (asserts `appId === com.operavia.desktop`) |
| `tests/dev-tooling-scripts.test.ts` | PASS                                            |
| TypeScript `tsc --noEmit`           | PASS                                            |

GUI-0001…0006 / RBAC / money / hardening remain **prior PASS** — not re-run this gate.

---

## Remaining Blockers

1. Developer ID signing credentials (`MAC_CERTS` / `CSC_LINK` + password, or keychain identity)
2. Apple notarization credentials (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`)
3. OPS-02 real-site drills
4. Master PIN escrow
5. Real desktop backup/restore
6. Backup policy approval
7. JWT/CSP written acceptance **or** Phase C
8. Pilot / executive sign-off
9. Physical printer / café LAN validation

**Not open defects:** GUI-0001…0006 (verified PASS in prior audits).

---

## Verdict

```text
READY FOR SIGNING
```

Configuration and unsigned RC with `com.operavia.desktop` are release-ready.  
Signing/notarization wait only on credentials — not on another engineering fix.

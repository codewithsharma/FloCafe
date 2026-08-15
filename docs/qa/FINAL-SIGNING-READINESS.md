# FINAL SIGNING READINESS

**Date:** 2026-08-15  
**Product:** Operavia  
**Version:** 3.0.5  
**Bundle ID:** `com.operavia.desktop`  
**Unsigned artifact:** `release/mac-arm64/Operavia.app`  
**Pre-signing audit:** PASS ([`FINAL-PRE-SIGNING-AUDIT.md`](./FINAL-PRE-SIGNING-AUDIT.md))  
**Live e2e PID 47633:** not restarted

---

## Status line

```text
SIGNING BLOCKED — CREDENTIALS NOT AVAILABLE
```

```text
READY FOR SIGNING — CREDENTIALS NOT AVAILABLE
```

Config, unsigned RC, and `release.yml` are ready. Signing was **not** attempted.

---

## Environment

| Check                                    | Status                                 |
| ---------------------------------------- | -------------------------------------- |
| macOS host                               | darwin (local)                         |
| Keychain Developer ID Application        | **ABSENT** (0 valid identities)        |
| Keychain Developer ID Installer          | **ABSENT** (0 identities)              |
| Local `CSC_LINK`                         | **ABSENT**                             |
| Local `CSC_KEY_PASSWORD`                 | **ABSENT**                             |
| Local `APPLE_API_KEY`                    | **ABSENT**                             |
| Local `APPLE_API_KEY_ID`                 | **ABSENT**                             |
| Local `APPLE_API_ISSUER`                 | **ABSENT**                             |
| Local `APPLE_TEAM_ID` env                | **ABSENT** (CI hardcodes `BKDY677XJA`) |
| Local `MAC_CERTS` / `MAC_CERTS_PASSWORD` | **ABSENT**                             |

---

## Credentials

| Gate                                      | Status     |
| ----------------------------------------- | ---------- |
| Developer ID certificate                  | **ABSENT** |
| `CSC_LINK` / `MAC_CERTS`                  | **ABSENT** |
| `CSC_KEY_PASSWORD` / `MAC_CERTS_PASSWORD` | **ABSENT** |
| Apple API key                             | **ABSENT** |
| Apple API key ID                          | **ABSENT** |
| Apple API issuer                          | **ABSENT** |

**No values printed. No credentials invented. Signing stopped before execution.**

---

## Release Workflow

File: `.github/workflows/release.yml` → job `release-mac` (`macos-latest`)

| Check                              | Result                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Fail-closed secret gate            | Yes — exits if any of `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` empty |
| Signing                            | `CSC_LINK` ← `secrets.MAC_CERTS` (base64 `.p12`); password ← `MAC_CERTS_PASSWORD`                                      |
| Notarization                       | App Store Connect **API key** — secret is base64 `.p8`, decoded to file path for `@electron/notarize` / notarytool     |
| Build command                      | `npm run build:frontend && npm run build && npx electron-builder --mac --x64 --arm64 --publish never`                  |
| Bundle ID source                   | `package.json` `build.appId` = **`com.operavia.desktop`** (not hardcoded in workflow)                                  |
| Version                            | **3.0.5** from `package.json`                                                                                          |
| Post-build verify                  | `codesign --verify --deep --strict`, `spctl --assess --type execute`, `xcrun stapler validate` (local + re-download)   |
| Workflow defects for new bundle ID | **None** — no change required                                                                                          |

Configured display identity (not a secret): `Codify Apps Private Limited (BKDY677XJA)`.  
`build.mac.notarize: true`, `hardenedRuntime: true`.

---

## Artifact

| Field                                 | Value                                |
| ------------------------------------- | ------------------------------------ |
| Path                                  | `release/mac-arm64/Operavia.app`     |
| Exists                                | Yes                                  |
| Version                               | 3.0.5                                |
| Architecture                          | arm64                                |
| Product                               | Operavia                             |
| CFBundleIdentifier                    | **`com.operavia.desktop`**           |
| Signature                             | **adhoc** (`TeamIdentifier=not set`) |
| frontend-out / KDS / expenses / audit | present                              |
| app.asar + better-sqlite3             | present                              |
| Active packaging `com.flo.desktop`    | **none** (legacy cleanup only)       |

Artifact was **not** replaced this gate.

---

## Signing Procedure

**Preferred (CI) — once GitHub secrets are populated:**

1. Ensure secrets: `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
2. Trigger authorized release via `.github/workflows/release.yml` (`release-mac`)
3. Workflow builds, signs, notarizes, then verifies

**Local equivalent (Developer ID Mac with env set):**

```bash
npm run build:frontend && npm run build
# or: npm run build:mac
npx electron-builder --mac --arm64 --publish never
# With CSC_LINK, CSC_KEY_PASSWORD, APPLE_API_KEY (file path to .p8),
# APPLE_API_KEY_ID, APPLE_API_ISSUER, and optionally APPLE_TEAM_ID=BKDY677XJA
```

Do **not** use `CSC_IDENTITY_AUTO_DISCOVERY=false` when performing real signing.  
Do **not** treat `npm run pack` (`electron-builder --dir`) as a signed release.

---

## Notarization Procedure

1. Electron-builder signs with Developer ID (after credentials present).
2. With `build.mac.notarize: true`, notarization runs via App Store Connect API key (`APPLE_API_KEY` path + `_ID` + `_ISSUER`).
3. Stapling is expected as part of the notarize/staple path; CI validates with `xcrun stapler validate`.
4. Notarization is **after** signing — fail-closed if secrets missing (no silent unsigned ship in `release-mac`).

---

## Cryptographic Verification

After a real signed+notarized build, required checks:

```bash
APP="<path-to-Operavia.app>"   # from DMG/ZIP or release/mac-arm64
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP"   # must NOT say adhoc; expect Developer ID + TeamIdentifier
spctl --assess --type execute --verbose "$APP"
xcrun stapler validate "$APP"
```

**This gate:** verification of production signature **N/A** — credentials absent; current app remains adhoc.

---

## Security

| Check                      | Result                |
| -------------------------- | --------------------- |
| `npm audit --omit=dev`     | **0** vulnerabilities |
| Artifact `E2ePass123!`     | not found             |
| Private key markers        | not found             |
| `.p12` / `.p8` in artifact | not found             |

---

## Final signing readiness matrix

| Gate                     | Status                            |
| ------------------------ | --------------------------------- |
| Developer ID certificate | **ABSENT**                        |
| CSC_LINK                 | **ABSENT**                        |
| CSC_KEY_PASSWORD         | **ABSENT**                        |
| Apple API key            | **ABSENT**                        |
| Apple API key ID         | **ABSENT**                        |
| Apple API issuer         | **ABSENT**                        |
| Release workflow         | **PASS**                          |
| Bundle ID                | **PASS** (`com.operavia.desktop`) |
| Unsigned RC              | **PASS** (valid adhoc)            |
| Signing command          | **DOCUMENTED**                    |
| Notarization flow        | **DOCUMENTED** (API key)          |
| Verification flow        | **DOCUMENTED**                    |
| Security scan            | **PASS**                          |
| npm audit                | **PASS**                          |

---

## Remaining Blockers

1. Supply signing + notarization credentials (CI secrets or Developer ID Mac)
2. Execute signed/notarized build + cryptographic verification
3. OPS-02 / Master PIN desktop DR / policy / pilot sign-off / printer+LAN

**Exact next action:** Populate `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, then run `release-mac` (or local `electron-builder --mac`) and verify codesign / Gatekeeper / stapler before OPS-02.

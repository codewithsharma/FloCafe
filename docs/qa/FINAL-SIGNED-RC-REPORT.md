# FINAL SIGNED RC REPORT

**Date:** 2026-08-15  
**Version:** 3.0.5  
**Platform:** macOS  
**Architecture:** arm64  
**Artifact (current):** `release/mac-arm64/Operavia.app` (~413 MB)  
**Git HEAD:** `9e42eece3d5892594f08be4a88f9c9ceb208047c`  
**Live e2e:** `http://localhost:3001` PID **47633** health **200** (not restarted; not the RC under Gatekeeper)

---

## Build

| Step                                 | Status                                     |
| ------------------------------------ | ------------------------------------------ |
| Main (`npm run build`)               | **PASS** (prior unsigned RC pass)          |
| Frontend (`npm run build:frontend`)  | **PASS**                                   |
| Packaging (`npm run pack` / `--dir`) | **PASS** — unsigned/adhoc artifact present |

---

## Signing

| Check                                      | Result                                                 |
| ------------------------------------------ | ------------------------------------------------------ |
| Configured identity (`build.mac.identity`) | `Codify Apps Private Limited (BKDY677XJA)` (name only) |
| Keychain codesigning identities            | **ABSENT** — `0 valid identities found`                |
| `CSC_LINK`                                 | **ABSENT**                                             |
| `CSC_KEY_PASSWORD`                         | **ABSENT**                                             |
| Current artifact signature                 | **adhoc / linker-signed** — `TeamIdentifier=not set`   |
| `codesign --verify --deep --strict`        | **Not claimed PASS** — app is not Developer ID signed  |

**Action taken:** Signing **stopped**. No alternate signing mechanism invented. No credentials fabricated.

**CI path (when secrets exist):** `.github/workflows/release.yml` expects `MAC_CERTS`, `MAC_CERTS_PASSWORD`, then verifies with `codesign --verify --deep --strict`.

---

## Notarization

| Check                           | Result                                               |
| ------------------------------- | ---------------------------------------------------- |
| `build.mac.notarize`            | `true` (configured)                                  |
| `APPLE_API_KEY`                 | **ABSENT**                                           |
| `APPLE_API_KEY_ID`              | **ABSENT**                                           |
| `APPLE_API_ISSUER`              | **ABSENT**                                           |
| `APPLE_TEAM_ID` (env)           | **ABSENT** (workflow hardcodes team id when CI runs) |
| Submitted                       | **No**                                               |
| Accepted / stapled / Gatekeeper | **Not performed**                                    |

**Action taken:** Notarization **not attempted** (requires successful signing + Apple API credentials).

---

## Security

| Check                                           | Result                                   |
| ----------------------------------------------- | ---------------------------------------- |
| `npm audit --omit=dev`                          | **0** (re-checked this gate)             |
| Artifact `E2ePass123!`                          | **0** hits                               |
| Artifact private key markers                    | **0** hits                               |
| Artifact `JWT_SECRET=` literals                 | **0** hits                               |
| Bundle id / name / version                      | `com.flo.desktop` / Operavia / **3.0.5** |
| frontend-out KDS / expenses / audit             | **Present**                              |
| `app.asar` + better-sqlite3 `darwin-arm64.node` | **Present**                              |

JWT/localStorage + CSP `unsafe-inline` remain **Phase C** residuals (policy acceptance still required).

---

## GUI

Authoritative prior evidence — **not re-run**:

- GUI-0001…0006 PASS
- Final RBAC audit PASS
- RC real-world QA PASS WITH CONDITIONS
- Production readiness / release hardening: CONDITIONAL GO
- Unsigned RC: READY FOR SIGNING ([`FINAL-UNSIGNED-RC-REPORT.md`](./FINAL-UNSIGNED-RC-REPORT.md))

---

## Remaining Gates

### Completed (local / automated)

- Engineering GUI + RBAC + money suites (prior)
- Hardening including P1-06
- Unsigned pack + artifact integrity + secret scan
- Signing environment inspection (credentials absent — honestly reported)

### Pending (credentials / humans)

1. **Signed macOS RC** — needs keychain identity or `CSC_LINK` + `CSC_KEY_PASSWORD`
2. **Notarized macOS RC** — needs Apple Notary API credentials after signing
3. **OPS-02 site drills** — real café
4. **Master PIN escrow** — policy + sealed offline record
5. **Real desktop backup/restore** — packaged app + `safeStorage`
6. **Backup policy approval**
7. **JWT/CSP written acceptance or Phase C**
8. **Pilot / executive sign-off**

### Environment-blocked

- Physical printer
- Café LAN / KDS hardware topology
- CDP hard network-cut of live API
- Concurrent isolated Electron production topology vs e2e PID

---

## OPS-02 execution plan (concise)

Source checklist: [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md)  
**None of the following are marked PASS here.**

| #   | Drill                                  | Classification                                                                                           |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Printer test + reprint                 | **REAL-SITE REQUIRED**                                                                                   |
| 2   | KDS/LAN + POS→KDS propagation          | **REAL-SITE REQUIRED**                                                                                   |
| 3   | Offline / WAN loss / LAN-only          | **REAL-SITE REQUIRED** (local-first design **AUTOMATED/LOCAL VERIFIED** in prior RC QA; WAN cut is site) |
| 4   | Backup create + verify                 | **REAL-SITE REQUIRED** (data-path tests **AUTOMATED/LOCAL VERIFIED**; Master PIN gate needs desktop)     |
| 5   | Restore                                | **REAL-SITE REQUIRED**                                                                                   |
| 6   | Master PIN create / escrow / rotate    | **REAL-SITE REQUIRED** + **REQUIRES POLICY/APPROVAL**                                                    |
| 7   | Force/day-close + cash reconciliation  | **REAL-SITE REQUIRED** (API/day-close suites **AUTOMATED/LOCAL VERIFIED**)                               |
| 8   | Restart / power-loss recovery          | **REAL-SITE REQUIRED**                                                                                   |
| 9   | Network failure / duplicate protection | **REAL-SITE REQUIRED**                                                                                   |
| 10  | Staff role verification on pilot host  | **REAL-SITE REQUIRED** (Chromium RBAC matrix **AUTOMATED/LOCAL VERIFIED** on e2e)                        |

---

## Real desktop backup / restore procedure (do not mark PASS until executed)

**Preconditions:** Signed+notarized RC preferred; at minimum a real packaged `Operavia.app` on a Mac with `safeStorage` available; after-hours / training data only.

1. Install signed/notarized RC (or approved clean-machine copy of packaged app).
2. Launch application (not `e2e-server.cjs`, not repo unpackaged DB).
3. Complete first-run / owner setup as required.
4. Create Master PIN via in-app flow.
5. Escrow Master PIN offline per approved policy (not chat/git/Drive).
6. Create backup; record filename/path/size.
7. Create known sale/data; note order id + totals.
8. Restore from backup with Master PIN confirmation.
9. Relaunch application.
10. Verify restored order id / settings / login.
11. Confirm no recovery latch unless intentionally testing failure; document any recovery UI.

**Evidence required:** screenshots + backup path listing + order ids + signed worksheet.  
**Status this gate:** **NOT PERFORMED** — e2e-as-node Master PIN remains fail-closed by design.

---

## Final Decision

```text
READY FOR SIGNING — CREDENTIALS NOT AVAILABLE
```

Unsigned `Operavia.app` remains valid for the signing handoff.  
**Not** `SIGNED — READY FOR NOTARIZATION`.  
**Not** `SIGNED + NOTARIZED — READY FOR OPS-02`.  
**Not** live café GO.

### Exact next action

1. Provide macOS Developer ID credentials to this machine **or** run the macOS job in `.github/workflows/release.yml` with secrets `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
2. Produce signed + notarized artifact; verify `codesign --verify --deep --strict`, `stapler validate`, and `spctl --assess`.
3. Install that artifact on a pilot Mac and execute OPS-02 + Master PIN backup/restore with evidence.

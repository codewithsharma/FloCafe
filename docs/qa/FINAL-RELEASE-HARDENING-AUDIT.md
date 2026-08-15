# Final Release Hardening Audit

**Date:** 2026-08-15  
**Product:** OPERAVIA Restaurant (repo legacy FloCafe)  
**Version:** 3.0.5  
**Schema tip:** v86  
**Prior readiness report:** [`FINAL-PRODUCTION-READINESS-AUDIT.md`](./FINAL-PRODUCTION-READINESS-AUDIT.md)  
**Live e2e server:** `http://localhost:3001` — **PID 47633** — health **200** (not restarted this pass)  
**Branch:** `restaurant-vertical`

---

## Current Verdict

```text
CONDITIONAL GO
```

Engineering hardening for this pass is complete enough to produce an **unsigned** release candidate and to proceed toward **signed/notarized** packaging. Live café production remains blocked on operational, packaging-credential, and governance gates — not on open GUI P0/P1 defects from GUI-0001…0006.

Not upgraded to **GO**: automated suites and a local fail-closed DB fix do not replace OPS-02, Master PIN desktop DR, signed artifacts, or executive acceptance of security residuals.

---

## Tests Executed

| Suite                                  | Result           | Notes                                                               |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `npx tsc --noEmit` (main)              | PASS             |                                                                     |
| `npx tsc -p frontend --noEmit`         | PASS             |                                                                     |
| `npm run build`                        | PASS             |                                                                     |
| `npm run build:frontend`               | PASS             | routes include `/kds`, `/expenses`, etc.                            |
| `npm audit --omit=dev`                 | PASS             | 0 vulnerabilities                                                   |
| GUI-0001                               | PASS             |                                                                     |
| GUI-0002                               | PASS             |                                                                     |
| GUI-0003 / GUI-0005–0006               | PASS             | `NODE_PATH=frontend/node_modules`                                   |
| JWT logout lifecycle                   | PASS             |                                                                     |
| money-cents phase2                     | PASS             | 20/20                                                               |
| backup-restore (data-path)             | PASS             | 10/10 — **not** desktop Master PIN restore                          |
| day-close-z contracts                  | PASS             |                                                                     |
| day-close.test.ts                      | PASS after fix   | Stale `user_version === 83` → tip via `getSupportedSchemaVersion()` |
| P1-06 unopenable DB                    | PASS             | New suite                                                           |
| Broad Chromium GUI session             | **Not re-run**   | Prior PASS retained                                                 |
| Physical printer / café LAN / notarize | **Not executed** | Environment / credentials                                           |

**PID 47633:** verified still running and healthy after this pass.

---

## Security Findings

| Topic                 | Classification            | Release impact                                                               |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| JWT in `localStorage` | P1 residual — **Phase C** | Written acceptance required before live café                                 |
| CSP `unsafe-inline`   | P1 residual — **Phase C** | Same                                                                         |
| Secrets hygiene       | VERIFIED PASS             | Prior audit; no change needed                                                |
| Unauthenticated API   | VERIFIED PASS             | 401                                                                          |
| npm production deps   | VERIFIED PASS             | 0                                                                            |
| Root `index.js`       | Hygiene                   | Accidental CJS dump; **removed** (not referenced; `main` is `dist/index.js`) |

---

## Authentication

| Fact                 | Value                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Default JWT lifetime | **24h** (`expires_in: 86400`)                                                                                             |
| Remember-me          | **10d**                                                                                                                   |
| Storage              | `localStorage` keys **`token`**, **`tenant`**                                                                             |
| Logout               | Client clears storage; server `revokeToken` (+ DB revoked_tokens)                                                         |
| Refresh              | `POST /api/auth/refresh` exists; **UI does not call it**                                                                  |
| HttpOnly cookies     | Technically possible but multi-surface (Electron, KDS standalone, static export Axios Bearer) — **unsafe as RC drive-by** |
| Recommendation       | **Do not migrate before RC.** Document Phase C; require written residual acceptance                                       |

---

## CSP

| Fact                   | Value                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Where                  | `main/middleware/http-observability.ts` Helmet; also legacy `renderer/*.html` meta              |
| `unsafe-inline`        | **scriptSrc** and **styleSrc** — all environments (no prod-only branch)                         |
| Why                    | Next.js static export + Tailwind inline styles/scripts                                          |
| Safe to remove for RC? | **No** without breaking UI / rewriting asset pipeline                                           |
| Mitigation             | LAN isolation (OPS-01); no guest Wi‑Fi to :3001–3003; accept residual or Phase C nonce/hash CSP |

---

## Database

| Topic                  | Status                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema tip             | v86                                                                                                                                                  |
| REAL dual-write        | Same SQLite transaction via `dualFromMajor`; prefer-cents readers; **cutover deferred** (not a RC redesign)                                          |
| P1-06 unopenable DB    | **CODE FIX** this pass: `new Database()` wrapped → `DatabaseRecoveryRequiredError('corrupt_database')` + recovery latch (does not weaken encryption) |
| Encrypted café DB file | Not an application-level ciphertext DB; Master PIN protects backup/restore gates via OS `safeStorage`                                                |
| P1-06 prior gap        | Hard open failure crashed before R14 integrity path — now fail-closed into recovery UI                                                               |

---

## Backup / Restore

| Claim                                      | Status                                          |
| ------------------------------------------ | ----------------------------------------------- |
| Automated backup/restore data-path tests   | VERIFIED PASS                                   |
| Master PIN + `safeStorage` on real desktop | **BLOCKED — REAL DESKTOP ENVIRONMENT REQUIRED** |
| Full restore PASS on this host             | **Not claimed**                                 |
| Fail-closed when safeStorage unavailable   | Intentional (e2e-as-node → 503)                 |

---

## Electron

| Item               | Detail                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Unsigned RC        | `npm run build && npm run build:frontend && npm run pack` (or `build:mac` / `build:win` / `build:linux` with discovery off) |
| Signed RC          | Signing env (`CSC_LINK`, `CSC_KEY_PASSWORD`, mac identity in `package.json` build.mac)                                      |
| Notarized mac RC   | Signed + `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` / `APPLE_TEAM_ID`                                        |
| This pass          | Did **not** sign/notarize (credentials not assumed present)                                                                 |
| Unpackaged DB path | Repo-relative `flo.db` when `!isPackaged` — concurrent Electron vs e2e PID is ENVIRONMENT LIMITATION                        |

---

## Offline

| Claim                          | Status                                             |
| ------------------------------ | -------------------------------------------------- |
| Local-first SQLite / LAN sales | Product design; prior RC QA money smoke PASS       |
| Browser CDP hard-cut of :3001  | ENVIRONMENT BLOCKED (capture-only network tooling) |
| Offline order queue            | Not the product model                              |

---

## Printing

| Claim                  | Status                                      |
| ---------------------- | ------------------------------------------- |
| Graceful print failure | Prior RC QA — order stays paid              |
| Physical printer       | **ENVIRONMENT BLOCKED** — OPS-02 drills 1–2 |

---

## KDS/LAN

| Claim                | Status                              |
| -------------------- | ----------------------------------- |
| SPA `/kds/` fallback | VERIFIED (GUI-0001)                 |
| Real café LAN drill  | **OPERATIONAL** — OPS-02 drills 3–4 |

---

## Day Close

| Claim                     | Status                                  |
| ------------------------- | --------------------------------------- |
| API close + duplicate 409 | Prior RC QA                             |
| Z contracts               | VERIFIED this pass                      |
| Full day-close suite      | VERIFIED after schema tip assertion fix |
| Site cash reconciliation  | OPS-02 drills 10–11                     |

---

## Residual classification table

| Risk                   | Severity     | Code fix possible?            | Operational?          | Environment blocked?     | Release impact     |
| ---------------------- | ------------ | ----------------------------- | --------------------- | ------------------------ | ------------------ |
| JWT / localStorage     | P1           | Phase C only (architecture)   | Accept in writing     | No                       | Policy gate        |
| CSP unsafe-inline      | P1           | Phase C (pipeline)            | Accept in writing     | No                       | Policy gate        |
| REAL dual-write        | P2           | Cutover later; no RC redesign | Monitor pilots        | No                       | Accepted residual  |
| P1-06 DB openability   | P1→mitigated | **Yes — done this pass**      | Recovery drill        | No                       | Engineering closed |
| Backup / restore       | P0 ops       | Code paths exist              | **Yes**               | Desktop `safeStorage`    | OPS gate           |
| Master PIN             | P0 ops       | Fail-closed intentional       | Escrow + rotate       | Desktop OS crypto        | OPS gate           |
| Printer                | Ops          | N/A                           | **Yes**               | Physical hardware        | OPS-02             |
| KDS / LAN              | Ops          | N/A                           | **Yes**               | Real café LAN            | OPS-02             |
| Day-close              | Ops+eng      | Eng suites PASS               | Site worksheet        | No for eng               | OPS-02 for live    |
| Electron shell         | Ops          | Packaging scripts ready       | Clean-machine install | Concurrent e2e topology  | Packaging gate     |
| Offline hard-cut       | Ops          | N/A                           | WAN cut drill         | CDP limitation in QA lab | OPS-02             |
| Signing / notarization | Release      | Config present                | Credentials           | Creds may be absent      | RC artifact gate   |
| Backup policy          | Governance   | N/A                           | **Yes**               | No                       | Sign-off           |
| Pilot approval         | Governance   | N/A                           | **Yes**               | No                       | Sign-off           |

---

## OPS-02

Created: [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md)  
All 15 drills left **unmarked** — real-world only.

---

## Release Checklist

Created: [`docs/qa/RELEASE-CANDIDATE-CHECKLIST.md`](./RELEASE-CANDIDATE-CHECKLIST.md)

---

## Remaining Engineering Risks

1. **JWT + localStorage** XSS blast radius on reachable LAN (mitigate with network isolation until Phase C).
2. **CSP `unsafe-inline`** same blast radius.
3. **REAL dual-write** until cents cutover — prefer-cents + same-txn writers; residual mismatch risk if readers diverge.
4. **Live disaster recovery** not claimed without desktop Master PIN restore proof.

---

## Environment / Operational Blockers

- Physical printer
- Real café LAN / KDS drill
- CDP / lab hard-cut of live API process
- Real desktop Master PIN backup/restore
- Concurrent isolated Electron production topology vs shared e2e PID
- Apple/Windows signing & notarization credentials (if not already in CI secrets)

---

## Required Before Production

1. Signed/notarized RC for target OS
2. OPS-02 site drills with evidence
3. Master PIN escrow + desktop backup/restore proof
4. Backup policy approval
5. Written acceptance of JWT/localStorage + CSP residuals **or** Phase C remediation
6. Pilot / executive sign-off

---

## Safe To Proceed To RC?

**CONDITIONAL GO** — yes, proceed to **build unsigned RC**, then **sign/notarize when credentials are available**, then execute OPS-02.  
Do **not** treat this document as live-café GO.

---

## Changes in this hardening pass

| Change                               | Type         |
| ------------------------------------ | ------------ |
| P1-06 unopenable DB → recovery latch | Code + test  |
| day-close tip schema assertion       | Test hygiene |
| Removed accidental root `index.js`   | Hygiene      |
| OPS-02 drill checklist               | Docs         |
| RC checklist                         | Docs         |
| This audit                           | Docs         |

**Server PID 47633 was NOT restarted. Nothing was pushed.**

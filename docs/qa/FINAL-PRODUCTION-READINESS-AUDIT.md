# RestaurantOS — Production Readiness Audit

**Date:** 2026-08-15  
**Product:** OPERAVIA Restaurant (repo legacy FloCafe)  
**Version (package.json):** 3.0.5 (`flo-desktop` / productName Operavia)  
**Git commit:** `1469a1ae976345f037ac2aeb7760dd45f80b50d0` — `fix(gui): close route RBAC leaks and chef kitchen nav` (Dev Raj Sharma)  
**Server under test:** `http://localhost:3001`  
**PID:** 47633  
**Health:** `{"status":"ok","db":"ok",…}` → **200** (e2e reports service version string **2.4.7** — see Observability)  
**Schema tip:** **v86**

---

## Executive Summary

Engineering GUI, RBAC, money smoke, and automated suites for the Restaurant vertical are in strong shape after GUI-0001…0006. **There are no open GUI P0/P1 authorization or false-฿0.00 checkout defects.**

**Live café deployment is not fully cleared.** Signed/notarized release artifact, OPS-02 site drills, Master PIN escrow, and a real-desktop backup/restore drill remain mandatory. Residual software risks (JWT in `localStorage` + CSP `unsafe-inline`, REAL dual-write, unopenable-DB edge, shift-less day-close cash Z) are accepted only under controlled LAN/ops constraints.

### Final decision

```text
CONDITIONAL GO
```

Not **GO** (production environment validation incomplete).  
Not **NO-GO** for engineering quality of the audited POS/RBAC/money paths — no remaining catastrophic GUI/authz/payment false-total product defects from this program.

**Do not deploy to a live café until every condition in “Required Actions Before Production” is completed and signed off.**

---

## Current QA Status

| Gate                                               | Verdict                          | Evidence                                           |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| Full GUI coverage                                  | PASS WITH CONDITIONS             | `docs/qa/evidence/gui/full/FINAL-FULL-COVERAGE.md` |
| GUI-0001…0004 retest                               | PASS                             | `FINAL-RETEST.md`                                  |
| GUI-0005 / 0006                                    | PASS                             | `FINAL-RBAC-RETEST.md`                             |
| Final RBAC audit                                   | PASS (failCount 0)               | `FINAL-RBAC-AUDIT.md`                              |
| RC real-world                                      | PASS WITH CONDITIONS             | `FINAL-RC-REAL-WORLD-QA.md`                        |
| Targeted unit suites (gui-0001…0005, flo-ui-shell) | PASS                             | this program                                       |
| Frontend `tsc --noEmit`                            | PASS                             | this audit                                         |
| `npm audit --omit=dev`                             | 0 vulnerabilities reported       | this audit                                         |
| Live Go-Live (R16 / OPS-02)                        | **NO-GO until human/site gates** | `docs/05-production/r16-*`, `ops-02-*`             |

---

## Security

| Topic                           | Assessment                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Tracked secrets / `.env`        | **SAFE** — `.env` gitignored; only `.env.example` tracked                                                          |
| E2E password `E2ePass123!`      | **SAFE** — tests/docs only; not found in `frontend/out` / packaged `dist` payload                                  |
| `@flo.local` placeholders in UI | **P2** — example emails in KDS/server forms; demo seeds inactive with random passwords                             |
| JWT                             | Issued by server; stored in **localStorage**; 24h / 10d remember; logout revoke + `tokens_valid_after`             |
| Electron window                 | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`                                                |
| Helmet CSP                      | Present; **`unsafe-inline`** for script/style — **P1 residual** with localStorage JWT (XSS blast radius on LAN)    |
| CORS                            | Restrictive (localhost / `.local` / private IP)                                                                    |
| Login rate limit                | **10 / 15 min**, no private-IP bypass on auth limiter                                                              |
| Unauthenticated API             | Spot-check **401** on `/api/orders`, `/products`, `/settings`, `/reports/sales`, `/staff`, `/expenses`, `/audit`   |
| Unauthenticated GUI             | Static HTML may load; AuthGuard sends unauthenticated `/pos/` → `/auth/login/` (verified Chromium); APIs still 401 |

**Secrets audit:** **SAFE** (no production credentials found in artifacts).

---

## RBAC

| Layer                     | Status                                          |
| ------------------------- | ----------------------------------------------- |
| Sidebar                   | `FLO_NAV_ITEMS.roles`                           |
| Route policy              | `getRolesForAppPath` → `canAccessAppPath`       |
| AuthGuard                 | Redirect + **no render** when denied            |
| Server                    | `requireAuth` + `requireRole` authoritative     |
| GUI matrix                | Owner/Manager/Cashier/Waiter/Chef — **0 fails** |
| Chef Kitchen              | Nav + `/kds/` + refresh PASS                    |
| Waiter/Cashier deep-links | Denied to landing                               |

**Status:** **PASS** (client + server model aligned for desktop routes audited).

---

## Financial Integrity

| Control                             | Status                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Coffee ฿60 + tax ฿4.20 = **฿64.20** | PASS (multiple GUI evidences)                                                                        |
| Prepaid Confirm ฿0.00 guard         | PASS (`prepaid-payable.ts`, GUI-0002)                                                                |
| Payment Idempotency-Key             | Mandatory on pay path                                                                                |
| Print failure after pay             | Order remains paid (RC evidence)                                                                     |
| Duplicate day-close                 | 409                                                                                                  |
| Currency model                      | THB / symbol ฿; integer-cents contract with **REAL dual-write residual** (Hardening — not a GUI bug) |

**Status:** **PASS WITH CONDITIONS** (REAL cutover still open as hardening; not a false-total defect).

---

## POS / Orders

Local SQLite SoR; create + cash record work without internet while local API is up. Cart is not a durable offline queue if `:3001` is down.

**Status:** **PASS WITH CONDITIONS** (local API availability required).

---

## KDS

SPA `/kds/` hard-nav PASS; unauthenticated kiosk allowed; authenticated roles gated (owner/manager/chef). Companion recovery hardened (H2). No durable KDS outbox (**P2**).

**Status:** **PASS WITH CONDITIONS**.

---

## Inventory / QR

Inventory OS + purchasing shipped (R4–R6). QR guest LAN ordering shipped (R10); pay-at-counter; expands unauthenticated LAN surface (ops: no guest Wi‑Fi).

**Status:** **PASS WITH CONDITIONS** (LAN ops discipline).

---

## Offline / Sync

| Mode                         | Status                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Internet offline + local API | PASS (badge + ORD-0007)                                                          |
| Hard-cut local API           | **BLOCKED BY ENVIRONMENT** (no CDP); architecture has **no** browser order queue |
| Cloud outbox                 | FloAdmin path; does not block billing                                            |

**Classification:** **PASS WITH CONDITIONS**.

---

## Backup / Restore

| Path                               | Status                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Production design                  | Master PIN + `safeStorage`; fail-closed if unavailable                               |
| e2e-as-node                        | Create/restore **BLOCKED** (503 / PIN unavailable) — **environment**, not design bug |
| Pre-migration auto-backup          | Present                                                                              |
| Full restore drill on real desktop | **NOT CLAIMED**                                                                      |
| Cancel restore UI                  | PASS                                                                                 |

**Classification:** **PASS WITH CONDITIONS** / restore execution **BLOCKED BY ENVIRONMENT** in this harness.

---

## Day Close

Close **201**; duplicate **409**. With `shifts_enabled=false`, cash Z section is **0** while Reports still show day sales — **product design** (aggregates closed shifts).

**Classification:** **PASS WITH CONDITIONS**.

---

## Printing

Software failure path PASS; physical printer **BLOCKED BY ENVIRONMENT**. R13 retry is manual (**P2**).

---

## Electron

| Item                            | Status                                                                   |
| ------------------------------- | ------------------------------------------------------------------------ |
| Security flags                  | PASS (isolation/sandbox)                                                 |
| Packaged signed/notarized RC    | **BLOCKED** (no signing credentials) — unsigned `--dir` verified earlier |
| Concurrent shell vs e2e `:3001` | Impossible by design                                                     |
| Unpackaged DB path              | Uses repo `flo.db` when `!isPackaged` (**P2** footgun for engineers)     |

**Classification:** **BLOCKED BY ENVIRONMENT** for production artifact; security config **PASS**.

---

## Database / Migrations

Schema tip **v86**; deterministic migrations with pre-migrate backup; R14 corrupt-openable fail-closed. Residual **P1-06** unopenable DB throw.

**Classification:** **PASS WITH CONDITIONS**.

---

## Build / Dependencies

| Check                           | Result                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Root version                    | 3.0.5                                                                                  |
| Frontend package version        | 0.1.0 (internal; not customer-facing)                                                  |
| `npm audit --omit=dev`          | **0** reported vulns                                                                   |
| Frontend tsc                    | PASS                                                                                   |
| Suspicious untracked `index.js` | Accidental compiled module dump at repo root — **do not ship**; not in last GUI commit |

**Health version string 2.4.7 vs package 3.0.5:** **P3** labeling inconsistency on e2e health payload.

---

## Deployment

Operators need: packaged Electron app (signed), `userData` DB + backups dir, Master PIN escrow, `network_mode` policy (`localhost` / `kds_lan`), printer config, KDS/LAN checklist, restore drill evidence.

Docs exist: `docs/13-operations/pilot-runbook.md`, `ops-02-site-readiness-checklist.md`, `r16-release-gate-checklist.md`.

**DOCUMENTATION:** present. **SITE VALIDATION:** pending human.

---

## Observability

`/api/health` OK; audit trail UI + CSV; login/order/payment audits observed in GUI. Production errors should avoid secrets (spot-check 401 bodies clean). Startup composition logs present.

**Status:** **PASS WITH CONDITIONS** (operator still needs signed binary + runbook drills).

---

## P0 Blockers

### Product defects (must fix in code before any claim of unrestricted production)

**None identified in this audit** for GUI money false-totals, RBAC deep-link leaks (GUI-0005/0006 closed), or tracked secret leakage.

### Live-deployment blockers (must clear before real restaurant Go-Live)

1. **Signed / notarized RC** for target OS (R16).
2. **OPS-02 site readiness** — printer, KDS/LAN, restore, force-close, operator walkthrough.
3. **Master PIN escrow** + attested desktop backup **and** restore drill.
4. **Backup policy** numeric approval (OPS docs still pending).
5. **Executive / pilot sign-off** package.

Until (1)–(5) complete, treat live Go-Live as **NO-GO** operationally even though this audit’s engineering decision is **CONDITIONAL GO**.

---

## P1 Blockers / residuals

| ID          | Item                                        | Notes                                                       |
| ----------- | ------------------------------------------- | ----------------------------------------------------------- |
| SEC-JWT-CSP | JWT in `localStorage` + CSP `unsafe-inline` | Accept only on staff LAN / localhost; guest Wi‑Fi forbidden |
| P0.3        | REAL money dual-write residual              | Prefer-cents readers; cutover not authorized                |
| P1-06       | Unopenable DB throw                         | R14 covers corrupt-openable only                            |
| DR          | Live Master-PIN restore                     | Not proven in e2e-as-node                                   |
| DAY-Z       | Cash Z empty without shifts                 | Enable shifts if café needs cash Z                          |

---

## P2 Issues

- Durable KDS outbox deferred
- R13 print queue manual retry only
- Placeholder `@flo.local` in packaged UI forms
- GPU sandbox disable switch (Windows)
- Unpackaged Electron writes `./flo.db`
- Health version string drift (2.4.7 vs 3.0.5)
- Untracked root `index.js` hygiene

---

## P3/P4 Backlog

- Frontend package version `0.1.0` vs app `3.0.5`
- Alias routes `/inventory` `/team` bounce (INFO)
- Exhaustive Settings tab button matrix
- WhatsApp module (if disabled)

---

## Environment-Blocked Tests

| Test                                     | Why                              |
| ---------------------------------------- | -------------------------------- |
| CDP hard network cut of `:3001`          | Browse MCP capture-only          |
| Physical printer                         | No CUPS destinations             |
| Master PIN backup/restore on e2e-as-node | `safeStorage` unavailable → 503  |
| Native Electron GUI against same e2e PID | Separate process/DB by design    |
| Codesign / notarization                  | No identities in eng environment |

---

## Failure scenarios

| Scenario             | Safe?          | Recovery              | Data loss risk          | Severity              |
| -------------------- | -------------- | --------------------- | ----------------------- | --------------------- |
| API down during POS  | No (new sales) | Restart local API     | Medium–High unpaid cart | Ops P0                |
| DB corrupt-openable  | Fail-closed    | Restore + clear latch | Low if backup good      | OK design             |
| Internet disconnect  | Yes            | Local SoR             | None                    | OK                    |
| Refresh mid-checkout | Partial        | Re-add cart           | Low if unpaid           | P2                    |
| Duplicate pay click  | Yes            | Idempotency           | Low                     | OK                    |
| KDS down             | Yes for money  | DB replay             | Kitchen delay           | P2                    |
| Printer down         | Yes for money  | Reprint / R13         | Receipt only            | P2                    |
| Backup create fail   | Yes (no wipe)  | Fix PIN/keyring       | High if never backed up | DR P0 until proven    |
| Restore cancel       | Yes            | —                     | None                    | OK                    |
| App restart          | Yes if DB OK   | WAL                   | Low committed           | OK                    |
| Process kill         | Partial        | WAL / integrity       | Low–Medium              | P1 unproven mid-write |

---

## Status table

| Area               | Status                          | Severity            | Evidence                    | Production impact       |
| ------------------ | ------------------------------- | ------------------- | --------------------------- | ----------------------- |
| Security (secrets) | PASS                            | —                   | gitignore / packaging scan  | Safe                    |
| Authentication     | PASS WITH CONDITIONS            | P1 residual JWT+CSP | auth.ts, auth store         | LAN-only accept         |
| RBAC               | PASS                            | —                   | FINAL-RBAC-AUDIT            | Safe                    |
| POS                | PASS WITH CONDITIONS            | —                   | GUI + RC                    | Needs local API         |
| Money              | PASS WITH CONDITIONS            | P1 REAL residual    | GUI-0002, bills idempotency | Pilot OK                |
| Payments           | PASS WITH CONDITIONS            | —                   | RC print-fail paid          | Safe                    |
| Orders             | PASS                            | —                   | GUI                         | Safe                    |
| KDS                | PASS WITH CONDITIONS            | P2 outbox           | GUI-0001/0006               | Safe                    |
| Inventory          | PASS                            | —                   | Owner walk                  | Safe                    |
| QR                 | PASS WITH CONDITIONS            | LAN surface         | FINAL-FULL                  | Ops LAN                 |
| Offline            | PASS WITH CONDITIONS            | Env hard-cut        | FINAL-RC                    | Local-first OK          |
| Sync (cloud)       | PASS WITH CONDITIONS            | —                   | architecture                | Non-blocking            |
| Backup             | PASS WITH CONDITIONS            | Env PIN             | FINAL-RC                    | Desktop drill required  |
| Restore            | BLOCKED (exec) / PASS (cancel)  | Env                 | FINAL-RC                    | Drill required          |
| Day-close          | PASS WITH CONDITIONS            | Design              | API 201/409                 | Enable shifts if needed |
| Audit              | PASS                            | —                   | GUI                         | Safe                    |
| Printing           | PASS WITH CONDITIONS            | HW blocked          | FINAL-RC                    | SOP + HW                |
| Electron           | BLOCKED (signed RC)             | Release             | R16 docs                    | Must sign               |
| Database           | PASS WITH CONDITIONS            | P1-06               | migrations v86              | Safe for pilot          |
| Migrations         | PASS                            | —                   | auto-backup                 | Safe                    |
| Build              | PASS                            | P3 version labels   | tsc / audit 0               | Safe                    |
| Dependencies       | PASS                            | —                   | npm audit 0                 | Safe                    |
| Deployment         | DOCUMENTATION OK / SITE PENDING | P0 ops              | OPS-02                      | Blocks live             |
| Observability      | PASS WITH CONDITIONS            | P3 health version   | /api/health                 | Safe                    |

---

## Required Actions Before Production

1. Produce **signed + notarized** Operavia build for the café OS; retire unsigned TRAINING binaries for live.
2. Complete **OPS-02** site checklist (printer, KDS/LAN, force-close, operator walkthrough).
3. Complete **Master PIN escrow** + **desktop backup create** + **destructive restore drill** on disposable then attested café procedure.
4. Approve **backup retention/policy** numerically.
5. Confirm `network_mode` and **guest Wi‑Fi forbidden**; accept JWT/CSP residual in writing or schedule Phase C harden.
6. If café needs cash Z section: enable **shifts**, close them before day-close.
7. Obtain **CEO/CTO/pilot sign-off** per R16 pack.
8. Do **not** commit accidental root `index.js`; keep e2e credentials out of packaging (already true).

---

## Final GO/NO-GO Decision

```text
CONDITIONAL GO
```

**Meaning:**

- Engineering quality for Restaurant POS GUI, RBAC, and audited money paths is sufficient to proceed toward a **controlled pilot** once operational gates clear.
- **Live unrestricted production remains blocked** until signed RC + OPS-02 + Master PIN DR + sign-off are done (those are **conditions**, not optional polish).

**Conditions (all required before live café Go-Live):**

1. Signed/notarized RC
2. OPS-02 site drills complete
3. Master PIN escrow + proven desktop backup/restore
4. Backup policy approved
5. Written acceptance of LAN/JWT-CSP residual (or Phase C fix)
6. Pilot/executive sign-off

**Git:** No product code changes in this audit — **no commit**. No push. PID **47633** left running.

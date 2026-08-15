# RELEASE CANDIDATE REAL-WORLD QA

**Date:** 2026-08-15  
**Server:** `http://localhost:3001` (e2e `tests/e2e-server.cjs`)  
**PID:** 47633 (never restarted / never killed)  
**Health:** `GET /api/health` → **200** (verified throughout)  
**KDS:** `http://localhost:3002` (same Electron PID)  
**Disposable DB:** `/var/folders/.../T/flo-e2e-4n0qwU/flo.db` (confirmed e2e temp)

---

## Environment

| Item                      | Value                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| Browser                   | Cursor Browse MCP / Chromium → e2e `:3001`                           |
| Electron native           | Separate smoke on `:3101` (cannot share e2e process)                 |
| Database                  | Disposable e2e SQLite schema v86                                     |
| Printer                   | **None** (`lpstat`: no destinations)                                 |
| Network control           | Browse `browser_network` = **capture only** (no CDP offline emulate) |
| Master PIN on e2e-as-node | **Unavailable** (OS encryption / keyring) — backup API **503**       |

---

## Implementation context (inspected)

- **Offline product contract:** local-first SQLite + local API; shell Online/Offline is badge-only; SW does not cache `/api`. No browser OfflineOrder queue.
- **Backup/restore:** Settings `?tab=data`; Master PIN gated; restore replaces live DB (destructive).
- **Day-close:** `POST /api/reports/day-close`; duplicate → **409**; cash Z totals derived from **closed shifts** (not from all sales when `shifts_enabled=false`).
- **Print:** thermal / WebUSB; no printer → graceful failure; pay still succeeds.
- **Electron:** unpackaged `electron .` uses **repo `flo.db`** (`getDbPath` when `!isPackaged`); cannot attach to existing e2e `:3001`.

---

## Offline

| Check                     | Result                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Online                    | PASS — Online badge (`rc-offline-online.png`)                                                |
| Offline detection (badge) | PASS — Offline badge after `navigator.onLine=false` (`rc-offline-state.png`)                 |
| Offline operation         | PASS — cart intact; takeaway checkout while badge Offline                                    |
| Persistence               | PASS — **ORD-20260815-0007** completed, total **฿64.20**                                     |
| Recovery                  | PASS — Online badge restored (`rc-offline-recovery.png`)                                     |
| Sync                      | N/A for POS SoR — order never left local SQLite; cloud outbox not in scope for this café e2e |
| Hard-cut of localhost API | **BLOCKED BY ENVIRONMENT** — no CDP `Network.emulateNetworkConditions`                       |

**Architecture note:** Product “offline” = no internet while local API runs. Badge-offline + local sale validates the intended model. Cutting Chromium↔`:3001` would simulate **backend down**, which is intentionally unsupported (no client order queue).

**Verdict:** **PASS WITH CONDITIONS**  
Condition: hard network-cut of local API not executable in this harness.

---

## Electron

| Check                        | Result                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup                      | PASS WITH CONDITIONS — `PORT=3101` process started; `/api/health` **200** (version 3.0.5); e2e `:3001` stayed up                                   |
| Login / POS / KDS GUI        | **BLOCKED** — JWT recovery latch (`JWT signing secret is missing or corrupt`); window not fully exercised in Chromium pack                         |
| Concurrent use of e2e PID DB | **IMPOSSIBLE** — native shell always boots its own server                                                                                          |
| Unpackaged DB path           | Uses `Projects/FloCafe/flo.db` (not `--user-data-dir`) when `!isPackaged` — smoke migrated that file v75→v86 with auto-backup under smoke userdata |
| Close                        | Process exited; `:3101` closed; `:3001` PID **47633** still listening                                                                              |

**Verdict:** **BLOCKED BY ENVIRONMENT** (for “native shell vs same e2e pack”) / **PASS WITH CONDITIONS** (isolated port smoke only).  
Evidence: process log `/tmp/flo-electron-rc.log`; no fake `rc-electron-*.png` for a full native GUI session.

---

## Printing

| Level                      | Result                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI print flow              | PASS — Confirm Print dialog (`rc-print-flow.png`)                                                                                                  |
| Electron print invocation  | Not separately proven beyond e2e API/UI                                                                                                            |
| System printer enumeration | Empty — no CUPS destinations                                                                                                                       |
| Physical print             | **BLOCKED BY ENVIRONMENT**                                                                                                                         |
| Failure handling           | PASS — toast _Failed to print… not connected_; order **ORD-0007** remained Completed/Paid (`rc-print-failure.png`); no crash; no duplicate payment |

**Verdict:** **PASS WITH CONDITIONS** (software failure path) / hardware **BLOCKED BY ENVIRONMENT**

---

## Backup

| Check         | Result                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Backup UI     | PASS — Backup & Data / history lists pre-v86 artifact (`rc-backup-success.png` = history listing)                                          |
| Create Backup | **BLOCKED** — Master PIN / OS encryption unavailable; toast _Backup failed_ (`rc-backup-blocked.png`); API `POST /api/db/backup` → **503** |
| Artifact      | Existing managed file `flo-backup-…-pre-v0-to-v86.db` in e2e `backups/`                                                                    |
| Integrity     | Pre-migration backup present; new Master-PIN backup not created                                                                            |

**Verdict:** **BLOCKED BY ENVIRONMENT** for PIN-gated create on e2e-as-node; UI listing **PASS**

---

## Restore

| Check                        | Result                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Environment safety           | PASS — e2e temp DB disposable                                                  |
| Restore UI                   | PASS — Confirm Restore opened; overwritten-data warning shown                  |
| Restore execution            | **Not executed** — Cancel only (`rc-restore-safe.png`); Master PIN unavailable |
| Data integrity after restore | **NOT TESTED** (destructive path blocked)                                      |

**Verdict:** **BLOCKED BY ENVIRONMENT** (cannot complete Master-PIN restore on this server)  
Safe cancel path: **PASS**

---

## Day Close

| Check                 | Result                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary UI            | PASS (`rc-day-close-summary.png`)                                                                                                                                                                       |
| API close             | PASS — `POST /api/reports/day-close` → **201** for `2026-08-15`                                                                                                                                         |
| Duplicate enforcement | PASS — second close → **409** `Day close already exists`                                                                                                                                                |
| Totals                | PASS WITH CONDITIONS — Z/cash section **0** because `shifts_enabled=false` and day-close cash aggregates **closed shifts**; sales report still shows day sales **฿513.60** / cash method totals present |
| Post-close            | PASS — re-close blocked                                                                                                                                                                                 |
| Audit                 | Close recorded (`day_close` id 1, closed_by `e2e-owner`)                                                                                                                                                |
| GUI result            | Already closed state (`rc-day-close-result.png`)                                                                                                                                                        |

**Verdict:** **PASS WITH CONDITIONS** (shift-less cash Z empty by design; sales still in Reports)

---

## Data Integrity

| Order               | Status    | Total            | Notes                                                       |
| ------------------- | --------- | ---------------- | ----------------------------------------------------------- |
| ORD-20260815-0007   | completed | **฿64.20**       | Badge-offline takeaway sale; print failed gracefully        |
| Prior ORD-0002…0006 | mixed     | ฿64.20 / ฿128.40 | From earlier GUI sessions                                   |
| Checkout zero       | none      | —                | Confirm · ฿64.20 verified (`rc-regression-checkout-64.png`) |

Sales report 2026-08-15: **7 orders**, sales **฿513.60**, cash method count **5**.

---

## Previous Defects (smoke)

| ID       | Result                                                 |
| -------- | ------------------------------------------------------ |
| GUI-0001 | **PASS** (`rc-regression-kds.png`)                     |
| GUI-0002 | **PASS** — Confirm · ฿64.20                            |
| GUI-0003 | Covered by deny smoke                                  |
| GUI-0004 | PASS (prior + expenses/audit still reachable as owner) |
| GUI-0005 | **PASS** (`rc-regression-deny.png`)                    |
| GUI-0006 | Not re-run this session (prior FINAL-RBAC-AUDIT PASS)  |

---

## Remaining Conditions

1. **OFFLINE HARD-CUT** of local API — blocked (no CDP network offline in Browse MCP)
2. **Native Electron full GUI** against the same e2e PID — impossible; isolated shell hit JWT recovery + unpackaged DB path
3. **Physical printer** — none installed
4. **Master-PIN backup create / destructive restore** — blocked on e2e-as-node (no OS encryption)
5. **Day-close cash Z** empty when shifts disabled — product design; validate with shifts enabled in a follow-up if required for café pilot

No new P0/P1 payment/authorization/sync defects found in this RC pass.

---

## Area classification

| Area                          | Classification             |
| ----------------------------- | -------------------------- |
| Offline (local-first + badge) | **PASS WITH CONDITIONS**   |
| Offline hard-cut              | **BLOCKED BY ENVIRONMENT** |
| Electron native (same e2e)    | **BLOCKED BY ENVIRONMENT** |
| Electron isolated smoke       | **PASS WITH CONDITIONS**   |
| Printing software path        | **PASS WITH CONDITIONS**   |
| Printing hardware             | **BLOCKED BY ENVIRONMENT** |
| Backup create (PIN)           | **BLOCKED BY ENVIRONMENT** |
| Backup history UI             | **PASS**                   |
| Restore (full)                | **BLOCKED BY ENVIRONMENT** |
| Restore cancel UI             | **PASS**                   |
| Day-close                     | **PASS WITH CONDITIONS**   |
| GUI-0001…0005 smoke           | **PASS**                   |

---

## RELEASE CANDIDATE QA

```text
PASS WITH CONDITIONS
```

RestaurantOS remains suitable to advance the QA/release track for **local POS sales, RBAC, KDS, graceful print failure, and day-close locking** on disposable e2e data. It is **not** cleared for claiming production DR readiness until Master-PIN backup/restore and native Electron pack are proven on a desktop environment with keyring + optional shifts-enabled day-close cash drill + physical printer if required by pilot SOP.

**Git:** no product code changes — **no commit**.

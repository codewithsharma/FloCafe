# GUI QA FINAL RETEST — 2026-08-15

**Driver:** Cursor Browse MCP (Chromium)  
**Server:** Existing `ELECTRON_RUN_AS_NODE` e2e-server on `:3001` (PID **47633** Electron) — **not restarted** after abort of a later restart attempt  
**API health:** `GET /api/health` → **200** (verified at continuation start and end)  
**Evidence dir:** `docs/qa/evidence/gui/full/` (new `fix-retest-*` files; prior evidence preserved)

## Build

| Check                         | Result                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `npm run build` (main)        | PASS (prior pass; live `dist/` serves SPA fallback incl. `/kds`)                   |
| `npm run build:frontend`      | PASS — `frontend/out/{expenses,audit,kds}/index.html` present (mtime Aug 15 14:36) |
| Unit tests GUI-0001/0002/0003 | PASS (prior)                                                                       |
| Live HTTP                     | `/api/health`, `/kds/`, `/expenses/`, `/audit/` → **200**                          |

## Fixes (product)

| ID       | Change                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GUI-0002 | `frontend/src/lib/prepaid-payable.ts` + `PrepaidCheckoutModal`; tax preview 400 if cart items unresolved; cancel-aware `use-tax-preview.ts`         |
| GUI-0003 | `canAccessPos` / `getLandingPageForRole` in `rbac.ts`; AuthGuard + POS gate; login/sidebar landing; deny redirects away from `/pos` for waiter/chef |
| GUI-0001 | `main/server.ts` — `SPA_FALLBACK_PATH = /^(?!\/api).*$/` (no `/kds` exclusion); WS upgrade unchanged                                                |
| GUI-0004 | Fresh `frontend/out` with expenses/audit/kds routes                                                                                                 |

## Defect retest results

### GUI-0002 — Zero checkout

| Field                      | Value                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| Original                   | Confirm Payment · ฿0.00 when preview missing                                    |
| Expected                   | TOTAL DUE / Confirm · ฿64.20 (Coffee + tax)                                     |
| First retest               | **PASS** — `fix-retest-01-owner-checkout-64.png`                                |
| Continuation (same server) | **PASS** — Owner POS checkout again shows ฿64.20 (dialog closed without paying) |
| Evidence                   | `fix-retest-01-owner-checkout-64.png`, `fix-retest-05-continue-checkout-64.png` |

### GUI-0001 / QA-GUI-KDS-DEEPLINK-01

| Field        | Value                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Original     | `GET /kds/` → `Cannot GET /kds/`                                                                       |
| Before       | `fix-retest-00-kds-deeplink-BEFORE.png`                                                                |
| First retest | **PASS** — Kitchen Display SPA                                                                         |
| Continuation | **PASS** — authenticated hard nav `/kds/` → Kitchen Display; no Cannot GET; Expenses/Audit nav present |
| Evidence     | `fix-retest-02-kds-deeplink-PASS.png`, `fix-retest-06-continue-kds-PASS.png`                           |

### GUI-0003 — Waiter/Chef POS

| Field               | Value                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Original            | Waiter/Chef land on `/pos/` with full UI                                                                                                                                                                                                                     |
| First retest        | **PASS** — Support landing; `/pos/` denied                                                                                                                                                                                                                   |
| Continuation Waiter | Login → `/support/`; no POS nav; hard `/pos/` → `/support/`                                                                                                                                                                                                  |
| Continuation Chef   | Login → `/support/`; no POS nav; hard `/pos/` → `/support/`                                                                                                                                                                                                  |
| Evidence            | `fix-retest-03-waiter-pos-denied.png`, `fix-retest-04-chef-pos-denied.png`, `fix-retest-09-continue-waiter-support.png`, `fix-retest-10-continue-waiter-pos-deny.png`, `fix-retest-11-continue-chef-support.png`, `fix-retest-12-continue-chef-pos-deny.png` |

### GUI-0004 — Stale frontend / routes

| Field        | Value                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Mitigation   | Post-fix frontend build served by live :3001                                                     |
| Continuation | **PASS** — Owner GUI `/expenses/` (Expenses page) and `/audit/` (Audit trail); HTTP 200 for both |
| Evidence     | `fix-retest-07-continue-expenses.png`, `fix-retest-08-continue-audit.png`                        |

## Continuation session (post-abort)

| Step                  | Result                        |
| --------------------- | ----------------------------- |
| Health `:3001`        | **200** — server left running |
| Frontend reachable    | **PASS**                      |
| Post-fix build        | **PASS** — out/ + SPA `/kds/` |
| Do not restart server | Honored                       |

## Role smoke

| Role    | Login landing      | POS direct URL    | Result                  |
| ------- | ------------------ | ----------------- | ----------------------- |
| Owner   | `/dashboard/`      | Allowed           | PASS (checkout ฿64.20)  |
| Manager | (unit + prior GUI) | Allowed by design | PASS (unit + prior GUI) |
| Cashier | (unit)             | Allowed by design | PASS (unit + prior GUI) |
| Waiter  | `/support/`        | Denied → Support  | PASS (continuation)     |
| Chef    | `/support/`        | Denied → Support  | PASS (continuation)     |

## Critical workflows

| Workflow                               | Result                                      |
| -------------------------------------- | ------------------------------------------- |
| Owner dine-in checkout label ฿64.20    | PASS (×2 GUI evidence)                      |
| KDS hard navigation                    | PASS (×2 GUI evidence)                      |
| Waiter/Chef POS deny                   | PASS (×2 rounds GUI evidence)               |
| Expenses / Audit routes                | PASS (continuation)                         |
| Manager/Cashier full sale              | Not re-run this continuation (prior + unit) |
| Takeaway table-less                    | NOT RETESTED                                |
| Reports / Inventory deep               | NOT RETESTED                                |
| QR / offline / backup / Electron shell | NOT RETESTED                                |

## Remaining blockers

- **Hardware:** physical printer not available in this QA environment.
- **Product follow-up (optional):** takeaway may still require a table when `tables_required=true` (prior session); not in this fix set.
- **Infra:** Prefer `ELECTRON_RUN_AS_NODE` + `tests/e2e-server.cjs` over `run-electron-node-test.cjs` (600s `spawnSync` timeout) for long GUI sessions.

## Remaining untested areas

- QR ordering GUI
- Offline GUI behavior
- Backup / restore GUI
- Exhaustive button / screen matrix (5 roles × all surfaces)
- Electron native shell (this pack used Chromium → e2e static+API on :3001)
- Full Manager/Cashier sale re-run on continuation server
- Takeaway without table when tables required

## Verdict

```text
GUI REGRESSION PASS — FULL QA STILL INCOMPLETE
```

All four priority defects (GUI-0001…0004) are fixed and re-verified on the **same live :3001** server with Chromium evidence (`fix-retest-00` … `fix-retest-12`). Full product QA pack remains incomplete for offline/QR/backup/Electron-shell/exhaustive matrix.

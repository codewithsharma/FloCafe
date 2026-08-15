# Full GUI QA Session — 2026-08-15 (FINAL)

**Driver:** Cursor browse MCP (real Chromium) — not Electron native shell  
**Server:** `ELECTRON_RUN_AS_NODE=1 … tests/e2e-server.cjs` (avoid `run-electron-node-test.cjs` **600s** `spawnSync` timeout)  
**API:** http://localhost:3001 · KDS: http://localhost:3002  
**Schema:** v86 · Package 3.0.5 · API health version string 2.4.7  
**Frontend:** rebuilt `npm run build:frontend` mid-session (stale `out/` lacked `/expenses`, `/audit`)

## Credentials used

| Role                            | Email             | Password    | Source                                                 |
| ------------------------------- | ----------------- | ----------- | ------------------------------------------------------ |
| manager                         | manager@flo.local | E2ePass123! | e2e-server seed                                        |
| owner / cashier / waiter / chef | `*@flo.local`     | E2ePass123! | QA DB insert into e2e temp SQLite (same password hash) |

## Progress matrix

| Role    |                                       Screens (live GUI) |                                                        Actions (meaningful) |                                              Critical flows |                                           RBAC | Result                    |
| ------- | -------------------------------------------------------: | --------------------------------------------------------------------------: | ----------------------------------------------------------: | ---------------------------------------------: | ------------------------- |
| Owner   |                                         ~18/35 exercised | POS checkout, KDS bump, nav sweep, settings/reports/ops/team/expenses/audit | POS dine-in pay PASS; KDS PASS; takeaway/checkout-zero FAIL |                   Owner nav full after rebuild | **PASS WITH DEFECTS**     |
| Manager |            Prior session ~12 + API login OK this session |                                                    Prior POS→pay→orders→KDS |                                    Prior critical path PASS |                                Manager seed OK | **PASS (prior + verify)** |
| Cashier |          Login + POS + Orders + Support; Settings denied |                                                      Login, nav, direct URL |                                               POS reachable | Nav POS/Orders/Support; `/settings/` → `/pos/` | **PASS**                  |
| Waiter  |             Login + Support-only nav; POS still rendered |                                            Login, direct `/reports/` denied |                                                           — |          Nav OK; **POS page still accessible** | **FAIL (RBAC gap)**       |
| Chef    | Login + Support-only nav; POS accessible; KDS :3002 PASS |                                                        KDS standalone login |                             KDS standalone empty board PASS |                        Same POS leak as waiter | **PASS WITH DEFECTS**     |

## Critical workflows

| Flow                         | Result                                                                      | Evidence                                       |
| ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| A. POS dine-in sale (Owner)  | **PASS** Table1 → Coffee → tax ฿4.20 total ฿64.20 → Cash                    | `04-owner-checkout.png`, `05-owner-orders.png` |
| B. KDS status (Owner in-app) | **PASS** Waiting→Preparing via sidebar                                      | `07-owner-kds-waiting.png`                     |
| B. KDS hard reload `/kds/`   | **FAIL** `Cannot GET /kds/`                                                 | `06-owner-kds-deeplink-fail.png`               |
| C. Dine-in table             | **PASS** table select + occupy path                                         | tables + POS                                   |
| D. Takeaway                  | **FAIL / PARTIAL** Place Order still forced table; later checkout **฿0.00** | `11-owner-checkout-zero-FAIL.png`              |
| E. QR ordering               | **NOT TESTED**                                                              | —                                              |
| F. Inventory                 | **PASS render** products/purchasing; subpages light                         | —                                              |
| G. CRM create                | **NOT TESTED clean** (fill tooling mangled fields)                          | Customers empty render PASS                    |
| H. Finance reports           | **PASS** Gross/Net ฿64.20                                                   | `09-owner-reports.png`                         |
| I. Printing                  | **BLOCKED** hardware — failure UI PASS                                      | print dialog after pay                         |
| J. Backup/restore            | **NOT TESTED** (Settings shows Backup & Data tab)                           | `settings` live                                |
| Offline GUI                  | **NOT TESTED**                                                              | —                                              |

## Defects (GUI)

### GUI-0001 / QA-GUI-KDS-DEEPLINK-01 (P2) — CONFIRMED

- **Role:** any authenticated
- **Screen:** `/kds/` hard navigation
- **Expected:** Kitchen Display SPA
- **Actual:** `Cannot GET /kds/`
- **Root cause:** `main/server.ts` SPA fallback `app.get(/^(?!\/api|\/kds).*$/, …)` excludes `/kds` while `express.static(…, { index: false })` does not auto-serve `kds/index.html`
- **Workaround:** client-side sidebar nav
- **Evidence:** `06-owner-kds-deeplink-fail.png`, `deep-link-probe-owner.json`

### GUI-0002 (P1) — Checkout total ฿0.00

- **Role:** Owner
- **Screen:** POS Checkout
- **Action:** Place Order after takeaway/table confusion (cart showed Items 1 / Subtotal ฿60.00)
- **Expected:** TOTAL DUE ฿64.20 (or honest error)
- **Actual:** dialog `Confirm Payment · ฿0.00` with blank TOTAL DUE amount
- **Evidence:** `11-owner-checkout-zero-FAIL.png`
- **Did not confirm** zero payment

### GUI-0003 (P1) — Waiter/Chef can open POS UI

- **Role:** waiter, chef
- **Expected:** POS unavailable (nav roles exclude POS)
- **Actual:** post-login lands on `/pos/` with full cart UI; unauthorized routes redirect back to POS
- **Evidence:** `13-waiter-pos-access.png`, `14-chef-pos-access.png`

### GUI-0004 (P3) — Stale frontend export

- Pre-rebuild `frontend/out` missing expenses/audit → Owner nav omitted Expenses/Audit; `/expenses/` soft-fell to Home
- **Mitigation:** `npm run build:frontend` before GUI QA

### Infra — ETIMEDOUT spawnSync (not product)

- `tests/run-electron-node-test.cjs` `timeout: 600_000` kills long GUI sessions
- Prefer direct `ELECTRON_RUN_AS_NODE=1 Electron … e2e-server.cjs` for long runs

## Known issue verification

| ID                     | Result                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| QA-GUI-KDS-DEEPLINK-01 | **Still FAIL** — app bug in Express static/SPA routing                                                                  |
| QA-SEC-CSP-JWT-01      | CSP present on login/pos (includes unsafe-inline); no jwt/token in HTML body sample                                     |
| QA-MONEY-REAL-01       | GUI shows **฿ currency units** (e.g. ฿64.20), not integer cents — product decision still open; plus GUI-0002 zero-total |

## Evidence directory

`docs/qa/evidence/gui/full/` — SESSION-FULL.md, screenshots 01–15, deep-link probe, known-issues-verify.md

## Final GUI Verdict

```
GUI QA COMPLETE — PASS WITH CONDITIONS
```

**Conditions:** (1) KDS deep-link FAIL (2) Waiter/Chef POS access FAIL (3) intermittent/state checkout ฿0.00 FAIL (4) physical print BLOCKED (5) offline/QR/backup-restore/exhaustive 217-button matrix NOT COMPLETE (6) browse MCP ≠ full Electron shell (7) e2e multi-role passwords were QA-seeded into temp DB — not production demo seed

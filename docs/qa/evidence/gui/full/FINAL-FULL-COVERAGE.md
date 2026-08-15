# FULL GUI QA — FINAL COVERAGE REPORT

**Date:** 2026-08-15  
**Driver:** Cursor Browse MCP / Browse CLI (real Chromium)  
**Server:** Live e2e `http://localhost:3001` — Electron PID **47633** (never restarted this session)  
**Health:** `GET /api/health` → **200** (verified at start and end)  
**Prior closed defects:** GUI-0001…0004 (regression only; not re-exercised extensively)  
**Evidence root:** `docs/qa/evidence/gui/full/` (`full-*` screenshots; prior `fix-retest-*` preserved)

---

## Overall Verdict

```text
GUI QA PASS WITH CONDITIONS
```

Core multi-role sales, takeaway, QR ordering, KDS hard-nav, Owner exhaustive screens, Backup UI, and Expenses/Audit routes work on the live Chromium→:3001 pack. Conditions: **direct-URL RBAC incomplete** for Cashier/Waiter/Chef (PRODUCT DEFECT), offline only partially simulated, Electron native shell not tested, physical printer hardware blocked.

---

## Coverage

| Area           | Status                                           | Evidence                                         |
| -------------- | ------------------------------------------------ | ------------------------------------------------ |
| Owner          | PASS                                             | `full-owner-01`…`22`, `01b`, `04b`, `16b`, `21b` |
| Manager        | PASS + sale ORD-0002                             | `full-manager-01`…`06`, `NN-*`                   |
| Cashier        | PASS + sale ORD-0003; RBAC COND                  | `full-cashier-01`…`06`                           |
| Waiter         | PASS landing/POS deny; RBAC FAIL deep-link       | `full-waiter-01`…`03b`                           |
| Chef           | PASS Support + KDS hard-nav; RBAC FAIL deep-link | `full-chef-01`…`04b`                             |
| Dine-in        | PASS (Owner prior ฿64.20; Manager/Cashier sales) | manager/cashier sale shots                       |
| Takeaway       | PASS table-less (PRODUCT BEHAVIOR) ORD-0005      | `full-takeaway-01`…`03*`                         |
| QR             | PASS guest order ORD-0006 → Orders+KDS           | `full-qr-01`…`03`                                |
| KDS            | PASS Owner/Manager/Chef hard-nav + refresh       | owner-06, manager-06, chef-03*                   |
| Inventory      | PASS Owner/Manager walk                          | `full-owner-08`…`14`, manager products           |
| CRM            | PASS Owner customers                             | `full-owner-07-customers.png`                    |
| Reports        | PASS Owner/Manager                               | `full-owner-15`, `full-manager-NN-reports`       |
| Expenses       | PASS Owner Add modal Cancel; Manager             | `full-owner-16*`, manager expenses               |
| Audit          | PASS                                             | `full-owner-18`, prior continue-08               |
| Backup/Restore | PASS UI; Restore confirm Cancelled (no destroy)  | `full-owner-21b`, `full-backup-01-ui`            |
| Offline        | PARTIAL (env limitation)                         | `full-offline-01`…`03`                           |
| RBAC           | COND — leaks documented                          | waiter/chef/cashier matrices below               |
| Electron shell | NOT TESTED                                       | Chromium→static+API only                         |

---

## Phase summaries

### Phase 1 — Owner exhaustive

All primary sidebar + nested inventory routes rendered OK (no blank/`Cannot GET`): Dashboard, POS, Tables (+ QR panel Cancel), Orders, KDS, Customers, Products, Purchasing, Recipes, Low-stock, Counts, Valuation, Movements, Reports, Expenses (+ Add modal Cancel), Operations (Close day **not** clicked), Audit, Team, Settings, Backup & Data, Support.

### Phase 2 — Manager

Landing `/pos/`. Sidebar matches owner-like business nav (no Owner Home). `/dashboard/` → redirect `/pos/`. Sale: Table 1 → E2E Coffee → **฿64.20** cash → **ORD-20260815-0002** on Orders + KDS Waiting. Printer toast only (no HW).

### Phase 3 — Cashier

Landing `/pos/`. Sidebar: POS, Orders, Support. Sale **ORD-20260815-0003** ฿64.20. Direct-URL: settings/reports/operations/dashboard/inventory alias/team alias → REDIRECT `/pos/`. **Leak:** `/products/`, `/staff/`, `/audit/`, `/expenses/`, `/kds/` stay ALLOWED (page renders).

### Phase 4 — Waiter

Landing `/support/`, sidebar Support-only. `/pos/` → Support (GUI-0003 still holds). **Leaks:** `/orders/`, `/products/`, `/expenses/`, `/staff/`, `/tables/`, `/customers/`, `/kds/` render business UI.

### Phase 5 — Chef

Landing `/support/`. KDS **not** in sidebar; hard `/kds/` + refresh → Kitchen Display with tickets, no `Cannot GET`. `/pos/` denied. **Leaks:** same business routes as waiter except `/kds/` not listed as leak in chef summary (chef uses KDS intentionally — but orders/products/expenses/staff/tables/customers leak).

### Phase 6 — Takeaway

With `tables_required=true`, table is required only for **dine_in**. Takeaway without table → checkout ฿64.20 → **ORD-20260815-0005** (`table_id=null`) on Orders + KDS. **PRODUCT BEHAVIOR**, not a defect.

### Phase 7 — QR

Tables → QR → `/qr/?t=…`. Menu, qty, place order → **ORD-20260815-0006** pending dine-in unpaid on table 1; appears on Orders + KDS (`usr-system-qr-guest`). Pay-at-counter (online payment frozen).

### Phase 8 — Offline

Badge Offline/Online via `navigator.onLine` + events + fetch monkeypatch. **Not** CDP network offline. Cart still manipulable; checkout still opened (cached/tax). **PARTIAL — ENVIRONMENT LIMITATION.**

### Phase 9 — Backup

Settings → Backup & Data: Create Backup / Restore / Initialize / Health Check visible. Restore confirmation opened → **Cancel**. Initialize not run. Destructive restore against temp DB intentionally not completed.

### Phase 10 — Direct-URL RBAC matrix

| Role    | Route                                                                           | Expected        | Actual             | Result          |
| ------- | ------------------------------------------------------------------------------- | --------------- | ------------------ | --------------- |
| Owner   | `/dashboard/`                                                                   | ALLOW           | `/dashboard/`      | PASS            |
| Owner   | `/pos/`                                                                         | ALLOW           | `/pos/`            | PASS            |
| Owner   | `/orders/`                                                                      | ALLOW           | `/orders/`         | PASS            |
| Owner   | `/tables/`                                                                      | ALLOW           | `/tables/`         | PASS            |
| Owner   | `/kds/`                                                                         | ALLOW           | `/kds/`            | PASS            |
| Owner   | `/products/`                                                                    | ALLOW           | `/products/`       | PASS            |
| Owner   | `/products/purchasing/`                                                         | ALLOW           | allowed            | PASS            |
| Owner   | `/customers/`                                                                   | ALLOW           | allowed            | PASS            |
| Owner   | `/reports/`                                                                     | ALLOW           | allowed            | PASS            |
| Owner   | `/expenses/`                                                                    | ALLOW           | allowed            | PASS            |
| Owner   | `/audit/`                                                                       | ALLOW           | allowed            | PASS            |
| Owner   | `/staff/`                                                                       | ALLOW           | allowed            | PASS            |
| Owner   | `/settings/`                                                                    | ALLOW           | allowed            | PASS            |
| Owner   | `/support/`                                                                     | ALLOW           | allowed            | PASS            |
| Owner   | `/inventory/`                                                                   | alias           | → `/dashboard/`    | INFO (no alias) |
| Owner   | `/team/`                                                                        | alias           | → `/dashboard/`    | INFO            |
| Manager | `/dashboard/`                                                                   | deny home       | → `/pos/`          | PASS            |
| Manager | `/pos/`…`/settings/`                                                            | ALLOW           | ALLOW              | PASS            |
| Cashier | `/pos/` `/orders/` `/support/`                                                  | ALLOW           | ALLOW              | PASS            |
| Cashier | `/settings/` `/reports/` `/operations/`                                         | DENY            | REDIRECT `/pos/`   | PASS            |
| Cashier | `/products/` `/staff/` `/audit/` `/expenses/` `/kds/`                           | DENY            | **ALLOWED UI**     | **FAIL**        |
| Waiter  | `/pos/`                                                                         | DENY            | → `/support/`      | PASS            |
| Waiter  | `/orders/` `/products/` `/expenses/` `/staff/` `/tables/` `/customers/` `/kds/` | DENY            | **ALLOWED UI**     | **FAIL**        |
| Waiter  | `/reports/` `/settings/` `/dashboard/` `/operations/`                           | DENY            | REDIRECT           | PASS            |
| Chef    | `/pos/`                                                                         | DENY            | → `/support/`      | PASS            |
| Chef    | `/kds/`                                                                         | ALLOW (kitchen) | ALLOW + refresh OK | PASS            |
| Chef    | `/orders/` `/products/` `/expenses/` `/staff/` `/tables/` `/customers/`         | DENY            | **ALLOWED UI**     | **FAIL**        |

Raw dumps: `/tmp/flo-owner-walk-results.json`, `/tmp/flo-manager-results.json`, `/tmp/flo-cashier-results.json`, `/tmp/flo-waiter-chef-results.json`, `/tmp/flo-takeaway-qr-offline.json`, `/tmp/flo-rbac-owner-manager.json`.

---

## Defects (reproducible)

| ID           | Sev    | Title                               | Notes                                                                                                                                                                                                                                                                   | Evidence                                              |
| ------------ | ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **GUI-0005** | **P1** | Direct-URL RBAC incomplete          | Sidebar hide ≠ page gate. Cashier can open Inventory/Team/Audit/Expenses/KDS via hard URL. Waiter/Chef can open Orders, Inventory, Expenses, Team, Tables, Customers (Waiter also KDS). AuthGuard still only hard-gates `/pos`. API may 403 mutations — UI still leaks. | `full-cashier-06`, `full-waiter-03*`, `full-chef-04*` |
| **GUI-0006** | **P2** | Chef has no Kitchen nav item        | Must hard-navigate `/kds/` for kitchen board                                                                                                                                                                                                                            | `full-chef-01` vs `full-chef-03`                      |
| GUI-0007     | P3     | Tables QR panel lacks `role=dialog` | Soft a11y                                                                                                                                                                                                                                                               | `full-owner-04b-table-qr.png`                         |

**Closed (prior session, not reopened):** GUI-0001 KDS SPA, GUI-0002 zero checkout, GUI-0003 POS deny, GUI-0004 stale routes.

---

## Blockers

| Type        | Detail                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| HARDWARE    | Physical printer — “No Printer” / print failure toasts during sales    |
| ENVIRONMENT | Browse MCP cannot CDP-emulate true offline                             |
| ENVIRONMENT | QA against Chromium→e2e static export, **not** Electron native shell   |
| SAFETY      | Full backup **restore** / DB initialize not executed (confirm UI only) |

---

## Untested / incomplete

- Electron native shell window, menus, auto-updater UI
- True offline sync queue / duplicate-order guarantees under network cut
- Destructive restore end-to-end
- Exhaustive every-button matrix on every nested Settings tab
- Delivery order type full path
- Day-close / Z execution (UI seen; not closed)
- Staff deactivate / product delete / expense void (confirm UI mostly cancelled)
- WhatsApp route (module may be off)

---

## Evidence (this continuation)

Created under `docs/qa/evidence/gui/full/`:

- Owner: `full-owner-01`…`22` (+ `01b`, `02`, `04b`, `16b`, `21b`)
- Manager: `full-manager-01`…`06`, `full-manager-NN-*`
- Cashier: `full-cashier-01`…`06`, `NN-*`
- Waiter: `full-waiter-01`…`03b`
- Chef: `full-chef-01`…`04b`
- Takeaway: `full-takeaway-01`…`03*`
- QR: `full-qr-01`…`03`
- Offline: `full-offline-01`…`03`
- Backup: `full-backup-01-ui.png`
- RBAC samples: `full-rbac-owner-sample.png`, `full-rbac-manager-sample.png` (if present)

Prior regression evidence (`fix-retest-*`, `SESSION-FULL.md`, `FINAL-RETEST.md`) preserved.

---

## Final recommendation

1. **QA for core POS/KDS/QR/takeaway/owner surfaces can be treated as exercised** on this live pack — not “untested.”
2. **Development fixes required before calling RBAC complete:** implement page-level (and keep API) denial for Cashier/Waiter/Chef on routes outside their role (GUI-0005); add Chef Kitchen sidebar item (GUI-0006).
3. **More GUI testing still required** for: Electron shell, true offline, restore E2E on disposable DB, day-close, destructive admin actions.
4. **Do not** treat this Chromium e2e pack as OPS-02 / live café sign-off. Live Go-Live remains **NO-GO** per R16/OPS-02.

**Server status at close:** PID **47633** still listening; `GET http://localhost:3001/api/health` → **200**.

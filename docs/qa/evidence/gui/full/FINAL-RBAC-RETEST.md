# GUI-0005 / GUI-0006 RETEST

**Date:** 2026-08-15  
**Server:** `http://localhost:3001` (live e2e; not restarted)  
**PID:** 47633  
**Health:** `GET /api/health` → **200**  
**Driver:** Cursor Browse MCP / Browse CLI (Chromium)  
**Frontend:** `npm run build:frontend` refreshed `frontend/out` without killing the server

---

## GUI-0005

| Field           | Value                                                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before          | Cashier/Waiter/Chef could hard-open business pages not in sidebar (nav hide ≠ auth)                                                                                                                                                                                                                                         |
| Fix             | Single path policy: `getRolesForAppPath` from `FLO_NAV_ITEMS` + `canAccessAppPath` in `rbac.ts`; `AuthGuard` redirects unauthorized authenticated users to `getLandingPageForRole` and **does not render** protected UI. `/kds` remains public only when **unauthenticated** (kitchen tablet); logged-in roles still gated. |
| Automated tests | `tests/gui-0005-route-rbac.test.ts` PASS; `tests/gui-0003-pos-rbac.test.ts` PASS                                                                                                                                                                                                                                            |
| GUI result      | **PASS** (0 route fails across Owner/Manager/Cashier/Waiter/Chef matrices)                                                                                                                                                                                                                                                  |
| Evidence        | `gui0005-owner-rbac.png`, `gui0005-manager-rbac.png`, `gui0005-cashier-rbac.png`, `gui0005-waiter-rbac.png`, `gui0005-chef-rbac.png`                                                                                                                                                                                        |

---

## GUI-0006

| Field           | Value                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Before          | Chef could use `/kds/` but had no Kitchen sidebar item                                                                  |
| Fix             | Added `chef` to kitchen nav `roles` in `navigation.ts` (same `/kds` route; no duplicate KDS)                            |
| Automated tests | Same suite asserts chef in kitchen roles + `filterNavItems` includes kitchen when KDS enabled                           |
| GUI result      | **PASS** — Chef landing `/support/` shows Kitchen + Support; click Kitchen → `/kds/`; hard reload still Kitchen Display |
| Evidence        | `gui0006-chef-kitchen-nav.png`, `gui0006-chef-kds-refresh.png`                                                          |

---

## RBAC Matrix (GUI)

| Role    | Route                                                                              | Expected           | Actual            | Result      |
| ------- | ---------------------------------------------------------------------------------- | ------------------ | ----------------- | ----------- |
| Owner   | `/dashboard/`                                                                      | Allow              | Allow             | PASS        |
| Owner   | `/pos/`                                                                            | Allow              | Allow             | PASS        |
| Owner   | `/orders/`                                                                         | Allow              | Allow             | PASS        |
| Owner   | `/tables/`                                                                         | Allow              | Allow             | PASS        |
| Owner   | `/kds/`                                                                            | Allow              | Allow             | PASS        |
| Owner   | `/products/`                                                                       | Allow              | Allow             | PASS        |
| Owner   | `/products/purchasing/`                                                            | Allow              | Allow             | PASS        |
| Owner   | `/customers/`                                                                      | Allow              | Allow             | PASS        |
| Owner   | `/reports/`                                                                        | Allow              | Allow             | PASS        |
| Owner   | `/expenses/`                                                                       | Allow              | Allow             | PASS        |
| Owner   | `/audit/`                                                                          | Allow              | Allow             | PASS        |
| Owner   | `/staff/`                                                                          | Allow              | Allow             | PASS        |
| Owner   | `/settings/`                                                                       | Allow              | Allow             | PASS        |
| Owner   | `/support/`                                                                        | Allow              | Allow             | PASS        |
| Owner   | `/inventory/` `/team/` `/purchasing/`                                              | Alias bounce       | Landing/canonical | PASS (INFO) |
| Manager | `/dashboard/`                                                                      | Deny → `/pos/`     | Redirect `/pos/`  | PASS        |
| Manager | `/pos/` `/kds/` / ops routes                                                       | Allow              | Allow             | PASS        |
| Cashier | `/pos/` `/orders/` `/support/`                                                     | Allow              | Allow             | PASS        |
| Cashier | `/settings/` `/reports/` `/products/` `/expenses/` `/audit/` `/staff/` `/kds/` / … | Deny → `/pos/`     | Redirect `/pos/`  | PASS        |
| Waiter  | `/pos/`                                                                            | Deny → `/support/` | Redirect          | PASS        |
| Waiter  | restricted business + `/kds/`                                                      | Deny → `/support/` | Redirect          | PASS        |
| Waiter  | `/support/`                                                                        | Allow              | Allow             | PASS        |
| Chef    | `/kds/`                                                                            | Allow              | Allow (+ refresh) | PASS        |
| Chef    | `/pos/` + restricted business                                                      | Deny → `/support/` | Redirect          | PASS        |
| Chef    | `/support/` + Kitchen nav                                                          | Allow              | Allow             | PASS        |

Raw dump: `/tmp/flo-rbac-retest.json`

---

## Regression

| ID                                | Result                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| GUI-0001 `/kds/` hard nav         | **PASS**                                                                       |
| GUI-0002 checkout not ฿0.00       | **PASS** — Confirm Payment · **฿64.20** (`gui0002-owner-checkout-reprobe.png`) |
| GUI-0003 Waiter/Chef `/pos/` deny | **PASS**                                                                       |
| GUI-0004 `/expenses/` `/audit/`   | **PASS**                                                                       |

---

## Remaining QA Conditions

- Offline GUI (true network isolation) — PARTIAL / env limitation
- Electron native shell — NOT TESTED (Chromium → e2e static+API)
- Physical printer hardware
- Destructive restore / day-close execution (UI only previously)

Do not re-list GUI-0001…0006 (all closed after this retest).

---

## Final Verdict

```text
GUI RBAC REGRESSION PASS

FULL GUI QA STATUS:
PASS WITH CONDITIONS
```

Conditions retained: offline depth, Electron shell, printer HW, destructive restore/day-close.

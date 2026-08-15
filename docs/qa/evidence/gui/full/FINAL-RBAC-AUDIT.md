# FINAL RBAC GUI AUDIT

**Date:** 2026-08-15  
**Server:** `http://localhost:3001` (live e2e)  
**PID:** 47633 (not restarted)  
**API health:** `GET /api/health` → **200**  
**Driver:** Cursor Browse MCP / Browse CLI (Chromium)  
**Raw dump:** `/tmp/flo-final-rbac-audit.json`

---

## Implementation Review

**Authoritative client route policy:** `FLO_NAV_ITEMS[].roles` in `frontend/src/config/navigation.ts`, exposed as `getRolesForAppPath(pathname)` → `canAccessAppPath(role, pathname)` in `frontend/src/lib/rbac.ts`.

| Layer          | Mechanism                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar        | `filterNavItems()` — same `roles` (+ module/feature flags)                                                                               |
| Landing        | `getLandingPageForRole()` — separate intentional map (owner→dashboard, manager/cashier→pos, waiter/chef→support)                         |
| Route guard    | `AuthGuard` — `authenticatedRouteDenied` → `router.replace(landing)` and **`return null`** (no protected render)                         |
| POS            | `canAccessPos` ≡ `canAccessAppPath(..., '/pos')`                                                                                         |
| KDS            | Nav roles owner/manager/**chef**; unauthenticated `/kds` still allowed for kitchen tablets; logged-in users must pass `canAccessAppPath` |
| Page rendering | Guard blocks first; some pages keep defense-in-depth `getLandingPageForRole` redirects                                                   |

**Consistency notes (INFO, not defects):**

- Module/feature flags (`kdsEnabled`, etc.) still gate **sidebar** only; role path access follows nav **roles** (same as Owner/Manager deep-link behavior historically).
- Alias paths `/inventory`, `/team`, `/purchasing` are not Next routes; hard-nav bounces to role landing while canonical `/products`, `/staff`, `/products/purchasing` work.
- Server `requireRole` remains authoritative for APIs; this audit covers **desktop GUI** authorization.

No implementation inconsistency requiring a code change was found in this audit.

---

## Automated Tests

| Command                                             | Result            |
| --------------------------------------------------- | ----------------- |
| `ts-node … tests/gui-0005-route-rbac.test.ts`       | **PASS**          |
| `ts-node … tests/gui-0003-pos-rbac.test.ts`         | **PASS**          |
| `ts-node … tests/gui-0001-kds-spa-fallback.test.ts` | **PASS**          |
| `ts-node … tests/gui-0002-prepaid-payable.test.ts`  | **PASS**          |
| `ts-node … tests/flo-ui-shell.test.ts`              | **PASS**          |
| `npx tsc -p frontend --noEmit`                      | **PASS** (exit 0) |
| `frontend/out/{kds,expenses}/index.html`            | Present           |

**Totals:** 5 suites exercised this gate — **0 failed**.

---

## GUI-0005

| Field                | Value                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| Before               | Cashier/Waiter/Chef could hard-open business pages not in sidebar          |
| Fix                  | Shared `canAccessAppPath` + AuthGuard deny/redirect without rendering      |
| Automated validation | PASS                                                                       |
| GUI validation       | **PASS** — 0 route fails across 5 roles; negatives confirm no protected UI |
| Evidence             | `final-rbac-{owner,manager,cashier,waiter,chef}.png`                       |
| Verdict              | **PASS**                                                                   |

---

## GUI-0006

| Field                | Value                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| Before               | Chef had no Kitchen sidebar item                                                 |
| Fix                  | `chef` in kitchen nav roles; same `/kds` route                                   |
| Automated validation | PASS                                                                             |
| GUI validation       | **PASS** — sidebar Kitchen+Support; click → `/kds/`; hard reload Kitchen Display |
| Evidence             | `final-rbac-chef.png`, `final-kds-chef.png`                                      |
| Verdict              | **PASS**                                                                         |

---

## Complete RBAC Matrix

| Role    | Route                                                                                                                       | Expected | Actual                | Redirect    | Result      |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- | ----------- | ----------- |
| owner   | /dashboard/                                                                                                                 | ALLOW    | /dashboard/           | —           | PASS        |
| owner   | /pos/                                                                                                                       | ALLOW    | /pos/                 | —           | PASS        |
| owner   | /orders/                                                                                                                    | ALLOW    | /orders/              | —           | PASS        |
| owner   | /tables/                                                                                                                    | ALLOW    | /tables/              | —           | PASS        |
| owner   | /kds/                                                                                                                       | ALLOW    | /kds/                 | —           | PASS        |
| owner   | /inventory/                                                                                                                 | alias    | → /dashboard/         | /dashboard/ | PASS (INFO) |
| owner   | /products/                                                                                                                  | ALLOW    | /products/            | —           | PASS        |
| owner   | /purchasing/                                                                                                                | alias    | → /dashboard/         | /dashboard/ | PASS (INFO) |
| owner   | /products/purchasing/                                                                                                       | ALLOW    | /products/purchasing/ | —           | PASS        |
| owner   | /customers/                                                                                                                 | ALLOW    | /customers/           | —           | PASS        |
| owner   | /reports/                                                                                                                   | ALLOW    | /reports/             | —           | PASS        |
| owner   | /expenses/                                                                                                                  | ALLOW    | /expenses/            | —           | PASS        |
| owner   | /audit/                                                                                                                     | ALLOW    | /audit/               | —           | PASS        |
| owner   | /team/                                                                                                                      | alias    | → /dashboard/         | /dashboard/ | PASS (INFO) |
| owner   | /staff/                                                                                                                     | ALLOW    | /staff/               | —           | PASS        |
| owner   | /settings/                                                                                                                  | ALLOW    | /settings/            | —           | PASS        |
| owner   | /support/                                                                                                                   | ALLOW    | /support/             | —           | PASS        |
| manager | /dashboard/                                                                                                                 | DENY     | /pos/                 | /pos/       | PASS        |
| manager | /pos/                                                                                                                       | ALLOW    | /pos/                 | —           | PASS        |
| manager | /orders/                                                                                                                    | ALLOW    | /orders/              | —           | PASS        |
| manager | /tables/                                                                                                                    | ALLOW    | /tables/              | —           | PASS        |
| manager | /kds/                                                                                                                       | ALLOW    | /kds/                 | —           | PASS        |
| manager | /products/                                                                                                                  | ALLOW    | /products/            | —           | PASS        |
| manager | /products/purchasing/                                                                                                       | ALLOW    | /products/purchasing/ | —           | PASS        |
| manager | /customers/                                                                                                                 | ALLOW    | /customers/           | —           | PASS        |
| manager | /reports/                                                                                                                   | ALLOW    | /reports/             | —           | PASS        |
| manager | /expenses/                                                                                                                  | ALLOW    | /expenses/            | —           | PASS        |
| manager | /audit/                                                                                                                     | ALLOW    | /audit/               | —           | PASS        |
| manager | /staff/                                                                                                                     | ALLOW    | /staff/               | —           | PASS        |
| manager | /settings/                                                                                                                  | ALLOW    | /settings/            | —           | PASS        |
| manager | /support/                                                                                                                   | ALLOW    | /support/             | —           | PASS        |
| manager | /inventory/ /team/ /purchasing/                                                                                             | alias    | → /pos/               | /pos/       | PASS (INFO) |
| cashier | /pos/ /orders/ /support/                                                                                                    | ALLOW    | ALLOW                 | —           | PASS        |
| cashier | /settings/ /reports/ /products/ /purchasing/ /customers/ /expenses/ /audit/ /staff/ /kds/ /tables/ /operations/ /dashboard/ | DENY     | /pos/                 | /pos/       | PASS        |
| cashier | /inventory/ /team/                                                                                                          | DENY     | /pos/                 | /pos/       | PASS        |
| waiter  | /pos/ /orders/ /reports/ /products/ /expenses/ /audit/ /staff/ /settings/ /kds/ /tables/ /customers/ /…                     | DENY     | /support/             | /support/   | PASS        |
| chef    | /kds/ (nav+hard+refresh)                                                                                                    | ALLOW    | /kds/ Kitchen Display | —           | PASS        |
| chef    | /pos/ /orders/ /reports/ /products/ /customers/ /expenses/ /audit/ /staff/ /settings/ /tables/ /…                           | DENY     | /support/             | /support/   | PASS        |

**GUI route failCount:** **0**

### Negative authorization (required samples)

| Role    | Route                            | Protected UI | Redirect  | Result |
| ------- | -------------------------------- | ------------ | --------- | ------ |
| Cashier | /settings/ /reports/ /inventory/ | No           | /pos/     | PASS   |
| Waiter  | /pos/ /reports/ /settings/       | No           | /support/ | PASS   |
| Chef    | /pos/ /reports/ /inventory/      | No           | /support/ | PASS   |

---

## Authorization Consistency

| Area           | Uses authoritative RBAC?                                          | Result |
| -------------- | ----------------------------------------------------------------- | ------ |
| Sidebar        | Yes — `FLO_NAV_ITEMS.roles` (+ flags)                             | PASS   |
| Landing        | Yes — `getLandingPageForRole` (intentional map)                   | PASS   |
| Route guard    | Yes — `canAccessAppPath` in AuthGuard                             | PASS   |
| Page rendering | Yes — AuthGuard returns null when denied                          | PASS   |
| POS            | Yes — `canAccessPos` → same policy                                | PASS   |
| KDS            | Yes — kitchen roles incl. chef; unauth kiosk exception documented | PASS   |

---

## Previous Defect Regression

| ID                                | Result                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- |
| GUI-0001 `/kds/` hard nav         | **PASS**                                                                          |
| GUI-0002 checkout not ฿0.00       | **PASS** — Confirm Payment · **฿64.20** (`final-regression-check.png`; cancelled) |
| GUI-0003 Waiter/Chef `/pos/` deny | **PASS**                                                                          |
| GUI-0004 `/expenses/` `/audit/`   | **PASS**                                                                          |

---

## New Defects

None discovered in this audit (no new P0/P1/P2 authorization defects).

---

## Remaining QA Conditions

- Offline true network-cut testing (prior PARTIAL / env limitation)
- Electron native shell (Chromium → e2e static+API only)
- Physical printer hardware
- Destructive restore / day-close execution

Do **not** re-list GUI-0001…0006 (all PASS).

---

## Evidence

- `final-rbac-owner.png`
- `final-rbac-manager.png`
- `final-rbac-cashier.png`
- `final-rbac-waiter.png`
- `final-rbac-chef.png`
- `final-kds-chef.png`
- `final-regression-check.png`

---

## Final Release Gate

```text
GUI RBAC AUDIT — PASS

FULL GUI QA — PASS WITH CONDITIONS
```

**Conditions only:** offline network-cut · Electron native shell · physical printer · destructive restore/day-close.

**Server at close:** PID **47633** still listening; health **200**.  
**Git:** No additional product code changes in this audit — no new commit.

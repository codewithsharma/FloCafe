# GUI Coverage Matrix — FloCafe / OPERAVIA

**Session:** 2026-08-15 (inventory + Playwright + live browse-MCP GUI)  
**Scope:** `frontend/src/app` App Router screens, nav (`frontend/src/config/navigation.ts`), major interactive components, Playwright config.  
**Method:** Static inventory + Playwright + **live Chromium GUI** (`docs/qa/evidence/gui/SESSION.md`). Button matrix / other roles still incomplete.

## Verdict (this session)

| Metric                                       | Value                                                     | Notes                                                     |
| -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| App Router `page.tsx` routes inventoried     | **35 / 35 (100%)**                                        | Full path list below                                      |
| Manual GUI (browse MCP, all 5 roles)         | **Owner deep + cashier/waiter/chef RBAC + prior manager** | `evidence/gui/full/SESSION-FULL.md`                       |
| Screens with flo-* component/static evidence | **~20 / 35 (~57%)**                                       | Source asserts — not live GUI                             |
| Playwright specs executed                    | **4 / 4 PASS**                                            | Prior run                                                 |
| Live browser GUI critical path               | **PASS WITH CONDITIONS**                                  | KDS deeplink FAIL; checkout ฿0 FAIL; waiter/chef POS leak |
| Role GUI coverage                            | **5 / 5 logged in**                                       | Full button matrix still incomplete                       |
| Action-level exhaustive button matrix        | **Incomplete**                                            | Critical POS/KDS/RBAC only                                |
| **Final GUI verdict**                        | **GUI QA COMPLETE — PASS WITH CONDITIONS**                | Conditions in SESSION-FULL.md                             |

Honest read: Multi-role live GUI executed with screenshots. Exhaustive 217-button matrix, offline GUI, QR E2E, backup restore, and Electron native shell remain open conditions — do **not** claim unconditional PASS.

---

## Playwright

| Item         | Status                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Config       | **Exists:** `frontend/playwright.config.ts`                                                            |
| Specs        | `frontend/e2e/kds-login.spec.ts`, `layout-integrity.spec.ts`, `prepaid-payment-reconciliation.spec.ts` |
| Bootstrap    | `tests/e2e-server.cjs` (health `http://127.0.0.1:3002/api/health`)                                     |
| Docs         | `docs/09-testing/e2e-testing.md`                                                                       |
| Run command  | Repo root: `npm run test:e2e` · Frontend: `cd frontend && npm run test:e2e`                            |
| This session | **EXECUTED — 4/4 PASS** (`docs/qa/evidence/playwright-e2e.log`)                                        |

Credentials documented for E2E: `manager@flo.local` / `E2ePass123!`.

---

## How to run UI (reference)

| Mode                                    | Command                |
| --------------------------------------- | ---------------------- |
| Full Electron                           | `npm run dev` (root)   |
| Frontend browser only                   | `npm run dev:frontend` |
| Backend only                            | `node dev-server.js`   |
| Playwright (when intentionally running) | `npm run test:e2e`     |

---

## Button / interaction inventory summary

Counts from static scan of `frontend/src/app` plus feature components (`pos`, `tables`, `kds`, `orders`, `products`, `staff`, `customers`, `settings`, `shifts`, `dashboard`, `flo`, `setup`, `layout`) — **approximate surface size**, not a manual click list.

| Measure                                  | Count                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Router screens (`page.tsx`)          | 35                                                                                                                                                                                                             |
| Scoped `.tsx` files scanned              | ~142                                                                                                                                                                                                           |
| Files importing `@/components/ui/button` | 74                                                                                                                                                                                                             |
| `<Button` JSX instances                  | ~217                                                                                                                                                                                                           |
| `type="button"` attributes               | ~175                                                                                                                                                                                                           |
| `onClick=` handlers                      | ~433                                                                                                                                                                                                           |
| Files using Dialog patterns              | ~42                                                                                                                                                                                                            |
| Settings deep-link tabs                  | 17 (`store`, `receipts-printers`, `payments`, `tax`, `pos`, `shifts`, `kds`, `server-app`, `whatsapp`, `loyalty`, `discounts`, `mobile-access`, `data`, `orderflow`, `account`, `privacy`, `updates`, `about`) |
| flo-* static UI test files               | 21 under `tests/flo-*.test.ts`                                                                                                                                                                                 |

Major interactive clusters (for QA planning): POS cart/checkout/payment (~15+ primary actions), Orders card dialogs (void/refund/exchange/cancel/print/add items), Tables CRUD + reserve/transfer/merge/QR, Products hub CRUD + CSV + stock, Settings multi-tab forms, Purchasing PO receive, KDS status advance / drag-drop.

---

## Coverage table

**Manual Result legend**

- `NOT TESTED` — no live GUI pass in this session.
- `AUTOMATED (component/static) NOT MANUAL GUI` — covered by `tests/flo-*.test.ts` (or closely related flo static checks): file existence, Flo tokens, touch-target class patterns, structure. **Not** a substitute for clicking the UI.

**Automated Evidence** lists static test files and/or Playwright specs that _exist_. “NOT RUN” means this discovery session did not execute them.

| Screen                | Route                   | Module                | Key Actions                                                                                                                                                                                                    | Roles                                               | Manual Result                                               | Automated Evidence                                                                                                                                                                   |
| --------------------- | ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root redirect         | `/`                     | core                  | Redirect → `/dashboard`                                                                                                                                                                                        | any → AuthGuard                                     | NOT TESTED                                                  | `flo-routes-complete.test.ts` (page scan)                                                                                                                                            |
| Home / Dashboard      | `/dashboard`            | core / reporting      | Metric tiles; attention strip → orders/tables/low-stock; links to reports/operations                                                                                                                           | owner (others → `/pos`)                             | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-home.test.ts`, `flo-phase12.test.ts`                                                                                                                                            |
| POS                   | `/pos`                  | pos                   | Category filter; add product; 86/un-86; cart qty/edit/remove; order type; guests; customer search/create; hold; place; table picker; addons; table checkout; pay/split; prepaid checkout; printer connect/kick | owner, manager, cashier                             | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-pos.test.ts`, `flo-pos-modals.test.ts`, `flo-phase12.test.ts`; Playwright **exists** `e2e/layout-integrity.spec.ts`, `e2e/prepaid-payment-reconciliation.spec.ts` (**NOT RUN**) |
| Tables                | `/tables`               | tables                | Add table; available; reserve; transfer; merge; assign waiter; QR rotate/copy; toggle active                                                                                                                   | owner, manager (+ tables module / `tablesRequired`) | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-tables.test.ts`, `flo-phase12.test.ts`                                                                                                                                          |
| Orders                | `/orders`               | order                 | Filters; held resume/delete; checkout; add items; takeaway; cancel; void/restore; discount; refund; exchange; print; WhatsApp; link customer                                                                   | owner, manager, cashier                             | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-orders.test.ts`, `flo-refund-ui.test.ts`, `flo-phase12.test.ts`                                                                                                                 |
| Kitchen (in-app)      | `/kds`                  | kds                   | Login; tabs/kanban; advance/back status; drag-drop; item modal; logout                                                                                                                                         | owner, manager (+ KDS enabled)                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-routes-complete.test.ts` (existence/tokens); Playwright **exists** `e2e/kds-login.spec.ts` targets standalone (**NOT RUN**)                                                     |
| Customers             | `/customers`            | customer              | Search/sort; add/edit; deactivate/reactivate; ledger; open detail                                                                                                                                              | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-customers.test.ts`, `flo-phase12.test.ts`                                                                                                                                       |
| Customer detail       | `/customers/detail?id=` | customer              | Back; notes add/edit/delete; history/metrics                                                                                                                                                                   | owner, manager                                      | NOT TESTED                                                  | none (flo-* does not target detail page)                                                                                                                                             |
| Inventory hub         | `/products`             | product               | Tabs products/categories/addons; product CRUD + image; stock adjust; bulk tax; CSV; category CRUD/reassign/force-delete; addon group CRUD; hub links                                                           | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-products.test.ts`                                                                                                                                                               |
| Addon groups (legacy) | `/addon-groups`         | product / addons      | Redirect → `/products?tab=addons`                                                                                                                                                                              | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-products.test.ts` (redirect assert)                                                                                                                                             |
| Low stock             | `/products/low-stock`   | inventory             | List; stock adjust; back                                                                                                                                                                                       | owner, manager                                      | NOT TESTED                                                  | none flo-*; API/static elsewhere only                                                                                                                                                |
| Valuation             | `/products/valuation`   | inventory             | View report; back                                                                                                                                                                                              | owner, manager                                      | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Movements             | `/products/movements`   | inventory             | List/filter; load more; back                                                                                                                                                                                   | owner, manager                                      | NOT TESTED                                                  | none flo-* (unit: `frontend/src/lib/inventory-movements.test.ts` — lib only)                                                                                                         |
| Counts                | `/products/counts`      | inventory             | Create; lines; submit; apply                                                                                                                                                                                   | owner, manager                                      | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Recipes / BOM         | `/products/recipes`     | recipes               | Create; toggle active; ingredient lines; save                                                                                                                                                                  | owner, manager                                      | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Purchasing            | `/products/purchasing`  | purchasing            | Suppliers CRUD/deactivate; mappings; PO create/status; receive dialog                                                                                                                                          | owner, manager                                      | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Reports               | `/reports`              | reporting             | KPIs; CSV exports (sales/tax/expenses/voids); deep links                                                                                                                                                       | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-reports.test.ts`, `flo-ui-shell.test.ts`, `flo-phase12.test.ts`                                                                                                                 |
| Expenses              | `/expenses`             | reporting             | Add expense; void                                                                                                                                                                                              | owner, manager                                      | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Operations            | `/operations`           | core / shifts         | Business date; day close; print/download Z; shift history                                                                                                                                                      | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-operations.test.ts`, `flo-home.test.ts` (DayCloseCard), `flo-ui-shell.test.ts`                                                                                                  |
| Audit log             | `/audit`                | core                  | Filters; export CSV                                                                                                                                                                                            | owner, manager                                      | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Team / Staff          | `/staff`                | staff                 | Add/edit; reset password; activate/deactivate; open detail                                                                                                                                                     | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-staff.test.ts`, `flo-phase12.test.ts`                                                                                                                                           |
| Staff detail          | `/staff/detail?id=`     | staff                 | View performance/shifts; back                                                                                                                                                                                  | owner, manager                                      | NOT TESTED                                                  | none flo-* (workforce API tests may touch file paths)                                                                                                                                |
| Settings              | `/settings?tab=*`       | core (+ feature tabs) | 17 tabs: store, printers, payments, tax, POS, shifts, KDS, server-app, WhatsApp, loyalty, discounts, mobile, backup/data, orderflow, account, privacy, updates, about                                          | owner, manager                                      | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-settings.test.ts`, `flo-settings-complete.test.ts`, `flo-settings-module-gating.test.ts`                                                                                        |
| WhatsApp              | `/whatsapp`             | notification          | Sent/inbox/connection; QR/pairing; disconnect; disable; blocklist                                                                                                                                              | owner, manager, cashier (+ flag)                    | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-whatsapp.test.ts`                                                                                                                                                               |
| Support               | `/support`              | core                  | Submit ticket; delivery status; diagnostics preview                                                                                                                                                            | all nav roles                                       | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-auth-support.test.ts`                                                                                                                                                           |
| Print test            | `/print-test`           | printing (dev/QA)     | Mode/paper/method; print; download HTML; WhatsApp text                                                                                                                                                         | typically owner/manager (no nav)                    | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-routes-complete.test.ts` (existence/tokens only)                                                                                                                                |
| Order history demo    | `/order-history-demo`   | order (dev)           | Demo history grid                                                                                                                                                                                              | internal                                            | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-routes-complete.test.ts` (existence/tokens only)                                                                                                                                |
| Login                 | `/auth/login`           | auth                  | Email/password; tenant select; recover link                                                                                                                                                                    | public                                              | AUTOMATED (component/static) + Playwright KDS/prepaid paths | `flo-auth-support.test.ts`; Playwright e2e **4/4 PASS**                                                                                                                              |
| Register              | `/auth/register`        | auth                  | Owner signup; country; passwords                                                                                                                                                                               | public                                              | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-auth-support.test.ts`                                                                                                                                                           |
| Recover               | `/auth/recover`         | auth                  | Master PIN + new password                                                                                                                                                                                      | public                                              | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-auth-support.test.ts`                                                                                                                                                           |
| First-run setup       | `/setup`                | onboarding            | Steps 1–6: locale, profile, service model, owner, privacy, complete                                                                                                                                            | first-run / Electron                                | NOT TESTED                                                  | none flo-* (backend `first-run-setup` tests are not GUI)                                                                                                                             |
| DB recovery           | `/recovery`             | data safety           | Restore backup (Master PIN IPC); support; exit                                                                                                                                                                 | Electron recovery                                   | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| Guest QR order        | `/qr?t=`                | public / tableside    | Menu; qty; place; status poll                                                                                                                                                                                  | guest (token)                                       | NOT TESTED                                                  | none flo-*                                                                                                                                                                           |
| KDS standalone        | `/kds-standalone`       | kds                   | Login; workspace; session restore                                                                                                                                                                              | kitchen via ~3002                                   | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-routes-complete.test.ts`; Playwright **exists** `e2e/kds-login.spec.ts` (**NOT RUN**)                                                                                           |
| Server standalone     | `/server-standalone`    | tables / server-app   | Login; table pick; draft; send/add to kitchen; logout                                                                                                                                                          | waiter device                                       | AUTOMATED (component/static) NOT MANUAL GUI                 | `flo-routes-complete.test.ts` (existence/tokens only)                                                                                                                                |

### Shell / global (not a route)

| Surface             | Route                      | Module | Key Actions                                                                             | Roles               | Manual Result                               | Automated Evidence                          |
| ------------------- | -------------------------- | ------ | --------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------- | ------------------------------------------- |
| App shell / sidebar | (all `(dashboard)` routes) | core   | Nav filter by role/module; logout; theme toggle; collapse; open/close/force-close shift | per `FLO_NAV_ITEMS` | AUTOMATED (component/static) NOT MANUAL GUI | `flo-ui-shell.test.ts`, `flo-theme.test.ts` |

---

## Nav role map (sidebar)

| Nav id     | href          | Roles                   | Gates                                 |
| ---------- | ------------- | ----------------------- | ------------------------------------- |
| home       | `/dashboard`  | owner                   | —                                     |
| pos        | `/pos`        | owner, manager, cashier | module `pos`                          |
| tables     | `/tables`     | owner, manager          | module `tables` + `tablesRequired`    |
| orders     | `/orders`     | owner, manager, cashier | module `order`                        |
| kitchen    | `/kds`        | owner, manager          | module `kds` + KDS enabled            |
| customers  | `/customers`  | owner, manager          | module `customer`                     |
| inventory  | `/products`   | owner, manager          | module `product`                      |
| reports    | `/reports`    | owner, manager          | module `reporting`                    |
| expenses   | `/expenses`   | owner, manager          | module `reporting`                    |
| operations | `/operations` | owner, manager          | module `core`                         |
| audit      | `/audit`      | owner, manager          | module `core`                         |
| team       | `/staff`      | owner, manager          | module `staff`                        |
| settings   | `/settings`   | owner, manager          | module `core`                         |
| whatsapp   | `/whatsapp`   | owner, manager, cashier | module `notification` + WhatsApp flag |
| support    | `/support`    | all five roles          | —                                     |

Source: `frontend/src/config/navigation.ts`.

---

## flo-* static suites (component/static — not live GUI)

Located under `tests/flo-*.test.ts` (21 files). Relevant to UI structure/tokens:

- `flo-ui-shell`, `flo-theme`, `flo-components-complete`, `flo-routes-complete`
- `flo-home`, `flo-pos`, `flo-pos-modals`, `flo-phase12`
- `flo-tables`, `flo-orders`, `flo-refund-ui`
- `flo-customers`, `flo-products`, `flo-staff`
- `flo-reports`, `flo-operations`
- `flo-settings`, `flo-settings-complete`, `flo-settings-module-gating`
- `flo-whatsapp`, `flo-auth-support`

These justify **AUTOMATED (component/static) NOT MANUAL GUI** only. They do not prove checkout, printing, or KDS behavior in a browser.

---

## Gaps to close next (suggested)

1. Run `npm run test:e2e` and attach report under `docs/qa/evidence/`.
2. Manual smoke on NOT TESTED inventory sub-routes: recipes, purchasing, counts, valuation, movements, low-stock, expenses, audit, setup, recovery, QR.
3. Expand Playwright beyond 3 specs toward POS full checkout, settings backup/restore, concurrent KDS+POS (see `docs/09-testing/e2e-testing.md` target state).
4. Treat flo-* as regression for design-system compliance, not as GUI acceptance.

---

## Session sign-off

| Checkpoint                         | Result                                               |
| ---------------------------------- | ---------------------------------------------------- |
| Route inventory complete           | Yes (35/35)                                          |
| Manual GUI this session            | **0% — NOT TESTED**                                  |
| Playwright full suite this session | **NOT RUN**                                          |
| Document purpose                   | Foundation for `docs/qa/GUI-COVERAGE.md` QA tracking |

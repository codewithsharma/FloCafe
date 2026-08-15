# API Coverage Matrix — OPERAVIA Restaurant QA

**Product:** OPERAVIA Restaurant (repo legacy: FloCafe)  
**Session evidence:** 2026-08-15 (`docs/qa/evidence/SUMMARY.txt` + `SUMMARY-r2-r14.txt`)  
**Inventory source:** `main/routes/` + `main/server.ts` (health, WebSocket)  
**Method:** Static route inventory + **method+path** hits from suite sources that **ran this session**.  
**Rule:** Do **not** invent PASS. `build` PASS ≠ endpoint PASS.

> **Update (final evidence):** Initial r2–r9.5 FAIL tallies were stale schema-tip pins (expect 83, tip 86). After tip-fix + `SUMMARY-rerun2.txt`, those suites are **PASS**. Row results below were flipped from FAIL→PASS for those suite citations.

---

## Startup (local API)

| Item          | Value                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Backend only  | `node dev-server.js`                                                                                                        |
| Default API   | **http://localhost:3001** (`GET /api/health`)                                                                               |
| KDS companion | **http://localhost:3002** (`KDS_PORT` can override; health `/api/health`)                                                   |
| KDS WebSocket | **ws://localhost:3001/kds** (upgrade on main API when KDS enabled)                                                          |
| Full Electron | `npm run dev`                                                                                                               |
| Global auth   | `requireAuth` on `/api/*` except health and most `/api/auth/*` login/setup flows; public QR uses table token (no staff JWT) |

---

## Session suite gate (evidence)

### PASS this session (may contribute `PASS (automated)`)

| Suite        | Evidence                                   | Notes                                               |
| ------------ | ------------------------------------------ | --------------------------------------------------- |
| h1–h4        | `h1.log`–`h4.log`                          | Hardening                                           |
| r1           | `r1.log`                                   | POS core                                            |
| r9.6         | `r9.6.log`                                 | Food-cost report                                    |
| r10–r15      | `r10.log`–`r15.log` / `SUMMARY-r2-r14.txt` | QR, coupons, voids, print queue, corrupt-DB, sim S1 |
| authz-phase3 | `authz-phase3.log`                         | Authz matrix                                        |
| staff-authz  | `staff-authz.log`                          | Staff RBAC                                          |
| orders-authz | `orders-authz.log`                         | Order mutation RBAC                                 |
| smoke        | `smoke.log`                                | Health + login smoke                                |
| build        | `build.log`                                | TypeScript compile only — **not** HTTP PASS         |

### Initially FAIL then FIXED (stale tip assertions → PASS on rerun)

| Suite   | First run            | Final evidence                                             | Focus                                    |
| ------- | -------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| r2      | FAIL (tip 83≠86)     | `SUMMARY-rerun.txt` **62/62 PASS**                         | Floor / tables                           |
| r3      | FAIL (tip + symbol)  | `SUMMARY-rerun.txt` **70/70 PASS**                         | Kitchen / KDS HTTP                       |
| r4–r6   | FAIL (multiline tip) | `SUMMARY-rerun2.txt` **PASS**                              | Inventory / recipes / purchasing         |
| r7–r8   | FAIL then PASS       | `SUMMARY-rerun.txt`                                        | CRM / staff                              |
| r9–r9.5 | FAIL then PASS       | `SUMMARY-rerun.txt` / `rerun2`                             | Expenses / audit / tax / Z / ops finance |
| r9–r9.5 | `r9.log`–`r9.5.log`  | Expenses, audit, tax export, day-close polish, ops-finance |

### Session Result legend

| Value                 | Meaning                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PASS (automated)**  | This **method+path** was exercised by ≥1 **PASS** suite (evidence after ·).                                                                          |
| **FAIL (regression)** | Reserved for suites still red after final evidence. **None remaining** for r2–r9.5 after tip-fix reruns (`SUMMARY-rerun.txt`, `SUMMARY-rerun2.txt`). |
| **NOT EXECUTED**      | No session suite HTTP hit for this method+path.                                                                                                      |

---

## Coverage math (this session)

| Metric                            |   Count | % of inventory |
| --------------------------------- | ------: | -------------: |
| Endpoints inventoried (HTTP + WS) | **305** |           100% |
| PASS (automated)                  | **109** |      **35.7%** |
| FAIL (regression)                 |   **0** |       **0.0%** |
| NOT EXECUTED                      | **196** |      **64.3%** |
| Executed (PASS + FAIL)            | **109** |      **35.7%** |

**Critical (Critical=Y):** 35 inventoried · PASS 15 · FAIL 0 · NOT EXECUTED 20 (post tip-fix; former FAIL flipped)

### By module

> **Superseded:** Module FAIL counts below were from the first r2–r9.5 tip-pin run. Final suite evidence is green; treat those FAIL cells as **PASS (automated)** for coverage math. Endpoint-level Session Result columns were flipped to PASS.

| Module       | Total | PASS | FAIL | NOT EXECUTED |
| ------------ | ----: | ---: | ---: | -----------: |
| health       |     1 |    1 |    0 |            0 |
| auth         |    12 |    1 |    0 |           11 |
| orders       |    16 |    9 |    1 |            6 |
| payments     |    23 |    7 |    0 |           16 |
| menu         |    31 |    2 |    0 |           29 |
| tables       |    11 |    0 |    7 |            4 |
| QR ordering  |     6 |    6 |    0 |            0 |
| kitchen/KDS  |    15 |    1 |    1 |           13 |
| customers    |    17 |    1 |   11 |            5 |
| staff/shifts |    15 |    5 |    2 |            8 |
| inventory    |    31 |    0 |   22 |            9 |
| reports      |    24 |    6 |   10 |            8 |
| printing     |    16 |    4 |    2 |           10 |
| backup/DB    |    12 |    3 |    0 |            9 |
| tax          |    15 |    1 |    0 |           14 |
| settings     |    31 |    1 |    0 |           30 |
| audit        |     2 |    0 |    2 |            0 |
| mobile       |     3 |    3 |    0 |            0 |
| whatsapp     |    15 |    0 |    0 |           15 |
| platform     |     9 |    0 |    0 |            9 |

> Alias: `/api/users/*` mounts the same router as `/api/staff/*` and is **not** double-counted.

---

## Public QR + WebSocket (highlight)

### Public guest QR (`/api/public/qr/*`) + staff QR helpers

| Method | Path                              | Auth              | Roles          | Module      | Critical | Session Result           |
| ------ | --------------------------------- | ----------------- | -------------- | ----------- | -------- | ------------------------ |
| GET    | `/api/public/qr/menu`             | public (QR token) | guest          | QR ordering | Y        | PASS (automated) · _r10_ |
| POST   | `/api/public/qr/orders`           | public (QR token) | guest          | QR ordering | Y        | PASS (automated) · _r10_ |
| GET    | `/api/public/qr/orders/:orderId`  | public (QR token) | guest          | QR ordering | Y        | PASS (automated) · _r10_ |
| GET    | `/api/public/qr/session`          | public (QR token) | guest          | QR ordering | Y        | PASS (automated) · _r10_ |
| GET    | `/api/tables/:id/qr`              | JWT               | owner, manager | QR ordering | N        | PASS (automated) · _r10_ |
| POST   | `/api/tables/:id/qr-token/rotate` | JWT               | owner, manager | QR ordering | N        | PASS (automated) · _r10_ |

### WebSocket

| Method | Path                               | Auth                      | Roles             | Module      | Critical | Session Result                                                                  |
| ------ | ---------------------------------- | ------------------------- | ----------------- | ----------- | -------- | ------------------------------------------------------------------------------- |
| WS     | `/kds` → `ws://localhost:3001/kds` | KDS session after upgrade | paired KDS client | kitchen/KDS | Y        | NOT EXECUTED · _h2 covers /api/kds-info + source asserts; live upgrade not run_ |

Companion KDS HTTP on **:3002** is separate (`main/kds-server.ts`). This matrix catalogs main API registration + main-process WS path.

---

## Full coverage by module

### health

| Method | Path          | Auth   | Roles | Module | Critical | Session Result                  |
| ------ | ------------- | ------ | ----- | ------ | -------- | ------------------------------- |
| GET    | `/api/health` | public | —     | health | Y        | PASS (automated) · _r14, smoke_ |

### auth

| Method | Path                           | Auth           | Roles                    | Module | Critical | Session Result             |
| ------ | ------------------------------ | -------------- | ------------------------ | ------ | -------- | -------------------------- |
| POST   | `/api/auth/jwt-secret/recover` | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/jwt-secret/rotate`  | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/login`              | public/special | — / setup / master flows | auth   | Y        | PASS (automated) · _smoke_ |
| POST   | `/api/auth/logout`             | JWT            | any authenticated        | auth   | N        | NOT EXECUTED               |
| GET    | `/api/auth/me`                 | JWT            | any authenticated        | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/password/change`    | JWT            | any authenticated        | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/recover-password`   | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/refresh`            | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/setup/initialize`   | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/setup/seed`         | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| GET    | `/api/auth/setup/status`       | public/special | — / setup / master flows | auth   | N        | NOT EXECUTED               |
| POST   | `/api/auth/tenants/select`     | JWT            | any authenticated        | auth   | N        | NOT EXECUTED               |

### orders

| Method | Path                                         | Auth | Roles                                 | Module | Critical | Session Result                                       |
| ------ | -------------------------------------------- | ---- | ------------------------------------- | ------ | -------- | ---------------------------------------------------- |
| GET    | `/api/held-orders`                           | JWT  | owner, manager, cashier, waiter       | orders | N        | NOT EXECUTED                                         |
| POST   | `/api/held-orders`                           | JWT  | owner, manager, cashier, waiter       | orders | N        | NOT EXECUTED                                         |
| DELETE | `/api/held-orders/:tableId`                  | JWT  | owner, manager, cashier, waiter       | orders | N        | NOT EXECUTED                                         |
| PATCH  | `/api/order-items/:id/status`                | JWT  | chef, manager, owner                  | orders | N        | PASS (automated) · _h3_                              |
| GET    | `/api/orders`                                | JWT  | owner, manager, cashier, waiter       | orders | N        | PASS (automated) · _authz_                           |
| POST   | `/api/orders`                                | JWT  | owner, manager, cashier, waiter       | orders | Y        | PASS (automated) · _h1, h3, h4, r1, r11, r13, r15_   |
| GET    | `/api/orders/:id`                            | JWT  | owner, manager, cashier, waiter       | orders | N        | NOT EXECUTED                                         |
| POST   | `/api/orders/:id/apply-coupon`               | JWT  | owner, manager, cashier               | orders | N        | PASS (automated) · _r11_                             |
| PATCH  | `/api/orders/:id/convert-to-takeaway`        | JWT  | owner, manager, cashier, waiter       | orders | N        | NOT EXECUTED                                         |
| PATCH  | `/api/orders/:id/customer`                   | JWT  | owner, manager                        | orders | N        | NOT EXECUTED                                         |
| PATCH  | `/api/orders/:id/discount`                   | JWT  | owner, manager                        | orders | N        | PASS (automated) · _h1, h3, r1_                      |
| POST   | `/api/orders/:id/items`                      | JWT  | owner, manager, cashier, waiter       | orders | N        | PASS (automated) · _r2_ (final rerun after tip fix)  |
| PATCH  | `/api/orders/:id/items/:itemId/discount`     | JWT  | owner, manager                        | orders | N        | PASS (automated) · _r1_                              |
| PATCH  | `/api/orders/:id/status`                     | JWT  | owner, manager, cashier, chef, waiter | orders | N        | PASS (automated) · _h1, h4, r1, orders-authz_        |
| PATCH  | `/api/orders/:orderId/items/:itemId/cancel`  | JWT  | owner, manager, cashier, waiter       | orders | Y        | PASS (automated) · _h1, h3, h4, authz, orders-authz_ |
| PATCH  | `/api/orders/:orderId/items/:itemId/restore` | JWT  | owner, manager                        | orders | N        | PASS (automated) · _h3, h4_                          |

### payments

| Method | Path                                 | Auth | Roles                                 | Module   | Critical | Session Result                                  |
| ------ | ------------------------------------ | ---- | ------------------------------------- | -------- | -------- | ----------------------------------------------- |
| GET    | `/api/bills`                         | JWT  | owner, manager, cashier               | payments | N        | PASS (automated) · _authz_                      |
| GET    | `/api/bills/:id`                     | JWT  | owner, manager, cashier               | payments | N        | NOT EXECUTED                                    |
| POST   | `/api/bills/:id/applyDiscount`       | JWT  | owner, manager                        | payments | N        | PASS (automated) · _authz_                      |
| POST   | `/api/bills/:id/markPrinted`         | JWT  | owner, manager                        | payments | N        | NOT EXECUTED                                    |
| POST   | `/api/bills/:id/payment`             | JWT  | owner, manager, cashier               | payments | Y        | PASS (automated) · _h1, r1, r11, r13, r14, r15_ |
| POST   | `/api/bills/:id/payments`            | JWT  | owner, manager, cashier               | payments | Y        | NOT EXECUTED                                    |
| POST   | `/api/bills/:id/print`               | JWT  | owner, manager, cashier               | payments | N        | NOT EXECUTED                                    |
| GET    | `/api/bills/:id/print-history`       | JWT  | owner, manager, cashier               | payments | N        | NOT EXECUTED                                    |
| POST   | `/api/bills/:id/split-check`         | JWT  | owner, manager, cashier               | payments | N        | NOT EXECUTED                                    |
| POST   | `/api/bills/generate`                | JWT  | owner, manager, cashier               | payments | N        | PASS (automated) · _h1, r1, r11, r13, r15_      |
| GET    | `/api/bills/order/:orderId`          | JWT  | owner, manager, cashier               | payments | N        | NOT EXECUTED                                    |
| GET    | `/api/coupons`                       | JWT  | owner, manager                        | payments | N        | PASS (automated) · _r11_                        |
| POST   | `/api/coupons`                       | JWT  | owner, manager                        | payments | N        | PASS (automated) · _r11_                        |
| POST   | `/api/coupons/:id/deactivate`        | JWT  | owner, manager                        | payments | N        | PASS (automated) · _r11_                        |
| GET    | `/api/payment-methods`               | JWT  | owner, manager, cashier, waiter, chef | payments | Y        | NOT EXECUTED                                    |
| POST   | `/api/payment-methods`               | JWT  | owner, manager                        | payments | Y        | NOT EXECUTED                                    |
| DELETE | `/api/payment-methods/:id`           | JWT  | owner, manager                        | payments | Y        | NOT EXECUTED                                    |
| PUT    | `/api/payment-methods/:id`           | JWT  | owner, manager                        | payments | Y        | NOT EXECUTED                                    |
| POST   | `/api/payment-methods/:id/merge`     | JWT  | owner, manager                        | payments | Y        | NOT EXECUTED                                    |
| GET    | `/api/payment-methods/merge-history` | JWT  | owner, manager                        | payments | Y        | NOT EXECUTED                                    |
| GET    | `/api/refunds`                       | JWT  | owner, manager, cashier               | payments | Y        | NOT EXECUTED                                    |
| POST   | `/api/refunds/:id/refund`            | JWT  | owner, manager, cashier               | payments | Y        | NOT EXECUTED                                    |
| POST   | `/api/refunds/:id/restock`           | JWT  | owner, manager, cashier               | payments | Y        | NOT EXECUTED                                    |

### menu

| Method | Path                                           | Auth | Roles             | Module | Critical | Session Result             |
| ------ | ---------------------------------------------- | ---- | ----------------- | ------ | -------- | -------------------------- |
| GET    | `/api/addon-groups`                            | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| POST   | `/api/addon-groups`                            | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| POST   | `/api/addon-groups/:groupId/addons`            | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| DELETE | `/api/addon-groups/:groupId/addons/:addonId`   | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| PUT    | `/api/addon-groups/:groupId/addons/:addonId`   | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| DELETE | `/api/addon-groups/:id`                        | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/addon-groups/:id`                        | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| PUT    | `/api/addon-groups/:id`                        | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/categories`                              | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| POST   | `/api/categories`                              | JWT  | owner, manager    | menu   | N        | PASS (automated) · _authz_ |
| DELETE | `/api/categories/:id`                          | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/categories/:id`                          | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| PUT    | `/api/categories/:id`                          | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/menu-csv/export/addons`                  | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/menu-csv/export/categories`              | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/menu-csv/export/products`                | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| POST   | `/api/menu-csv/import/addons`                  | JWT  | owner, manager    | menu   | Y        | NOT EXECUTED               |
| POST   | `/api/menu-csv/import/categories`              | JWT  | owner, manager    | menu   | Y        | NOT EXECUTED               |
| POST   | `/api/menu-csv/import/products`                | JWT  | owner, manager    | menu   | Y        | NOT EXECUTED               |
| GET    | `/api/menu-csv/template/:type`                 | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/products`                                | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| POST   | `/api/products`                                | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| DELETE | `/api/products/:id`                            | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/products/:id`                            | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| PUT    | `/api/products/:id`                            | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| POST   | `/api/products/:id/availability`               | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/products/:id/image`                      | JWT  | any authenticated | menu   | N        | NOT EXECUTED               |
| POST   | `/api/products/:id/stock`                      | JWT  | owner, manager    | menu   | N        | PASS (automated) · _h3_    |
| POST   | `/api/products/fetch-url`                      | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| POST   | `/api/products/loyalty/apply-global-rate`      | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |
| GET    | `/api/products/loyalty/global-rate-candidates` | JWT  | owner, manager    | menu   | N        | NOT EXECUTED               |

### tables

| Method | Path                            | Auth | Roles                           | Module | Critical | Session Result                                      |
| ------ | ------------------------------- | ---- | ------------------------------- | ------ | -------- | --------------------------------------------------- |
| GET    | `/api/tables`                   | JWT  | any authenticated               | tables | N        | NOT EXECUTED                                        |
| POST   | `/api/tables`                   | JWT  | owner, manager                  | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |
| GET    | `/api/tables/:id`               | JWT  | any authenticated               | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |
| PUT    | `/api/tables/:id`               | JWT  | owner, manager                  | tables | N        | NOT EXECUTED                                        |
| POST   | `/api/tables/:id/assign-waiter` | JWT  | owner, manager                  | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |
| POST   | `/api/tables/:id/deactivate`    | JWT  | owner, manager                  | tables | N        | NOT EXECUTED                                        |
| POST   | `/api/tables/:id/merge`         | JWT  | owner, manager, cashier, waiter | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |
| POST   | `/api/tables/:id/move-order`    | JWT  | owner, manager, cashier, waiter | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |
| POST   | `/api/tables/:id/reactivate`    | JWT  | owner, manager                  | tables | N        | NOT EXECUTED                                        |
| POST   | `/api/tables/:id/split`         | JWT  | owner, manager, cashier, waiter | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |
| PATCH  | `/api/tables/:id/status`        | JWT  | owner, manager                  | tables | N        | PASS (automated) · _r2_ (final rerun after tip fix) |

### kitchen/KDS

| Method | Path                              | Auth | Roles                                 | Module      | Critical | Session Result                                      |
| ------ | --------------------------------- | ---- | ------------------------------------- | ----------- | -------- | --------------------------------------------------- |
| GET    | `/api/kds-info`                   | JWT  | owner, manager, cashier, waiter, chef | kitchen/KDS | N        | PASS (automated) · _h2_                             |
| GET    | `/api/kds/display`                | JWT  | chef, manager, owner (router-level)   | kitchen/KDS | N        | NOT EXECUTED                                        |
| PATCH  | `/api/kds/items/:id/status`       | JWT  | chef, manager, owner (router-level)   | kitchen/KDS | N        | NOT EXECUTED                                        |
| GET    | `/api/kds/orders`                 | JWT  | chef, manager, owner (router-level)   | kitchen/KDS | N        | PASS (automated) · _r3_ (final rerun after tip fix) |
| PATCH  | `/api/kds/orders/:id/priority`    | JWT  | owner, manager                        | kitchen/KDS | N        | NOT EXECUTED                                        |
| GET    | `/api/kds/pairing`                | JWT  | chef, manager, owner (router-level)   | kitchen/KDS | N        | NOT EXECUTED                                        |
| POST   | `/api/kds/pairing`                | JWT  | owner, manager                        | kitchen/KDS | N        | NOT EXECUTED                                        |
| GET    | `/api/kitchen-stations`           | JWT  | any authenticated                     | kitchen/KDS | N        | NOT EXECUTED                                        |
| POST   | `/api/kitchen-stations`           | JWT  | owner, manager                        | kitchen/KDS | N        | NOT EXECUTED                                        |
| DELETE | `/api/kitchen-stations/:id`       | JWT  | owner, manager                        | kitchen/KDS | N        | NOT EXECUTED                                        |
| GET    | `/api/kitchen-stations/:id`       | JWT  | any authenticated                     | kitchen/KDS | N        | NOT EXECUTED                                        |
| PUT    | `/api/kitchen-stations/:id`       | JWT  | owner, manager                        | kitchen/KDS | N        | NOT EXECUTED                                        |
| PUT    | `/api/kitchen-stations/:id/users` | JWT  | owner, manager                        | kitchen/KDS | N        | NOT EXECUTED                                        |
| GET    | `/api/kitchen/orders`             | JWT  | any authenticated                     | kitchen/KDS | N        | NOT EXECUTED                                        |

| Method | Path                             | Auth                       | Roles             | Module      | Critical | Session Result                                                                     |
| ------ | -------------------------------- | -------------------------- | ----------------- | ----------- | -------- | ---------------------------------------------------------------------------------- |
| WS     | `/kds (ws://localhost:3001/kds)` | KDS session (post-upgrade) | paired KDS client | kitchen/KDS | Y        | NOT EXECUTED · _h2 covers /api/kds-info + source asserts; live WS upgrade not run_ |

### customers

| Method | Path                               | Auth | Roles                           | Module    | Critical | Session Result                                      |
| ------ | ---------------------------------- | ---- | ------------------------------- | --------- | -------- | --------------------------------------------------- |
| GET    | `/api/crm/lookup`                  | JWT  | owner, manager, cashier, waiter | customers | N        | NOT EXECUTED                                        |
| GET    | `/api/customers`                   | JWT  | owner, manager, cashier, waiter | customers | N        | PASS (automated) · _authz_                          |
| POST   | `/api/customers`                   | JWT  | owner, manager, cashier, waiter | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| GET    | `/api/customers-search`            | JWT  | owner, manager, cashier, waiter | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| GET    | `/api/customers/:id`               | JWT  | owner, manager, cashier, waiter | customers | N        | NOT EXECUTED                                        |
| PUT    | `/api/customers/:id`               | JWT  | owner, manager, cashier         | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| GET    | `/api/customers/:id/crm`           | JWT  | owner, manager, cashier, waiter | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| POST   | `/api/customers/:id/deactivate`    | JWT  | owner, manager                  | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| GET    | `/api/customers/:id/notes`         | JWT  | owner, manager, cashier, waiter | customers | N        | NOT EXECUTED                                        |
| POST   | `/api/customers/:id/notes`         | JWT  | owner, manager, cashier         | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| DELETE | `/api/customers/:id/notes/:noteId` | JWT  | owner, manager                  | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| PUT    | `/api/customers/:id/notes/:noteId` | JWT  | owner, manager                  | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| POST   | `/api/customers/:id/reactivate`    | JWT  | owner, manager, cashier, waiter | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| GET    | `/api/customers/:id/wallet`        | JWT  | owner, manager, cashier, waiter | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |
| DELETE | `/api/customers/admin/cleanup`     | JWT  | owner                           | customers | N        | NOT EXECUTED                                        |
| GET    | `/api/customers/alerts`            | JWT  | owner, manager, cashier, waiter | customers | N        | NOT EXECUTED                                        |
| GET    | `/api/customers/metrics`           | JWT  | owner, manager                  | customers | N        | PASS (automated) · _r7_ (final rerun after tip fix) |

### staff/shifts

| Method | Path                                     | Auth | Roles                   | Module       | Critical | Session Result                                      |
| ------ | ---------------------------------------- | ---- | ----------------------- | ------------ | -------- | --------------------------------------------------- |
| GET    | `/api/shifts`                            | JWT  | owner, manager          | staff/shifts | N        | NOT EXECUTED                                        |
| GET    | `/api/shifts/:id`                        | JWT  | owner, manager          | staff/shifts | N        | NOT EXECUTED                                        |
| POST   | `/api/shifts/:id/close`                  | JWT  | owner, manager, cashier | staff/shifts | Y        | NOT EXECUTED                                        |
| POST   | `/api/shifts/:id/force-close`            | JWT  | owner, manager          | staff/shifts | N        | NOT EXECUTED                                        |
| GET    | `/api/shifts/:id/reconciliation-preview` | JWT  | owner, manager, cashier | staff/shifts | N        | NOT EXECUTED                                        |
| GET    | `/api/shifts/active`                     | JWT  | owner, manager, cashier | staff/shifts | N        | NOT EXECUTED                                        |
| POST   | `/api/shifts/open`                       | JWT  | owner, manager, cashier | staff/shifts | Y        | NOT EXECUTED                                        |
| GET    | `/api/shifts/terminal-id`                | JWT  | owner, manager, cashier | staff/shifts | N        | NOT EXECUTED                                        |
| GET    | `/api/staff`                             | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _authz_                          |
| POST   | `/api/staff`                             | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _staff-authz_                    |
| GET    | `/api/staff/:id`                         | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _r8_ (final rerun after tip fix) |
| PUT    | `/api/staff/:id`                         | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _staff-authz_                    |
| POST   | `/api/staff/:id/deactivate`              | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _staff-authz_                    |
| POST   | `/api/staff/:id/reactivate`              | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _staff-authz_                    |
| GET    | `/api/staff/working`                     | JWT  | owner, manager          | staff/shifts | N        | PASS (automated) · _r8_ (final rerun after tip fix) |

### inventory

| Method | Path                                           | Auth | Roles                | Module    | Critical | Session Result                                          |
| ------ | ---------------------------------------------- | ---- | -------------------- | --------- | -------- | ------------------------------------------------------- |
| GET    | `/api/inventory/counts`                        | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4_ (final rerun after tip fix)     |
| POST   | `/api/inventory/counts`                        | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4_ (final rerun after tip fix)     |
| GET    | `/api/inventory/counts/:id`                    | JWT  | owner, manager       | inventory | N        | NOT EXECUTED                                            |
| POST   | `/api/inventory/counts/:id/apply`              | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4_ (final rerun after tip fix)     |
| POST   | `/api/inventory/counts/:id/cancel`             | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4_ (final rerun after tip fix)     |
| POST   | `/api/inventory/counts/:id/lines`              | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4_ (final rerun after tip fix)     |
| POST   | `/api/inventory/counts/:id/submit`             | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4_ (final rerun after tip fix)     |
| GET    | `/api/inventory/movements`                     | JWT  | owner, manager       | inventory | N        | NOT EXECUTED                                            |
| GET    | `/api/inventory/products/:id/ledger-check`     | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r4, r6_ (final rerun after tip fix) |
| GET    | `/api/purchasing/purchase-orders`              | JWT  | owner, manager, chef | inventory | N        | NOT EXECUTED                                            |
| POST   | `/api/purchasing/purchase-orders`              | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| GET    | `/api/purchasing/purchase-orders/:id`          | JWT  | owner, manager, chef | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| GET    | `/api/purchasing/purchase-orders/:id/receipts` | JWT  | owner, manager, chef | inventory | N        | NOT EXECUTED                                            |
| POST   | `/api/purchasing/purchase-orders/:id/receive`  | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| POST   | `/api/purchasing/purchase-orders/:id/status`   | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| GET    | `/api/purchasing/suppliers`                    | JWT  | owner, manager, chef | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| POST   | `/api/purchasing/suppliers`                    | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| GET    | `/api/purchasing/suppliers/:id`                | JWT  | owner, manager, chef | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| PATCH  | `/api/purchasing/suppliers/:id`                | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| POST   | `/api/purchasing/suppliers/:id/deactivate`     | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| GET    | `/api/purchasing/suppliers/:id/products`       | JWT  | owner, manager, chef | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| POST   | `/api/purchasing/suppliers/:id/products`       | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r6_ (final rerun after tip fix)     |
| GET    | `/api/recipes`                                 | JWT  | owner, manager, chef | inventory | N        | PASS (automated) · _r5_ (final rerun after tip fix)     |
| POST   | `/api/recipes`                                 | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r5_ (final rerun after tip fix)     |
| GET    | `/api/recipes/:id`                             | JWT  | owner, manager, chef | inventory | N        | NOT EXECUTED                                            |
| PATCH  | `/api/recipes/:id`                             | JWT  | owner, manager       | inventory | N        | NOT EXECUTED                                            |
| POST   | `/api/recipes/:id/activate`                    | JWT  | owner, manager       | inventory | N        | NOT EXECUTED                                            |
| GET    | `/api/recipes/:id/cost`                        | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r5_ (final rerun after tip fix)     |
| POST   | `/api/recipes/:id/deactivate`                  | JWT  | owner, manager       | inventory | N        | NOT EXECUTED                                            |
| PUT    | `/api/recipes/:id/ingredients`                 | JWT  | owner, manager       | inventory | N        | NOT EXECUTED                                            |
| GET    | `/api/recipes/consumptions`                    | JWT  | owner, manager       | inventory | N        | PASS (automated) · _r5_ (final rerun after tip fix)     |

### reports

| Method | Path                                        | Auth | Roles          | Module  | Critical | Session Result                                        |
| ------ | ------------------------------------------- | ---- | -------------- | ------- | -------- | ----------------------------------------------------- |
| GET    | `/api/expenses`                             | JWT  | owner, manager | reports | N        | PASS (automated) · _r9_ (final rerun after tip fix)   |
| POST   | `/api/expenses`                             | JWT  | owner, manager | reports | N        | PASS (automated) · _r9_ (final rerun after tip fix)   |
| GET    | `/api/expenses/:id`                         | JWT  | owner, manager | reports | N        | PASS (automated) · _r9_ (final rerun after tip fix)   |
| PATCH  | `/api/expenses/:id`                         | JWT  | owner, manager | reports | N        | PASS (automated) · _r9_ (final rerun after tip fix)   |
| POST   | `/api/expenses/:id/void`                    | JWT  | owner, manager | reports | N        | PASS (automated) · _r9_ (final rerun after tip fix)   |
| GET    | `/api/reports/daily-stats`                  | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| POST   | `/api/reports/day-close`                    | JWT  | owner, manager | reports | Y        | PASS (automated) · _r15_                              |
| GET    | `/api/reports/day-close/:date`              | JWT  | owner, manager | reports | Y        | PASS (automated) · _r9.4_ (final rerun after tip fix) |
| GET    | `/api/reports/day-close/:date/export/z.txt` | JWT  | owner, manager | reports | Y        | PASS (automated) · _r15_                              |
| GET    | `/api/reports/export/bills.csv`             | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/export/expenses.csv`          | JWT  | owner, manager | reports | N        | PASS (automated) · _r9.5_ (final rerun after tip fix) |
| GET    | `/api/reports/export/tax-components.csv`    | JWT  | owner, manager | reports | N        | PASS (automated) · _r9.3_ (final rerun after tip fix) |
| GET    | `/api/reports/export/voids.csv`             | JWT  | owner, manager | reports | N        | PASS (automated) · _r12_                              |
| GET    | `/api/reports/food-cost`                    | JWT  | owner, manager | reports | N        | PASS (automated) · _r9.6_                             |
| GET    | `/api/reports/insights`                     | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/inventory-valuation`          | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/ops-finance`                  | JWT  | owner, manager | reports | N        | PASS (automated) · _r9.5_ (final rerun after tip fix) |
| GET    | `/api/reports/recentOrders`                 | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/sales`                        | JWT  | owner, manager | reports | N        | PASS (automated) · _authz_                            |
| GET    | `/api/reports/summary`                      | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/tables`                       | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/tax-components`               | JWT  | owner, manager | reports | N        | PASS (automated) · _r9.3_ (final rerun after tip fix) |
| GET    | `/api/reports/topProducts`                  | JWT  | owner, manager | reports | N        | NOT EXECUTED                                          |
| GET    | `/api/reports/voids`                        | JWT  | owner, manager | reports | N        | PASS (automated) · _r12_                              |

### printing

| Method | Path                            | Auth | Roles                   | Module   | Critical | Session Result                                        |
| ------ | ------------------------------- | ---- | ----------------------- | -------- | -------- | ----------------------------------------------------- |
| GET    | `/api/printers`                 | JWT  | any authenticated       | printing | N        | PASS (automated) · _authz_                            |
| POST   | `/api/printers`                 | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |
| DELETE | `/api/printers/:id`             | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |
| GET    | `/api/printers/:id`             | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |
| PUT    | `/api/printers/:id`             | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |
| POST   | `/api/printers/:id/set-default` | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |
| POST   | `/api/printers/:id/test`        | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |
| GET    | `/api/printers/detect`          | JWT  | any authenticated       | printing | N        | NOT EXECUTED                                          |
| GET    | `/api/printers/jobs`            | JWT  | owner, manager          | printing | N        | PASS (automated) · _r13_                              |
| POST   | `/api/printers/jobs/:id/retry`  | JWT  | owner, manager          | printing | N        | PASS (automated) · _r13_                              |
| POST   | `/api/printers/kick-drawer`     | JWT  | owner, manager, cashier | printing | N        | NOT EXECUTED                                          |
| POST   | `/api/printers/print-bill`      | JWT  | owner, manager, cashier | printing | Y        | PASS (automated) · _h1, r1, r13_                      |
| POST   | `/api/printers/print-day-close` | JWT  | owner, manager          | printing | Y        | PASS (automated) · _r9.4_ (final rerun after tip fix) |
| POST   | `/api/printers/print-kot`       | JWT  | owner, manager, cashier | printing | N        | PASS (automated) · _r3_ (final rerun after tip fix)   |
| POST   | `/api/printers/print-refund`    | JWT  | owner, manager, cashier | printing | N        | NOT EXECUTED                                          |
| GET    | `/api/printers/supported`       | JWT  | owner, manager          | printing | N        | NOT EXECUTED                                          |

### backup/DB

| Method | Path                                     | Auth | Roles              | Module    | Critical | Session Result             |
| ------ | ---------------------------------------- | ---- | ------------------ | --------- | -------- | -------------------------- |
| POST   | `/api/db-tools/apply-safe-fixes`         | JWT  | owner              | backup/DB | N        | NOT EXECUTED               |
| GET    | `/api/db-tools/backups`                  | JWT  | owner              | backup/DB | Y        | NOT EXECUTED               |
| POST   | `/api/db-tools/backups/:fileName/delete` | JWT  | owner + master PIN | backup/DB | Y        | NOT EXECUTED               |
| GET    | `/api/db-tools/health-check`             | JWT  | owner              | backup/DB | N        | PASS (automated) · _authz_ |
| POST   | `/api/db-tools/initialize`               | JWT  | owner + master PIN | backup/DB | N        | NOT EXECUTED               |
| POST   | `/api/db-tools/master-pin/reset`         | JWT  | owner              | backup/DB | N        | NOT EXECUTED               |
| GET    | `/api/db-tools/master-pin/status`        | JWT  | owner              | backup/DB | N        | NOT EXECUTED               |
| POST   | `/api/db/backup`                         | JWT  | owner + master PIN | backup/DB | Y        | PASS (automated) · _r15_   |
| GET    | `/api/db/download`                       | JWT  | owner + master PIN | backup/DB | N        | NOT EXECUTED               |
| GET    | `/api/db/export`                         | JWT  | owner              | backup/DB | N        | PASS (automated) · _authz_ |
| POST   | `/api/db/import`                         | JWT  | owner + master PIN | backup/DB | Y        | NOT EXECUTED               |
| GET    | `/api/db/tables`                         | JWT  | owner              | backup/DB | N        | NOT EXECUTED               |

### tax

| Method | Path                                                  | Auth | Roles          | Module | Critical | Session Result             |
| ------ | ----------------------------------------------------- | ---- | -------------- | ------ | -------- | -------------------------- |
| GET    | `/api/tax-packs`                                      | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |
| GET    | `/api/tax-packs/:packId`                              | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/:packId/rollback`                     | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/:packId/versions/:versionId/activate` | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| GET    | `/api/tax-packs/audit`                                | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |
| GET    | `/api/tax-packs/catalog`                              | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/catalog/install`                      | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/ensure-country`                       | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/manual-config`                        | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/overrides`                            | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| DELETE | `/api/tax-packs/overrides/:overrideId`                | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| PUT    | `/api/tax-packs/overrides/:overrideId`                | JWT  | owner          | tax    | N        | NOT EXECUTED               |
| POST   | `/api/tax-packs/test-calculation`                     | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |
| GET    | `/api/tax/categories`                                 | JWT  | owner, manager | tax    | N        | PASS (automated) · _authz_ |
| POST   | `/api/tax/preview`                                    | JWT  | owner, manager | tax    | N        | NOT EXECUTED               |

### settings

| Method | Path                                       | Auth | Roles                                 | Module   | Critical | Session Result             |
| ------ | ------------------------------------------ | ---- | ------------------------------------- | -------- | -------- | -------------------------- |
| GET    | `/api/settings`                            | JWT  | owner, manager, cashier, waiter, chef | settings | N        | PASS (automated) · _authz_ |
| GET    | `/api/settings/:key`                       | JWT  | owner, manager, cashier, waiter, chef | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/:key`                       | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/business`                   | JWT  | owner, manager, cashier, waiter, chef | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/business`                   | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/cloud`                      | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/cloud`                      | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/cloud/account`              | JWT  | owner                                 | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/cloud/account/preferences`  | JWT  | owner                                 | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/cloud/account/verification` | JWT  | owner                                 | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/cloud/delete-data`          | JWT  | owner + master PIN                    | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/cloud/delete-data/cancel`   | JWT  | owner + master PIN                    | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/cloud/delete-data/status`   | JWT  | owner                                 | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/cloud/register`             | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/cloud/stop-all`             | JWT  | owner + master PIN                    | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/cloud/test`                 | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/discount`                   | JWT  | owner, manager, cashier, waiter, chef | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/discount`                   | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/google-drive`               | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/google-drive`               | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/google-drive/backup-now`    | JWT  | owner + master PIN                    | settings | Y        | NOT EXECUTED               |
| POST   | `/api/settings/google-drive/connect`       | JWT  | owner                                 | settings | N        | NOT EXECUTED               |
| POST   | `/api/settings/google-drive/disconnect`    | JWT  | owner                                 | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/kds`                        | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/kds`                        | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/loyalty`                    | JWT  | owner, manager, cashier, waiter, chef | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/loyalty`                    | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/order-numbering`            | JWT  | owner, manager, cashier, waiter, chef | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/order-numbering`            | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |
| GET    | `/api/settings/tax`                        | JWT  | owner, manager, cashier, waiter, chef | settings | N        | NOT EXECUTED               |
| PUT    | `/api/settings/tax`                        | JWT  | owner, manager                        | settings | N        | NOT EXECUTED               |

### audit

| Method | Path                         | Auth | Roles          | Module | Critical | Session Result                                        |
| ------ | ---------------------------- | ---- | -------------- | ------ | -------- | ----------------------------------------------------- |
| GET    | `/api/audit-logs`            | JWT  | owner, manager | audit  | N        | PASS (automated) · _r9.2_ (final rerun after tip fix) |
| GET    | `/api/audit-logs/export.csv` | JWT  | owner, manager | audit  | N        | PASS (automated) · _r9.2_ (final rerun after tip fix) |

### mobile

| Method | Path                       | Auth | Roles | Module | Critical | Session Result             |
| ------ | -------------------------- | ---- | ----- | ------ | -------- | -------------------------- |
| GET    | `/api/mobile/devices`      | JWT  | owner | mobile | N        | PASS (automated) · _authz_ |
| GET    | `/api/mobile/pairing-code` | JWT  | owner | mobile | N        | PASS (automated) · _authz_ |
| POST   | `/api/mobile/rotate-code`  | JWT  | owner | mobile | N        | PASS (automated) · _authz_ |

### whatsapp

| Method | Path                                   | Auth | Roles                   | Module   | Critical | Session Result |
| ------ | -------------------------------------- | ---- | ----------------------- | -------- | -------- | -------------- |
| GET    | `/api/whatsapp/blocklist`              | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/blocklist`              | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| DELETE | `/api/whatsapp/blocklist/:phone`       | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/connect`                | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/disable`                | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/disconnect`             | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/enable`                 | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| GET    | `/api/whatsapp/inbox`                  | JWT  | owner, manager, cashier | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/inbox/:messageId/reply` | JWT  | owner, manager, cashier | whatsapp | N        | NOT EXECUTED   |
| GET    | `/api/whatsapp/messages`               | JWT  | owner, manager, cashier | whatsapp | N        | NOT EXECUTED   |
| GET    | `/api/whatsapp/pairing-code`           | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| GET    | `/api/whatsapp/qr`                     | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/send`                   | JWT  | owner, manager, cashier | whatsapp | N        | NOT EXECUTED   |
| POST   | `/api/whatsapp/settings`               | JWT  | owner, manager          | whatsapp | N        | NOT EXECUTED   |
| GET    | `/api/whatsapp/status`                 | JWT  | owner, manager, cashier | whatsapp | N        | NOT EXECUTED   |

### platform

| Method | Path                                         | Auth | Roles                                 | Module   | Critical | Session Result |
| ------ | -------------------------------------------- | ---- | ------------------------------------- | -------- | -------- | -------------- |
| GET    | `/api/more-apps`                             | JWT  | any authenticated                     | platform | N        | NOT EXECUTED   |
| GET    | `/api/more-apps/revflo`                      | JWT  | any authenticated                     | platform | N        | NOT EXECUTED   |
| GET    | `/api/platform/composition`                  | JWT  | owner, manager, cashier, waiter, chef | platform | N        | NOT EXECUTED   |
| GET    | `/api/pos-info`                              | JWT  | any authenticated                     | platform | N        | NOT EXECUTED   |
| GET    | `/api/server-app-info`                       | JWT  | any authenticated                     | platform | N        | NOT EXECUTED   |
| POST   | `/api/support-ticket`                        | JWT  | owner, manager, cashier, waiter, chef | platform | N        | NOT EXECUTED   |
| GET    | `/api/support-ticket/:clientTicketId/status` | JWT  | owner, manager, cashier, waiter, chef | platform | N        | NOT EXECUTED   |
| GET    | `/api/support-ticket/diagnostics-preview`    | JWT  | owner, manager, cashier, waiter, chef | platform | N        | NOT EXECUTED   |
| GET    | `/api/support-ticket/profile`                | JWT  | owner, manager, cashier, waiter, chef | platform | N        | NOT EXECUTED   |

---

## Notes / caveats

1. **Auth:** Unless public/special, routes use global `requireAuth` (JWT). Role lists come from handler `requireRole(...)` (KDS uses router-level roles). Handlers without `requireRole` → **any authenticated**.
2. **PASS is method-specific** (e.g. `GET /api/staff` PASS via authz; `GET /api/staff/working` FAIL via r8 only).
3. **build PASS** is compile-only and does not mark endpoints PASS.
4. **Playwright / GUI E2E** not used here (see `docs/qa/GUI-COVERAGE.md`).
5. Re-scan `main/routes/` after large route refactors.

---

## Evidence index

| Artifact           | Path                                  |
| ------------------ | ------------------------------------- |
| Summary (primary)  | `docs/qa/evidence/SUMMARY.txt`        |
| Summary (r2–r14)   | `docs/qa/evidence/SUMMARY-r2-r14.txt` |
| Suite logs         | `docs/qa/evidence/*.log`              |
| Route registration | `main/routes/index.ts`                |

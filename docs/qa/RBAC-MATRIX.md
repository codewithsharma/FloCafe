# FloCafe / OPERAVIA — RBAC Matrix (QA)

**Captured:** 2026-08-15  
**Branch:** `restaurant-vertical`  
**Evidence:** [`docs/qa/evidence/SUMMARY.txt`](./evidence/SUMMARY.txt)  
**Code authority:** role strings on `users.role` + `requireRole()` — not docs alone.

---

## 1. Roles discovered (exact strings)

| Role      | Canonical source                                         |
| --------- | -------------------------------------------------------- |
| `owner`   | `main/services/staff-workforce.ts` → `VALID_STAFF_ROLES` |
| `manager` | same                                                     |
| `cashier` | same                                                     |
| `waiter`  | same                                                     |
| `chef`    | same                                                     |

Mirrored in:

- `main/validation/staff.ts` → `staffRoleSchema`
- `frontend/src/components/staff/StaffFormDialog.tsx` → `VALID_ROLES`
- `frontend/src/config/navigation.ts` → `FloNavRole`
- Setup first admin: `INITIAL_ADMIN_ROLE = 'owner'` in `main/routes/auth.ts`

**Not a valid staff role:** settings UI still checks `role === 'admin'` (`frontend/src/app/(dashboard)/settings/page.tsx`). Staff API rejects anything outside the five roles above.

**Hierarchy (coded):** `owner > manager > cashier | waiter | chef`  
Managers may create/edit only operational roles (`cashier`, `waiter`, `chef`). Only owners can change roles. PINs are permitted only for `owner` / `manager`.

---

## 2. Authorization model

**RBAC is role-based via `requireRole(...roles)`, not fine-grained permission strings.**

| Fact                 | Detail                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| No permissions table | Authorization is membership in a role set on each route/service                                                                |
| Middleware           | `requireRole` in `main/middleware/security.ts` → 403 `"Insufficient permissions"`                                              |
| Auth layer           | Global JWT `requireAuth` in `main/server.ts`; **DB role overrides JWT claim**                                                  |
| Orthogonal gates     | Manager/owner **PIN** (`pin_hash`) for voids / in-progress cancel; **Master PIN** for destructive DB/ops                       |
| Module capabilities  | `CapabilityId` in `main/modules/types.ts` (e.g. `staff.manage`, `pos.sell`) are **vertical composition**, not user permissions |

Documented summary: `docs/07-security/permissions.md`, `docs/05-api/authorization.md`, `docs/05-production/h3-permissions-rbac-hardening.md`.

---

## 3. Navigation matrix (`FLO_NAV_ITEMS`)

Source: `frontend/src/config/navigation.ts`. Filtered by role (+ module / feature flags).

| Nav id     | href          | owner | manager | cashier | waiter | chef |
| ---------- | ------------- | :---: | :-----: | :-----: | :----: | :--: |
| home       | `/dashboard`  |   Y   |         |         |        |      |
| pos        | `/pos`        |   Y   |    Y    |    Y    |        |      |
| tables     | `/tables`     |   Y   |    Y    |         |        |      |
| orders     | `/orders`     |   Y   |    Y    |    Y    |        |      |
| kitchen    | `/kds`        |   Y   |    Y    |         |        |      |
| customers  | `/customers`  |   Y   |    Y    |         |        |      |
| inventory  | `/products`   |   Y   |    Y    |         |        |      |
| reports    | `/reports`    |   Y   |    Y    |         |        |      |
| expenses   | `/expenses`   |   Y   |    Y    |         |        |      |
| operations | `/operations` |   Y   |    Y    |         |        |      |
| audit      | `/audit`      |   Y   |    Y    |         |        |      |
| team       | `/staff`      |   Y   |    Y    |         |        |      |
| settings   | `/settings`   |   Y   |    Y    |         |        |      |
| whatsapp   | `/whatsapp`   |   Y   |    Y    |    Y    |        |      |
| support    | `/support`    |   Y   |    Y    |    Y    |   Y    |  Y   |

**Notes:**

- `AuthGuard` (`frontend/src/components/layout/AuthGuard.tsx`) requires login for non-public paths; does **not** enforce role per route.
- Landing after login is always `/pos` (`getLandingPage`) for every role.
- Public paths include `/kds` and `/kds-standalone` (chef typically uses standalone KDS, not sidebar kitchen item).
- Waiter/chef sidebar is effectively **Support only**.

---

## 4. Comprehensive Allow / Deny matrix

Legend for **Testing** column:

| Mark                  | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| **AUTOMATED**         | Covered by authz suite(s) that **PASSED** in this audit session (see §6) |
| **MANUAL NOT TESTED** | GUI / deep-link / E2E not verified in this session                       |
| **PARTIAL**           | API automated; GUI still untested (or vice versa)                        |

| Role             | Module                                                                  | Action                                     | GUI                           | API                                                             | Expected                                   | Testing                                                                        |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- | --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| owner            | Auth                                                                    | First-run setup / login                    | Setup wizard → owner          | `/api/auth/setup`, login                                        | Allow; role=`owner`                        | MANUAL NOT TESTED                                                              |
| owner            | Nav                                                                     | All primary + WhatsApp + Support           | Full sidebar                  | n/a                                                             | Allow all nav items                        | MANUAL NOT TESTED                                                              |
| owner            | POS                                                                     | Sell                                       | `/pos`                        | `POST /api/orders` O/M/C/W                                      | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | POS                                                                     | Apply order discount                       | Discount UI shown             | `PATCH /api/orders/:id/discount` O/M                            | Allow                                      | PARTIAL — H3 UI gate + API role; GUI MANUAL NOT TESTED                         |
| owner            | POS                                                                     | Apply coupon                               | UI                            | `POST /api/orders/:id/apply-coupon` O/M/C                       | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | POS                                                                     | Menu 86 chrome                             | Shown (restaurant)            | products 86 O/M                                                 | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Orders                                                                  | List / get                                 | `/orders`                     | list/get O/M/C/W                                                | Allow                                      | PARTIAL — authz-phase3 unauth; GUI MANUAL NOT TESTED                           |
| owner            | Orders                                                                  | Add items                                  | Orders/POS                    | `POST .../items` O/M/C/W                                        | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Orders                                                                  | Cancel / void item                         | Orders UI                     | `PATCH .../cancel` O/M/C/W (+ PIN policy)                       | Allow                                      | AUTOMATED — orders-authz, h3                                                   |
| owner            | Orders                                                                  | Restore voided item                        | UI                            | `PATCH .../restore` O/M                                         | Allow                                      | AUTOMATED — h3                                                                 |
| owner            | Orders                                                                  | Patch status                               | UI                            | `PATCH .../status` all five roles                               | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Orders                                                                  | Patch customer                             | UI                            | `PATCH .../customer` O/M                                        | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Bills                                                                   | List / pay / print                         | POS/orders                    | bills O/M/C; print O/M/C                                        | Allow                                      | PARTIAL — authz-phase3 unauth bills; GUI MANUAL NOT TESTED                     |
| owner            | Bills                                                                   | Apply bill discount                        | UI                            | `POST .../applyDiscount` O/M                                    | Allow                                      | AUTOMATED — authz-phase3 (non-O/M denied)                                      |
| owner            | Refunds                                                                 | Process refund                             | Orders                        | refunds O/M/C                                                   | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Shifts                                                                  | Open / close / active                      | Status bar                    | shifts operators O/M/C                                          | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Shifts                                                                  | Force-close / history                      | Status bar                    | shifts managers O/M                                             | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Day close                                                               | Close day / Z export                       | Dashboard card                | `/api/reports/day-close*` O/M                                   | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Reports                                                                 | View / export                              | `/reports`                    | `/api/reports/*` O/M                                            | Allow                                      | PARTIAL — authz-phase3 sales 401 unauth; GUI MANUAL NOT TESTED                 |
| owner            | Audit                                                                   | List / export CSV                          | `/audit`                      | `/api/audit-logs*` O/M                                          | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Staff                                                                   | List / create / update / deactivate        | `/staff`                      | `/api/staff` O/M                                                | Allow                                      | AUTOMATED — staff-authz                                                        |
| owner            | Staff                                                                   | Change roles / set PIN                     | Staff form                    | owner-only role change; PIN O/M                                 | Allow                                      | AUTOMATED — staff-authz                                                        |
| owner            | Inventory                                                               | Movements / counts / wastage / 86          | `/products*`                  | inventory + products mutate O/M                                 | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Recipes                                                                 | CRUD                                       | `/products/recipes`           | write O/M; read +chef                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Purchasing                                                              | Suppliers / POs                            | `/products/purchasing`        | write O/M; read +chef                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Categories                                                              | Create / update / delete                   | Inventory UI                  | categories mutate O/M                                           | Allow                                      | AUTOMATED — authz-phase3 (non-O/M denied)                                      |
| owner            | Tables                                                                  | CRUD floor                                 | `/tables`                     | create/update/deactivate O/M                                    | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Tables                                                                  | Seat / free / assign waiter                | Tables UI                     | seat ops O/M/C/W                                                | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | KDS                                                                     | View / update item status                  | `/kds`                        | `/api/kds`, kitchen O/M/Ch                                      | Allow (all stations)                       | MANUAL NOT TESTED                                                              |
| owner            | Customers                                                               | Full CRM + metrics + deactivate            | `/customers`                  | O/M metrics/deactivate; list O/M/C/W                            | Allow                                      | PARTIAL — authz-phase3 staff/customer exposure; GUI MANUAL NOT TESTED          |
| owner            | Settings                                                                | View / save                                | `/settings`                   | GET many roles; PUT O/M                                         | Allow                                      | PARTIAL — h3 deep-link gate; GUI MANUAL NOT TESTED                             |
| owner            | Tax packs                                                               | Install / overrides / rollback             | Settings tax                  | many owner-only mutates                                         | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | DB tools                                                                | Export / wipe / backups                    | Settings                      | `/api/db*`, `/database-tools` + Master PIN                      | Allow                                      | AUTOMATED — authz-phase3 owner-only routes                                     |
| owner            | Mobile                                                                  | Pairing code / devices / rotate            | Settings                      | `/api/mobile/*` owner                                           | Allow                                      | AUTOMATED — authz-phase3                                                       |
| owner            | WhatsApp                                                                | Admin + send / inbox                       | `/whatsapp`                   | admin O/M; send O/M/C                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Printers                                                                | CRUD + kick drawer                         | Settings / POS                | CRUD O/M; kick/print O/M/C                                      | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Support                                                                 | Submit ticket                              | `/support`                    | all five roles                                                  | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Server App                                                              | Login                                      | Server App                    | roles W/M/O only                                                | Allow                                      | MANUAL NOT TESTED                                                              |
| owner            | Platform                                                                | Read composition                           | App shell                     | `/api/platform/composition` all five                            | Allow                                      | MANUAL NOT TESTED                                                              |
| manager          | Nav                                                                     | All except Home                            | Sidebar (no `/dashboard`)     | n/a                                                             | Home hidden                                | MANUAL NOT TESTED                                                              |
| manager          | POS                                                                     | Sell + discount                            | `/pos`                        | discount O/M                                                    | Allow                                      | PARTIAL — h3; GUI MANUAL NOT TESTED                                            |
| manager          | Orders                                                                  | Cancel / void (+ PIN)                      | UI                            | cancel O/M/C/W                                                  | Allow                                      | AUTOMATED — orders-authz, h3                                                   |
| manager          | Orders                                                                  | Restore item                               | UI                            | restore O/M                                                     | Allow                                      | AUTOMATED — h3                                                                 |
| manager          | Bills                                                                   | Pay / discount                             | UI                            | bills O/M/C; applyDiscount O/M                                  | Allow                                      | AUTOMATED — authz-phase3 deny for C/W/Ch on discount                           |
| manager          | Staff                                                                   | Create operational roles only              | `/staff`                      | cannot create O/M; cannot change roles                          | Allow ops; Deny elevate                    | AUTOMATED — staff-authz                                                        |
| manager          | Staff                                                                   | Edit owner / other manager                 | Staff UI                      | `canModifyTargetStaff`                                          | Deny                                       | AUTOMATED — staff-authz                                                        |
| manager          | Shifts                                                                  | Open/close/force/history                   | Status bar                    | operators + managers                                            | Allow                                      | MANUAL NOT TESTED                                                              |
| manager          | Day close / reports / audit / inventory / settings                      | Manage                                     | Yes                           | O/M routes                                                      | Allow                                      | MANUAL NOT TESTED                                                              |
| manager          | DB export / mobile pairing / Master PIN wipe                            | Destructive                                | Hidden / fail                 | owner-only                                                      | Deny (403)                                 | AUTOMATED — authz-phase3                                                       |
| manager          | KDS                                                                     | Full access                                | `/kds`                        | O/M/Ch                                                          | Allow                                      | MANUAL NOT TESTED                                                              |
| manager          | Server App                                                              | Login                                      | Server App                    | W/M/O                                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| cashier          | Nav                                                                     | POS, Orders, WhatsApp, Support             | Limited sidebar               | n/a                                                             | Others hidden                              | MANUAL NOT TESTED                                                              |
| cashier          | POS                                                                     | Sell                                       | `/pos`                        | orders create O/M/C/W                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| cashier          | POS                                                                     | Apply discount UI                          | Hidden                        | `PATCH .../discount` O/M                                        | Deny GUI + API                             | PARTIAL — h3 UI + role; GUI MANUAL NOT TESTED                                  |
| cashier          | POS                                                                     | Apply coupon                               | UI                            | apply-coupon O/M/C                                              | Allow                                      | MANUAL NOT TESTED                                                              |
| cashier          | Bills                                                                   | Pay / print / drawer kick                  | POS                           | bills + printers O/M/C                                          | Allow                                      | MANUAL NOT TESTED                                                              |
| cashier          | Bills                                                                   | Apply bill discount                        | —                             | applyDiscount O/M                                               | Deny (403)                                 | AUTOMATED — authz-phase3                                                       |
| cashier          | Refunds                                                                 | Process                                    | UI                            | refunds O/M/C                                                   | Allow                                      | MANUAL NOT TESTED                                                              |
| cashier          | Orders                                                                  | Cancel pending                             | Policy after requireRole      | inline: pending cancel O/M only                                 | Deny pending; void in-progress + PIN Allow | AUTOMATED — orders-authz, h3                                                   |
| cashier          | Orders                                                                  | Restore item                               | —                             | restore O/M                                                     | Deny (403)                                 | AUTOMATED — h3                                                                 |
| cashier          | Shifts                                                                  | Open/close own terminal                    | Status bar                    | O/M/C                                                           | Allow (terminal match on close)            | MANUAL NOT TESTED                                                              |
| cashier          | Shifts                                                                  | Force-close / history                      | Hidden                        | managers only                                                   | Deny                                       | MANUAL NOT TESTED                                                              |
| cashier          | Day close / reports / audit / staff / inventory / settings / tables nav | Access                                     | Nav hidden; settings redirect | requireRole 403                                                 | Deny                                       | PARTIAL — h3 settings gate; authz-phase3 categories/tax; GUI MANUAL NOT TESTED |
| cashier          | Categories create                                                       | —                                          | `POST /api/categories` O/M    | Deny (403)                                                      | AUTOMATED — authz-phase3                   |
| cashier          | Tax categories                                                          | —                                          | `GET /api/tax/categories` O/M | Deny (403)                                                      | AUTOMATED — authz-phase3                   |
| cashier          | DB / mobile                                                             | Owner tools                                | —                             | owner-only                                                      | Deny (403)                                 | AUTOMATED — authz-phase3                                                       |
| cashier          | KDS API                                                                 | Kitchen                                    | No                            | kds requireRole Ch/M/O                                          | Deny                                       | MANUAL NOT TESTED                                                              |
| cashier          | Server App                                                              | Login                                      | —                             | W/M/O only                                                      | Deny                                       | MANUAL NOT TESTED                                                              |
| cashier          | WhatsApp                                                                | Send / inbox                               | Secondary nav                 | O/M/C                                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| cashier          | Support                                                                 | Ticket                                     | Footer                        | all roles                                                       | Allow                                      | MANUAL NOT TESTED                                                              |
| waiter           | Nav                                                                     | Support only                               | Sidebar                       | n/a                                                             | Minimal GUI                                | MANUAL NOT TESTED                                                              |
| waiter           | Landing                                                                 | Post-login redirect                        | Always `/pos`                 | n/a                                                             | Lands on POS without nav item              | MANUAL NOT TESTED (known gap)                                                  |
| waiter           | Orders                                                                  | Create / list / items / cancel             | No primary nav                | O/M/C/W APIs                                                    | API Allow if called; GUI not surfaced      | PARTIAL — orders-authz cancel; GUI MANUAL NOT TESTED                           |
| waiter           | Orders                                                                  | Void in-progress (own order) + manager PIN | —                             | cancel + ownership + PIN                                        | Allow                                      | AUTOMATED — orders-authz                                                       |
| waiter           | Orders                                                                  | Restore / discount                         | —                             | O/M                                                             | Deny                                       | AUTOMATED — h3 / authz-phase3 discount                                         |
| waiter           | Tables                                                                  | Seat / free / assign                       | No nav (tables O/M only)      | seat ops O/M/C/W                                                | API Allow; GUI MANUAL NOT TESTED           | MANUAL NOT TESTED                                                              |
| waiter           | Customers                                                               | List / create / update                     | No nav                        | O/M/C/W                                                         | API Allow; GUI MANUAL NOT TESTED           | MANUAL NOT TESTED                                                              |
| waiter           | Customers                                                               | Metrics / deactivate                       | —                             | O/M                                                             | Deny                                       | MANUAL NOT TESTED                                                              |
| waiter           | Bills / refunds / shifts / reports / staff / settings / inventory       | Money & admin                              | No                            | mostly 403                                                      | Deny                                       | PARTIAL — authz-phase3 owner-only + manager routes; GUI MANUAL NOT TESTED      |
| waiter           | KDS                                                                     | Kitchen display                            | Public path exists            | API Ch/M/O                                                      | Deny API                                   | MANUAL NOT TESTED                                                              |
| waiter           | Server App                                                              | Handheld login                             | Server App                    | W/M/O                                                           | Allow                                      | MANUAL NOT TESTED                                                              |
| waiter           | Support                                                                 | Ticket                                     | Yes                           | all roles                                                       | Allow                                      | MANUAL NOT TESTED                                                              |
| chef             | Nav                                                                     | Support only                               | Sidebar                       | n/a                                                             | Minimal GUI                                | MANUAL NOT TESTED                                                              |
| chef             | Landing                                                                 | Post-login `/pos`                          | No POS nav                    | n/a                                                             | Awkward landing                            | MANUAL NOT TESTED (known gap)                                                  |
| chef             | KDS                                                                     | Login + tickets + status                   | `/kds` or standalone          | `/api/kds`, kitchen, `PATCH /api/order-items/:id/status` Ch/M/O | Allow (station/category scoped)            | PARTIAL — h3 status roles; GUI MANUAL NOT TESTED                               |
| chef             | Recipes / purchasing                                                    | Read                                       | No inventory nav              | GET +chef                                                       | API Allow if called                        | MANUAL NOT TESTED                                                              |
| chef             | Orders create / cancel                                                  | FoH                                        | —                             | create/cancel exclude chef                                      | Deny                                       | AUTOMATED — h3 cancel roles exclude chef                                       |
| chef             | Bills / refunds / shifts / reports / staff / settings                   | Admin                                      | No                            | 403                                                             | Deny                                       | AUTOMATED — authz-phase3 samples                                               |
| chef             | Customers                                                               | Detail                                     | Redirect away                 | customers roles exclude chef                                    | Deny                                       | MANUAL NOT TESTED                                                              |
| chef             | Categories / tax / DB / mobile                                          | Privileged                                 | —                             | O/M or owner                                                    | Deny                                       | AUTOMATED — authz-phase3                                                       |
| chef             | Server App                                                              | Login                                      | —                             | not in W/M/O                                                    | Deny                                       | MANUAL NOT TESTED                                                              |
| chef             | Support                                                                 | Ticket                                     | Yes                           | all roles                                                       | Allow                                      | MANUAL NOT TESTED                                                              |
| any active role  | Platform                                                                | Composition                                | App shell                     | all five roles                                                  | Allow                                      | MANUAL NOT TESTED                                                              |
| any              | Unauthenticated                                                         | Protected APIs                             | Login redirect                | no Bearer                                                       | 401                                        | AUTOMATED — authz-phase3                                                       |
| deactivated user | Any                                                                     | Reuse JWT                                  | Logout                        | `is_active=0`                                                   | 401                                        | AUTOMATED — authz-phase3                                                       |
| cross-order      | Orders                                                                  | Cancel item on wrong order                 | —                             | object check                                                    | 404                                        | AUTOMATED — authz-phase3                                                       |

### Role-set quick reference (API)

| Role set                 | Roles                                   | Typical modules                                                            |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| Owner only               | `owner`                                 | DB tools, mobile pairing, Master PIN gates, some tax/cloud                 |
| Owner + manager          | `owner`, `manager`                      | Staff, reports, audit, inventory write, settings write, discounts, restore |
| Shift / refund operators | `owner`, `manager`, `cashier`           | Shifts open/close, refunds, bills, print/kick                              |
| Floor                    | `owner`, `manager`, `cashier`, `waiter` | Orders create/list/cancel, tables seat, customers CRUD                     |
| Kitchen                  | `owner`, `manager`, `chef`              | KDS, kitchen, order-item status                                            |
| All five                 | all                                     | Support, some settings GET, payment-methods GET, platform composition      |
| Server App               | `waiter`, `manager`, `owner`            | `main/server-app.ts`                                                       |

---

## 5. Testing status summary

| Area                                                     | Status                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| API role boundaries (sample matrix)                      | **AUTOMATED** — passed this session                              |
| Staff create/edit/PIN/last-owner                         | **AUTOMATED** — passed                                           |
| Order cancel / void PIN / restore / H3 gates             | **AUTOMATED** — passed                                           |
| Unauth + deactivated + owner-only routes                 | **AUTOMATED** — passed                                           |
| Sidebar visibility per role                              | **MANUAL NOT TESTED**                                            |
| Deep-link to `/settings`, `/reports`, `/staff` as C/W/Ch | **MANUAL NOT TESTED** (settings redirect coded; not E2E’d)       |
| Waiter/chef post-login `/pos` UX                         | **MANUAL NOT TESTED**                                            |
| Server App role allow/deny                               | **MANUAL NOT TESTED**                                            |
| KDS standalone chef happy path (GUI)                     | **MANUAL NOT TESTED** (Playwright present; not run this session) |
| Full Playwright `test:e2e`                               | **NOT RUN** (see evidence SUMMARY)                               |

---

## 6. Evidence — suites PASSED this audit session

From [`docs/qa/evidence/SUMMARY.txt`](./evidence/SUMMARY.txt) (captured 2026-08-15T13:35:39, HEAD `b996b980`):

| Suite                           | npm script                  | Result         | Log                                                                |
| ------------------------------- | --------------------------- | -------------- | ------------------------------------------------------------------ |
| Staff authorization             | `npm run test:staff-authz`  | **PASS** 36/36 | [`docs/qa/evidence/staff-authz.log`](./evidence/staff-authz.log)   |
| Orders authorization            | `npm run test:orders-authz` | **PASS** 17/17 | [`docs/qa/evidence/orders-authz.log`](./evidence/orders-authz.log) |
| Phase 3 authz matrix            | `npm run test:authz-phase3` | **PASS** 67/67 | [`docs/qa/evidence/authz-phase3.log`](./evidence/authz-phase3.log) |
| H3 Permissions / RBAC hardening | `npm run test:h3`           | **PASS** 33/33 | [`docs/qa/evidence/h3.log`](./evidence/h3.log)                     |

Source files:

- `tests/staff-authz.test.ts`
- `tests/orders-authz.test.ts`
- `tests/authz-matrix-phase3.test.ts`
- `tests/h3-permissions-rbac-hardening.test.ts`

H3 covers (among others): item cancel roles O/M/C/W; restore O/M; order-items status chef/M/O; POS discount UI helpers; Settings deep-link gate; test `createApp` DB-role-over-JWT parity.

---

## 7. Known gaps and risks

1. **Chef nav is minimal** — only Support in `FLO_NAV_ITEMS`. Kitchen work depends on `/kds` / `/kds-standalone` (public AuthGuard paths), not role-filtered nav.
2. **Waiter nav is minimal** — Support only, yet many floor APIs allow waiter (orders, tables seat, customers). Product relies on Server App / deep links / undocumented entry points rather than desktop sidebar.
3. **Waiter Server App** — handheld allows `waiter|manager|owner` (`main/server-app.ts`); cashier and chef are denied. GUI for this path is **MANUAL NOT TESTED**.
4. **Post-login landing is always `/pos`** — waiters and chefs land on a screen their nav does not list; no role-based landing.
5. **AuthGuard is auth-only** — route-level GUI enforcement is nav filter + ad-hoc page checks (`canAccessSettings`, reports `canView`, etc.). Deep links may leak empty/error UX even when API returns 403.
6. **Legacy `admin` string** in settings — dead check; not a staff role.
7. **No fine-grained permissions** — cannot grant “reports without staff” without code change; role sets are coarse.
8. **Demo seed credentials are not usable** — `manager@flo.local` / `cashier@flo.local` / `chef@flo.local` are inactive with random passwords (`seedDemoRestaurant`). E2E uses `manager@flo.local` / `E2ePass123!` via `tests/e2e-server.cjs` only.
9. **PIN vs role** — cashier/waiter void of in-progress items requires a manager/owner PIN; automated on API, GUI for cashier void still called out as incomplete in H3 “Not in H3”.
10. **Object-level / ownership** — waiter void scoped to own orders in cancel path; broader IDOR matrix beyond authz-phase3 samples is not exhaustive in this doc.
11. **Module capabilities ≠ RBAC** — do not treat `CapabilityId` as user permissions when writing cases.
12. **Playwright / full E2E not run** this session — GUI columns remain **MANUAL NOT TESTED**.

---

## 8. How to create role users (for manual QA)

1. Sign in as **owner** (or manager for operational roles only).
2. Open **Team** (`/staff`) — owners/managers only in nav.
3. Create user: `name`, `password`, `role` ∈ {`owner`,`manager`,`cashier`,`waiter`,`chef`}.
4. Rules: manager cannot create owner/manager; only owner can change roles; PIN only for owner/manager; cannot demote/deactivate last active owner.

API: `POST /api/staff` with `requireRole('owner','manager')` — see `main/routes/staff.ts` and `tests/staff-authz.test.ts`.

---

## 9. Suggested next manual QA pass

Priority smoke (one account per role):

| #   | Role    | Checks                                                                                                         |
| --- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | owner   | Full nav; settings save; staff create each role; day close; DB export denied without Master PIN where required |
| 2   | manager | No home; cannot create owner; reports + staff ops OK; DB/mobile 403                                            |
| 3   | cashier | POS only primary; no discount control; shift open/close; settings deep-link redirects                          |
| 4   | waiter  | Support-only sidebar; Server App login works; desktop POS landing awkward; API seat/order via Server App       |
| 5   | chef    | KDS standalone ticket flow; desktop login → `/pos` then navigate to KDS; customers/settings denied             |

Re-run automated gate anytime:

```sh
npm run test:staff-authz
npm run test:orders-authz
npm run test:authz-phase3
npm run test:h3
```

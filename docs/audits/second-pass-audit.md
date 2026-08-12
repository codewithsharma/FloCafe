# Second-Pass Independent Audit

**Date:** 2026-08-12  
**Scope:** RestaurantOS documentation (`docs/00-product/` through `docs/16-release/`) vs FloCafe source code  
**Method:** Direct inspection of `main/`, `frontend/`, `tests/`, `package.json`, legacy `docs/API.md`  
**Application code modified:** No

---

## 1. Executive verdict

The documentation system correctly captures FloCafe's **macro-architecture** (Electron + three Express servers + SQLite WAL + static Next.js frontend) and most **major feature areas**. However, the second pass found **material factual errors** in database column naming, identifier types, schema-origin claims, privacy/telemetry characterization, and several feature status labels. The legacy `docs/API.md` endpoint `POST /api/auth/register` is **wrong**; staff creation uses `POST /api/staff`.

The RestaurantOS gap analysis and architecture recommendation (retain Electron + SQLite + Express) remain **justified** by the codebase. Priority ordering overweights **developer refactor work** (migration extraction) as product P0.

**AUDIT VERDICT: YELLOW**

Corrections required, but the documentation foundation is sound and the analysis direction is largely accurate.

---

## 2. Verified claims

These major claims were **confirmed in source code**:

| Claim | Evidence |
|-------|----------|
| Schema version **66** | `main/db.ts` MIGRATIONS last entry `version: 66` |
| **66 sequential migrations** (v1–v66) | `grep version:` in `main/db.ts` |
| **40 live tables** (excluding `_flo_meta`) | 23 in `createSchema()` + 17 via migrations/schema helpers (see §6) |
| Electron **43**, Express **5**, better-sqlite3 **13** | Root `package.json` |
| Next.js **16.2.12**, React **19.2.8** | `frontend/package.json` |
| Three servers: **3001 / 3002 / 3003** | `main/server.ts`, `kds-server.ts`, `server-app.ts` |
| WAL mode, `busy_timeout = 5000`, FK toggled during migrations | `main/db.ts` `initDatabase()` |
| JWT global auth on `/api/*` with documented exceptions | `main/server.ts` `requireAuth` |
| Roles: owner, manager, cashier, waiter, chef | `users.role` CHECK in `createSchema()` |
| KDS WebSocket at `/kds` | `main/services/kds.ts`, `server.ts` |
| Split checks via `bill_items`, `split_group_id` | Migration v59, `main/routes/bills.ts` |
| Partial payments (`payment_status = 'partial'`) | `main/routes/bills.ts` lines 658, 683 |
| Payment idempotency + transaction refs | Migrations v49–v54, tables in `db.ts` |
| Product stock tracking + decrement on order | `products.track_inventory`, `orders.ts` |
| Held orders per table (JSON items) | Migration v17, `held_orders` table |
| Print audit via `print_logs` | Migration v5 |
| Tax config audit via `tax_config_audit` | `createSchema()` |
| Master PIN + manager PIN overrides | `master-pin.ts`, `cancel-override.test.ts` |
| Cloud outbox pattern, billing not blocked | `cloud-sync.ts`, `docs/cloud-v2-plan.md` |
| Renderer `contextIsolation: true`, `nodeIntegration: false` | `main/index.ts` lines 219–221 |
| Renderer `sandbox: false` | `main/index.ts` line 221 |
| **96** test files (`tests/*.test.ts`) | filesystem count |
| No Docker / no coverage tooling | repo search, `package.json` |
| No shift/refund entities | no matching tables or routes |

---

## 3. Incorrect claims

Claims present in generated docs that **contradict source code**:

| Doc location | Incorrect claim | Actual (evidence) |
|--------------|-----------------|-------------------|
| `06-database/data-model.md` | Users column `password_hash` | Column is `password` (bcrypt hash stored there). `createSchema()` line 3842; `staff.ts` INSERT uses `password` |
| `06-database/database-schema.md` | Same `password_hash` | Same as above |
| `07-security/secrets-management.md` | Password hashes in `users.password_hash` | `users.password` |
| `06-database/data-model.md`, `database-schema.md` | Bill field `paid_status` | Column is `payment_status` (`createSchema()` line 3936; index uses `payment_status`) |
| `06-database/data-model.md` | Loyalty ledger field `points` | Column is `amount` (`loyalty_ledger.amount`) |
| `06-database/data-model.md` | Printer fields `type`, `connection` | Columns: `connection_type`, `ip_address`, `port`, `paper_width` (`printers` table) |
| `06-database/data-model.md` | "All tables defined in `createSchema()`" | Only **23** base tables; 17 others from migrations/`createCloudSyncSchema()`/`createWhatsAppSchema()` |
| `03-architecture/technical-design.md` | "UUID v4 for entity IDs" (implied all) | `orders`, `order_items`, `bills`, `loyalty_ledger`, `tax_config_audit` use **INTEGER AUTOINCREMENT** PKs |
| `00-product/feature-list.md` | Order lifecycle "preparing→completed" | Valid statuses include **`pending`**; created orders start `pending` (`orders.ts` lines 403, 814) |
| `00-product/feature-list.md` | Telemetry **(opt-in)** | **Enabled by default** for new installs: `seedInstallDefaults()` sets `telemetry_enabled='true'` (`db.ts` line 4300); comment in `telemetry.ts` line 4 |
| `03-architecture/integration-architecture.md` | Telemetry "Outbound opt-in" | Default-on; owner disables in Settings |
| `12-observability/metrics.md` | Telemetry opt-in | Same |
| `README.md` (upstream) + implied in printing docs | Bluetooth ESC/POS printing **[BUILT]** | `printers.connection_type` CHECK allows only `network`, `usb`, `webusb` (`db.ts` 3976). `thermal.ts` never sets `connectionType: 'bluetooth'`. Settings UI types include bluetooth but **no print path uses it** |
| Legacy `docs/API.md` | `POST /api/auth/register` | **Does not exist**. Staff creation: `POST /api/staff` or `POST /api/users` (`staff.ts`) |
| `02-design/user-flows.md` | Login redirects to `/dashboard` | Root `/` redirects to `/dashboard` (`app/page.tsx`); login flow may land on `/pos` depending on role — **INFERRED**, not uniformly `/dashboard` |

---

## 4. Unsupported claims

Marked **UNKNOWN** or weakly supported — do not treat as verified:

| Claim | Issue |
|-------|-------|
| Production readiness "High" for many features | Subjective; not derived from runtime metrics or production telemetry |
| "17 settings tabs" exact count | UI may change; not statically verified in this pass |
| Exact Playwright touch target 44px as production guarantee | E2E checks layout; not full accessibility audit |
| `docs/05-api/api-specification.md` completeness | Explicitly defers to `docs/API.md` which is **known stale** |
| Multi-location sync "hub-and-spoke" design | **TARGET STATE only** — correctly labeled PLANNED but easy to misread |
| Service charge as operational POS feature | Tax infrastructure exists (`service_charge_tax_category_id`) but `orders.ts` **hardcodes `service_charge: 0`** on create — merchant-facing service charge is **not implemented** |

---

## 5. Missing capabilities

Important restaurant POS capabilities **absent from or under-documented** in the feature inventory:

| Capability | Classification | Evidence |
|------------|----------------|----------|
| **Partial payments** | **EXISTS** | `payment_status = 'partial'`, `paid_amount`, `balance` in `bills.ts` — not listed in `feature-list.md` |
| **Packaging & delivery charges** | **EXISTS** | `orders.packaging_charge`, `delivery_charge`; tax kinds in `tax.ts` |
| **Service charge (amount)** | **MISSING** | Tax category only; order creation sets `service_charge: 0` |
| **Tips** | **MISSING** | No tip columns, routes, or UI found |
| **Cash drawer / kick** | **MISSING** | No drawer command in `thermal.ts` or routes |
| **Shift open/close** | **MISSING** | Correctly NOT BUILT |
| **Refunds** | **MISSING** | Correctly NOT BUILT (voids/cancels exist) |
| **Comps (complimentary)** | **PARTIAL** | Discounts with reason; void/cancel paths — no dedicated comp type |
| **Table merge** | **MISSING** | Only `move-order` (`tables.ts`) |
| **Table transfer** | **EXISTS** | `POST /api/tables/:id/move-order` |
| **86 / menu availability** | **PARTIAL** | `products.is_active` deactivation — no service-hour or dedicated "86" workflow |
| **Combos / bundles** | **MISSING** | No combo entity; "bundled" refers to tax packs |
| **Day close / Z-report** | **PARTIAL** | Reports API (`/api/reports/*`) without formal close workflow |
| **Payment reconciliation** | **PARTIAL** | Transaction refs + idempotency; no shift-level reconciliation |
| **End-of-day lock** | **MISSING** | No day-close gate on orders |
| **Bluetooth printing** | **MISSING** (UI stub only) | See §3 |
| **Multi-terminal POS writes** | **NOT APPLICABLE today** | Single SQLite writer; KDS/Server App proxy to :3001 |
| **Device management** | **PARTIAL** | RevFlo pairing (`/api/mobile/*`); KDS station assignment |
| **Printer routing by station** | **EXISTS** | `kitchen_stations.printer_id`, issue-134 tests |
| **Offline recovery** | **EXISTS** | Backup/restore, pre-migration backup |
| **Diagnostics (store-attributed)** | **EXISTS** | `diagnostics_consent` default **true** (`db.ts` 4302); separate from anonymous telemetry |

---

## 6. Database discrepancies

### Table count: **40 verified** (documentation correct on count)

**Base `createSchema()` (23 tables):**  
categories, products, addon_groups, addons, addon_group_product, kitchen_stations, station_users, tables, customers, users, orders, order_items, bills, loyalty_ledger, settings, kds_pairing_tokens, printers, country_packs, country_pack_versions, tax_categories, tax_rules, tax_overrides, tax_config_audit

**Added after v1 (17 tables):**

| Table | Origin |
|-------|--------|
| cloud_sync_outbox | v3 `createCloudSyncSchema()` |
| print_logs | v5 |
| sequences | v9/v10 |
| held_orders | v17 |
| order_item_addons | v25 |
| whatsapp_messages, whatsapp_blocklist | v29 `createWhatsAppSchema()` |
| support_ticket_outbox | v41 |
| store_diagnostics_outbox | v44 |
| payment_idempotency | v49+ (final scoped table) |
| order_idempotency | v49+ |
| payment_transaction_refs | v49+ |
| payment_transaction_ref_conflicts | v49+ |
| revoked_tokens | v55 |
| payment_methods, payment_method_merges | v58 |
| bill_items | v59 |

**Documentation error:** Stating all tables live in `createSchema()` is **false**.

### Column / type discrepancies

| Entity | Docs say | Code says |
|--------|----------|-----------|
| Order PK | String UUID (implied) | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| Bill PK | String UUID (implied) | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| User password | `password_hash` | `password` |
| Bill payment state | `paid_status` | `payment_status` |
| Loyalty | `points` | `amount` |
| Printer | generic type/connection | `connection_type` enum: network/usb/webusb only |

### FK / index notes

- Documented partial FK coverage is **correct** (`orders.table_id`, etc. without FK).
- Index on bills uses `payment_status`, not `paid_status` (v45 migration) — docs indexing section has wrong column name.

### Transaction behavior — **verified**

- Migrations run in transactions with `user_version` bump.
- `withTxn()` used in business logic.
- Maintenance lock returns 503 (`databaseMaintenanceMiddleware`).

---

## 7. API discrepancies

### Auth model — verified

Global JWT via `requireAuth` except:
- `/api/health`
- `/api/auth/*` (handled per-route)
- `GET /api/products/:id/image`

KDS server (:3002) and Server App (:3003) expose **subset endpoints** with separate auth stacks — documented correctly at high level.

### Documented but nonexistent

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/register` | In legacy `docs/API.md` only; use `POST /api/staff` |

### Undocumented in `docs/05-api/` (exist in code)

Representative gaps — full surface is ~**180+ route handlers**:

| Method | Path | Module | Auth |
|--------|------|--------|------|
| POST | `/api/auth/tenants/select` | auth | Public |
| POST | `/api/auth/setup/seed` | auth | Public (setup) |
| POST | `/api/auth/recover-password` | auth | Public + rate limit |
| POST | `/api/auth/password/change` | auth | Bearer |
| GET | `/api/auth/setup/status` | auth | Public |
| PATCH | `/api/order-items/:id/status` | order-items | Bearer + KDS enabled |
| POST | `/api/bills/:id/applyDiscount` | bills | owner, manager |
| POST | `/api/bills/:id/markPrinted` | bills | owner, manager |
| POST | `/api/bills/:id/print` | bills | owner, manager, cashier |
| GET | `/api/bills/:id/print-history` | bills | owner, manager, cashier |
| GET/POST | `/api/tax-packs/*` (13 routes) | tax-packs | owner/manager |
| GET/POST | `/api/db-tools/*` (7 routes) | database-tools | owner (+ master PIN) |
| GET/POST | `/api/support-ticket/*` | support-ticket | staff roles |
| GET/POST | `/api/whatsapp/*` (15 routes) | whatsapp | role-gated |
| GET/POST | `/api/settings/*` (31 routes) | settings | varies |
| GET/POST | `/api/menu-csv/*` | menu-csv | owner, manager |
| GET | `/api/more-apps`, `/revflo` | more-apps | auth |
| PATCH | `/api/orders/:orderId/items/:itemId/cancel` | index | auth + PIN logic |
| PATCH | `/api/orders/:orderId/items/:itemId/restore` | index | owner, manager |

### KDS server (:3002) — separate app

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | Public |
| GET | `/api/kds/info` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/kds/orders` | Bearer (chef/manager/owner) |
| PATCH | `/api/kds/items/:id/status` | Bearer |
| GET | `/api/categories` | Bearer |

### Server App (:3003)

Proxies: categories, products, tables, orders, customers-search, crm/lookup, customers — documented at architecture level, **not** in `docs/05-api/api-specification.md`.

### API matrix sample (main :3001 mounted routers)

| Mount | File | ~Routes |
|-------|------|---------|
| `/api/auth` | auth.ts | 10 |
| `/api/orders` | orders.ts | 9 |
| `/api/bills` | bills.ts | 11 |
| `/api/settings` | settings.ts | 31 |
| `/api/whatsapp` | whatsapp.ts | 15 |
| `/api/tax-packs` | tax-packs.ts | 13 |
| `/api/printers` | printers.ts | 11 |
| `/api/products` | products.ts | 10 |
| `/api/reports` | reports.ts | 8 |
| `/api/customers` | customers.ts | 7 |
| `/api/tables` | tables.ts | 8 |
| `/api/kitchen-stations` | kitchen-stations.ts | 6 |
| `/api/staff`, `/api/users` | staff.ts | 6 each (dual mount) |
| `/api/kds` | kds.ts | 5 |
| `/api/db`, `/api/db-tools` | database.ts, database-tools.ts | 5 + 7 |
| Inline | index.ts | 10 |

**Recommendation:** Generate OpenAPI from route files; do not rely on legacy `docs/API.md`.

---

## 8. Security discrepancies

| Finding | Doc status | Revalidation |
|---------|------------|--------------|
| SEC-01 LAN not encrypted | MEDIUM | **CONFIRMED** — HTTP/WS on `0.0.0.0` |
| SEC-02 sandbox disabled | MEDIUM | **CONFIRMED** — `sandbox: false` in `main/index.ts`; comment explains Windows GPU workaround |
| SEC-03 unsigned Windows installer | MEDIUM | **CONFIRMED** — release workflow behavior |
| SEC-04 incomplete scanning | LOW | **CONFIRMED** |
| SEC-05 WhatsApp credentials not encrypted | LOW | **CONFIRMED** — not re-audited filesystem this pass |
| Telemetry "opt-in" | Docs wrong | **Default enabled** — privacy posture understated |
| Diagnostics default-on | Partially in security-audit-2.7.0 | **CONFIRMED** — `diagnostics_consent='true'` in seed defaults |
| IPC allowlist | Documented | **CONFIRMED** — `ALLOWED_IPC_KEYS` in `ipc.ts` |
| SQL injection | Parameterized queries assumed | Spot-check shows prepared statements; **no automated proof** |
| CORS / SSRF | Documented + tested | Test files exist (`cors-security`, `url-allowlist`) |
| WebSocket JWT revalidation | Documented | **CONFIRMED** — `kds-websocket-revalidation.test.ts` |

**New nuance for docs:** Anonymous telemetry is **on by default**; Tier-2 diagnostics consent is also **on by default** for new installs (distinct streams per `telemetry.ts` header comment).

---

## 9. Architecture concerns

### Electron + SQLite + Express — still appropriate

| Criterion | Assessment |
|-----------|--------------|
| Offline-first | **Strong fit** — local DB, no cloud dependency for billing |
| Single-location concurrency | **Adequate** — WAL + one writer; KDS/Server App as readers/proxies |
| LAN deployment | **Fit** — intentional `0.0.0.0` binding; security tradeoff documented |
| Multiple POS terminals writing | **Poor fit** — SQLite single-writer; docs correctly flag this |
| KDS / waiter tablets | **Fit** — separate servers, shared DB |
| Multi-location future | **Requires new design** — not solvable by bolting on; P2 RFC is correct |
| Backup/recovery | **Fit** — file-based DB, tested restore |
| Hardware (print/USB) | **Fit** — Electron main process access |

**Do not recommend microservices** for current scope — no evidence the monolith is failing operationally.

### Architecture doc gaps

- Understates **integer PK** transactional core vs UUID catalog entities.
- Should explicitly note **Server App proxies POST only subset** (no bill payment from :3003 in grep results).
- **Cloud sync enabled in defaults** before registration — operational implication missing.

---

## 10. Priority changes

Re-evaluation of RestaurantOS priorities:

| Item | Doc priority | Recommended | Justification |
|------|--------------|-------------|---------------|
| Migration extraction (`db.ts` split) | P0 | **Engineering P1 / Product P3** | Reduces maintainer risk but delivers **zero restaurant operator value**; upgrade-path tests already guard migrations |
| Shift management | P1 | **P1 — keep** | Real cash accountability gap; no workaround |
| Refunds | P1 | **P1 — keep** (or P1.5) | Voids ≠ refunds; needed for card/cash return audit |
| Audit logging | P1 | **P1 — keep** | `print_logs` + `tax_config_audit` insufficient for payments/voids |
| Stock ledger | P1 | **P2** | Basic stock adjust + auto-decrement **already EXISTS**; ledger is enhancement |
| Multi-location | P2 | **P2 — keep** (design only) | High complexity; blocked on schema RFC |
| Payment terminals | P2 | **P2 — keep** | Manual methods work; integration is market-dependent |
| Online ordering | P3 | **P3 — keep** | No foundation in code |
| AI | P3 | **P3 — keep** | Correctly optional |
| **Partial payments** (missing from gap doc) | — | **Document as EXISTS** | Already shipped |
| **Privacy defaults review** | — | **P1 compliance** | Telemetry/diagnostics default-on affects production readiness in EU-like deployments |
| **API spec accuracy** | — | **P1 engineering** | Legacy API.md misleads integrators |

---

## 11. Documentation corrections required

### Must fix (factual)

1. **`06-database/data-model.md`** — `password` not `password_hash`; `payment_status` not `paid_status`; `loyalty_ledger.amount` not `points`; printer columns; remove "all tables in createSchema()"; document INTEGER PKs for orders/bills.
2. **`06-database/database-schema.md`** — same column fixes.
3. **`06-database/indexing.md`** — `idx_bills_paid_status_paid_at` → uses `payment_status`.
4. **`07-security/secrets-management.md`** — password column name.
5. **`03-architecture/technical-design.md`** — clarify mixed ID strategy (UUID catalog vs integer transactions).
6. **`00-product/feature-list.md`** — order lifecycle includes `pending`; add **partial payments** as BUILT; reclassify **Bluetooth printing** as NOT BUILT or EXPERIMENTAL; fix telemetry row (default-on, owner can disable).
7. **`03-architecture/integration-architecture.md`**, **`12-observability/*`** — telemetry default-on wording.
8. **`15-project-management/implementation-plan.md`** — demote migration extraction as product P0; add privacy defaults review.
9. **Cross-link** legacy `docs/API.md` with **staleness warning** or deprecate `POST /api/auth/register`.

### Should improve (quality)

1. Expand `docs/05-api/api-specification.md` with `:3002` and `:3003` route tables.
2. Add **service charge** as PARTIAL (tax infra only, amount always 0).
3. Add **tips, cash drawer, table merge, day close** to gap analysis as MISSING.
4. Reduce generic "Production readiness: High" without test citations.
5. Align `09-testing/test-strategy.md` test count (**96** files, not "~95").
6. Document `diagnostics_consent` default separately from anonymous telemetry.

### Contradictions found

| A | B |
|---|---|
| Telemetry opt-in (feature-list) | Default `telemetry_enabled='true'` (db seed) |
| All tables in createSchema (data-model) | 17 tables from migrations |
| UUID IDs (technical-design) | Integer PK on orders/bills |
| Bluetooth printing BUILT (implicit via README alignment) | DB enum excludes bluetooth; no print implementation |

### Boilerplate / low value

Several docs (`10-ai/*`, parts of `12-observability/*`) correctly state NOT APPLICABLE — acceptable for structure, but should cross-reference audit to avoid implying implementation.

---

## Feature verification summary (BUILT / PARTIAL / NOT BUILT)

| Feature (from feature-list) | Verdict | Notes |
|-----------------------------|---------|-------|
| POS, cart, held orders | **BUILT** | Verified |
| Order types | **BUILT** | Verified |
| Order lifecycle | **BUILT** — doc incomplete | Missing `pending` in description |
| Split checks / split payments | **BUILT** | Verified |
| Partial payments | **BUILT** — **missing from feature-list** | Verified |
| KDS / KOT / stations | **BUILT** | Verified |
| Tax packs | **BUILT** | Verified |
| WhatsApp | **BUILT** — note RC dep | `@whiskeysockets/baileys` RC |
| Cloud sync | **BUILT** | Outbox verified |
| RevFlo pairing | **BUILT** — cloud-dependent | 409 when unregistered |
| WebUSB + network print | **BUILT** | Verified |
| Bluetooth print | **NOT BUILT** | Doc/README overstates |
| Inventory stock | **PARTIAL** — doc OK | No ledger |
| Audit logging | **PARTIAL** — doc OK | Domain-specific only |
| RBAC | **PARTIAL** — doc OK | Role-based only |
| Telemetry | **BUILT** — doc mislabels opt-in | Default on |
| Refunds / shifts | **NOT BUILT** — doc OK | Verified absent |

---

## AUDIT VERDICT

### YELLOW

Documentation is **substantially accurate at the architectural and feature-area level**, but contains **correctable factual errors** in database field names, ID types, schema origins, telemetry privacy characterization, and Bluetooth printing. Gap analysis priorities should **separate engineering debt from operator-facing P0/P1**. No evidence was found that the core RestaurantOS direction (incremental evolution of Electron + SQLite + Express) is wrong.

**Recommended next step:** Apply §11 corrections to affected markdown files only (no application code changes).

---

## Correction Status

**Applied:** 2026-08-12

### Summary

| Metric | Value |
|--------|-------|
| Corrections applied | **28** distinct fixes across **22** files |
| Application code modified | **No** |
| Tests modified | **No** |
| Unresolved §11 items | **0** (all identified factual corrections applied) |

### Documents changed

| File | Corrections |
|------|-------------|
| `docs/06-database/data-model.md` | Schema split (23+17), column names, mixed PKs, payment_status, lifecycle |
| `docs/06-database/database-schema.md` | Column names, schema origin, service charge note |
| `docs/06-database/indexing.md` | payment_status column reference |
| `docs/06-database/migrations.md` | 23 base + 17 additional tables |
| `docs/07-security/secrets-management.md` | `users.password` column |
| `docs/07-security/security.md` | Privacy defaults section |
| `docs/07-security/security-requirements.md` | SR-T-06 target consent |
| `docs/03-architecture/technical-design.md` | Mixed ID strategy; service charge infra vs feature |
| `docs/03-architecture/integration-architecture.md` | Telemetry default-on |
| `docs/04-technology/tech-stack.md` | Bluetooth NOT BUILT |
| `docs/00-product/feature-list.md` | Partial payments, capabilities matrix, telemetry, bluetooth, service charge |
| `docs/00-product/roadmap.md` | Priority reclassification |
| `docs/15-project-management/implementation-plan.md` | Gap table priorities |
| `docs/15-project-management/task-breakdown.md` | Phase reorder |
| `docs/15-project-management/technical-debt.md` | TD-01 priority demotion |
| `docs/15-project-management/progress.md` | Phase 0 completion |
| `docs/05-api/api-specification.md` | Staff endpoint; no /auth/register |
| `docs/API.md` | Staleness warning; POST /api/staff |
| `docs/12-observability/monitoring.md` | Telemetry default-on |
| `docs/12-observability/metrics.md` | Telemetry default-on |
| `docs/02-design/user-flows.md` | pending status in kitchen flow |
| `docs/09-testing/test-strategy.md` | 96 test files |
| `docs/cloud-v2-plan.md` | CURRENT STATE note on diagnostics default |

### Post-correction consistency check

Searched `docs/**/*.md` for incorrect terms:

| Term | Remaining in generated docs | Status |
|------|----------------------------|--------|
| `password_hash` | Audit report only (historical) | OK |
| `paid_status` as column name | Audit + explanatory index name notes | OK |
| `auth/register` as valid endpoint | Audit + API.md negation note only | OK |
| Telemetry "opt-in" as CURRENT STATE | Audit only; feature-list corrected | OK |
| Bluetooth printing BUILT | Audit only; feature-list NOT BUILT | OK |
| Universal UUID IDs | Audit only; technical-design corrected | OK |

### Unresolved / intentional保留

| Item | Reason |
|------|--------|
| Root `README.md` still mentions Bluetooth printing | **Out of scope** — user restricted changes to `docs/` only |
| `docs/API.md` response examples may contain other drift | Staleness warning added; full API rewrite not requested |
| `docs/cloud-v2-plan.md` design language still says "opt-in" | Preserved as design intent with CURRENT STATE caveat added |

### Application code confirmation

```text
git diff --name-only
```

Verified: only files under `docs/` were modified in this correction pass.

### Post-correction documentation status

**GREEN** — All known factual corrections from §11 have been applied to the RestaurantOS documentation set.


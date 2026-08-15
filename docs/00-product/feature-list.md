<!-- Last verified against codebase: 2026-08-15, schema v83 -->

# Feature Inventory

This file is **code evidence** (what exists in the tree). The canonical **product plan** (Existing / Hardening / Planned / Later / Frozen) is [`capability-matrix.md`](capability-matrix.md).

Status legend: **[BUILT]** usable · **[PARTIAL]** incomplete · **[STUB]** surface only · **[EXPERIMENTAL]** unstable · **[NOT BUILT]** absent · **[FROZEN]** deferred per `STRATEGY.md`

Evidence paths reference the Operavia codebase (repo: FloCafe) as of schema **v83**. Default vertical: **restaurant**.

## POS & Orders

| Feature                                   | Status  | Evidence                                                                                          | Production readiness               |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| POS product grid & cart                   | [BUILT] | `frontend/src/app/(dashboard)/pos/page.tsx`, `frontend/src/store/cart.ts`                         | High — E2E layout tests            |
| Order types (dine-in, takeaway, delivery) | [BUILT] | `frontend/src/lib/order-types.ts`, `orders.type` column; Retail POS takeaway-only (Phase 4.12)    | High                               |
| Order lifecycle                           | [BUILT] | `main/routes/orders.ts`                                                                           | High — integration tests           |
| Held orders (table carts)                 | [BUILT] | `main/routes/held-orders.ts`, `held_orders` table                                                 | High — `tests/held-orders.test.ts` |
| Order notes validation                    | [BUILT] | `tests/order-notes-validation.test.ts`                                                            | High                               |
| Barcode product lookup                    | [BUILT] | Wedge + POS name/SKU/barcode search (Phase 4.1); `?barcode=` exact; `?search=` name\|sku\|barcode | High                               |
| Retail floor usability (chrome + search)  | [BUILT] | Phase 4.1: tables settings gated; `/tables` fail-closed; POS SKU/barcode search + scan toasts     | High                               |
| Cancel order (manager PIN)                | [BUILT] | `tests/cancel-override.test.ts`; H1 audit `order.cancelled` on status cancel                      | High                               |
| Void/cancel line items                    | [BUILT] | Item cancel/restore; H1 blocks after successful tender (`ORDER_HAS_SUCCESSFUL_TENDER`)            | High                               |
| Split checks                              | [BUILT] | `main/routes/bills.ts`, `bill_items`, v59 migration                                               | High — payment tests               |
| Prepaid checkout                          | [BUILT] | `frontend/src/components/pos/PrepaidCheckoutModal.tsx`, E2E spec                                  | High                               |

Order lifecycle statuses (VERIFIED): `pending` → `preparing` → `ready` → `served` → `completed` | `cancelled`. New orders start as **`pending`**.

## Tables

Restaurant vertical only (`ACTIVE_VERTICAL_ID=restaurant` or unset). Not mounted on Retail.

| Feature                                | Status      | Evidence                                | Production readiness |
| -------------------------------------- | ----------- | --------------------------------------- | -------------------- |
| Table CRUD                             | [BUILT]     | `main/routes/tables.ts`, `tables` table | High                 |
| Table status (available/occupied/etc.) | [BUILT]     | `tables.status`                         | High                 |
| Move order between tables (transfer)   | [BUILT]     | `POST /api/tables/:id/move-order`       | Medium               |
| Table merge                            | [NOT BUILT] | No merge endpoint or workflow           | —                    |
| Floor/section grouping                 | [BUILT]     | `tables.floor`, `tables.section`        | Medium               |

## Menu & Products

| Feature                          | Status      | Evidence                                                                                      | Production readiness            |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| Categories (hierarchical)        | [BUILT]     | `main/routes/categories.ts`                                                                   | High                            |
| Products CRUD                    | [BUILT]     | `main/routes/products.ts`                                                                     | High                            |
| Addon groups & modifiers         | [BUILT]     | `main/routes/addon-groups.ts`, `addon_groups`, `addons`                                       | High                            |
| Product images                   | [BUILT]     | `main/routes/products.ts`, `tests/product-images.test.ts`                                     | High                            |
| CSV menu import/export           | [BUILT]     | `main/routes/menu-csv.ts`                                                                     | Medium                          |
| Dietary tags                     | [BUILT]     | `products.tags`, `DietaryBadge.tsx`                                                           | Medium                          |
| Menu availability / deactivation | [BUILT]     | `products.is_active`; Restaurant POS 86 via `POST /api/products/:id/availability` (Phase 4.7) | High — `npm run test:phase-4.7` |
| Product-level stock tracking     | [PARTIAL]   | `track_inventory`, `stock_quantity` — no recipes/BOM                                          | Medium                          |
| Combos / bundles                 | [NOT BUILT] | No combo entity                                                                               | —                               |

## Customers & CRM

| Feature              | Status  | Evidence                                                                                 | Production readiness |
| -------------------- | ------- | ---------------------------------------------------------------------------------------- | -------------------- |
| Customer CRUD        | [BUILT] | `main/routes/customers.ts`; `POST /:id/deactivate` (4.9) + `POST /:id/reactivate` (3.6E) | High                 |
| Phone search (E.164) | [BUILT] | `main/lib/phone.ts`, phone tests                                                         | High                 |
| CRM lookup by phone  | [BUILT] | `GET /api/crm/lookup`                                                                    | High                 |
| Customer wallet view | [BUILT] | `GET /api/customers/:id/wallet`                                                          | Medium               |
| Loyalty points       | [BUILT] | `loyalty_ledger.amount`, integration tests                                               | High                 |
| Loyalty redemption   | [BUILT] | `tests/integration-loyalty-redemption.test.ts`                                           | High                 |

## Staff & Access Control

| Feature                                   | Status    | Evidence                               | Production readiness   |
| ----------------------------------------- | --------- | -------------------------------------- | ---------------------- |
| Roles (owner/manager/cashier/waiter/chef) | [BUILT]   | `users.role`, `main/routes/staff.ts`   | High                   |
| Staff creation                            | [BUILT]   | `POST /api/staff` or `POST /api/users` | High                   |
| JWT authentication                        | [BUILT]   | `main/routes/auth.ts`, `jsonwebtoken`  | High                   |
| Manager PIN overrides                     | [BUILT]   | `manager-pin-verification.test.ts`     | High                   |
| Master PIN (destructive ops)              | [BUILT]   | `main/services/master-pin.ts`          | High                   |
| Kitchen station user scoping              | [BUILT]   | `station_users`, KDS tests             | High                   |
| Permission matrix                         | [PARTIAL] | Role checks per-route; no RBAC table   | High for current model |

## Kitchen (KOT/KDS)

Restaurant vertical only (`ACTIVE_VERTICAL_ID=restaurant` or unset). Not mounted on Retail.

| Feature                       | Status  | Evidence                                     | Production readiness     |
| ----------------------------- | ------- | -------------------------------------------- | ------------------------ |
| Embedded KDS                  | [BUILT] | `frontend/src/app/(dashboard)/kds/page.tsx`  | High                     |
| Standalone KDS server (:3002) | [BUILT] | `main/kds-server.ts`                         | High — integration tests |
| WebSocket realtime            | [BUILT] | `main/services/kds.ts`, `/kds` WS            | High                     |
| Kitchen stations & routing    | [BUILT] | `kitchen_stations`, issue-134 tests          | High                     |
| KOT printing                  | [BUILT] | `main/printers/thermal.ts`, KOT toggles test | High                     |
| KDS pairing tokens            | [BUILT] | `kds_pairing_tokens` table                   | Medium                   |
| Printer routing by station    | [BUILT] | `kitchen_stations.printer_id`                | High                     |

## Payments & Billing

| Feature                               | Status      | Evidence                                                                                                                                | Production readiness |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Bill generation                       | [BUILT]     | `main/routes/bills.ts`                                                                                                                  | High                 |
| Split payments                        | [BUILT]     | `POST /api/bills/:id/payments`                                                                                                          | High                 |
| Partial payments                      | [BUILT]     | `payment_status = 'partial'`, `paid_amount`, `balance` in `bills.ts`; Orders/Pay remaining due uses FIN-01 collectible (Phase 4.10)     | High                 |
| Payment methods catalog               | [BUILT]     | `payment_methods`, merge support                                                                                                        | High                 |
| Payment idempotency                   | [BUILT]     | `payment_idempotency`, v49+ migrations                                                                                                  | High                 |
| Transaction reference tracking        | [BUILT]     | `payment_transaction_refs`                                                                                                              | High                 |
| Payment reconciliation (shift-level)  | [BUILT]     | `main/services/shift.ts` close/recon + day-close cash − cash refunds                                                                    | High                 |
| Discounts (order & item level)        | [BUILT]     | discount integration tests; H1 `order.discount_applied` audit + post-tender 409                                                         | High                 |
| Comps (complimentary)                 | [PARTIAL]   | Discounts with reason; void/cancel paths — no dedicated comp type                                                                       | Medium               |
| Taxes (pack-based engine)             | [BUILT]     | `main/services/tax-engine.ts`                                                                                                           | High                 |
| Packaging & delivery charges          | [BUILT]     | `orders.packaging_charge`, `delivery_charge`                                                                                            | High                 |
| Service charge (configurable amount)  | [NOT BUILT] | Tax infra exists; order create hardcodes `service_charge: 0`; [ADR-014](../14-decisions/ADR-014-service-charge.md) Proposed — no wiring | —                    |
| Tips                                  | [NOT BUILT] | No tip columns or workflow found                                                                                                        | —                    |
| Refunds (money)                       | [BUILT]     | `main/routes/refunds.ts`, `main/services/refund.ts`, M6 + FIN-01; receipt print 3.6A + WebUSB parity 3.6G (`/printers/print-refund`)    | High                 |
| Returns / merchandise restock         | [BUILT]     | Phase 4.2 / ADR-011: optional `POST /api/refunds/:id/restock` (explicit item+qty); Retail UI; Restaurant money-only                     | Medium               |
| Retail exchange                       | [BUILT]     | Phase 4.5 / ADR-012: Retail Orders UI + coordinator (refund → sale → restock); no exchange API/table                                    | Medium               |
| Payment terminal / Stripe integration | [FROZEN]    | Manual cash/card/wallet tenders only (`payment-tender.ts`); STRATEGY freeze                                                             | —                    |
| SaaS subscription / seat billing      | [STUB]      | Settings shows tenant `plan`/`status` façade; no Stripe/billing engine                                                                  | —                    |

## Printing

| Feature                    | Status      | Evidence                                                                   | Production readiness |
| -------------------------- | ----------- | -------------------------------------------------------------------------- | -------------------- |
| ESC/POS thermal — network  | [BUILT]     | `main/printers/thermal.ts` TCP 9100                                        | High                 |
| ESC/POS thermal — USB      | [BUILT]     | `main/printers/thermal.ts`                                                 | High                 |
| WebUSB printing (renderer) | [BUILT]     | `PrinterService.ts`; bills + refund parity (Phase 3.6G)                    | Medium               |
| Browser print fallback     | [BUILT]     | `frontend/src/lib/printer/web-print.ts`                                    | Medium               |
| Bluetooth printing         | [NOT BUILT] | UI type stub only; DB CHECK excludes bluetooth; no print path              | —                    |
| Printer profiles (58/80mm) | [BUILT]     | `main/printers/profiles.ts`                                                | High                 |
| Print audit log            | [BUILT]     | `print_logs` table; H1: successful `/printers/print-bill` logs server-side | High                 |
| Cash drawer kick           | [BUILT]     | `POST /api/printers/kick-drawer` + POS PrinterStatus (Phase 3.6F)          | High                 |

Supported `printers.connection_type` values (VERIFIED): `network`, `usb`, `webusb`.

## Reports & Analytics

| Feature                       | Status      | Evidence                                                                                                                                    | Production readiness |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Daily stats & sales summary   | [BUILT]     | `main/routes/reports.ts`; Home/Reports UI Gross/Refunds/Net (Phase 3.6B)                                                                    | High                 |
| Tax component reports         | [BUILT]     | `GET /api/reports/tax-components`                                                                                                           | Medium               |
| Top products & table stats    | [BUILT]     | reports routes                                                                                                                              | Medium               |
| Insights dashboard            | [BUILT]     | `tests/reports-insights.test.ts`                                                                                                            | Medium               |
| Day close / Z-report workflow | [BUILT]     | `main/services/day-close.ts`, Operations UI; cash Z print/download Phase 3.6D                                                               | High                 |
| Expenses (R9 Slice 1)         | [BUILT]     | Schema v83 `expenses`; `main/services/expenses.ts`; `/api/expenses`; UI `/expenses`; Owner/Manager; cents-only; `tests/r9-expenses.test.ts` | High                 |
| Advanced analytics / BI       | [NOT BUILT] | —                                                                                                                                           | —                    |
| Accounting export             | [BUILT]     | `GET /api/reports/export/bills.csv`; Reports start/end dates (Phase 4.8)                                                                    | High                 |

## Inventory & Supply Chain

| Feature                          | Status      | Evidence                                                                                                                           | Production readiness |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Product stock decrement on order | [BUILT]     | `main/services/inventory.ts` via order path                                                                                        | Medium               |
| Manual stock adjustment          | [BUILT]     | `POST /api/products/:id/stock` → Inventory service; Products UI (Phase 3.6C)                                                       | High                 |
| Low stock filter                 | [BUILT]     | `?low_stock=true` on products                                                                                                      | Medium               |
| Low-stock attention hub          | [BUILT]     | Phase 4.3: `/products/low-stock`, dashboard AttentionStrip, reuses existing filter; read-only + optional adjust                    | Medium               |
| Inventory on-hand valuation      | [BUILT]     | Phase 4.11: `GET /api/reports/inventory-valuation` + `/products/valuation`; catalog cost × qty (not WAC/FIFO)                      | Medium               |
| Inventory adjustment API         | [BUILT]     | `POST /api/products/:id/stock`                                                                                                     | Medium               |
| Stock movement ledger            | [BUILT]     | Schema v75 `inventory_movements` + `GET /api/inventory/movements` + owner/manager UI at `/products/movements`; no pre-v75 backfill | Medium               |
| Recipes / BOM                    | [BUILT]     | R5 `recipes` / `recipe-cost.ts`; UI `/products/recipes`                                                                            | High                 |
| Suppliers / purchasing           | [BUILT]     | R6 `purchasing.ts`; UI `/products/purchasing`                                                                                      | High                 |
| Stock transfers                  | [NOT BUILT] | —                                                                                                                                  | —                    |
| Wastage tracking                 | [BUILT]     | Phase 4.15: `POST /api/products/:id/stock` `action=wastage`; ledger `reason=wastage`, `movement_type=adjustment`                   | Medium               |

## Operations & Data

| Feature                    | Status  | Evidence                                                                       | Production readiness |
| -------------------------- | ------- | ------------------------------------------------------------------------------ | -------------------- |
| Backup / restore           | [BUILT] | `main/routes/database.ts`, `database-tools.ts`                                 | High                 |
| Offline recovery           | [BUILT] | Backup/restore + pre-migration auto-backup + `/recovery` UI                    | High                 |
| Schema health check        | [BUILT] | `main/services/schema-health.ts`                                               | High                 |
| Google Drive backup        | [BUILT] | `main/services/google-drive.ts`                                                | Medium               |
| Database initialize (wipe) | [BUILT] | master PIN gated                                                               | High                 |
| Shift management           | [BUILT] | `main/routes/shifts.ts`, `main/services/shift.ts`, Settings `shifts_enabled`   | High                 |
| Shift reconciliation       | [BUILT] | Close/force-close + expected cash (incl. cash refunds)                         | High                 |
| Cash drawer kick (ESC/POS) | [BUILT] | Phase 3.6F — `buildDrawerKick` / `kickCashDrawer` via default printer          | High                 |
| Audit logging (general)    | [BUILT] | `audit_logs` (v68+), `main/services/audit-log.ts`, `main/routes/audit-logs.ts` | High                 |

## Integrations & Cloud

| Feature                        | Status      | Evidence                                                                                                                                                                                     | Production readiness |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| FloAdmin cloud sync            | [BUILT]     | `main/services/cloud-sync.ts`                                                                                                                                                                | Medium               |
| WhatsApp bill delivery         | [BUILT]     | `main/services/whatsapp.ts`                                                                                                                                                                  | Medium — Baileys RC  |
| RevFlo mobile pairing          | [BUILT]     | `POST /api/mobile/pairing-code`                                                                                                                                                              | Medium               |
| Server App (waiter :3003)      | [BUILT]     | `main/server-app.ts`                                                                                                                                                                         | Medium               |
| Device management (mobile/KDS) | [PARTIAL]   | RevFlo pairing, KDS station assignment                                                                                                                                                       | Medium               |
| Online ordering                | [NOT BUILT] | —                                                                                                                                                                                            | —                    |
| Delivery aggregator APIs       | [FROZEN]    | Swiggy/Zomato/ONDC — STRATEGY freeze                                                                                                                                                         | —                    |
| Accounting integrations        | [NOT BUILT] | —                                                                                                                                                                                            | —                    |
| Retail vertical (composition)  | [PARTIAL]   | Composition selectable; Phase 4.1–4.5 (floor, restock, low-stock, accounting CSV, **exchange**). Variants: **ADR-013 Proposed** (identity = product row; matrix not built). PO still missing | Medium               |
| Modular platform registry      | [BUILT]     | `main/modules/` Phase 2 CLOSED; Phase 3.1–3.4 composition/remount                                                                                                                            | High                 |

## Multi-location & Sync

| Feature             | Status      | Evidence                                                 | Production readiness |
| ------------------- | ----------- | -------------------------------------------------------- | -------------------- |
| Multi-location      | [FROZEN]    | Single SQLite per install; ADR-006 before implementation | —                    |
| Cross-terminal sync | [NOT BUILT] | LAN companion apps hit host API only                     | —                    |
| Offline mode        | [BUILT]     | Local-first SQLite SoR; cloud outbound non-blocking      | High                 |

## Settings, Privacy & Localization

| Feature                        | Status    | Evidence                                                                        | Production readiness |
| ------------------------------ | --------- | ------------------------------------------------------------------------------- | -------------------- |
| Business settings              | [BUILT]   | `main/routes/settings.ts`                                                       | High                 |
| i18n (en/es/pt)                | [PARTIAL] | Legacy `frontend/src/lib/i18n/` + incremental i18next namespaces — dual catalog | Medium               |
| Auto-update (electron-updater) | [BUILT]   | `main/index.ts`                                                                 | High                 |
| Anonymous telemetry            | [BUILT]   | `main/services/telemetry.ts`                                                    | Medium               |
| Store diagnostics              | [BUILT]   | `store_diagnostics_outbox`, `diagnostics_consent` setting                       | Medium               |

### Privacy note (CURRENT STATE — post-M2)

**VERIFIED:** New installs do **not** transmit telemetry or diagnostics until the owner explicitly opts in during setup or Settings → Privacy. Setting values `'pending'`, missing, or legacy `'false'` (migration v28) all fail closed. Explicit `'true'` required to send.

**Operational upgrades:** Installs with completed onboarding keep stored preferences (grandfathering); explicit opt-outs (`'false'`) are preserved through migration v67.

**TARGET (future):** Jurisdiction-specific re-consent if required by legal review. See [`07-security/privacy-and-consent.md`](../07-security/privacy-and-consent.md).

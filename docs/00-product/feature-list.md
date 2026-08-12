# Feature Inventory

Status legend: **[BUILT]** usable · **[PARTIAL]** incomplete · **[EXPERIMENTAL]** unstable · **[NOT BUILT]** absent

Evidence paths reference the FloCafe codebase as of schema v66.

## POS & Orders

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| POS product grid & cart | [BUILT] | `frontend/src/app/(dashboard)/pos/page.tsx`, `frontend/src/store/cart.ts` | High — E2E layout tests |
| Order types (dine-in, takeaway, delivery) | [BUILT] | `frontend/src/lib/order-types.ts`, `orders.type` column | High |
| Order lifecycle | [BUILT] | `main/routes/orders.ts` | High — integration tests |
| Held orders (table carts) | [BUILT] | `main/routes/held-orders.ts`, `held_orders` table | High — `tests/held-orders.test.ts` |
| Order notes validation | [BUILT] | `tests/order-notes-validation.test.ts` | High |
| Barcode product lookup | [BUILT] | `frontend/src/hooks/useBarcodeScanner.ts`, `tests/issue-137-barcode.test.ts` | Medium |
| Cancel order (manager PIN) | [BUILT] | `tests/cancel-override.test.ts` | High |
| Void/cancel line items | [BUILT] | `main/routes/index.ts` PATCH cancel/restore | High |
| Split checks | [BUILT] | `main/routes/bills.ts`, `bill_items`, v59 migration | High — payment tests |
| Prepaid checkout | [BUILT] | `frontend/src/components/pos/PrepaidCheckoutModal.tsx`, E2E spec | High |

Order lifecycle statuses (VERIFIED): `pending` → `preparing` → `ready` → `served` → `completed` | `cancelled`. New orders start as **`pending`**.

## Tables

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Table CRUD | [BUILT] | `main/routes/tables.ts`, `tables` table | High |
| Table status (available/occupied/etc.) | [BUILT] | `tables.status` | High |
| Move order between tables (transfer) | [BUILT] | `POST /api/tables/:id/move-order` | Medium |
| Table merge | [NOT BUILT] | No merge endpoint or workflow | — |
| Floor/section grouping | [BUILT] | `tables.floor`, `tables.section` | Medium |

## Menu & Products

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Categories (hierarchical) | [BUILT] | `main/routes/categories.ts` | High |
| Products CRUD | [BUILT] | `main/routes/products.ts` | High |
| Addon groups & modifiers | [BUILT] | `main/routes/addon-groups.ts`, `addon_groups`, `addons` | High |
| Product images | [BUILT] | `main/routes/products.ts`, `tests/product-images.test.ts` | High |
| CSV menu import/export | [BUILT] | `main/routes/menu-csv.ts` | Medium |
| Dietary tags | [BUILT] | `products.tags`, `DietaryBadge.tsx` | Medium |
| Menu availability / deactivation | [PARTIAL] | `products.is_active`; no dedicated "86" workflow | Medium |
| Product-level stock tracking | [PARTIAL] | `track_inventory`, `stock_quantity` — no recipes/BOM | Medium |
| Combos / bundles | [NOT BUILT] | No combo entity | — |

## Customers & CRM

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Customer CRUD | [BUILT] | `main/routes/customers.ts` | High |
| Phone search (E.164) | [BUILT] | `main/lib/phone.ts`, phone tests | High |
| CRM lookup by phone | [BUILT] | `GET /api/crm/lookup` | High |
| Customer wallet view | [BUILT] | `GET /api/customers/:id/wallet` | Medium |
| Loyalty points | [BUILT] | `loyalty_ledger.amount`, integration tests | High |
| Loyalty redemption | [BUILT] | `tests/integration-loyalty-redemption.test.ts` | High |

## Staff & Access Control

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Roles (owner/manager/cashier/waiter/chef) | [BUILT] | `users.role`, `main/routes/staff.ts` | High |
| Staff creation | [BUILT] | `POST /api/staff` or `POST /api/users` | High |
| JWT authentication | [BUILT] | `main/routes/auth.ts`, `jsonwebtoken` | High |
| Manager PIN overrides | [BUILT] | `manager-pin-verification.test.ts` | High |
| Master PIN (destructive ops) | [BUILT] | `main/services/master-pin.ts` | High |
| Kitchen station user scoping | [BUILT] | `station_users`, KDS tests | High |
| Permission matrix | [PARTIAL] | Role checks per-route; no RBAC table | High for current model |

## Kitchen (KOT/KDS)

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Embedded KDS | [BUILT] | `frontend/src/app/(dashboard)/kds/page.tsx` | High |
| Standalone KDS server (:3002) | [BUILT] | `main/kds-server.ts` | High — integration tests |
| WebSocket realtime | [BUILT] | `main/services/kds.ts`, `/kds` WS | High |
| Kitchen stations & routing | [BUILT] | `kitchen_stations`, issue-134 tests | High |
| KOT printing | [BUILT] | `main/printers/thermal.ts`, KOT toggles test | High |
| KDS pairing tokens | [BUILT] | `kds_pairing_tokens` table | Medium |
| Printer routing by station | [BUILT] | `kitchen_stations.printer_id` | High |

## Payments & Billing

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Bill generation | [BUILT] | `main/routes/bills.ts` | High |
| Split payments | [BUILT] | `POST /api/bills/:id/payments` | High |
| Partial payments | [BUILT] | `payment_status = 'partial'`, `paid_amount`, `balance` in `bills.ts` | High |
| Payment methods catalog | [BUILT] | `payment_methods`, merge support | High |
| Payment idempotency | [BUILT] | `payment_idempotency`, v49+ migrations | High |
| Transaction reference tracking | [BUILT] | `payment_transaction_refs` | High |
| Payment reconciliation (shift-level) | [PARTIAL] | Transaction refs + idempotency; no shift close | Medium |
| Discounts (order & item level) | [BUILT] | discount integration tests | High |
| Comps (complimentary) | [PARTIAL] | Discounts with reason; void/cancel paths — no dedicated comp type | Medium |
| Taxes (pack-based engine) | [BUILT] | `main/services/tax-engine.ts` | High |
| Packaging & delivery charges | [BUILT] | `orders.packaging_charge`, `delivery_charge` | High |
| Service charge (configurable amount) | [NOT BUILT] | Tax infra exists; order create hardcodes `service_charge: 0` | — |
| Tips | [NOT BUILT] | No tip columns or workflow found | — |
| Refunds | [NOT BUILT] | No refund entity or dedicated workflow | — |
| Returns | [NOT BUILT] | No return workflow distinct from void/cancel | — |
| Payment terminal integration | [NOT BUILT] | Manual payment methods only | — |

## Printing

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| ESC/POS thermal — network | [BUILT] | `main/printers/thermal.ts` TCP 9100 | High |
| ESC/POS thermal — USB | [BUILT] | `main/printers/thermal.ts` | High |
| WebUSB printing (renderer) | [BUILT] | `frontend/src/lib/printer/PrinterService.ts` | Medium |
| Browser print fallback | [BUILT] | `frontend/src/lib/printer/web-print.ts` | Medium |
| Bluetooth printing | [NOT BUILT] | UI type stub only; DB CHECK excludes bluetooth; no print path | — |
| Printer profiles (58/80mm) | [BUILT] | `main/printers/profiles.ts` | High |
| Print audit log | [BUILT] | `print_logs` table | High |
| Cash drawer kick | [NOT BUILT] | No drawer command in printer stack | — |

Supported `printers.connection_type` values (VERIFIED): `network`, `usb`, `webusb`.

## Reports & Analytics

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Daily stats & sales summary | [BUILT] | `main/routes/reports.ts` | Medium |
| Tax component reports | [BUILT] | `GET /api/reports/tax-components` | Medium |
| Top products & table stats | [BUILT] | reports routes | Medium |
| Insights dashboard | [BUILT] | `tests/reports-insights.test.ts` | Medium |
| Day close / Z-report workflow | [PARTIAL] | Reports API only; no formal close gate | Low |
| Advanced analytics / BI | [NOT BUILT] | — | — |

## Inventory & Supply Chain

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Product stock decrement on order | [BUILT] | `main/routes/orders.ts` | Medium |
| Manual stock adjustment | [BUILT] | `POST /api/products/:id/stock` | Medium |
| Low stock filter | [BUILT] | `?low_stock=true` on products | Medium |
| Inventory adjustment API | [BUILT] | `POST /api/products/:id/stock` | Medium |
| Stock movement ledger | [NOT BUILT] | No append-only ledger table | — |
| Recipes / BOM | [NOT BUILT] | — | — |
| Suppliers / purchasing | [NOT BUILT] | — | — |
| Stock transfers | [NOT BUILT] | — | — |
| Wastage tracking | [NOT BUILT] | — | — |

## Operations & Data

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Backup / restore | [BUILT] | `main/routes/database.ts`, `database-tools.ts` | High |
| Offline recovery | [BUILT] | Backup/restore + pre-migration auto-backup | High |
| Schema health check | [BUILT] | `main/services/schema-health.ts` | High |
| Google Drive backup | [BUILT] | `main/services/google-drive.ts` | Medium |
| Database initialize (wipe) | [BUILT] | master PIN gated | High |
| Shift management | [NOT BUILT] | — | — |
| Shift reconciliation | [NOT BUILT] | — | — |
| Audit logging (general) | [PARTIAL] | `print_logs`, `tax_config_audit` only | Low |

## Integrations & Cloud

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| FloAdmin cloud sync | [BUILT] | `main/services/cloud-sync.ts` | Medium |
| WhatsApp bill delivery | [BUILT] | `main/services/whatsapp.ts` | Medium — Baileys RC |
| RevFlo mobile pairing | [BUILT] | `POST /api/mobile/pairing-code` | Medium |
| Server App (waiter :3003) | [BUILT] | `main/server-app.ts` | Medium |
| Device management (mobile/KDS) | [PARTIAL] | RevFlo pairing, KDS station assignment | Medium |
| Online ordering | [NOT BUILT] | — | — |
| Delivery aggregator APIs | [NOT BUILT] | — | — |
| Accounting integrations | [NOT BUILT] | — | — |

## Multi-location & Sync

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Multi-location | [NOT BUILT] | Single SQLite DB per install | — |
| Cross-terminal sync | [NOT BUILT] | LAN companion apps only | — |
| Offline mode | [BUILT] | Local-first by design | High |

## Settings, Privacy & Localization

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Business settings | [BUILT] | `main/routes/settings.ts` | High |
| i18n (en/es/pt) | [BUILT] | `frontend/src/lib/i18n/` | High |
| Auto-update (electron-updater) | [BUILT] | `main/index.ts` | High |
| Anonymous telemetry | [BUILT] | `main/services/telemetry.ts` | Medium |
| Store diagnostics | [BUILT] | `store_diagnostics_outbox`, `diagnostics_consent` setting | Medium |

### Privacy note (CURRENT STATE — post-M2)

**VERIFIED:** New installs do **not** transmit telemetry or diagnostics until the owner explicitly opts in during setup or Settings → Privacy. Setting values `'pending'`, missing, or legacy `'false'` (migration v28) all fail closed. Explicit `'true'` required to send.

**Operational upgrades:** Installs with completed onboarding keep stored preferences (grandfathering); explicit opt-outs (`'false'`) are preserved through migration v67.

**TARGET (future):** Jurisdiction-specific re-consent if required by legal review. See [`07-security/privacy-and-consent.md`](../07-security/privacy-and-consent.md).

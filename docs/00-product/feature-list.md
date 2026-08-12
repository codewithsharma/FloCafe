# Feature Inventory

Status legend: **[BUILT]** usable · **[PARTIAL]** incomplete · **[EXPERIMENTAL]** unstable · **[NOT BUILT]** absent

Evidence paths reference the FloCafe codebase as of schema v66.

## POS & Orders

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| POS product grid & cart | [BUILT] | `frontend/src/app/(dashboard)/pos/page.tsx`, `frontend/src/store/cart.ts` | High — E2E layout tests |
| Order types (dine-in, takeaway, delivery) | [BUILT] | `frontend/src/lib/order-types.ts`, `orders.type` column | High |
| Order lifecycle (preparing→completed) | [BUILT] | `main/routes/orders.ts` | High — integration tests |
| Held orders (table carts) | [BUILT] | `main/routes/held-orders.ts`, `held_orders` table | High — `tests/held-orders.test.ts` |
| Order notes validation | [BUILT] | `tests/order-notes-validation.test.ts` | High |
| Barcode product lookup | [BUILT] | `frontend/src/hooks/useBarcodeScanner.ts`, `tests/issue-137-barcode.test.ts` | Medium |
| Cancel order (manager PIN) | [BUILT] | `tests/cancel-override.test.ts` | High |
| Void/cancel line items | [BUILT] | `main/routes/index.ts` PATCH cancel/restore | High |
| Split checks | [BUILT] | `main/routes/bills.ts`, `bill_items`, v59 migration | High — payment tests |
| Prepaid checkout | [BUILT] | `frontend/src/components/pos/PrepaidCheckoutModal.tsx`, E2E spec | High |

## Tables

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Table CRUD | [BUILT] | `main/routes/tables.ts`, `tables` table | High |
| Table status (available/occupied/etc.) | [BUILT] | `tables.status` | High |
| Move order between tables | [BUILT] | `POST /api/tables/:id/move-order` | Medium |
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
| Product-level stock tracking | [PARTIAL] | `track_inventory`, `stock_quantity` — no recipes/BOM | Medium |

## Customers & CRM

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Customer CRUD | [BUILT] | `main/routes/customers.ts` | High |
| Phone search (E.164) | [BUILT] | `main/lib/phone.ts`, phone tests | High |
| CRM lookup by phone | [BUILT] | `GET /api/crm/lookup` | High |
| Customer wallet view | [BUILT] | `GET /api/customers/:id/wallet` | Medium |
| Loyalty points | [BUILT] | `loyalty_ledger`, integration tests | High |
| Loyalty redemption | [BUILT] | `tests/integration-loyalty-redemption.test.ts` | High |

## Staff & Access Control

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Roles (owner/manager/cashier/waiter/chef) | [BUILT] | `users.role`, `main/routes/staff.ts` | High |
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

## Payments & Billing

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Bill generation | [BUILT] | `main/routes/bills.ts` | High |
| Split payments | [BUILT] | `POST /api/bills/:id/payments` | High |
| Payment methods catalog | [BUILT] | `payment_methods`, merge support | High |
| Payment idempotency | [BUILT] | `payment_idempotency`, v49+ migrations | High |
| Transaction reference tracking | [BUILT] | `payment_transaction_refs` | High |
| Discounts (order & item level) | [BUILT] | discount integration tests | High |
| Taxes (pack-based engine) | [BUILT] | `main/services/tax-engine.ts` | High |
| Refunds | [NOT BUILT] | No refund entity or dedicated workflow | — |
| Payment terminal integration | [NOT BUILT] | Manual payment methods only | — |

## Printing

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| ESC/POS thermal (main process) | [BUILT] | `main/printers/thermal.ts` | High |
| WebUSB printing (renderer) | [BUILT] | `frontend/src/lib/printer/PrinterService.ts` | Medium |
| Browser print fallback | [BUILT] | `frontend/src/lib/printer/web-print.ts` | Medium |
| Printer profiles (58/80mm) | [BUILT] | `main/printers/profiles.ts` | High |
| Print audit log | [BUILT] | `print_logs` table | High |

## Reports & Analytics

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Daily stats & sales summary | [BUILT] | `main/routes/reports.ts` | Medium |
| Tax component reports | [BUILT] | `GET /api/reports/tax-components` | Medium |
| Top products & table stats | [BUILT] | reports routes | Medium |
| Insights dashboard | [BUILT] | `tests/reports-insights.test.ts` | Medium |
| Advanced analytics / BI | [NOT BUILT] | — | — |

## Inventory & Supply Chain

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Product stock decrement on order | [BUILT] | `main/routes/orders.ts` | Medium |
| Manual stock adjustment | [BUILT] | `POST /api/products/:id/stock` | Medium |
| Low stock filter | [BUILT] | `?low_stock=true` on products | Medium |
| Recipes / BOM | [NOT BUILT] | — | — |
| Suppliers / purchasing | [NOT BUILT] | — | — |
| Stock transfers | [NOT BUILT] | — | — |
| Wastage tracking | [NOT BUILT] | — | — |

## Operations & Data

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Backup / restore | [BUILT] | `main/routes/database.ts`, `database-tools.ts` | High |
| Schema health check | [BUILT] | `main/services/schema-health.ts` | High |
| Google Drive backup | [BUILT] | `main/services/google-drive.ts` | Medium |
| Database initialize (wipe) | [BUILT] | master PIN gated | High |
| Shift management | [NOT BUILT] | — | — |
| Audit logging (general) | [PARTIAL] | `print_logs`, `tax_config_audit` only | Low |

## Integrations & Cloud

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| FloAdmin cloud sync | [BUILT] | `main/services/cloud-sync.ts` | Medium |
| WhatsApp bill delivery | [BUILT] | `main/services/whatsapp.ts` | Medium — Baileys RC |
| RevFlo mobile pairing | [BUILT] | `POST /api/mobile/pairing-code` | Medium |
| Server App (waiter :3003) | [BUILT] | `main/server-app.ts` | Medium |
| Online ordering | [NOT BUILT] | — | — |
| Delivery aggregator APIs | [NOT BUILT] | — | — |
| Accounting integrations | [NOT BUILT] | — | — |

## Multi-location & Sync

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Multi-location | [NOT BUILT] | Single SQLite DB per install | — |
| Cross-terminal sync | [NOT BUILT] | LAN companion apps only | — |
| Offline mode | [BUILT] | Local-first by design | High |

## Settings & Localization

| Feature | Status | Evidence | Production readiness |
|---------|--------|----------|---------------------|
| Business settings | [BUILT] | `main/routes/settings.ts` | High |
| i18n (en/es/pt) | [BUILT] | `frontend/src/lib/i18n/` | High |
| Auto-update (electron-updater) | [BUILT] | `main/index.ts` | High |
| Telemetry (opt-in) | [BUILT] | `main/services/telemetry.ts` | Medium |

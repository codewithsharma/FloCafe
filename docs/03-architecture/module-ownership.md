# Module Ownership Map

**Status:** DOCUMENTATION (Phase 2 **COMPLETE** / [final exit](phase-2-final-exit-gate.md))
**Date:** 2026-08-13
**Source:** `main/modules/catalog.ts`, `main/routes/`, `main/services/`, `main/db.ts`

Practical ownership for future extraction. Implementations remain colocated in the monolith.

| Module | Domain | Routes | Services / helpers | Frontend | DB entities | Deps | Vertical-specific? | Extraction blockers |
|--------|--------|--------|--------------------|----------|-------------|------|--------------------|---------------------|
| core | Auth, settings, audit | `auth`, `settings`, `audit-logs`, `platform` | `jwt-secret`, `master-pin`, `audit-log`, `network-mode` | auth, setup, recovery, settings | `users`, `settings`, `revoked_tokens`, `audit_logs` | — | N | Cross-cutting; extract last |
| customer | CRM | `customers`, search/CRM in `index` | `lib/phone` | customers, POS search | `customers` | core | N | Phone util + loyalty reads |
| product | Catalog items | `products` | Tax facade validation only (no calculate) | products, POS grid | `products` (+ tax config refs) | core, category, tax | N | Tax config columns colocated; inventory columns |
| category | Catalog groups | `categories` | — | products tabs | `categories` | core | N | Coupled to products UI |
| inventory | Stock counts + ledger | **`inventory`** (read); writes via products/orders | **`inventory` service** + `inventory_movements` | products OOS | product stock columns + movements | product | N | Stock columns on products; write HTTP still product-nested |
| pos | Sell surface | `pos-info` (thin) | checkout-coordinator (frontend) | `pos/*` | orders/bills/… | product, order, payment | N | Orchestrator (2.16); extract last |
| order | Order lifecycle | `orders`, `order-items`, `held-orders` | **`order` ownership facade**; inventory/tax callees | orders, POS | `orders`, `order_items`, `held_orders` | product, core, inventory, tax | N | Fat create/add-items; KDS/tables soft-gated |
| payment | Tender / bills | `bills`, `payment-methods` | **`payment-tender`**, `payment-cash` | PaymentModal | `bills`, `payment_*` | order, tax | N | generate/print/split still in bills.ts |
| refund | Refunds | `refunds` | `refund`, `shift` | RefundDialog | `refunds`, idempotency | payment | N | Tied to bills/shifts; no inventory restock |
| tax | Tax compute | **`tax`**, `tax-packs` | **`tax`, `tax-engine`** | TaxConfigurationPanel | tax pack tables + snapshots | core | N | Denormalized snapshots |
| shift | Shifts / recon | `shifts` | `shift`, `day-close` | shifts, operations | `shifts`, `day_closes` | core, payment | N | Money path coupling |
| staff | Users / roles | `staff` | audit | staff page | `users`, `station_users` | core | N | Shared with auth users |
| loyalty | Points / wallet | via bills/customers/settings | — | settings, POS wallet | `loyalty_ledger` | customer, payment | N | **No dedicated router** |
| reporting | Reports / day close | `reports` | `day-close` | reports, DayCloseCard | aggregates | core, payment | N | Reads many domains |
| printing | Receipts / KOT | `printers` | `receipt` | settings printers | `printers`, `print_logs` | core | N | Kitchen station FK |
| notification | WhatsApp | `whatsapp` | `whatsapp` | whatsapp page | whatsapp tables | core | N | Relatively contained |
| backup | Backup / DB tools | `db`, `db-tools` | schema-health, Drive | settings backup | all + files | core | N | Touches entire DB |
| tables | Floor tables | `tables` | kds notify | tables, POS picker | `tables` | order | **Y** | Order FK |
| kitchen | Stations | `kitchen`, `kitchen-stations` | helpers in `db.ts` | settings stations | `kitchen_stations` | order, product | **Y** | Logic in db.ts |
| kds | Kitchen display | `kds`, `kds-info` | `kds` WS | kds pages | pairing + orders | order, kitchen, product | **Y** | WS + order coupling |
| menu | Menu CSV | `menu-csv` | tax validation | products import | writes products/categories | product, category | **Y** | Import-only surface |
| addons | Addon groups | `addon-groups` | tax helpers | products addons | addon tables | product | **Y** | Product join tables |

## Inventory owns / does not own (Phase 2.7–2.12)

- **Owns:** all application stock **writes** (sale, cancel restore, manual adjust, product create opening, product update stock), append-only `inventory_movements`, low-stock fragment, bounded history reads (`listInventoryMovements`, `GET /api/inventory/movements`).
- **Does not own:** product metadata (name/price/category), sales/payments/orders, refund restock (intentionally none), Inventory UI (deferred).

`products.stock_quantity` = current-state **read** cache; Inventory owns mutations. Ledger from schema v75 (no pre-migration backfill). Opening stock = `adjustment` + reason `opening` (no separate type).

## Product owns / does not own (tax — Phase 2.13)

- **Owns:** persistence of `tax_category_id` / `tax_behavior` as Tax config references on the product row; create/update validation via Tax facade helpers only.
- **Does not own:** tax calculation, `EngineTaxSnapshot`, tax packs, rewriting historical order/bill tax when product config changes. Legacy `tax_type`/`tax_rate` forced none/0 (not authoritative).

## Tax owns / does not own (Phase 2.7 + 2.10 + 2.11 + 2.13)

- **Owns:** tax calculation (`calculateTax` / engine), frozen `EngineTaxSnapshot` contract, tax breakdown/snapshots adapters, tax rounding helpers, money-path discount item-tax scaling, Tax HTTP under `main/routes/tax.ts` (`/api/tax/preview`, `/api/tax/categories`).
- **Does not own:** products (except defining valid categories Product may reference), orders, payments, refunds, reporting UI, tax-pack install/activate lifecycle (`tax-packs.ts`), settings registration/`taxes_enabled` HTTP.
- **Co-owns with Order/Bill:** persisted SNAPSHOT_DATA (`tax_amount` / `tax_snapshot`) — historical values must not change when product tax config later changes.

See also [extraction-readiness.md](extraction-readiness.md), [phase-2.7-domain-boundaries.md](phase-2.7-domain-boundaries.md), [phase-2.8-inventory-ledger.md](phase-2.8-inventory-ledger.md), [phase-2.9-product-inventory-boundary.md](phase-2.9-product-inventory-boundary.md), [phase-2.10-tax-http-boundary.md](phase-2.10-tax-http-boundary.md), [phase-2.11-tax-snapshot-contract.md](phase-2.11-tax-snapshot-contract.md), [phase-2.12-inventory-movement-read-api.md](phase-2.12-inventory-movement-read-api.md), and [phase-2.13-product-tax-ownership.md](phase-2.13-product-tax-ownership.md).

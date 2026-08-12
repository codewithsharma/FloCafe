# Data Model — Current State

Schema version **66**. Authoritative source: `main/db.ts`.

## Schema initialization

**VERIFIED:** Fresh installs run migration v1, which calls `createSchema()` then `seedInstallDefaults()`. Subsequent migrations (v2–v66) append tables, columns, and indexes.

| Layer | Table count | Origin |
|-------|-------------|--------|
| Base schema | **23** | `createSchema()` in `main/db.ts` |
| Additional live tables | **17** | Later migrations and helpers (`createCloudSyncSchema()`, `createWhatsAppSchema()`, etc.) |
| **Total live tables** | **40** | Excludes backup-only `_flo_meta` |

Do **not** assume all 40 tables are defined in `createSchema()` alone.

## Entity inventory (40 live tables)

### Catalog

| Entity | Table | Key fields |
|--------|-------|------------|
| Category | `categories` | id (TEXT), name, parent_id, sort_order, deleted_at |
| Product | `products` | id (TEXT), category_id, name, price, cost, tax_*, track_inventory, stock_quantity, tags |
| AddonGroup | `addon_groups` | id (TEXT), name, min/max selection, required |
| Addon | `addons` | id (TEXT), addon_group_id, name, price |
| AddonGroupProduct | `addon_group_product` | product_id, addon_group_id (M:N) |
| KitchenStation | `kitchen_stations` | id (TEXT), name, category_ids, printer_id |
| Printer | `printers` | id (TEXT), name, connection_type, ip_address, port, paper_width |

`printers.connection_type` CHECK: `network`, `usb`, `webusb` only (`main/db.ts`).

### Floor

| Entity | Table | Key fields |
|--------|-------|------------|
| Table | `tables` | id (TEXT), number (unique), capacity, status, floor, section, kitchen_station_id |
| StationUser | `station_users` | user_id, station_id (M:N) |

### People

| Entity | Table | Key fields |
|--------|-------|------------|
| User (Staff) | `users` | id (TEXT), email, **password** (bcrypt hash), role, pin_hash, category_ids, tokens_valid_after |
| Customer | `customers` | id (TEXT), name, phone, phone_digits, tag_counts |

### Transactions

| Entity | Table | PK type | Key fields |
|--------|-------|---------|------------|
| Order | `orders` | **INTEGER AUTOINCREMENT** | order_number, type, table_id, customer_id, user_id, status, packaging_charge, delivery_charge |
| OrderItem | `order_items` | **INTEGER AUTOINCREMENT** | order_id, product_id, quantity, unit_price, voided_at |
| OrderItemAddon | `order_item_addons` | — | order_item_id, addon_id, quantity, price snapshot |
| Bill | `bills` | **INTEGER AUTOINCREMENT** | bill_number, order_id, total, **payment_status**, paid_amount, balance, split_group_id |
| BillItem | `bill_items` | — | bill_id, order_item_id, quantity (split-check allocation) |
| HeldOrder | `held_orders` | TEXT | table_id, items (JSON blob) |
| LoyaltyLedger | `loyalty_ledger` | INTEGER | customer_id, bill_id, type, **amount** |
| PrintLog | `print_logs` | — | bill_id, user_id, action, timestamp |
| AuditLog | `audit_logs` | INTEGER | actor_user_id, action, entity_type, entity_id, result, metadata_json, terminal_id, request_id, created_at |

### Tax engine

| Entity | Table | Purpose |
|--------|-------|---------|
| CountryPack | `country_packs` | Installed tax pack metadata |
| CountryPackVersion | `country_pack_versions` | Versioned manifest + JSON rules |
| TaxCategory | `tax_categories` | Categories from pack |
| TaxRule | `tax_rules` | Calculation rules |
| TaxOverride | `tax_overrides` | Per-entity overrides |
| TaxConfigAudit | `tax_config_audit` | Pack install/override audit |

### Infrastructure

| Entity | Table | Purpose |
|--------|-------|---------|
| Setting | `settings` | Key-value config store |
| Sequence | `sequences` | Order/bill number generation |
| KdsPairingToken | `kds_pairing_tokens` | Short-lived KDS pairing |
| RevokedToken | `revoked_tokens` | JWT blocklist |
| PaymentMethod | `payment_methods` | Manual payment catalog |
| PaymentIdempotency | `payment_idempotency` | Dedup payment requests |
| OrderIdempotency | `order_idempotency` | Dedup order creation |
| PaymentTransactionRef | `payment_transaction_refs` | Unique txn ref per method |
| CloudSyncOutbox | `cloud_sync_outbox` | Cloud event queue |
| SupportTicketOutbox | `support_ticket_outbox` | Support request queue |
| StoreDiagnosticsOutbox | `store_diagnostics_outbox` | Diagnostics queue |
| WhatsAppMessage | `whatsapp_messages` | Message history |
| WhatsAppBlocklist | `whatsapp_blocklist` | Blocked phones |

## Relationships (declared FKs)

See `main/db.ts` `createSchema()` — key chains:
- `products.category_id` → `categories`
- `orders.user_id` → `users`
- `order_items.order_id` → `orders`
- `bills.order_id` → `orders`
- `bill_items` → `bills`, `order_items`
- `station_users` → `users`, `kitchen_stations`

## Logical links without FK

`orders.table_id`, `orders.customer_id`, `bills.customer_id`, `held_orders.table_id` — used in queries but no declared FK constraint.

## PROPOSED entities (RestaurantOS — NOT IMPLEMENTED)

| Entity | Purpose |
|--------|---------|
| Location | Multi-store scoping |
| Terminal | Register/device identity |
| Shift | Cash drawer sessions |
| Ingredient | Recipe components |
| Recipe | BOM linking products to ingredients |
| Supplier | Vendor master |
| PurchaseOrder | Stock procurement |
| StockMovement | Inventory ledger |
| AuditLog | General action audit — **IMPLEMENTED** (M3, `audit_logs`) |
| Refund | Payment reversal record |

## Identifiers

**Mixed strategy (VERIFIED):**

| ID style | Tables |
|----------|--------|
| TEXT (short random or UUID-style via `uuid` / `generateShortId`) | categories, products, users, customers, tables, printers, most config entities |
| **INTEGER AUTOINCREMENT** | **orders**, **order_items**, **bills**, loyalty_ledger, tax_config_audit, **audit_logs** |

Human-readable sequences: `order_number`, `bill_number` via `sequences` table.

## State transitions

### Order status
`pending` → `preparing` → `ready` → `served` → `completed` | `cancelled`

New orders are created with status **`pending`** (`main/routes/orders.ts`). Evidence: PATCH status allows `preparing`, `ready`, `served`, `completed`, `cancelled`.

### Bill payment_status
Values include `unpaid`, **`partial`**, and `paid` (`main/routes/bills.ts`). Tracked on `bills.payment_status` with `paid_amount` and `balance`.

### Table status
Updated via `PATCH /api/tables/:id/status`.

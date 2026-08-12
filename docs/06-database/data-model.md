# Data Model — Current State

Schema version **66**. All tables defined in `main/db.ts` `createSchema()`.

## Entity inventory (40 live tables)

### Catalog

| Entity | Table | Key fields |
|--------|-------|------------|
| Category | `categories` | id, name, parent_id, sort_order, deleted_at |
| Product | `products` | id, category_id, name, price, cost, tax_*, track_inventory, stock_quantity, tags |
| AddonGroup | `addon_groups` | id, name, min/max selection, required |
| Addon | `addons` | id, addon_group_id, name, price |
| AddonGroupProduct | `addon_group_product` | product_id, addon_group_id (M:N) |
| KitchenStation | `kitchen_stations` | id, name, category_ids, printer_id |
| Printer | `printers` | id, name, type, connection, paper_width |

### Floor

| Entity | Table | Key fields |
|--------|-------|------------|
| Table | `tables` | id, number (unique), capacity, status, floor, section, kitchen_station_id |
| StationUser | `station_users` | user_id, station_id (M:N) |

### People

| Entity | Table | Key fields |
|--------|-------|------------|
| User (Staff) | `users` | id, email, password_hash, role, pin_hash, category_ids, tokens_valid_after |
| Customer | `customers` | id, name, phone, phone_digits (generated), tag_counts |

### Transactions

| Entity | Table | Key fields |
|--------|-------|------------|
| Order | `orders` | id, order_number, type, table_id, customer_id, user_id, status, charges |
| OrderItem | `order_items` | id, order_id, product_id, quantity, price, tax, voided_at |
| OrderItemAddon | `order_item_addons` | order_item_id, addon_id, quantity, price snapshot |
| Bill | `bills` | id, bill_number, order_id, total, paid_status, split_group_id |
| BillItem | `bill_items` | bill_id, order_item_id, quantity (split-check allocation) |
| HeldOrder | `held_orders` | table_id, items (JSON blob) |
| LoyaltyLedger | `loyalty_ledger` | customer_id, bill_id, type, points |
| PrintLog | `print_logs` | bill_id, user_id, action, timestamp |

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

See `main/db.ts` createSchema — key chains:
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
| AuditLog | General action audit |
| Refund | Payment reversal record |

## Identifiers

- String UUIDs for most entities (generated at insert)
- Human-readable sequences: `order_number`, `bill_number` via `sequences` table

## State transitions

### Order status
`preparing` → `ready` → `served` → `completed` | `cancelled`
Evidence: `main/routes/orders.ts` PATCH status

### Bill paid_status
Tracked on `bills.paid_status` — integration tests cover partial/split payment flows.

### Table status
Updated via `PATCH /api/tables/:id/status`.

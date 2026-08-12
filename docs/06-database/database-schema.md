# Database Schema

Schema version **66**. Authoritative source: `main/db.ts` `createSchema()`.

## Table count: 40 live tables

See `06-database/data-model.md` for entity descriptions.

## Core DDL patterns
- String UUID primary keys
- `created_at`, `updated_at` timestamps (ISO strings)
- Soft delete via `deleted_at` on categories, products, customers
- Settings as key-value store

## Column highlights

### products
price, cost, tax_category_id, tax_behavior, track_inventory, stock_quantity, low_stock_threshold, cb_percent (loyalty), tags, image_url

### orders
order_number (unique), type, table_id, customer_id, user_id, status, subtotal, tax_total, discount_total, charges (JSON)

### bills
bill_number (unique), order_id, total, paid_status, paid_at, split_group_id, printed_at

### users
email (unique), password_hash, role, pin_hash, category_ids (JSON), tokens_valid_after

## Indexes
See data-model.md index inventory. Performance indexes added in v45 migration.

## Backup metadata
`_flo_meta` table exists on backup files only with schema_version.

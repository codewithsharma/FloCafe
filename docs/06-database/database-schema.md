# Database Schema

Schema version **80**. Authoritative sources: `main/db.ts` (`createSchema()`, `MIGRATIONS[]`, helper schema functions).

## Table count: 43 live tables

- **23 tables** created by `createSchema()` on fresh install (migration v1)
- **20 additional tables** added by later migrations and helpers (`createCloudSyncSchema()`, `createWhatsAppSchema()`, migration v68 `audit_logs`, migration v69 `shifts`, migration v71 `day_closes`, etc.)

See `06-database/data-model.md` for the full entity list.

## Core DDL patterns

- **Mixed primary keys:** TEXT ids for catalog/config entities; **INTEGER AUTOINCREMENT** for `orders`, `order_items`, `bills`, and some ledger/audit rows
- `created_at`, `updated_at` timestamps (ISO strings)
- Soft delete via `deleted_at` on categories, products, customers
- Settings as key-value store

## Column highlights

### products
price, cost, tax_category_id, tax_behavior, track_inventory, stock_quantity, low_stock_threshold, cb_percent (loyalty), tags, image_url

### orders
order_number (unique), type, table_id, customer_id, user_id, status, packaging_charge, delivery_charge, service_charge_tax_category_id, subtotal, tax_amount, discount_amount, total

Note: order creation currently passes **`service_charge: 0`** in charge context (`main/routes/orders.ts`) — merchant-configurable service charge amounts are **not** a live POS feature today.

### bills
bill_number (unique), order_id, total, **payment_status**, paid_amount, balance, paid_at, split_group_id, printed_at

### day_closes (v71 — M5-G)

Immutable business-day cash snapshot. Migration `m5_day_closes`.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| business_date | TEXT NOT NULL UNIQUE | `YYYY-MM-DD` in `settings.timezone` (not UTC) |
| closed_by_user_id | TEXT NOT NULL | FK → `users(id)` |
| summary_json | TEXT NOT NULL | Immutable snapshot (totals + per-shift rows) |
| created_at | TEXT NOT NULL | ISO timestamp |

Index: `idx_day_closes_created_at` on `created_at`. Duplicate `business_date` → UNIQUE constraint (API **409**).

### shifts reconciliation columns (v70 — M5-B/D)

Nullable on open / legacy rows; written at close/force-close:

- `expected_cash_cents` INTEGER NULL
- `variance_cents` INTEGER NULL (`NULL` when counted cash omitted)

### users
email (unique), **password** (bcrypt hash stored in `password` column), role, pin_hash, category_ids (JSON), tokens_valid_after

## Indexes

See `data-model.md` and `indexing.md`. Performance indexes added in v45 migration use **`payment_status`** on bills (not `paid_status`).

## Backup metadata

`_flo_meta` table exists on backup files only with schema_version.

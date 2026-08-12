# Technical Design

## CURRENT STATE

### ID generation (mixed strategy)

**Do not assume UUIDs for all entities.**

| Strategy | Used for | Evidence |
|----------|----------|----------|
| TEXT id (`uuid` package or `generateShortId()`) | categories, products, users, customers, tables, printers, addon entities | `createSchema()` |
| **INTEGER AUTOINCREMENT** | **orders**, **order_items**, **bills**, loyalty_ledger, tax_config_audit | `createSchema()` PK definitions |

JWT `jti` and cloud pairing codes use `uuid` separately from entity primary keys.

### Money handling
`decimal.js` in tax engine; SQLite REAL for storage — tests enforce decimal integrity.

### Sequence generation
`sequences` table with name+date composite key for order/bill numbers.

### Settings pattern
Key-value `settings` table; typed accessors in route handlers.

### Image storage
Product images as URLs or local paths; `GET /api/products/:id/image` serves bytes.

### Tax calculation pipeline
1. Resolve active country pack version
2. Map product/category to tax category
3. Apply rules via `tax-engine.ts`
4. Apply overrides from `tax_overrides`

### Service charge (infrastructure vs POS feature)
Tax infrastructure includes a `service_charge` tax kind and `orders.service_charge_tax_category_id`. Order creation currently hardcodes **`service_charge: 0`** (`main/routes/orders.ts`). Configurable service charge amounts are **NOT IMPLEMENTED** as user-facing POS functionality.

## TARGET STATE
- Typed settings schema with validation (Zod — PROPOSED)
- Stock movement as append-only ledger (PROPOSED)
- Configurable service charge amounts (PROPOSED)

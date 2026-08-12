# Technical Design

## CURRENT STATE

### ID generation
UUID v4 via `uuid` package for entity IDs.

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

## TARGET STATE
- Typed settings schema with validation (Zod — PROPOSED)
- Stock movement as append-only ledger

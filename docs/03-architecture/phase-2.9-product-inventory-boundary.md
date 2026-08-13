# Phase 2.9 — Product ↔ Inventory Boundary Completion

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.8 (`bc2c301`)

## 1. Why Product no longer owns stock mutations

Product create/PUT previously wrote `products.stock_quantity` directly, bypassing the Phase 2.8 ledger. That left Inventory incomplete as a domain: stock history could skip product-form edits.

## 2. Inventory ownership

Inventory owns **all application-level stock writes**:

- Sale / cancel restore (Phase 2.8)
- Manual `POST /api/products/:id/stock`
- Product create initial stock (`applyAbsoluteStockChange`, reason `opening`)
- Product update stock field (`applyAbsoluteStockChange`, reason `product_update`)

## 3. Current stock cache

`products.stock_quantity` remains the runtime read cache. Reads may stay on the product row.

## 4. Movement ledger

Non-zero stock changes append `adjustment` rows (no new `opening` type — avoids schema change). Zero-delta skips INSERT.

## 5. Product API compatibility

`POST /api/products` and `PUT /api/products/:id` still accept `stock_quantity`. Implementation routes through Inventory. No frontend change.

## 6. Transaction ownership

Create and update wrap metadata + Inventory stock write (+ addons) in one `withTxn`. Failure rolls back all.

## 7. Zero-delta behavior

`oldStock === newStock` → no movement.

## 8. Product deletion

Soft-delete only (`deleted_at`). Ledger rows preserved. FK has no CASCADE.

## 9. Remaining coupling

- Stock column still physically on `products`
- Runtime reads still on product SQL
- Order paths still orchestrate Inventory
- Test/seed fixtures may INSERT stock outside Inventory (documented exception)
- menu-csv does not write stock (schema default 0)

## 10. Future extraction path

Next: optional movement HTTP/UI, or split stock column / port; tax HTTP consolidation. Package extraction still deferred.

## Schema

**No migration.** Still schema **v75**.

## Related

- [phase-2.8-inventory-ledger.md](phase-2.8-inventory-ledger.md)
- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)

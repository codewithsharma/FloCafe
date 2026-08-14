# Phase 2.12 — Inventory Movement History Read Boundary

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.11 (`828f582`)

## 1. Purpose

Expose existing `inventory_movements` history through an Inventory-owned read API so future UI/reporting never queries the ledger with raw SQL.

## 2. Inventory ownership

Inventory owns stock writes (2.8/2.9) and movement history reads (2.12). Product remains the `product_id` reference and hosts stock mutation HTTP for compatibility.

## 3. Endpoint

```http
GET /api/inventory/movements?product_id=&limit=&before_id=
```

Router: `main/routes/inventory.ts` · Mount: `app.use('/api/inventory', inventoryRoutes)`.

## 4. Authentication

Global JWT `requireAuth` (no public access).

## 5. Authorization

`requireRole('owner', 'manager')` — same as `POST /api/products/:id/stock`.

## 6. Request parameters

| Param        | Required | Notes                                 |
| ------------ | -------- | ------------------------------------- |
| `product_id` | yes      | Active product (`deleted_at IS NULL`) |
| `limit`      | no       | Default 100, clamp 1–500              |
| `before_id`  | no       | Keyset: `id < before_id`              |

## 7. Response contract

```json
{
  "movements": [
    {
      "id": 1,
      "product_id": "...",
      "quantity_delta": -1,
      "movement_type": "sale",
      "reference_type": "order",
      "reference_id": "...",
      "reason": null,
      "stock_after": 9,
      "created_at": "..."
    }
  ],
  "nextCursor": 42
}
```

`nextCursor` omitted when no further page. Snake_case matches products/tax API convention.

## 8. Pagination

Fetch `limit + 1`; trim; set `nextCursor` to last returned `id` when more exist. No OFFSET.

## 9. Ordering

Newest → oldest: `ORDER BY id DESC`.

## 10. Database query

Service `listInventoryMovements` in `main/services/inventory.ts`. `getMovements` wraps it for existing callers. Route does not embed SQL for listing (product existence check only).

## 11. Index usage

Uses PK `id` + `product_id` filter. Existing `(product_id, created_at)` adequate at café scale + LIMIT ≤500. **No new index.** Schema stays v75.

## 12. Historical data limitation

Ledger starts empty at v75 migration. Pre-migration stock activity is not reconstructable. API does not claim complete historical audit.

## 13. Movement types

Unchanged: `sale`, `cancel_restore`, `adjustment` only.

## 14. Vertical neutrality

No table/KOT/KDS/waiter/kitchen concepts. Shared module; retail-test vertical includes inventory.

## 15. Future UI consumers

**Phase 3.5A:** owner/manager UI at `/products/movements` consumes this API (display-only; no stock recalculation). Further reporting/diagnostics consumers remain optional.

## 16. Reconciliation relationship

`calculateLedgerStock` / `compareCurrentStockToLedger` remain in-process only — not exposed on HTTP.

## 17. Known limitations

- `products.stock_quantity` still the runtime cache
- Stock write HTTP still under products
- Order sale/cancel orchestration still owns txn
- No backfill; SUM(delta) ≠ on-hand without baseline
- Extraction readiness remains **MEDIUM**

## Schema

**No migration.** Still schema **v75**.

## Related

- [phase-2.8-inventory-ledger.md](phase-2.8-inventory-ledger.md)
- [phase-2.9-product-inventory-boundary.md](phase-2.9-product-inventory-boundary.md)
- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)

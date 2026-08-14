# Phase 4.3 — Low-Stock Attention Hub

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**  
**Baseline:** Phase 4.2 (`edf0f13`)

**Related:** [Phase 4 product completion discovery](phase-4-product-completion-discovery.md) · [Phase 2.7 domain boundaries](../03-architecture/phase-2.7-domain-boundaries.md) · [Phase 3.6C stock adjust UI](../03-architecture/phase-3.6c-stock-adjust-ui.md)

---

## Summary

Owners/managers get a **read-only attention surface** for tracked products that are low or out of stock, reusing the existing `GET /api/products?low_stock=true` contract. Optional **Adjust stock** uses the Phase 3.6C workflow (`POST /api/products/:id/stock`). No purchasing, suppliers, forecasting, or schema changes.

## Existing low-stock contract (reused)

| Item                       | Definition                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------- |
| **Tracked product**        | `products.track_inventory = 1`                                                         |
| **Current stock**          | `products.stock_quantity` (cache)                                                      |
| **Threshold**              | `products.low_stock_threshold` (schema default **5**; create may store `0` if omitted) |
| **Low-stock filter**       | `track_inventory = 1 AND stock_quantity <= low_stock_threshold`                        |
| **Out of stock (display)** | `stock_quantity <= 0` (subset of low-stock list)                                       |
| **Low stock (display)**    | `stock_quantity > 0` and still matches filter                                          |
| **Healthy**                | `stock_quantity > low_stock_threshold` — **excluded** from `?low_stock=true`           |
| **Untracked**              | Excluded from filter                                                                   |
| **Inactive**               | Included unless caller passes `active=true` (hub uses default list semantics)          |
| **Deleted**                | Excluded (`deleted_at IS NULL`)                                                        |

**Owner:** `LOW_STOCK_SQL_FRAGMENT` in `main/services/inventory.ts`.  
**HTTP:** `GET /api/products?low_stock=true` in `main/routes/products.ts`.

## API

**No backend changes.** Hub calls:

```http
GET /api/products?low_stock=true
```

Stock adjustment (separate explicit action):

```http
POST /api/products/:id/stock
{ "action": "set"|"increase"|"decrease", "quantity": number }
```

## UI

| Surface                        | Behavior                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **`/products/low-stock`**      | Dedicated read-only table: name, SKU/barcode, stock, threshold, status; owner/manager; `inventory` module gate |
| **Dashboard `AttentionStrip`** | When `lowStockCount > 0` and `inventory` enabled → link to hub                                                 |
| **Products page**              | “Low stock” button next to “Stock movements” (owner/manager + inventory)                                       |

Adjust stock reuses `StockAdjustmentDialog` + `postProductStockAdjust`.

## Authorization

- **Page:** owner/manager only (same as movements page); others → `/pos`
- **API:** preserves existing product list contract (GET `/products` unscoped by role; stock POST remains owner/manager)
- **Cashiers** do not get the hub UI; no new inventory visibility for floor roles

## Verticals

| Vertical       | Hub                                                     |
| -------------- | ------------------------------------------------------- |
| **Restaurant** | Available when `product` + `inventory` modules composed |
| **Retail**     | Same shared commerce modules; no tables/KDS leakage     |

## Inventory / money impact

- Hub list: **read-only** (no ledger writes)
- Adjust stock: existing InventoryService path only when operator confirms
- No changes to orders, bills, payments, refunds, tax, FIN-01, day-close, shifts

## Tests

```sh
npm run test:phase-4.3
```

Covers API filter semantics, vertical composition, frontend contracts, ledger unchanged on list fetch.

## Out of scope

Suppliers, PO, receiving, reorder automation, forecasting, variants, valuation, multi-location, accounting CSV, schema migration, P1.6.

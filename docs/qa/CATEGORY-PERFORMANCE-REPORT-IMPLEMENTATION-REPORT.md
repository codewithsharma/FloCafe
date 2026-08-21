# Category Performance Report — Implementation Report

## Summary

| Field      | Value                                           |
| ---------- | ----------------------------------------------- |
| Feature    | Category Performance Report                     |
| Feature ID | `RPT-CATEGORY`                                  |
| Phase      | P12                                             |
| Status     | **COMPLETE** (Implemented / Hardening verified) |
| Commit     | _(see git after commit)_                        |
| Schema     | **v88** (no bump)                               |

Live pilot remains **NO-GO** (R16).

## Implementation summary

Thin projection of P11 Product Performance: `queryCategoryReport` calls `queryProductReport` and exposes `by_category` plus category-focused totals. No duplicate settlement SQL.

## Source of Record

Identical to RPT-PRODUCT:

| Data            | Tables / fields                                                    |
| --------------- | ------------------------------------------------------------------ |
| Settlement gate | `bills` + FIN-02; `bills.created_at`; `DISTINCT order_id`          |
| Lines           | `order_items` excluding `cancelled` / `voided` / `void_adjustment` |
| Merchandise     | `order_items.subtotal` / `subtotal_cents`                          |
| Item discounts  | `order_items.discount_amount` / `discount_amount_cents`            |
| Category        | Live `products.category_id` → `categories.name`                    |

## Settlement semantics

Settled bills only (paid / partially_refunded / refunded / collectible-complete partial). UTC half-open window via `utcDayBounds`.

## Category attribution semantics

**Category attribution uses the current product → category relationship; category history is not snapshotted.**

Uncategorized products (null `category_id`) appear as **Uncategorized** with `category_id: null`.

## Quantity / merchandise / discounts

Same as P11: `SUM(quantity)`, `SUM(subtotal)`, `SUM(discount_amount)` on active lines. Merchandise is **not** app Gross Sales.

## Refund limitations

**Refunds are not allocated to categories because the existing refund source does not contain reliable order-item/category attribution.** Report-level `sales.refunds` context only.

## Void / cancel treatment

Excluded exactly as P11.

## Reconciliation methodology

`category.by_category === product.by_category` (same array).  
`SUM(category merchandise) == SUM(product merchandise)` for the same window.

## API

- `GET /api/reports/categories`
- `GET /api/reports/export/categories.csv` — audits `report.categories_exported`

## CSV

Same dataset as JSON `by_category` (+ `__total__` row).

## RBAC

Owner/Manager 200; Cashier/Waiter/Chef 403.

## Frontend

Reports page panel after Product Performance: summary metrics, category table, empty/loading, CSV export.

## Test Matrix

| Command                     | Result               |
| --------------------------- | -------------------- |
| `npm run test:rpt-category` | PASS                 |
| Regressions                 | _(filled after run)_ |

## Known Limitations

- Live category join only (no historical category snapshot)
- No category-level refund allocation
- No order-level discount allocation to categories
- Insights `topCategories` widget remains a separate unsettled popularity query

# Product Performance Report — Implementation Report

## Summary

| Field      | Value                                           |
| ---------- | ----------------------------------------------- |
| Feature    | Product Performance Report                      |
| Feature ID | `RPT-PRODUCT`                                   |
| Phase      | P11                                             |
| Status     | **COMPLETE** (Implemented / Hardening verified) |
| Commit     | _(see git after commit)_                        |
| Schema     | **v88** (no bump)                               |

Live pilot remains **NO-GO** (R16).

## Source of Record

| Data             | Tables / fields                                                                      |
| ---------------- | ------------------------------------------------------------------------------------ |
| Settlement gate  | `bills` + FIN-02 settled statuses; window on `bills.created_at`; `DISTINCT order_id` |
| Lines            | `order_items` excluding `cancelled` / `voided` / `void_adjustment`                   |
| Product identity | `order_items.product_id`, name snapshot `product_name`                               |
| Merchandise      | `order_items.subtotal` / `subtotal_cents`                                            |
| Item discounts   | `order_items.discount_amount` / `discount_amount_cents`                              |
| Category         | Live `products.category_id` → `categories.name` (not snapshotted)                    |
| Order discounts  | `bills.discount_amount` as **context only**                                          |
| Refunds          | `sales.refunds` via day-sales semantics (bill-level, not per SKU)                    |

## Sales Semantics

| Concern               | Rule                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Eligible orders       | Those with ≥1 settled bill in the UTC window                                                     |
| Eligible items        | Active statuses only                                                                             |
| Quantity              | `SUM(quantity)`                                                                                  |
| Merchandise sales     | `SUM(subtotal)` — post item discount, includes addons, **pre tax**, **pre order-level discount** |
| Item discounts        | Summed on product rows                                                                           |
| Order-level discounts | Not allocated to products (`order_discounts_context`)                                            |
| Refunds               | Do not change merchandise; shown in `sales.refunds`                                              |
| Taxes                 | Not included in merchandise (bill Gross elsewhere includes tax)                                  |
| Split payments        | No double-count (DISTINCT order_id)                                                              |

**Not called Gross Sales** — app Gross Sales remains settled `bills.total`.

## Historical Semantics

- Product **name**: snapshotted on `order_items.product_name` (display uses `MAX(product_name)` per `product_id` in period)
- Product **category**: live join only — category moves rewrite history for this report

## Category Semantics

`by_category` rolled up from product rows → `sum(category merchandise) == totals.merchandise_sales`.

Category Performance as a standalone matrix row remains Planned; this is an in-report breakdown only.

## API

- `GET /api/reports/products` — Owner/Manager; `start_date`, `end_date`, optional `category_id`, `product_id`, `sort`
- `GET /api/reports/export/products.csv` — same filters; audits `report.products_exported`

## CSV

Same dataset as JSON `by_product` (+ `__total__` row). Shared `toCsvRow` escaping.

## RBAC

Owner/Manager 200; Cashier/Waiter/Chef 403.

## Performance

Single CTE aggregation over settled orders + `order_items`; no N+1; relies on existing `bills.created_at` / `order_items` indexes.

## Test Matrix

| Command                     | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `npm run test:rpt-product`  | PASS                                                            |
| `npm run test:rpt-pay`      | PASS                                                            |
| `npm run test:rpt-disc`     | PASS                                                            |
| `npm run test:rpt-staff`    | PASS                                                            |
| `npm run test:r13`          | PASS (51/51)                                                    |
| `npm run test:kds-alerts`   | PASS                                                            |
| `npm run test:kds-h-outbox` | PASS                                                            |
| `npm run test:inv-auto-86`  | PASS                                                            |
| `npm run test:critical`     | PASS (24/24)                                                    |
| `npm run test:phase2`       | PASS                                                            |
| `npm run test:print-health` | PASS                                                            |
| `npm run build`             | PASS                                                            |
| `npm run build:frontend`    | PASS                                                            |
| `npm run lint`              | Baseline debt (~13 errors / 9 warnings); **0 new** on P11 files |

## Regression

P4–P10 suites green; no schema bump; `/topProducts` widget unchanged.

## Known Limitations

- No item-level refund attribution
- No order-level discount allocation to SKUs
- Category not historically snapshotted
- Addons folded into parent line (not separate SKUs)
- Legacy `/topProducts` widget unchanged (unsettled popularity)
- Category Performance remains a separate Planned matrix row (in-report rollup only)

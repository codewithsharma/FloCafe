# Phase 4.4 — Accounting CSV Export

**Date:** 2026-08-14  
**Status:** IMPLEMENTED  
**Baseline:** Phase 4.3 (`9960e15`) · schema **v75** (unchanged)  
**Discovery:** [phase-4.4-accounting-csv-discovery.md](phase-4.4-accounting-csv-discovery.md)  
**Money semantics:** [reporting-financial-semantics.md](../15-project-management/reporting-financial-semantics.md)

---

## 1. Scope

Read-only, server-generated CSV export of **bill-level financial data** for a selected UTC calendar date range. Owners and managers download from the Reports page. No accounting engine, integrations, or schema changes.

---

## 2. API

```http
GET /api/reports/export/bills.csv?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Authorization: Bearer <JWT>   (owner | manager)
```

| Response | Detail                                                                 |
| -------- | ---------------------------------------------------------------------- |
| **200**  | UTF-8 CSV (`text/csv; charset=utf-8`); header + zero or more data rows |
| **400**  | Missing/malformed dates, reversed range, or range > 93 days            |
| **403**  | Cashier, waiter, chef, or other non-manager roles                      |
| **401**  | Unauthenticated                                                        |

**Filename:** `operavia-sales-{start_date}-to-{end_date}.csv` (Content-Disposition attachment).

---

## 3. Authorization

Same as other `/api/reports/*` routes: `requireRole('owner', 'manager')`. Export is mounted only when the `reporting` module is enabled (shared commerce module — Restaurant and Retail).

---

## 4. Date semantics

| Param        | Required | Format       |
| ------------ | -------- | ------------ |
| `start_date` | yes      | `YYYY-MM-DD` |
| `end_date`   | yes      | `YYYY-MM-DD` |

**Window:** half-open UTC interval via `utcDayBounds()`:

```
[start_date 00:00:00 UTC, end_date + 1 day 00:00:00 UTC)
```

Filter: `bills.created_at >= windowStart AND bills.created_at < endExclusive`.

**Maximum range:** 93 inclusive calendar days.

This matches `/summary`, `/sales`, and `/tax-components` — **not** tenant-local day-close boundaries.

---

## 5. CSV schema (exact header order)

```
date,bill_number,bill_id,order_id,bill_status,gross_sales,discount,tax,net_sales,refunds,payments_received,payment_summary
```

| Column              | Source                                | Semantics                                       |
| ------------------- | ------------------------------------- | ----------------------------------------------- |
| `date`              | `substr(bills.created_at, 1, 10)`     | UTC calendar date of bill creation              |
| `bill_number`       | `bills.bill_number`                   | Display bill number                             |
| `bill_id`           | `bills.id`                            | Primary key                                     |
| `order_id`          | `bills.order_id`                      | Linked order                                    |
| `bill_status`       | `bills.payment_status`                | e.g. `paid`, `partially_refunded`               |
| `gross_sales`       | `bills.total`                         | Sale value before refunds                       |
| `discount`          | `bills.discount_amount`               | Bill discount                                   |
| `tax`               | `bills.tax_amount`                    | Stored tax (v1; no component breakdown)         |
| `net_sales`         | `bills.paid_amount`                   | Net collected after refunds                     |
| `refunds`           | `SUM(refunds.amount)`                 | Completed refunds only (`status = 'completed'`) |
| `payments_received` | Sum of `payment_details` line amounts | Gross tender (Payments Received)                |
| `payment_summary`   | Aggregated `payment_details`          | e.g. `card:60.00\|cash:40.00` (methods sorted)  |

**One row per bill.** No tender-level, refund-level, or tax-component rows.

---

## 6. Money semantics

- **Format:** decimal dollars, fixed `.`, two fractional digits (`10.00`, `0.00`).
- **No** REAL→cents migration, new rounding, or locale formatting.
- **Gross / Net:** per [reporting-financial-semantics.md](../15-project-management/reporting-financial-semantics.md).
- **Payments Received:** sum of `payment_details` JSON line amounts — **not** `paid_amount`, **not** `total − refunds`. Unchanged after partial refund.
- **Refunds:** aggregated in SQL before join; pending/failed/voided excluded.

---

## 7. Implementation map

| Layer             | File                                               |
| ----------------- | -------------------------------------------------- |
| CSV escaping      | `main/lib/csv.ts` (`toCsvRow`)                     |
| Export service    | `main/services/bills-csv-export.ts`                |
| HTTP route        | `main/routes/reports.ts` → `GET /export/bills.csv` |
| Frontend download | `frontend/src/lib/accounting-csv-export.ts`        |
| Reports UI        | `frontend/src/app/(dashboard)/reports/page.tsx`    |
| Tests             | `tests/phase-4.4-accounting-csv-export.test.ts`    |

---

## 8. Vertical behavior

| Vertical       | Status                                           |
| -------------- | ------------------------------------------------ |
| **Restaurant** | PASS — shared `reporting` module                 |
| **Retail**     | PASS — same endpoint; no restaurant-only columns |

---

## 9. Schema / money-path impact

- **Schema:** none (v75 unchanged).
- **Money path:** read-only SELECT; no bill/refund/payment mutations.
- **Transaction ownership:** unchanged.

---

## 10. Performance

Single SQL query with pre-aggregated refunds subquery. Range capped at 93 days. Order: `bills.created_at ASC, bills.id ASC`.

---

## 11. Tests

```sh
npm run test:phase-4.4
```

Covers: CSV escaping, money formatting, payment/refund aggregation, UTC boundaries, authorization, HTTP contract, frontend wiring, empty export.

Regression: financial-reporting-semantics, day-close, phase-4.2-refund-restock, restaurant/retail isolation.

---

## 12. Known limitations

- Reports UI start/end date (Phase 4.8); 93-day cap unchanged.
- UTC day boundaries only (tenant-local export would need ADR).
- Tax column is `bills.tax_amount` only — no tax-component breakdown.
- Export includes all bills in window regardless of `payment_status` (bill-level ledger view).

---

## Verdict

**PHASE 4.4 COMPLETE** — read-only bill-level accounting CSV export implemented per discovery contract.

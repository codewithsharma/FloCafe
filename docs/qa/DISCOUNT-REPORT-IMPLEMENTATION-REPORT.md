# P7 — Discount Report (RPT-DISC) Implementation Report

**Date:** 2026-08-21  
**Feature ID:** RPT-DISC  
**Schema tip:** **v88** (unchanged — no migration)  
**Baseline:** P1.1 `8111878` · P2 `b16f579` · P4 `cd2304f` · P5 `a323b19` · P6 `4541dcb`  
**Status:** **Implemented / Hardening verified** (automated). Live pilot remains **NO-GO** (R16).

---

## 1. Feature Summary

Adds a period **Discount Report** with:

- Total discounts (order-level + item-level layered comps)
- Discounted bill count and average discount
- Breakdown by type (percentage / amount), source (manual / coupon), and scope (order / item)
- Merchandise subtotal context and discounted merchandise
- JSON API + CSV export + Reports UI panel

Existing order/bill/item discount fields remain the source of record. No parallel discount ledger. No discount-engine redesign.

---

## 2. Existing Discount Architecture

| Concern           | Location                                                         |
| ----------------- | ---------------------------------------------------------------- |
| Order-level apply | `main/services/order-discount.ts` → `orders` + unpaid `bills`    |
| Item-level apply  | `main/routes/orders/discount.ts` → `order_items.discount_amount` |
| Coupons (R11)     | `coupons` config → same order discount slot via `apply-coupon`   |
| Settings          | `discount_mode`, max %, max amount, optional manager PIN         |
| Promotions        | **Not implemented** (matrix Planned)                             |

Single order-level discount slot (type/value/reason/amount). Item comps shrink line/order subtotal first; order/coupon discount then applies to that subtotal. Tax is computed after discounts (pre-tax discount).

---

## 3. Source of Record

| Metric                | Source                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Order-level discounts | `bills.discount_amount` on **settled** bills (same settlement filter as `queryDaySalesSemantics`)           |
| Order type / reason   | `bills.discount_type`, `bills.discount_reason`                                                              |
| Item-level discounts  | `order_items.discount_amount` for those bills' orders, excluding `cancelled` / `voided` / `void_adjustment` |
| Sales context         | `queryDaySalesSemantics` (Gross / Refunds / Net **sales**) — context only                                   |

**Authoritative money for the report** is the persisted applied monetary impact on settled bills — not frontend state, not coupon catalog usage counters alone.

---

## 4. Discount Semantics

Report measures **actual applied monetary impact**:

- Order layer: stored `discount_amount` after percentage or fixed calculation
- Item layer: stored item `discount_amount`
- Configured percentage is **not** reported as the money metric; the computed amount is

Coupon vs manual: `discount_reason` starting with `coupon:` → coupon; otherwise manual when an order discount exists.

---

## 5. Report Calculations

```
order_discounts         = Σ bills.discount_amount          (settled, window)
item_discounts          = Σ order_items.discount_amount    (active lines, those orders)
total_discounts         = order_discounts + item_discounts
discounted_bill_count   = # settled bills with order discount > 0 OR linked item discount > 0
average_discount        = total_discounts / discounted_bill_count  (0 if none)
merchandise_subtotal    = Σ bills.subtotal                 (pre order-level discount; post item comps)
discounted_merchandise  = merchandise_subtotal − order_discounts
```

---

## 6. Completed / Void / Cancel Handling

| Case                                                                                     | Treatment                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------- |
| Discounted settled (paid / partially_refunded / refunded / collectible-complete partial) | **Included**                        |
| Discounted unpaid then cancelled                                                         | **Excluded** (never settles)        |
| Item void / void_adjustment negatives                                                    | **Excluded** from item discount sum |
| Abandoned drafts                                                                         | Excluded (not settled)              |

---

## 7. Refund Treatment

Refunds are tender-only (`refunds` table). They **do not** rewrite `discount_amount`.

```
Original sale discount stays on the bill
Refund amount appears in sales.refunds / payment report — not as discount reversal
```

Chosen rule: Discount report = discounts applied at sale time on settled bills; Payment/refund reports = subsequent cash reversal.

---

## 8. Discount Types and Breakdown

| Breakdown            | Supported? | Notes                                  |
| -------------------- | ---------- | -------------------------------------- |
| percentage vs amount | Yes        | Order-level `discount_type` only       |
| manual vs coupon     | Yes        | Via `discount_reason` prefix `coupon:` |
| order vs item scope  | Yes        | Separate layers                        |
| Named promotions     | No         | Promotions engine not built            |
| Employee attribution | No         | Audit-only; not first-class on bills   |

---

## 9. Date / Timezone Behavior

Reuses P6 / voids / ops-finance contract:

- `utcDayBounds` half-open UTC calendar days (`YYYY-MM-DD` → `[start, end)`)
- Bill window: `bills.created_at`
- UI date pickers remain local calendar strings interpreted as UTC days (Phase 4.8)

---

## 10. Filters

| Filter                                         | Status                                    |
| ---------------------------------------------- | ----------------------------------------- |
| `start_date` / `end_date`                      | Supported; inverted → 400                 |
| Discount type / source / employee / order type | **Not** in this slice (document as later) |

---

## 11. RBAC / Tenant Isolation

`requireRole('owner', 'manager')` on JSON + CSV. Cashier / waiter / chef → 403. Single-store SQLite — no cross-tenant surface.

Discount **application** permissions unchanged (owner/manager; cashier can apply coupons).

---

## 12. API

| Endpoint                                         | Role                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| `GET /api/reports/discounts?start_date&end_date` | Owner/Manager                                     |
| `GET /api/reports/export/discounts.csv`          | Owner/Manager + audit `report.discounts_exported` |

Payload: `{ discounts: DiscountReport }`.

---

## 13. UI / UX

Reports page panel **Discount report**: summary tiles, type/source/scope tables, empty state  
(“No discounts were applied during this period.”), CSV export. Uses existing date range controls. i18n en/es/pt.

---

## 14. Export

CSV via `discountReportToCsv` — summary + type/source/scope rows. Empty range = header only. Totals match JSON API (suite asserts parity).

---

## 15. Reconciliation

| View                     | Relationship                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| App Gross / Net sales    | `SUM(bill.total)` / `paid_amount` — **post-discount** (incl. tax). **Not** `Gross − Discount = Net` merchandise. |
| `discounted_merchandise` | `merchandise_subtotal − order_discounts` (pre-tax order-discounted base)                                         |
| Payment report           | Independent tender/refund ledger                                                                                 |

Mismatch is intentional and documented in UI note.

---

## 16. Performance

Aggregation over settled bills in the date window + item sum by order_id set. No full-table load of all historical orders into Node for grouping beyond the window. No new indexes (same settlement path as day sales).

---

## 17. Tests

`npm run test:rpt-disc` — empty range, fixed, percentage, coupon, item+order stack, cancel exclusion, refund non-reversal, reconciliation identity, RBAC, inverted dates, CSV↔JSON, audit, FE source contracts.

---

## 18. Regression Results

| Suite                                  | Result                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:rpt-disc`                | PASS                                                                                                                                                            |
| `npm run test:rpt-pay`                 | PASS                                                                                                                                                            |
| `npm run test:inv-auto-86`             | PASS                                                                                                                                                            |
| `npm run test:kds-h-outbox`            | PASS                                                                                                                                                            |
| `tests/security-hardening.test.ts`     | PASS                                                                                                                                                            |
| `npm run test:discover-guard`          | PASS (244 classified)                                                                                                                                           |
| `npm run test:merge`                   | PASS with 1 flake: `issue-125-addon-read-paths` failed once under tier runner (`isModuleEnabled is not a function`); solo re-run **27/27 PASS** — not P7-caused |
| `npm run build`                        | PASS                                                                                                                                                            |
| `npm run build:frontend`               | PASS                                                                                                                                                            |
| Full `npm run lint`                    | **12 errors / 9 warnings** — same baseline as pre-P7; P7 introduced **0** new errors                                                                            |
| Backend eslint on `discount-report.ts` | clean; `reports.ts` pre-existing `any` warnings only                                                                                                            |

---

## 19. Known Limitations

- No employee / order-type / named-promotion filters (data incomplete or feature absent)
- Item discounts have no persisted type/value — only amount; type breakdown is order-level only
- `POST /bills/:id/applyDiscount` historically lacks audit (pre-existing debt) — report still reads bill money fields
- App “Gross Sales” is not pre-discount merchandise

---

## 20. Acceptance Criteria

See final P7 status response checklist (PASS / FAIL / DEFERRED).

---

## 21. Final Status

**Implemented / Hardening verified** (automated evidence). Not Production-ready / live GO (R16 still blocked).

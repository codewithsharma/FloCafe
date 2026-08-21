# P6 — Payment Report Deepening (RPT-PAY) Implementation Report

**Date:** 2026-08-21  
**Feature ID:** RPT-PAY  
**Schema tip:** **v88** (unchanged — no migration)  
**Baseline:** P1.1 `8111878` · P2 `b16f579` · P4 `cd2304f` · P5 `a323b19`  
**Status:** **Implemented / Hardening verified** (automated). Live pilot remains **NO-GO** (R16).

---

## 1. Feature Summary

Deepened the thin “Payment Methods” mix into a period **Payment Report** with:

- Payments Received (gross tender)
- Refunds (completed)
- Net payments
- Breakdown by tender method
- JSON API + CSV export + Reports UI panel

Existing bill tender JSON and refunds table remain the source of record. No parallel ledger.

---

## 2. Existing Payment Architecture

| Concern           | Location                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| Tender apply      | `main/services/payment-tender.ts` → `bills.payment_details` JSON array |
| Catalog methods   | `payment_methods` + built-ins `cash` / `card` / `wallet`               |
| Refunds           | `refunds` table (v72); does **not** rewrite `payment_details`          |
| Shift cash        | `getShiftPaymentSummary` — cash lines − cash refunds by `shift_id`     |
| Prior thin report | `paymentMethodBreakdown` on daily-stats / summary / sales              |

---

## 3. Source of Record

| Metric            | Source                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| Payments Received | `bills.payment_details` line `amount` via SQL `json_each`                       |
| Refunds           | `refunds.amount_cents` where `status = 'completed'`                             |
| Net payments      | Received − Refunds (independent UTC windows)                                    |
| Sales context     | `queryDaySalesSemantics` (Gross/Refunds/Net **sales**) — shown for context only |

---

## 4. Payment Status Semantics

Tender history includes lines on bills in any payment status when expanding `payment_details` (`paidOnly=false`, same as daily-stats).

Sales window still uses settled/collectible-complete bills per FIN-02 / day-sales-semantics.

**Failed tenders** never write `payment_details` (HTTP error + rollback).  
**Voided payment lines** do not exist — voids/cancels adjust order/bill totals, not tender history.

---

## 5. Refund Treatment

Refunds are separate `refunds` rows. After a partial refund:

```
Payments Received = original gross tender (unchanged)
Refunds           = refund amount in window
Net payments      = received − refunds
```

Refund method attribution uses `refunds.method` (refund tender).

---

## 6. Split / Partial Payment Handling

Multiple lines in one batch and sequential partials both append to `payment_details`. Report sums **lines**, not bill totals — split cash+card correctly attributes each method without double-counting the order.

---

## 7. Report Calculations

```
payments_received = Σ payment_details.amount (payment_time in [start, end))
refunds           = Σ refunds.amount_cents/100 (created_at in [start, end))
net_payments      = payments_received − refunds
```

Per-method rows merge payment and refund maps by method name (catalog name preferred).

---

## 8. Date / Timezone Behavior

Reuse `utcDayBounds` half-open UTC calendar days (`YYYY-MM-DD` → `[start, end)`). Same contract as voids / ops-finance / bills CSV. UI date pickers remain local calendar strings interpreted as UTC days (Phase 4.8).

---

## 9. Filters

Supported: `start_date`, `end_date` (validated; inverted → 400).  
Not in this slice: shift filter, employee filter, order-type filter (document as later).

---

## 10. RBAC / Tenant Isolation

`requireRole('owner', 'manager')` on JSON + CSV. Cashier/waiter/chef → 403. Single-store SQLite — no cross-tenant surface.

---

## 11. API

| Endpoint                                        | Role                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| `GET /api/reports/payments?start_date&end_date` | Owner/Manager                                    |
| `GET /api/reports/export/payments.csv`          | Owner/Manager + audit `report.payments_exported` |

Payload: `{ payments: PaymentReport }`.

Daily-stats / summary / sales still call `queryPaymentsReceivedByMethod` via a thin wrapper (no semantic drift).

---

## 12. UI / UX

Reports page panel **Payment report**: summary tiles, method table, empty states, CSV export. Uses existing date range controls. i18n en/es/pt.

---

## 13. Reconciliation

| View                    | Relationship                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Sales Gross/Refunds/Net | Same refund ledger; sales ≠ payments received                                                |
| Shift expected cash     | Uses `bills.shift_id` + cash qualifier — **not** payment-time window; intentional difference |
| Day-close Z             | Cash drawer snapshot — not full tender mix                                                   |

Documented in UI note and this report.

---

## 14. Performance

Aggregation in SQLite (`json_each` + GROUP BY). No in-memory load of all bills. No new indexes (existing JSON path already used by daily-stats).

---

## 15. Tests

`npm run test:rpt-pay` — empty range, cash, split tender, partial refund semantics, RBAC, inverted dates, CSV↔JSON parity, audit, FE source contracts.

---

## 16. Regression Results

| Suite                              | Result                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `npm run test:rpt-pay`             | PASS (44)                                                                       |
| `npm run test:financial-reporting` | PASS (34/34)                                                                    |
| `npm run test:inv-auto-86`         | PASS                                                                            |
| `npm run test:kds-h-outbox`        | PASS (23)                                                                       |
| `npm run test:critical`            | PASS (24/24 suites)                                                             |
| P2 cors / JWT / helmet (vitest)    | PASS                                                                            |
| `npm run lint:backend`             | PASS (0 errors; warnings only)                                                  |
| `npm run lint` (full)              | FAIL — **12 frontend errors / 9 warnings** (pre-existing; not introduced by P6) |
| `npm run build`                    | PASS                                                                            |
| `npm run build:frontend`           | PASS                                                                            |

---

## 17. Known Limitations

- No shift / employee / order-type filters on this report
- Refund-by-method uses refund tender method, not always `original_method`
- Full lint remains red on pre-existing frontend React Compiler rules (baseline debt)
- Live café pilot still NO-GO (R16)

---

## 18. Acceptance Criteria

See P6 final response checklist.

---

## 19. Final Status

**Implemented / Hardening verified** for RPT-PAY automated scope.  
**Not** claimed Production-ready / live GO.

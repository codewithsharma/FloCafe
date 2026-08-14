# Reporting financial semantics

**Status:** Canonical contract (P0.2 financial hardening)  
**Date:** 2026-08-12 (updated 2026-08-14 — FIN-02 collectible-complete `partial` Gross/Net)  
**Scope:** How report fields map to money. Do not treat `paid_amount` and `payment_details` as interchangeable.

---

## Definitions

| Concept               | Meaning                                    | Primary source                                                                                                                                                                                |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gross Sales**       | Sale value of settled bills before refunds | `SUM(bills.total)` where `payment_status IN ('paid','partially_refunded','refunded')` **or** `payment_status = 'partial'` and FIN-01 collectible is 0 (`SUM(payment_details.amount) ≥ total`) |
| **Refunds**           | Completed refund outflow in the window     | `SUM(refunds.amount_cents) / 100` (`status = 'completed'`)                                                                                                                                    |
| **Net Sales**         | Sales after refunds                        | `Gross Sales − Refunds` ≈ `SUM(bills.paid_amount)` for those included bills                                                                                                                   |
| **Payments Received** | Gross tender / payment activity by method  | Sum of `payment_details` line amounts (`paymentMethodBreakdown`)                                                                                                                              |
| **Net Cash Movement** | Drawer cash truth                          | `cash in − cash refunds` (see `main/services/shift.ts` expected cash)                                                                                                                         |

### Expected relationships

```
Gross Sales − Refunds = Net Sales

Cash In − Cash Refunds = Net Cash Movement
```

Payments Received may stay at the original tender total after a partial refund (for example Sale ₹1,000 / Refund ₹300 → Payments Received ₹1,000, Net Sales ₹700). That is intentional: tender history is not rewritten when refunds post.

### Collectible outstanding (FIN-01)

```
gross_successful_tender = SUM(payment_details line amounts)
net_paid                = gross_successful_tender − completed_refunds   (= bills.paid_amount)
collectible outstanding = bill_total − gross_successful_tender
```

Refunds reduce net paid and cash reconciliation. They **never** recreate payment capacity.  
Example: total ₹1,000 → pay ₹600 → refund ₹200 → gross ₹600, net ₹400, collectible ₹400 (not ₹600).

Payment eligibility in `preparePaymentBatch` uses **gross** tender for remaining balance (`BILL_NO_OUTSTANDING_BALANCE` when collectible ≤ 0).

---

## Field map (current APIs)

| Endpoint field                                               | Semantics                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GET /daily-stats` → `sales`                                 | Legacy: `SUM(paid_amount)` over **all** bills created that day (includes unpaid zeros). Prefer `netSales`.  |
| `GET /daily-stats` → `grossSales` / `refunds` / `netSales`   | Settled-bill Gross / Refunds / Net for the UTC day                                                          |
| `GET /daily-stats` → `paymentMethods`                        | Payments Received (gross tender)                                                                            |
| `GET /summary` → `bills.collected`                           | Legacy all-bills `SUM(paid_amount)`                                                                         |
| `GET /summary` → `bills.grossSales` / `refunds` / `netSales` | Settled-bill Gross / Refunds / Net                                                                          |
| `GET /summary` → `paymentMethods`                            | Payments Received (gross tender)                                                                            |
| `GET /sales` → `byPaymentMethod`                             | Payments Received for bills that settled (`paid` / `partially_refunded` / `refunded`)                       |
| Day close → `cash_payment_total_cents`                       | **Cash In** — qualifying cash tender on closed shifts (`getShiftPaymentSummary`)                            |
| Day close → `cash_refund_total_cents`                        | **Cash Refunds** — completed `method=cash` refunds on those shifts                                          |
| Day close → `net_cash_movement_cents`                        | **Net Cash** = Cash In − Cash Refunds (excludes opening float)                                              |
| Day close → `expected_cash_cents_total`                      | Sum of **persisted** shift `expected_cash_cents` (already includes float + cash in − cash refunds at close) |

---

## Do not confuse

- **`bills.paid_amount`** — net collected after refunds (Net Sales building block).
- **`bills.payment_details`** — original payment lines (Payments Received / gross tender). Refunds do not remove these lines.
- **Collectible outstanding** — `bill_total − gross tender`, **not** `bill_total − paid_amount` (FIN-01).
- **Order `SUM(total)` series on `/sales`** — order volume, not bill Net Sales.

---

## Out of scope

No full reporting redesign, accounting ledger, or REAL→cents migration in this contract.

# Staff Performance Report — Implementation Report

## 1. Status

**COMPLETE** (Implemented / Hardening verified)

- Feature: Staff Performance Report
- Feature ID: `RPT-STAFF`
- Phase: P9
- Commit: `7bdb66c` (`7bdb66cadd1d1a6e506d2917efb35bf0a6fe21d8`)
- Schema version: **v88** (no bump)

Live pilot / production remains **NO-GO** pending R16 human and release gates.

## 2. Feature

Owner/Manager staff activity and performance report built only on **persisted attribution fields**. Labels distinguish order creator, payment audit actor, refund actor, and shift openers. No invented cashier/waiter commission model.

## 3. Data attribution model

| Metric                       | Source                                                                | Staff identity                                                        | Included?     |
| ---------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------- |
| Orders created               | `orders`                                                              | `orders.user_id` (exclude `cancelled`, exclude `usr-system-qr-guest`) | Yes           |
| Sales from orders created    | settled `bills.total` joined to `orders.user_id`                      | Order **creator** (not cashier/waiter)                                | Yes (labeled) |
| Payments received            | `audit_logs` `payment.received`                                       | `actor_user_id` + `metadata.amount_cents`                             | Yes           |
| Refunds processed            | `refunds` (`status=completed`)                                        | `created_by`                                                          | Yes           |
| Discounts applied (events)   | `audit_logs` `order.discount_applied` / `order.item_discount_applied` | `actor_user_id`                                                       | Yes (counts)  |
| Voids / cancellations        | `audit_logs` R12 actions                                              | `actor_user_id`                                                       | Yes (counts)  |
| Shifts opened / closed       | `shifts`                                                              | `opened_by_user_id` / `closed_by_user_id`                             | Yes           |
| Payment line cashier         | `bills.payment_details`                                               | _(none)_                                                              | **No**        |
| Waiter-attributed sales      | `tables.assigned_waiter_id`                                           | Mutable live floor only                                               | **No**        |
| Attendance / hours           | —                                                                     | —                                                                     | **No**        |
| Tips / commissions / payroll | —                                                                     | —                                                                     | **No**        |

API `attribution` object documents each metric’s field semantics for clients.

## 4. Financial semantics

| Concern            | Rule                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Sales source       | Settled bills (`paid` / `partially_refunded` / `refunded` / collectible-complete `partial`) — same as day-sales / RPT-DISC |
| Sales attribution  | Bill total → **order creator** (`orders.user_id`)                                                                          |
| Discount treatment | Sales are post-discount bill totals (incl. tax where present); discount **events** counted separately via audit            |
| Refund treatment   | Shown separately (`refunds_*`); **do not** reduce `sales_from_orders_created`                                              |
| Cancelled orders   | Excluded from `orders_created`; cancel actors counted in `voids_cancels_count`                                             |
| Tax                | Included in settled bill total (same as FIN-02 / day-sales gross)                                                          |
| Window             | UTC half-open day bounds via `utcDayBounds`                                                                                |

## 5. API

| Route                               | Auth           | Notes                                                |
| ----------------------------------- | -------------- | ---------------------------------------------------- |
| `GET /api/reports/staff`            | Owner, Manager | Query: `start_date`, `end_date`, optional `staff_id` |
| `GET /api/reports/export/staff.csv` | Owner, Manager | CSV; audits `report.staff_exported`                  |

- Invalid / missing dates → today (same `reportDate` helper as P6/P7)
- `start_date > end_date` → **400**
- Cashier / Waiter / Chef → **403**
- Unknown `staff_id` → empty `by_staff` (no invented zeros for strangers)

Response wrapper: `{ staff: StaffReport }`.

## 6. Tests

```sh
npm run test:rpt-staff
```

**PASS** — attribution separation, sales/refund semantics, historical integrity, RBAC (5 roles), date bounds, staff filter, CSV parity, FE contracts, schema tip v88.

## 7. Regression results

| Suite                       | Result       |
| --------------------------- | ------------ |
| `npm run test:rpt-staff`    | PASS         |
| `npm run test:critical`     | PASS (24/24) |
| `npm run test:phase2`       | PASS         |
| `npm run test:kds-h-outbox` | PASS         |
| `npm run test:inv-auto-86`  | PASS         |
| `npm run test:rpt-pay`      | PASS         |
| `npm run test:rpt-disc`     | PASS         |
| `npm run test:kds-alerts`   | PASS         |
| `npm run build`             | PASS         |
| `npm run build:frontend`    | PASS         |

Targeted eslint on changed staff files: **0 new errors**. Full lint baseline debt unchanged (pre-existing frontend React Compiler issues).

## 8. Known limitations

- No reliable **payment processor** column on tender lines; payments use audit actors.
- No historical **waiter sales** (assigned waiter is live floor state).
- No **attendance**, tips, commissions, or payroll.
- Discount **money** by staff is not claimed; only applied-event counts (money stays in RPT-DISC).
- QR guest system user excluded from staff rows.

## Documentation / inventory

- Feature list: Staff report (RPT-STAFF) `[BUILT]`
- Capability matrix: Staff report 🟢 Existing
- Feature inventory: RPT-13 Existing

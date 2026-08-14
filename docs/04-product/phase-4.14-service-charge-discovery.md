# Phase 4.14 — Configurable Service Charge Discovery

**Date:** 2026-08-14  
**Status:** COMPLETE (paper only — **no implementation**)  
**Schema:** v75 — **unchanged**  
**ADR:** [ADR-014](../14-decisions/ADR-014-service-charge.md) **Proposed** (human Accept required before any wiring)

---

## Why an ADR

Tax already knows `ChargeTaxKind = 'service_charge'`. Order create **hardcodes `service_charge: 0`**. There is **no** `orders.service_charge` or `bills.service_charge` amount column. Wiring a non-zero amount is a money path (totals, tax snapshot, FIN-01, refunds, CSV, day-close). Tips remain out of scope.

---

## Schema v75 facts

| Exists                                                                   | Missing                                   |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| `orders.service_charge_tax_category_id`                                  | **No** `orders.service_charge` amount     |
| `orders.packaging_charge`, `orders.delivery_charge` (REAL)               | **No** `bills.service_charge` amount      |
| Tax kind `'service_charge'`; receipts print `bill.service_charge` if > 0 | Amount never persisted                    |
| `bills.delivery_charge` / `packaging_charge`                             | No `bills.service_charge_tax_category_id` |

`db-audit` bill identity is `subtotal + tax + packaging + delivery − discount + round_off` — **no service_charge**.

Frontend `Bill.service_charge` is typed but SQLite has no column → always 0 at print/pay.

---

## Money-path map (today)

| Surface       | Behavior                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Order create  | `chargeContext.service_charge: 0`; INSERT packaging/delivery amounts only                                 |
| Order total   | `subtotal + exclusiveTax + delivery + packaging` — **no service**                                         |
| Zod create    | `packaging_charge` / `delivery_charge` only; `.passthrough()` so a client `service_charge` is **ignored** |
| Tax preview   | **Does** accept `service_charge` and taxes it                                                             |
| Bill generate | Copies delivery + packaging only                                                                          |
| Receipt       | Prints service charge if `bill.service_charge > 0` (never true)                                           |
| PaymentModal  | No service-charge row                                                                                     |
| Refund        | `createBillRefund` uses `bill.total`; charge is inside total if it existed                                |
| FIN-01        | Collectible = `total − gross tender`. Raising total raises collectible                                    |

Analog: `delivery_charge` is stored on orders + bills, taxed via frozen category id, included in totals, copied on generate, weight-allocated on split, preserved on item cancel.

---

## Retail isolation

POS does **not** send `service_charge` today (postpaid/prepaid payloads have type/items only). Shared tax module **is** on Retail. If a future Settings toggle is added without a restaurant/tables (or dine-in) gate, Retail **would** start sending it. Preview would tax it.

**Fail-closed:** Retail POS must not send an amount. Server should ignore/reject when restaurant floor / tables / explicit setting is off.

---

## Characterization commands (future wiring, not this phase)

```sh
node tests/run-electron-node-test.cjs tests/tax-pack-management.test.ts
node tests/run-electron-node-test.cjs tests/schema-health.test.ts
node tests/run-electron-node-test.cjs tests/upgrade-path.test.ts
node tests/run-electron-node-test.cjs tests/issue-24-cancel-item-checkout.test.ts
```

---

## Recommendation

See **ADR-014**. Wiring requires **v76+** amount columns (or an invented snapshot-only path — rejected). This phase does not migrate.

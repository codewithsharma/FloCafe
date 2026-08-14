# Phase 2.18 — Synthetic Retail Validation

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Depends on:** [2.17 restaurant isolation](phase-2.17-restaurant-isolation.md), [2.15 payment](phase-2.15-payment-domain-boundary.md), [2.5 composition](phase-2.5-vertical-composition-validation.md)  
**Code:** `main/modules/fixtures/retail-test-vertical.ts`  
**Tests:** `tests/synthetic-retail-composition.test.ts`, `tests/shared-module-vertical-neutrality.test.ts`, `tests/synthetic-retail-sale.test.ts`

## 1. Purpose

Strengthen `retail-test` as an **architecture validation fixture**, not a production vertical.

Prove: the same shared modules (Customer, Product, Inventory, Order, Payment, Tax, POS, …) can be composed **without** Restaurant modules — so future Operavia Retail does not copy Restaurant business logic.

Also prove a complete takeaway money path (Product → Inventory → Order → Tax → Bill → Payment → historical snapshot) succeeds without tables/KDS/addons.

## 2. CURRENT

| Fact                    | Value                                 |
| ----------------------- | ------------------------------------- |
| Id                      | `retail-test`                         |
| Name                    | Operavia Retail Test                  |
| Version                 | `0.0.0-test`                          |
| In `VERTICALS`          | **No**                                |
| `ACTIVE_VERTICAL_ID`    | Still `restaurant`                    |
| API `?verticalId=`      | Ignored (always restaurant)           |
| `business_type` mapping | `retail` / `retail-test` → restaurant |

Enabled modules (17): core, customer, product, category, inventory, pos, order, payment, refund, tax, shift, staff, loyalty, reporting, printing, notification, backup.

Explicitly excluded: tables, kitchen, kds, menu, addons.

## 3. What 2.18 proves

| Suite            | Proof                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Composition      | retail-test not in `VERTICALS`; shared modules compose; restaurant-only excluded |
| Neutrality       | catalog shared ↛ restaurant; Order/Payment soft-gates present                    |
| **Sale E2E**     | takeaway create → tax → bill → pay → stock delta; no tables seeded               |
| **Historical**   | product name/SKU/price/tax mutate after paid sale → order/bill snapshots frozen  |
| **Idempotency**  | same `Idempotency-Key` replay does not double-collect                            |
| **Stock reject** | oversell rejected; stock unchanged                                               |

Companion: `payment-without-restaurant.test.ts`, `order-restaurant-isolation.test.ts`.

## 4. Retail checkout flow (characterized)

```
Product (tax_category_id / tax_behavior + tracked stock)
  → Order takeaway (no table_id) — Inventory decrement inside Order txn
  → Tax facade at write — snapshot on order_items / order
  → Bill generate
  → Payment apply (mandatory Idempotency-Key)
  → Order completed
```

Restaurant capabilities are absent from the sale path (no table rows, no KDS/addon requirements). Production ACTIVE remains restaurant; soft-gates skip restaurant side effects when modules/table_id absent.

## 5. Financial invariants (sale fixture)

| Field        | Example (dual-rate exclusive pack) |
| ------------ | ---------------------------------- |
| Unit price   | ₹1000                              |
| Qty          | 2                                  |
| Subtotal     | ₹2000                              |
| Tax          | ₹100 (5%)                          |
| Total / bill | ₹2100                              |
| Stock        | 10 → 8                             |

## 6. Limitations

| Topic                                 | Status                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Application restart / userdata reload | **Not tested** in this suite (same DB process)                           |
| Runtime ACTIVE switch to retail-test  | **Not done** (by design — synthetic composition only)                    |
| Fail-closed restaurant route unmount  | **Phase 3**                                                              |
| Production Operavia Retail vertical   | **Phase 3**                                                              |
| Insufficient-stock HTTP status        | Characterized as `>= 400` (may be 500 today if Error lacks `statusCode`) |

## 7. TARGET vs DEFERRED

| CURRENT                                       | TARGET (Phase 3)                    | DEFERRED                         |
| --------------------------------------------- | ----------------------------------- | -------------------------------- |
| Synthetic composition + soft gates + sale E2E | Production Operavia Retail vertical | Fail-closed route unmount        |
| Static Express mounts                         | Optional HTTP gating by vertical    | Tenant / runtime vertical switch |
| dine-in remains an order type                 | Retail order types as needed        | Custom builder / marketplace     |

## 8. Architectural success criterion

> Can the same shared modules be composed into a non-Restaurant vertical without copying Restaurant business logic, and can a Retail-style takeaway sale complete without Restaurant?

**Catalog + soft-gated side effects + takeaway money path: YES.**  
**Production Retail product: NO (not this phase).**

```sh
npm run test:synthetic-retail
```

## 9. Related

- [phase-2.5-vertical-composition-validation.md](phase-2.5-vertical-composition-validation.md)
- [phase-2.17-restaurant-isolation.md](phase-2.17-restaurant-isolation.md)
- [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md)

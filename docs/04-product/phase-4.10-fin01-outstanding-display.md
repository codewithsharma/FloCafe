# Phase 4.10 — FIN-01 Collectible Outstanding Display

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**  
**Money writes:** none (`UPDATE bills` / `payment_status` not touched)

---

## Summary

Orders and PaymentModal now show **collectible outstanding** (`bill_total − gross successful tender` from `payment_details`) instead of net `bill.balance` after refunds. Pay/Checkout is hidden when collectible is 0 even if net balance is still > 0. Stored `payment_status` is unchanged. `BILL_NO_OUTSTANDING_BALANCE` is unchanged.

Canonical example (reporting-financial-semantics §19): total 1000, pay 600, refund 200 → collectible **400**, net balance **600**. Full tender then refund → collectible **0**.

---

## Helper

`frontend/src/lib/bill-collectible.ts`

- `collectibleOutstanding(bill)` — major units (REAL)
- `hasCollectibleOutstanding(bill)` — Checkout/Pay gate

Derivation is frontend-only from existing GET bill JSON. No DTO field.

---

## UI

| Surface                      | Change                                                    |
| ---------------------------- | --------------------------------------------------------- |
| Orders `showCheckout`        | Requires collectible > 0 when a bill exists               |
| `OrderCard` partial row      | **Collectible** instead of net Balance                    |
| `PaymentModal` remaining due | `collectibleOutstanding(bill)` not `Number(bill.balance)` |

i18n: `orders.collectible` (en/es/pt). `orders.balance` kept.

---

## Tests

`npm run test:phase-4.10` · `npm run test:refunds`

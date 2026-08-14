# Phase 4.2 — Retail Returns & Restock

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**  
**ADR:** [ADR-011](../14-decisions/ADR-011-refund-restock-policy.md) — **Accepted**

**Related:** [discovery](phase-4.2-retail-returns-restock-discovery.md) · [ADR-009](../14-decisions/ADR-009-refund-model.md) · [Phase 4.1](phase-4.1-retail-floor-usability.md)

---

## Summary

Retail / retail-test can optionally restock merchandise **after** a successful money refund, with **explicit** `order_item_id` + `quantity`. Restaurant remains money-only. Money semantics (FIN-01, day-close, tax snapshots, refund idempotency) are unchanged.

## API

```http
POST /api/refunds/:refundId/restock
Idempotency-Key: <required, distinct from money-refund key>
Content-Type: application/json

{ "order_item_id": "<id>", "quantity": <positive number> }
```

Mounted only under `/api/refunds`. Money refund remains `POST /api/bills/:id/refund`.

## Inventory ledger

| Field                            | Value                                       |
| -------------------------------- | ------------------------------------------- |
| `movement_type`                  | `adjustment`                                |
| `reference_type`                 | `refund`                                    |
| `reference_id`                   | `refund.id`                                 |
| `reason`                         | `refund_restock:order_item:<order_item_id>` |
| `quantity_delta` / `stock_after` | recorded by InventoryService                |

No new movement type. No `refund_items` table.

## Transaction boundary (T2)

1. Money refund commits (`createBillRefund`).
2. Optional restock is a **separate** request/transaction (`createRefundRestock`).
3. Refund success does not depend on restock; UI toasts restock failure separately.

## Idempotency

Restock reuses `refund_idempotency` with a distinct key and request hash (`op: refund_restock`). Remaining restorable qty = line qty − prior `refund_restock` deltas for that order item.

## Verticals

| Vertical             | Money refund | Restock API / UI          |
| -------------------- | ------------ | ------------------------- |
| Restaurant           | Yes          | **403** / hidden          |
| Retail / retail-test | Yes          | Optional explicit restock |

## UI

Orders `RefundDialog` (Retail composition only): checkbox **Restock returned item** + item select + quantity. Never amount→qty inference.

## Tests

- `tests/phase-4.2-refund-restock.test.ts`
- Existing refund / inventory / isolation / FIN-01 / day-close suites remain green

```sh
npm run test:phase-4.2
```

## Out of scope

Exchanges, suppliers/PO, variants, recipes, multi-location, valuation, REAL→cents, FIN-01/day-close redesign, service extraction, P1.6.

# ADR-011: Refund restock / merchandise return policy

**Status:** Accepted  
**Date:** 2026-08-14  
**Deciders:** Product + CTO (approved in principle 2026-08-14)  
**Amends:** [ADR-009](ADR-009-refund-model.md) Consequences — money-only refunds remain the default; **optional** Inventory-owned restock is allowed under this ADR  
**Related:** ADR-008, Phase 2.8 inventory ledger, [phase-4.2 discovery](../04-product/phase-4.2-retail-returns-restock-discovery.md), [phase-4.2 implementation](../04-product/phase-4.2-retail-returns-restock.md)

---

## Context

ADR-009 delivered amount-only money refunds with **no inventory restock**. Retail product completeness requires **RETURN → OPTIONAL RESTOCK** with explicit item identity and quantity (never amount→unit inference).

## Decision (Accepted)

### Policy

1. **B — Optional restock:** Operator must explicitly request restock with **`order_item_id` + `quantity`**.
2. **Q2 + Q4:** Payload carries item identity + qty; **forbid** amount/price/all-lines inference.
3. **L2 — Ledger:** `movement_type = 'adjustment'`, `reference_type = 'refund'`, `reference_id = refund.id`, `reason = refund_restock:order_item:<order_item_id>`.
4. **Verticals:** Restock enabled only when active vertical is **`retail`** or **`retail-test`**. **Restaurant remains money-only.**
5. **T2 — Transaction boundary:** Money refund commits first; restock is a **separate** request/transaction after a successful refund. Refund success does not depend on restock.
6. **Schema:** **v75 unchanged.** No `refund_items` table; no new `movement_type`. Idempotency reuses existing `refund_idempotency` (distinct Idempotency-Key + request hash for restock).

### Verified before Accept

| Concern                                | Finding                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `adjustment` + `reference_type=refund` | Allowed by CHECK; no collision with `manual`/`product` refs if filters use `reference_type` |
| Dedicated movement type                | **Not required** for audit/idempotency                                                      |
| `refund_items` table                   | **Not required** — restock against bill’s order line + reason encodes `order_item_id`       |
| UNIQUE index on movements              | **Not required** — soft idempotency via `refund_idempotency` + remaining-qty cap            |

### API

```http
POST /api/refunds/:refundId/restock
Idempotency-Key: <required, distinct from money-refund key>
Content-Type: application/json

{ "order_item_id": "<id>", "quantity": <positive number> }
```

Mounted only under `/api/refunds` (not `/api/bills`).

### Caps and rejects

- `quantity <= 0` → 400
- Missing `order_item_id` → 400
- Item not on refund’s order → 400
- `voided` / `void_adjustment` / `cancelled` → 400
- Product not tracking inventory → 400
- `quantity > remaining restorable` (line qty − prior refund_restock for that order_item) → 400
- Restaurant (and non-retail verticals) → 403

### Idempotency

Same `Idempotency-Key` + matching request hash → replay stored restock response (no second stock write).  
Natural remaining-qty cap also prevents over-restock without a key.

## Consequences

- Positive: Retail can restock sellable returns without changing FIN-01/tax/day-close money math; Restaurant unchanged; Inventory ownership preserved; schema stays v75.
- Negative: Operators must pick lines/qty; amount-only refunds do not imply stock.
- Out of scope: exchanges, damaged-condition fields, suppliers/PO, REAL→cents, 3.5B/C, P1.6.

## Alternatives rejected

| Alternative               | Why                                          |
| ------------------------- | -------------------------------------------- |
| Always restock (A)        | Damaged goods + F&B                          |
| Full-line heuristic (Q3)  | Void/cancel double-restore risk              |
| New movement_type (L1)    | Unnecessary for first slice                  |
| `refund_items` table (Q1) | Avoidable with order_item_id payload         |
| Atomic money+stock (T1)   | Couples domains; money must stay independent |

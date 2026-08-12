# ADR-009: Refund model (M6)

**Status:** Accepted  
**Date:** 2026-08-12  
**Deciders:** CEO + CTO (Nexora POS mandate); clarifications locked 2026-08-12  
**Supersedes:** n/a  
**Related:** ADR-008 (cash reconciliation), FR-T-02

## Context

Nexora POS records payments on `bills` but has no payment-reversal entity. Voids/cancels adjust order/bill totals only. ADR-008 defines:

```
expected_cash_cents = opening_float + cash_in - cash_refunds
```

with `cash_refunds = 0` until M6.

## Decision

1. Add a first-class **`refunds`** table and **`refund_idempotency`** (schema **v72**).
2. Implement `POST /api/bills/:id/refund` via **`main/services/refund.ts`** (thin route).
3. Reduce `bills.paid_amount`; extend `payment_status` with `partially_refunded` | `refunded`.
4. Attribute `refunds.shift_id` to the **active open shift** at refund time; subtract **cash** refunds only in shift expected-cash computation; **do not** mutate closed shifts’ persisted expected/variance.
5. Require manager/owner PIN for **all** roles (always-on); audit `payment.refunded` inside the same transaction.
6. Refund method must match an existing payment line method; omit → largest tender.
7. `refundable_cents` from payment_details sum minus completed refunds (not mutable paid_amount alone).
8. Card refunds are **record-only** (no gateway). Reuse cents math patterns from `bills.ts`; defer full REAL→cents schema migration (P0.3).
9. No cashback clawback; print/UI deferred.

## Consequences

- Positive: pilots can reverse money safely; recon formula matches ADR-008; audit trail for money-out.
- Negative: hybrid REAL + cents remains until P0.3; no inventory restock/returns; no cashback clawback in MVP; print UI deferred.
- Follow-ups: UI refund dialog; day-close summary refund fields; P0.3 money representation.

## Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Negative `payment_details` lines | Cash qualifier rejects ≤0; weak audit entity |
| Treat void as refund | Does not reverse collected payment |
| Rewrite closed-shift expected on late refund | Breaks ADR-008 immutability |
| Full tax/returns/restock in M6 | Out of scope; speculative |

## Evidence

- `docs/15-project-management/m6-refund-architecture.md`
- `docs/14-decisions/ADR-008-cash-reconciliation-model.md`

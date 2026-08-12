# ADR-008: Shift Cash Reconciliation Model

## Status

**Accepted (M5-A design — 2026-08-12)**  
**Depends on:** ADR-007 (per-terminal shifts), M4-B through M4-E3 (GREEN)  
**Does not implement:** Any application code, migrations, or UI

## Context

M4 delivers per-terminal shift lifecycle with:

- `opening_float_cents` and optional `counted_cash_cents` on close
- Payment attribution via `bills.shift_id` (first payment batch)
- Cash lines in `bills.payment_details` JSON (`method === 'cash'`, applied `amount`)
- M3 audit events: `shift.opened`, `shift.closed`, `shift.force_closed`

M4 **does not** compute expected cash, variance, or day-close snapshots. Schema v69 intentionally omits `expected_cash_cents` and `variance_cents` (verified in `tests/shift-schema.test.ts`).

M5 must answer: *How much cash should be in the drawer, how much was counted, and what is the variance?* — without duplicating payment storage or inventing a parallel reconciliation ledger.

## Decision

Adopt **compute-on-close reconciliation** attached to the existing `shifts` row:

1. **Expected cash** is derived at shift close (and preview) from:
   ```
   expected_cash_cents = opening_float_cents
                       + SUM(applied_cash_cents on bills WHERE shift_id = this shift)
                       - SUM(cash_refund_cents)   // zero until M6
   ```
2. **Variance** is computed when `counted_cash_cents` is provided:
   ```
   variance_cents = counted_cash_cents - expected_cash_cents
   ```
3. **Bill attribution is authoritative** — use `bills.shift_id`, never `orders.shift_id`, for cash math (ADR-007 point 3).
4. **Cash identification** — payment line qualifies iff resolved `method === 'cash'` (strict) **and** applied amount &gt; 0 cents (same predicate as M4-D4 cash gate and cash allocation in `main/routes/bills.ts`).
5. **Applied amount** — use stored `payment_details[].amount` (decimal dollars → integer cents), **not** `tendered_amount` (includes change given back).
6. **Persist on close** — write `expected_cash_cents` and `variance_cents` (nullable when no count) on the `shifts` row inside the same `withTxn()` as close/force-close.
7. **Lifecycle states remain `open` | `closed`** — no new DB status values (`COUNTING`, `RECONCILED`). Reconciliation metadata is columns + audit, not state machine expansion.
8. **Day close** — separate immutable `day_closes` entity (master plan M5) aggregating **closed** shifts for a business date; deferred to M5-G slice after per-shift reconciliation is green.
9. **Refunds** — explicitly **deferred to M6**; M5 formula hardcodes refund term to zero.
10. **No shift reopen** — closed shifts remain immutable for accountability (consistent with M4).

## Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Separate `shift_reconciliations` table | Adds join complexity; one close per shift; `shifts` already has reserved columns in RFC §14.1 |
| Reconcile on every payment | Expensive; drawer count is end-of-shift; partial expected cash is misleading mid-shift |
| Use `orders.shift_id` for cash math | Breaks closed-shift-then-pay case (order shift A, payment shift B) — documented in M4-D impact analysis |
| Store running expected cash on each payment | Duplicates derivable data; drift risk if payment_details repaired |
| Floating-point dollars in reconciliation | Violates existing cents pattern (`opening_float_cents`, `paymentAmountCents`) |
| Require counted cash to close | Product ambiguity — backend already allows NULL; blocks card-only shifts unnecessarily if enforced globally |

## Consequences

### Positive

- Minimal schema: two columns on `shifts` + optional `day_closes`
- Deterministic, reproducible from existing payment rows
- Reuses M4 attribution rules and audit patterns
- M6 refunds plug into formula without redesign

### Negative

- JSON aggregation over `payment_details` per close (acceptable at shift scale; indexed `bills.shift_id`)
- First-payment-wins `bills.shift_id` can mis-attribute cross-terminal partial payments (M4 accepted tradeoff; document in M5 UX)
- Frontend currently **requires** counted cash on close while backend allows NULL — must align in M5-F

## Evidence

- `main/db.ts` v69 — `shifts` without expected/variance columns
- `main/services/shift.ts` — close stores `counted_cash_cents` only
- `main/routes/bills.ts` — `applyPaymentBatch`, cash predicate, `bills.shift_id` stamp
- `docs/15-project-management/m4-shift-management-rfc.md` §10.2, §15
- `tests/shift-bill-payment-integration.test.ts` — dual order/bill shift semantics

## Related

- [`m5-cash-reconciliation-rfc.md`](../15-project-management/m5-cash-reconciliation-rfc.md)
- [`m5-cash-reconciliation-impact-analysis.md`](../15-project-management/m5-cash-reconciliation-impact-analysis.md)
- ADR-007 — per-terminal shift model
- M6 — refunds (cash refund term)
- M8 — cash drawer kick (per-terminal)

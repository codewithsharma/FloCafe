# ADR-012: Retail exchange policy

**Status:** Accepted  
**Date:** 2026-08-14  
**Deciders:** Product + CTO (approved in principle 2026-08-14)  
**Supersedes:** n/a — amends scope boundaries only; does **not** change ADR-009/011 money or restock contracts  
**Related:** [ADR-009](ADR-009-refund-model.md), [ADR-011](ADR-011-refund-restock-policy.md), [phase-4.5 discovery](../04-product/phase-4.5-retail-exchange-discovery.md), [reporting-financial-semantics.md](../15-project-management/reporting-financial-semantics.md)

---

## 1. Context

Phase 4.5 discovery verified that Opervia Retail can compose a merchandise **exchange** from existing commerce operations:

1. `POST /api/bills/:id/refund` — money return (ADR-009)
2. `POST /api/refunds/:refundId/restock` — optional stock return (ADR-011, retail-only)
3. Standard POS checkout — replacement sale (order → bill → payment)

ADR-011 explicitly listed **exchanges out of scope**. Retail product depth now requires a locked policy for how those legs combine without redesigning money, tax, inventory ownership, or FIN-01.

**Baseline:** schema **v75** · Phase 4.4 (`20b3b13`).

---

## 2. Problem

Retail floor staff need to **return merchandise and sell replacement SKU(s)** in one guided workflow. Opervia has no exchange entity, no item-level refund API, and no net-settlement primitive. Uncoordinated multi-step flows risk wrong refund amounts, duplicate legs on retry, and inventory drift.

This ADR defines **policy and architecture** for v1. It does **not** authorize schema changes or modifications to existing refund/restock/payment services.

---

## 3. Decision (Accepted)

### Architecture — Option A: Composition

**Retail exchange v1 is a Retail-only frontend exchange coordinator** that orchestrates existing APIs in a fixed leg order. No new exchange table, no dedicated exchange HTTP endpoint, and no new server-side exchange entity for v1.

**Why no exchange entity for v1:**

| Need                    | Satisfied by existing artifacts                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Money out               | `refunds` row on original bill                                                                                                        |
| Money in                | `payment_details` on new bill                                                                                                         |
| Stock in (return)       | `inventory_movements` (`adjustment`, `reference_type=refund`)                                                                         |
| Stock out (replacement) | `inventory_movements` (`sale`) on new order                                                                                           |
| Idempotency             | Per-leg stores (`refund_idempotency`, `order_idempotency`, `payment_idempotency`)                                                     |
| Audit                   | `audit_logs`, bill/order/refund IDs — correlation via coordinator metadata (optional `audit_logs` JSON), not a persisted exchange row |

A dedicated exchange operation (Option B) or entity (Option C) adds linkage and replay surface but introduces new settlement logic or schema without being necessary for floor utility once policy and coordinator idempotency are defined.

---

## 4. Alternatives considered

| Option                              | Summary                                           | Rejected for v1 because                                                                                      |
| ----------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **A — Composition**                 | Coordinator calls refund + restock + POS checkout | **Accepted** — smallest diff; preserves ADR-009/011 txn boundaries                                           |
| **B — Dedicated exchange API**      | Single `POST /api/exchanges`                      | New money orchestration surface; still multi-txn internally; higher cost without eliminating partial-failure |
| **C — Exchange entity/table**       | Persistent `exchanges` + lines                    | Schema v76+; not required for audit if legs remain independently queryable                                   |
| **Net settlement on original bill** | Adjust original bill total                        | Violates FIN-01; rewrites tax snapshot; conflicts with ADR-009                                               |
| **Store credit tender**             | Customer wallet / credit balance                  | Deferred — no ledger or tender type exists                                                                   |

---

## 5. Detailed policy

### 5.1 Returned item identity

Every return leg **must** specify:

- `order_item_id` — line on the original order
- `quantity` — units returned (positive integer)

**Never** infer returned quantity from refund amount, price delta, or payment lines. Restock (when used) reuses ADR-011 with the same explicit pair.

### 5.2 Return value (money)

**Formula (per returned line):**

```text
effective_unit_price = order_items.total / order_items.quantity
return_value_line     = round(effective_unit_price × return_qty, 2)
total_return_value    = sum(return_value_line) across selected lines
```

- **`order_items.total`** is the authoritative per-line amount the customer paid (includes line-level discount and tax as stored at sale time).
- **`order_items.unit_price`** is shown in UI for reference; when line `discount_amount > 0` or tax differs from simple `unit_price × qty`, **refund amount uses `total/quantity`**, not raw `unit_price × qty`.
- **Partial quantity:** `return_qty ≤ order_items.quantity − already_restocked_qty` for restock; refund value uses `return_qty` only.
- **Multiple quantities / multiple lines:** Sum line return values into **one refund request** on the original bill (single `POST /api/bills/:id/refund` with aggregated amount).
- **Already-refunded bill:** Refund amount must not exceed server `refundable_cents` (bill-level cap). Coordinator **does not** receive per-line refunded history from the server — operator must not double-refund; UI shows bill-level remaining refundable.
- **Order-level discount:** Embedded in each line’s `total` at sale time; no separate allocation math in v1.

**Coordinator limitation (explicit):** Refund API remains **bill-level amount only**. The server does not validate `order_item_id` on refund. Correct return value is **coordinator + UX responsibility**. Wrong amount is operator error, not a new server invariant in v1.

### 5.3 Replacement pricing

Replacement items use **current catalog selling price** at the time of the new order. The replacement is a **normal new sale**:

- New `orders` / `order_items` / `bills` row(s)
- Current tax calculation via existing tax engine
- Normal discount application only through existing `PATCH /orders/:id/discount` (if operator chooses)
- Normal payment / `payment_details` on the **new** bill

**Do not mutate** the original bill, order totals, or tax snapshots.

### 5.4 Discount carry-over

**No automatic carry-over** of the original bill’s or order’s discount to the replacement sale.

If the operator applies a discount on the replacement, it follows **existing new-sale discount rules** (manager approval, limits, etc.). The original sale’s discount history is immutable.

### 5.5 Price difference

Exchange is **not** net-settlement. Two independent money movements:

| Case                                     | Action                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replacement_total > total_return_value` | Customer pays difference via **new bill payment** (existing payment APIs)                                                                                                                                                                           |
| `replacement_total < total_return_value` | Customer receives **`total_return_value − replacement_total`** as additional refund on original bill **only if** bill refundable cap allows; otherwise refund `total_return_value` first and operator handles goodwill separately (**operational**) |
| Equal                                    | Refund return value; replacement payment equals replacement total; no extra movement                                                                                                                                                                |

**Simpler v1 rule:** Coordinator performs **one refund** for full `total_return_value` of returned lines, then **full payment** on replacement bill. Operator sees difference in summary before confirm. FIN-01 semantics unchanged on each bill.

### 5.6 Leg order (mandatory)

```text
1. REFUND        — POST /api/bills/:id/refund
2. REPLACEMENT   — POST /orders → POST /bills/generate → POST /bills/:id/payment(s)
3. RESTOCK (opt) — POST /api/refunds/:refundId/restock per returned line (retail only)
```

**Justification:**

- **Refund first:** Money-out is the customer commitment; matches ADR-011 “money first” spirit.
- **Replacement before restock:** Replacement **decrements** stock on new SKUs; returned units are **added** only after sale succeeds. Avoids restock-then-abort leaving returned units in stock without a completed replacement sale.
- **Restock last:** Optional; failure does not invalidate money or replacement sale (same as Phase 4.2).

### 5.7 Multi-line exchange (v1 scope)

**Supported at coordinator/UI level:**

- **Multiple returned lines** — each with `order_item_id` + `quantity`; one aggregated refund; optional restock per line.
- **Multiple replacement lines** — single new order with multiple items (standard POS).

**Not supported in v1:**

- Splitting return across **multiple original bills**
- Linking one return to **multiple replacement orders** in one atomic coordinator run (operator may run a second exchange manually)
- Per-line **separate refund API calls** unless operator explicitly chooses partial returns in separate sessions (not default UX)

No new persistence model for multi-line.

### 5.8 Store credit

**DEFERRED.** No customer credit balance, exchange wallet, store-credit ledger, or new tender type in v1. Refunds use existing methods (cash, card, UPI, wallet where applicable).

### 5.9 Restock policy

Reuse **ADR-011** unchanged:

- Retail / retail-test only
- Explicit operator opt-in per line
- Explicit `order_item_id` + `quantity`
- Remaining-qty cap; voided/cancelled lines blocked
- InventoryService-owned `adjustment` movement
- Separate txn after refund

Restaurant: exchange unavailable; restock remains **403**.

---

## 6. Money semantics

| Topic                                  | Policy                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Economic model                         | Refund on original bill + new sale on new bill                                     |
| FIN-01                                 | Unchanged; each bill has own gross tender / collectible rules                      |
| Original `payment_details`             | Immutable on refund                                                                |
| Original `tax_amount` / `tax_snapshot` | Immutable                                                                          |
| Replacement tax                        | New sale — current engine                                                          |
| Day close                              | Cash refund on refund shift; cash in on payment shift (may differ)                 |
| Reporting / CSV                        | Refund on original bill row; replacement as separate bill — **no exchange rollup** |

---

## 7. Inventory semantics

| Leg              | Owner                               | Movement                              |
| ---------------- | ----------------------------------- | ------------------------------------- |
| Replacement sale | `Inventory.decrementTrackedStock`   | `sale` on new order                   |
| Return restock   | `Inventory.restockTrackedForRefund` | `adjustment`, `reference_type=refund` |

**Prohibited:** frontend stock mutation; route SQL; amount→qty inference; auto-restore all lines; restock voided/cancelled lines; duplicate restock beyond cap.

---

## 8. Transaction boundaries

**Do not move existing ownership.**

| Operation               | Txn                | Owner                 |
| ----------------------- | ------------------ | --------------------- |
| Refund                  | Single `withTxn`   | `createBillRefund`    |
| Order + stock decrement | Single `withTxn`   | `orders.ts`           |
| Payment                 | Single `withTxn`   | `payment-tender.ts`   |
| Restock                 | Separate `withTxn` | `createRefundRestock` |

Exchange coordinator spans **multiple independent transactions**. No giant txn across refund + order + payment + restock.

---

## 9. Idempotency

**Accepted model: Operational recovery with deterministic per-leg keys** — not cross-leg atomicity.

### Exchange attempt identity

Coordinator generates **`exchange_attempt_id`** (UUID) at workflow start. Persists in **sessionStorage** (or equivalent client store) until terminal state or explicit dismiss.

### Per-leg Idempotency-Key format

| Leg                | Key pattern                                  | Hash / scope                                               |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------- |
| Refund             | `exchange-{attemptId}-refund`                | Existing refund hash (billId, amount, method, reason)      |
| Order create       | `exchange-{attemptId}-order`                 | Existing order hash (body)                                 |
| Bill generate      | Derived from order idempotency replay        | No separate key if order replayed                          |
| Payment            | `exchange-{attemptId}-payment`               | Existing payment hash                                      |
| Restock (per line) | `exchange-{attemptId}-restock-{orderItemId}` | Existing restock hash (`op`, refundId, order_item_id, qty) |

### Retry rules

1. Before each leg, coordinator checks session for **completed leg result** (refund id, order id, bill id, payment status, restock ids).
2. If leg succeeded, **reuse stored ids** — do not call API again with a **new** key.
3. If leg failed or unknown, **retry with same key** for that leg — existing per-leg idempotency replays or completes once.
4. **Never** issue a second refund for the same exchange attempt.
5. **Never** create a duplicate replacement order for the same attempt.
6. **Never** restock twice for the same `(attemptId, orderItemId)` key.

**Explicit acceptance:** Full exchange is **not atomic**. Cross-leg atomicity is **not guaranteed**. Per-leg idempotency **is** guaranteed when keys are stable.

---

## 10. Partial failure / recovery

Conceptual states (coordinator-derived; **no DB entity**):

| State                  | Meaning                                |
| ---------------------- | -------------------------------------- |
| `refund_pending`       | Refund not yet submitted               |
| `refund_complete`      | Refund id stored                       |
| `replacement_pending`  | Order/bill/payment not complete        |
| `replacement_complete` | New order + bill paid                  |
| `restock_pending`      | Restock not submitted for one+ lines   |
| `restock_complete`     | All requested restocks done or skipped |

**No automatic compensation.** Operator completes or abandons remaining legs explicitly.

| Failure                                     | Result                                                       | Recovery                                                           |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Refund fails                                | No money out; no replacement started                         | Fix input; retry refund (same key)                                 |
| Refund succeeds → replacement fails         | Customer refunded; no new sale                               | Retry replacement (same order/payment keys); **no second refund**  |
| Replacement succeeds → restock fails        | Money + sale valid; stock may be understated on returned SKU | Retry restock per line (same restock keys); or manual stock adjust |
| Network fail after leg success              | Session must persist leg ids                                 | Resume coordinator; skip completed legs                            |
| Operator abandons mid-exchange              | Partial state remains in DB                                  | Manager uses Orders/refunds/inventory to reconcile manually        |
| Duplicate exchange request (new attempt id) | Treated as new workflow                                      | Operator must verify bill refundable before second exchange        |

---

## 11. Auditability

**Sufficient for v1 without exchange table:**

| Artifact                                                           | Audit role            |
| ------------------------------------------------------------------ | --------------------- |
| `refunds`                                                          | Money returned        |
| Original + new `bills` / `payment_details`                         | Tender history        |
| New `orders` / `order_items`                                       | Replacement lines     |
| `inventory_movements`                                              | Restock + sale deltas |
| `refund_idempotency` / `order_idempotency` / `payment_idempotency` | Replay evidence       |
| `audit_logs` (`payment.refunded`, etc.)                            | Operator actions      |

**Optional v1 enhancement (implementation):** single `audit_logs` entry `exchange.completed` with JSON `{ exchange_attempt_id, original_bill_id, refund_id, replacement_order_id, replacement_bill_id, returned_lines[] }` — **does not require new table**.

**Missing for automated exchange analytics:** No server-side query “all exchanges today” without correlation metadata. Acceptable for v1; reporting uses independent refund + sale rows.

---

## 12. Reporting

Exchange **must not** introduce exchange-specific Gross/Net/Payments Received formulas.

- Original bill: gross unchanged; refund appears in Refunds / net / CSV `refunds` column
- New bill: normal gross sale and payments received
- Day close: independent shift attribution per leg
- FIN-01: per-bill; unchanged

---

## 13. Tax

- **Return leg:** ADR-009 refund — no mutation of original `tax_amount` / `tax_snapshot`
- **Replacement leg:** New order/bill — normal current tax calculation
- No pro-rata tax reversal on partial return in v1

---

## 14. Vertical isolation

| Vertical                | Exchange                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `retail`, `retail-test` | Exchange coordinator + UI enabled                                  |
| `restaurant` (default)  | No exchange UI; no coordinator; refund money-only; restock **403** |

Gate: same pattern as ADR-011 `RESTOCK_VERTICALS` — coordinator not mounted unless `composition.verticalId ∈ {retail, retail-test}`.

No new module catalog entry required for v1; optional future `exchange` capability flag deferred.

---

## 15. Schema / API impact

| Change              | v1                                                                 |
| ------------------- | ------------------------------------------------------------------ |
| Schema              | **v75 unchanged**                                                  |
| New tables          | **None**                                                           |
| New columns         | **None**                                                           |
| New HTTP endpoints  | **None**                                                           |
| Refund API changes  | **None**                                                           |
| Restock API changes | **None**                                                           |
| Frontend            | New exchange coordinator + Retail Orders UI (implementation phase) |

---

## 16. Testing requirements (pre-ship)

### Characterization (existing — must pass)

- `tests/phase-4.2-refund-restock.test.ts`
- `tests/integration-refunds.test.ts` (FIN-01)
- `tests/financial-reporting-semantics.test.ts`
- `tests/inventory-boundary.test.ts`

### New (implementation phase)

- Coordinator idempotency: retry each leg does not duplicate
- Full exchange happy path: refund + sale + restock; stock net correct
- Partial failure: refund ok, sale fail → no second refund on resume
- Restaurant: exchange UI absent
- Cheaper / more expensive / equal replacement (money totals)
- Multi-line return + multi-line replacement
- Bill partially refunded before exchange → capped refund

---

## 17. Risks

| Risk                                      | Mitigation                                                        |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Wrong refund amount (bill-level API)      | UX shows computed return value; confirm step; bill refundable cap |
| No per-line refund history on server      | Operator training; show bill remaining refundable                 |
| Partial exchange state                    | Session persistence + recovery UI                                 |
| Cash refund + payment on different shifts | Document in ops training                                          |
| No linked reporting                       | Accept for v1; optional audit_logs correlation                    |

---

## 18. Consequences

**Positive:**

- Retail exchange without schema or money-path redesign
- ADR-009/011/FIN-01 preserved
- Restaurant unchanged
- Incremental implementation via frontend coordinator

**Negative:**

- Not atomic; operator recovery required on partial failure
- No store credit; no exchange analytics query
- Bill-level refund cannot enforce item-level money on server

**Out of scope:** store credit, suppliers/PO, variants, multi-location, accounting integrations, REAL→cents, tax redesign (3.5B), service extraction, P1.6.

---

## 19. Implementation gate

### READY FOR IMPLEMENTATION

All product decisions from Phase 4.5 discovery §14 are **resolved** by this ADR:

| #   | Decision                  | Resolution                                                   |
| --- | ------------------------- | ------------------------------------------------------------ |
| P1  | Return value formula      | `(order_items.total / quantity) × return_qty`, summed        |
| P2  | Replacement pricing       | Current catalog via new order                                |
| P3  | Order discount carry-over | None automatic; embedded in line `total`                     |
| P4  | Price difference          | Separate refund + replacement payment                        |
| P5  | Leg order                 | Refund → replacement → restock                               |
| P6  | Store credit              | Deferred                                                     |
| P7  | Multi-line                | Supported at coordinator; one refund + one replacement order |
| P8  | Partially refunded bills  | Allowed within bill refundable cap                           |
| P9  | Audit linkage             | Existing artifacts + optional audit_logs JSON                |
| P10 | Shift attribution         | Independent per leg; ops note                                |

**Phase 4.5 implementation** may proceed under a separate authorized task. **Phase 4.5 is not complete** until implementation gates pass.

**Do not modify** refund, restock, tax, or FIN-01 behavior during implementation except via the coordinator and UI specified here.

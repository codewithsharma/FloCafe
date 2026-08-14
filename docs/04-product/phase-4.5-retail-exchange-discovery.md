# Phase 4.5 — Retail Exchange Workflow Discovery

**Date:** 2026-08-14  
**Status:** DISCOVERY COMPLETE — **ADR-012 ACCEPTED**  
**Policy:** [ADR-012](../14-decisions/ADR-012-retail-exchange-policy.md) — **READY FOR IMPLEMENTATION** (implementation not started)

**Related:** [phase-4.2-retail-returns-restock.md](phase-4.2-retail-returns-restock.md) · [ADR-009](../14-decisions/ADR-009-refund-model.md) · [ADR-011](../14-decisions/ADR-011-refund-restock-policy.md) · [reporting-financial-semantics.md](../15-project-management/reporting-financial-semantics.md) · [phase-4-product-completion-discovery.md](phase-4-product-completion-discovery.md)

---

## 1. Executive summary

Opervia Retail can already perform the **atomic legs** of a merchandise exchange:

1. **Return money** — `POST /api/bills/:id/refund` (`createBillRefund`, ADR-009)
2. **Optional restock** — `POST /api/refunds/:id/restock` (Phase 4.2, ADR-011, retail-only)
3. **Replacement sale** — standard POS checkout (`POST /orders` → `POST /bills/generate` → payment)

There is **no exchange entity**, **no item-level refund contract**, **no net-settlement API**, and **no linked audit trail** tying return + replacement. ADR-011 explicitly lists **exchanges out of scope**.

Economically, an exchange **is** a refund + new sale (plus optional restock). Opervia does **not** require a dedicated `exchanges` table for a **v1 floor workflow**, but **does** require an **ADR** to lock product policy before implementation — especially return-value rules, price-difference settlement, partial-failure recovery, and cross-leg idempotency.

**Recommended architecture (post-ADR):** **Option A — Composition** via a Retail-only **exchange coordinator** (frontend orchestration reusing existing APIs). Avoid Option C (exchange table) for v1 unless audit/linkage requirements exceed composition.

**Verdict:** **ADR-012 ACCEPTED** — see [ADR-012](../14-decisions/ADR-012-retail-exchange-policy.md). Implementation authorized pending separate implementation task.

---

## 2. Existing implementation map (verified)

### 2.1 Sale → bill → payment

| Step                             | Owner                   | Transaction | Inventory                                               |
| -------------------------------- | ----------------------- | ----------- | ------------------------------------------------------- |
| `POST /api/orders`               | `main/routes/orders.ts` | `withTxn`   | `decrementTrackedStock` per line (`movement_type=sale`) |
| `POST /api/bills/generate`       | `main/routes/bills.ts`  | `withTxn`   | none                                                    |
| `POST /api/bills/:id/payment(s)` | `payment-tender.ts`     | `withTxn`   | none                                                    |

Frontend: `frontend/src/lib/pos/checkout-coordinator.ts` — create order → optional discount → bill → payment. Idempotency: `order_idempotency`, `payment_idempotency` (per user + key).

### 2.2 Refund (money only)

| Item               | Detail                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| Service            | `main/services/refund.ts` → `createBillRefund()`                              |
| Route              | `POST /api/bills/:id/refund`                                                  |
| Txn                | Single `withTxn`                                                              |
| Writes             | `refunds` row; `bills.paid_amount`, `balance`, `payment_status`               |
| Does **not** write | `payment_details`, `tax_snapshot`, `tax_amount`, `total`, `orders`, inventory |
| Idempotency        | `refund_idempotency` (user + key + bill + request hash)                       |
| Auth               | owner, manager, cashier + manager PIN always                                  |

Refundable cap: `SUM(payment_details amounts) − SUM(completed refunds)` — **not** derived from mutable `paid_amount` alone (ADR-009, FIN-01).

### 2.3 Refund restock (Phase 4.2)

| Item          | Detail                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- |
| Service       | `main/services/refund-restock.ts` → `createRefundRestock()`                                  |
| Route         | `POST /api/refunds/:id/restock`                                                              |
| Txn           | Separate `withTxn` **after** money refund commits (ADR-011 T2)                               |
| Vertical      | `retail` / `retail-test` only → `RESTOCK_VERTICAL_DISABLED` elsewhere                        |
| Contract      | Explicit `order_item_id` + `quantity` — no amount inference                                  |
| Ledger        | `movement_type=adjustment`, `reference_type=refund`, `reason=refund_restock:order_item:<id>` |
| Caps          | `remaining = lineQty − sumRefundRestockedQtyForOrderItem()`                                  |
| Blocked lines | `voided`, `void_adjustment`, `cancelled`                                                     |

UI pattern (`orders/page.tsx`): refund succeeds → optional restock with **separate** idempotency key; restock failure toasts separately (money not reversed).

### 2.4 Inventory ownership

All stock mutations via `main/services/inventory.ts`:

- Sale: `decrementTrackedStock`
- Order cancel: `restoreTrackedStock` (`cancel_restore`)
- Refund restock: `restockTrackedForRefund` (does **not** call `adjustProductStock`)
- Manual adjust: `adjustProductStock` via `POST /products/:id/stock`

**Prohibited today and must remain prohibited:** frontend stock mutation, route-level SQL stock writes, amount→quantity inference, automatic restore-all-lines on refund.

### 2.5 Financial semantics (immutable for exchange discovery)

From `docs/15-project-management/reporting-financial-semantics.md`:

```
Gross Sales − Refunds = Net Sales
gross_successful_tender = SUM(payment_details line amounts)   // unchanged on refund
net_paid = gross − completed_refunds                         // bills.paid_amount
collectible outstanding = bill_total − gross_successful_tender   // FIN-01
```

Tax on original bill: frozen at bill creation (`bills.tax_snapshot`, `tax_amount`). Refund service never reads/writes tax fields.

### 2.6 Vertical composition

| Vertical     | Modules            | Exchange-relevant                                                 |
| ------------ | ------------------ | ----------------------------------------------------------------- |
| `retail`     | 17 shared commerce | refund, inventory, pos, order, payment — **no** tables/kds/addons |
| `restaurant` | +5 restaurant      | restock API returns 403; money-only refunds                       |

Gate pattern: `isRefundRestockVerticalEnabled()` / `RESTOCK_VERTICALS` in service layer. Route mounted via shared `refund` module but retail-gated in service.

### 2.7 Reporting / day close / CSV (Phase 4.4)

- Refunds reduce Net Sales and appear in accounting CSV `refunds` column
- Payments Received stays at original tender (unchanged by refund)
- Day close: cash refunds by `refunds.shift_id` on **current open shift**, not original payment shift
- Replacement sale creates **new** bill/order in reports — no link to original return

---

## 3. Exchange problem definition

### 3.1 Smallest useful Retail exchange

**Target workflow (floor reality):**

```text
Original sale (paid bill)
    → customer returns merchandise (full or partial qty)
    → store refunds money for returned value (or issues store credit — NOT BUILT)
    → returned units optionally restocked (explicit, retail-only)
    → customer receives replacement SKU(s) via new sale
    → price difference settled (customer pays more / store refunds difference / even)
```

### 3.2 Can exchange compose from existing primitives?

| Leg                         | Existing primitive                | Sufficient?                                           |
| --------------------------- | --------------------------------- | ----------------------------------------------------- |
| Return money                | Bill-level refund (amount)        | **Partial** — no server link to `order_item_id`       |
| Restock return              | `POST /refunds/:id/restock`       | **Yes** — explicit item + qty (ADR-011)               |
| Replacement sale            | POS checkout → new order/bill     | **Yes**                                               |
| Price difference            | Separate refund and/or payment    | **Yes** but operator must run correct amounts         |
| Link return ↔ replacement   | —                                 | **No** — no entity or audit contract                  |
| Safe retry of full exchange | Per-leg idempotency only          | **Partial** — no exchange-level key                   |
| Item-level return value     | UI can compute from `order_items` | **UI-only** — server validates bill-level amount only |

**Conclusion:** A **composition model (Option A)** can deliver v1 Retail exchange **without schema changes**, reusing Phase 4.2 patterns. It **cannot** guarantee semantic correctness without **product policy** (how return value is computed) and **operator UX** that prevents wrong refund amounts. A dedicated exchange operation (Option B) or entity (Option C) adds linkage and idempotency but is **not required** for minimal floor utility if ADR accepts composition + explicit recovery rules.

---

## 4. Implementation model comparison

### Option A — Composition (orchestrated multi-step)

Exchange UI/coordinator sequences:

1. Refund returned value on original bill
2. Optional restock (per returned line)
3. Create replacement order + bill + payment (POS)

| Dimension            | Assessment                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Money-path risk      | **Medium** — wrong refund amount if UI policy wrong; FIN-01 unchanged                    |
| Inventory risk       | **Low** — reuses ADR-011 restock + sale decrement                                        |
| Tax risk             | **Low-Medium** — replacement gets new tax snapshot; return does not reverse original tax |
| Idempotency risk     | **High** — 3+ independent keys; partial completion without exchange-level replay         |
| Retry behavior       | Per-leg replay works; **no** atomic "exchange succeeded" flag                            |
| Partial failure      | **Explicit operator recovery** required (see §5)                                         |
| Transaction boundary | T2-style: independent txns per leg (matches ADR-011)                                     |
| Auditability         | **Weak** — unless audit metadata added                                                   |
| Schema impact        | **None** for v1                                                                          |
| API impact           | **None** for v1 (frontend-only coordinator)                                              |
| Restaurant isolation | **Clean** — retail-only gate on coordinator + restock                                    |
| Retail UX complexity | **Medium** — multi-step wizard; can mirror RefundDialog + POS                            |
| Implementation cost  | **Lowest**                                                                               |

### Option B — Dedicated exchange operation

Single new API e.g. `POST /api/exchanges` coordinating refund + restock + order create + payment.

| Dimension            | Assessment                                                                     |
| -------------------- | ------------------------------------------------------------------------------ |
| Money-path risk      | **High** — new settlement logic unless still delegates to existing services    |
| Inventory risk       | **Medium** — must orchestrate decrement + restock in correct order             |
| Tax risk             | **Medium** — must not break tax immutability on original bill                  |
| Idempotency risk     | **Lower** — one exchange idempotency record possible                           |
| Retry behavior       | Single replay surface                                                          |
| Partial failure      | Still multi-txn internally unless giant txn (rejected)                         |
| Transaction boundary | Multiple service calls; **must not** span one giant txn across money+inventory |
| Auditability         | **Stronger**                                                                   |
| Schema impact        | Likely `exchange_idempotency` table minimum                                    |
| API impact           | New route + service                                                            |
| Restaurant isolation | Service-level vertical gate                                                    |
| Retail UX complexity | **Lower** — one confirm action                                                 |
| Implementation cost  | **Medium-High**                                                                |

### Option C — Exchange document/entity

Persistent `exchanges` + line tables linking original items, refund ids, replacement order ids.

| Dimension           | Assessment                          |
| ------------------- | ----------------------------------- |
| Money-path risk     | Same as B if still delegates        |
| Inventory risk      | Same as B                           |
| Tax risk            | Same as B                           |
| Idempotency risk    | **Lowest** — entity state machine   |
| Auditability        | **Strongest**                       |
| Schema impact       | **v76+** — new tables, FKs, indexes |
| API impact          | CRUD + state transitions            |
| Implementation cost | **Highest**                         |

### Recommendation

**Smallest safe path:** **Option A (Composition)** with:

- Retail-only `exchange-coordinator` (frontend, mirroring `checkout-coordinator.ts`)
- Reuse `RefundDialog` patterns + POS for replacement
- Optional **audit-only** metadata (`audit_logs` action `exchange.completed` with JSON refs) — **no new table required for v1 linkage**

**Option B/C** deferred until product requires durable exchange records (returns analytics, linked reprint, compliance).

---

## 5. Critical scenarios (20 cases)

Recovery principle: **No automatic compensation.** Operator explicitly completes or reverses remaining legs. Money already committed is **never** auto-reversed by restock/replacement failure.

| #   | Scenario                            | Safe approach (composition)                                                   | Recovery if partial fail                                            |
| --- | ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Full qty exchange                   | Refund full line value; restock full qty; new sale for replacement            | Standard per-leg                                                    |
| 2   | Partial qty exchange                | Refund proportional value (**policy**); restock partial qty; new sale         | If refund wrong amount → manual adjustment/refund                   |
| 3   | Multiple qty same SKU               | Restock capped by `remaining` per `order_item_id`                             | `RESTOCK_QUANTITY_EXCEEDS` → reduce qty                             |
| 4   | Cheaper replacement                 | Refund return value; customer keeps difference (refund > replacement)         | Refund leg only; skip extra payment                                 |
| 5   | More expensive replacement          | Refund return value; customer pays difference on new bill                     | If payment fails → unpaid replacement bill; return already refunded |
| 6   | Equal value                         | Refund = replacement total (UI computed)                                      | Even exchange = two balanced legs                                   |
| 7   | Customer pays difference            | Refund + new sale payment for delta                                           | Payment failure → complete payment later on open bill               |
| 8   | Store owes customer                 | Refund exceeds replacement (extra refund on original or larger refund amount) | **HUMAN PRODUCT DECISION REQUIRED** — single refund vs split        |
| 9   | Multiple replacement items          | One new order with multiple lines                                             | Standard POS multi-line                                             |
| 10  | Return not restocked                | Skip restock step                                                             | N/A                                                                 |
| 11  | Return restocked                    | `postRefundRestock` after refund                                              | Restock fail → toast; money done; retry restock                     |
| 12  | Already partially refunded          | Refund only remaining return value ≤ refundable cap                           | `REFUND_EXCEEDS_PAID` if over                                       |
| 13  | Already partially restocked         | `remaining` qty cap prevents over-restock                                     | `RESTOCK_QUANTITY_EXCEEDS`                                          |
| 14  | Voided original line                | Cannot restock; refund amount **policy** (may still refund bill-level?)       | **HUMAN PRODUCT DECISION REQUIRED**                                 |
| 15  | Cancelled original line             | Blocked for restock; stock may already differ                                 | Do not exchange via restock path                                    |
| 16  | Network retry mid-exchange          | Per-leg idempotency keys must be **stable** per exchange attempt              | Exchange coordinator must reuse keys on retry                       |
| 17  | Duplicate exchange request          | Same keys → replay; different intent → new keys                               | Operator verifies state before re-submit                            |
| 18  | Replacement succeeds, restock fails | Money + sale done; stock understated                                          | Retry restock or manual adjust                                      |
| 19  | Restock succeeds, replacement fails | Stock increased; no new sale                                                  | Manual sale or reverse stock via adjust (**policy**)                |
| 20  | Refund succeeds, replacement fails  | Customer has refund; no replacement                                           | Complete sale manually; no auto undo                                |

**Scenario 19 is the highest-risk composition gap:** restock before replacement sale can leave inventory wrong if sale never happens. **ADR must define leg order** (recommended: **refund → replacement sale → restock**, mirroring "money first" spirit of ADR-011 — sale decrements stock before restock adds returned units, net effect depends on SKUs).

**Recommended leg order (proposal for ADR, not decided):**

```text
1. Refund returned value (money out)
2. Replacement sale (new order → payment → stock − on replacement)
3. Optional restock returned item (stock + on return)
```

Rationale: avoids restock-then-abort leaving extra stock; replacement failure leaves customer refunded but not replaced (operator completes sale). **Product must confirm.**

---

## 6. Money semantics

| Question                                    | Finding                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Is exchange economically refund + new sale? | **Yes** — no net-settlement primitive exists                                                                                        |
| Original tax snapshot immutable?            | **Yes** — refund does not adjust `tax_amount` / `tax_snapshot`                                                                      |
| Replacement tax calculation?                | **New order/bill** — current tax engine at sale time                                                                                |
| Original discount carries over?             | **No automatic carry** — **HUMAN PRODUCT DECISION REQUIRED**                                                                        |
| Replacement price: current vs original?     | **Current catalog price** on new order unless UI applies manual discount — **HUMAN PRODUCT DECISION REQUIRED**                      |
| Original sale price preserved on return?    | Refund amount is **operator/UI chosen** bill-level amount; server does not enforce line price — **HUMAN PRODUCT DECISION REQUIRED** |
| Price difference settlement?                | Separate refund (original bill) + payment (new bill); no linked settlement API                                                      |
| Payment records for additional payment?     | Normal `payment_details` on **new** bill                                                                                            |
| Refund representation?                      | Standard `refunds` row on **original** bill                                                                                         |
| Day close impact?                           | Cash refund on refund shift; cash in on payment shift — may differ                                                                  |
| FIN-01 impact?                              | Refund does not recreate collectible on original bill; new bill has own FIN-01 lifecycle                                            |
| Reporting / CSV impact?                     | Two bills: original shows refund; new shows gross sale — **no exchange link** in CSV                                                |

---

## 7. Inventory semantics

Existing ADR-011 restock semantics are **sufficient for the return leg** when:

- Operator selects explicit `order_item_id` + quantity
- Vertical is retail
- Line not voided/cancelled
- Quantity ≤ remaining restockable

**Not sufficient without policy:**

- Restock **before** vs **after** replacement (ordering)
- Exchange-out movement type (currently only `adjustment` + `refund_restock:order_item:` reason)
- Damaged/non-sellable returns (no condition field)

**Replacement leg** uses normal sale decrement on new order — no special exchange movement type required for v1.

---

## 8. Idempotency

| Leg          | Store                 | Key scope                                                  |
| ------------ | --------------------- | ---------------------------------------------------------- |
| Refund       | `refund_idempotency`  | user + key + bill + hash(amount, method, reason)           |
| Restock      | `refund_idempotency`  | user + key + bill + hash(op, refundId, order_item_id, qty) |
| Order create | `order_idempotency`   | user + key + hash(body)                                    |
| Payment      | `payment_idempotency` | user + key + bill + hash                                   |

**Gap:** No exchange-level idempotency. A coordinator must:

- Derive **deterministic** keys from `(exchangeAttemptId, leg)` or store attempt id in sessionStorage
- On retry, reuse keys for completed legs (read state from API before re-invoking)
- Never auto-generate fresh keys on network retry mid-exchange

**Composition cannot guarantee safe retries without coordinator state machine** — document in ADR.

---

## 9. Transaction ownership (current — do not move)

| Operation             | Txn owner           | Boundary                                                      |
| --------------------- | ------------------- | ------------------------------------------------------------- |
| `createBillRefund`    | `refund.ts`         | Single txn: refund insert + bill update + audit + idempotency |
| `createRefundRestock` | `refund-restock.ts` | Separate txn: stock + movement + idempotency                  |
| Order create          | `orders.ts`         | Txn: order + items + stock decrement                          |
| Payment apply         | `payment-tender.ts` | Txn: bill payment update                                      |

**Future exchange:** **Orchestration across existing operations** — **not** one giant txn spanning refund + restock + order + payment (ADR-011 T2 precedent).

---

## 10. Vertical isolation

| Requirement                  | Mechanism today                                                      |
| ---------------------------- | -------------------------------------------------------------------- |
| Retail-only exchange UX      | Gate: `verticalId ∈ {retail, retail-test}` (same as restock)         |
| Restaurant no restock        | `RESTOCK_VERTICAL_DISABLED`                                          |
| Restaurant no exchange UI    | No coordinator mounted when not retail                               |
| No restaurant module leakage | Exchange must not mount tables/kds/addons                            |
| Module composition           | Shared `refund`, `order`, `payment`, `pos`, `inventory` — sufficient |

**Clean capability gate:** Yes — mirror Phase 4.2 `RESTOCK_VERTICALS` pattern; optional future `exchange` capability flag in catalog (not required for v1).

---

## 11. Schema / API assessment

### v1 composition (Option A)

| Change                | Required?                                             |
| --------------------- | ----------------------------------------------------- |
| New table             | **No**                                                |
| New columns           | **No**                                                |
| New movement type     | **No** — reuse `adjustment` + existing reason pattern |
| New refund fields     | **No**                                                |
| New order/bill fields | **No**                                                |
| New endpoint          | **No** — frontend orchestration only                  |

Optional: `audit_logs` JSON with `{ original_bill_id, refund_id, replacement_order_id, exchange_attempt_id }` — uses existing audit table.

### Option B/C

| Change                                      | Required?      |
| ------------------------------------------- | -------------- |
| `exchange_idempotency` or `exchanges` table | **Likely yes** |
| New API                                     | **Yes**        |

**Discovery stops at product/architecture boundary** — no implementation until ADR accepted.

---

## 12. UX discovery (smallest practical)

**Proposed flow (Retail Orders page primary):**

1. Open completed paid order → **Exchange** action (retail-only, alongside Refund)
2. Select return line(s) + return quantity
3. Toggle restock per line (default off, matching Phase 4.2)
4. Scan/select replacement SKU(s) — inline picker or navigate to `/pos` with prefilled cart
5. Summary panel:
   - Returned value (computed from line totals × qty — **display only until policy locked**)
   - Replacement value (cart subtotal)
   - Difference (refund due / pay due / even)
6. Confirm → coordinator runs legs in ADR-defined order
7. Result screen: refund receipt, replacement receipt, explicit failures per leg

**Reuse:**

- `RefundDialog` restock UX (`orders/page.tsx`, `RefundDialog.tsx`)
- `handleCreateNewOrderForCustomer` → `/pos` prefill pattern
- `checkout-coordinator.ts` for replacement payment

**Insufficient without product decisions:**

- Return value formula for partial qty / discounted original lines
- Whether to allow exchange on `partially_refunded` bills
- Whether voided-but-paid edge cases exist in Retail
- Store credit vs cash refund for positive difference

---

## 13. Tests required before implementation

### Characterization (existing — run, do not rewrite)

| Test                                    | File                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Refund does not mutate inventory        | `tests/inventory-boundary.test.ts`, `tests/phase-4.2-refund-restock.test.ts` §1 |
| Restock explicit + retail-only          | `tests/phase-4.2-refund-restock.test.ts`                                        |
| Restock qty cap / duplicate idempotency | phase-4.2 §4–5                                                                  |
| Voided line blocked                     | phase-4.2 §6                                                                    |
| Restaurant 403 restock                  | phase-4.2 §2                                                                    |
| FIN-01 after partial refund             | `tests/integration-refunds.test.ts` §19–21                                      |
| Financial semantics                     | `tests/financial-reporting-semantics.test.ts`                                   |

### Future exchange tests (post-ADR, pre-implementation)

| Area                             | Cases                                                  |
| -------------------------------- | ------------------------------------------------------ |
| Coordinator contract             | Stable idempotency keys on retry                       |
| Full exchange happy path         | Refund + restock + new sale; stock net correct         |
| Equal / cheaper / more expensive | Money totals match policy                              |
| Partial qty                      | Restock cap + refund cap                               |
| Partial failure                  | Refund ok, sale fail → state queryable                 |
| Restaurant                       | Exchange action absent / API 403                       |
| Reporting                        | Original bill refund + new bill sale appear separately |
| No double restock                | Idempotent exchange retry                              |

---

## 14. Open product decisions (HUMAN PRODUCT DECISION REQUIRED)

| #   | Decision                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------ |
| P1  | Return value formula: line `unit_price × return_qty` vs proportional `line_total` vs manual entry only |
| P2  | Replacement pricing: always current catalog vs honor original price for same SKU                       |
| P3  | Original order discount: pro-rate return value or ignore                                               |
| P4  | Price difference: always two legs vs allow single net refund/payment                                   |
| P5  | Leg order: refund → sale → restock vs refund → restock → sale                                          |
| P6  | Store credit / wallet — in scope or cash/card only                                                     |
| P7  | Multi-line return in one exchange — supported v1 or single line only                                   |
| P8  | Exchange on partially refunded bills — allowed or blocked                                              |
| P9  | Audit linkage requirement — audit_logs sufficient vs persistent exchange entity                        |
| P10 | Cash drawer: refund and payment may hit same or different shifts — operator training note              |

---

## 15. Explicit non-goals

Suppliers, PO, receiving, recipes/BOM, variants, multi-location, SaaS, terminals, AI, accounting integrations, QuickBooks, REAL→cents, tax redesign (3.5B), service/package extraction, microservices, P1.6 pilot gates.

---

## 16. Final discovery verdict

### ADR-012 ACCEPTED — READY FOR IMPLEMENTATION

Policy resolved in [ADR-012](../14-decisions/ADR-012-retail-exchange-policy.md). Implementation must **not** proceed until a separate **Phase 4.5 implementation** task is authorized.

---

## Phase 4.5 Discovery

| Field                        | Value                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| **Status**                   | DISCOVERY COMPLETE — **ADR-012 ACCEPTED**                                     |
| **Discovery document**       | `docs/04-product/phase-4.5-retail-exchange-discovery.md`                      |
| **Policy ADR**               | `docs/14-decisions/ADR-012-retail-exchange-policy.md`                         |
| **Production code**          | None                                                                          |
| **Schema**                   | v75 unchanged                                                                 |
| **Money path**               | Unchanged; exchange = refund + new sale (composition)                         |
| **Inventory**                | ADR-011 restock + sale decrement; leg order: refund → sale → restock          |
| **Restaurant**               | No exchange; money-only refunds unchanged                                     |
| **Retail**                   | Composition + coordinator; no fork required                                   |
| **Recommended architecture** | **Option A — Composition** + frontend exchange coordinator                    |
| **Open product decisions**   | **Resolved in ADR-012**                                                       |
| **Required ADR**             | **ADR-012 — ACCEPTED**                                                        |
| **Implementation readiness** | **READY FOR IMPLEMENTATION** (awaiting authorized task)                       |
| **Tests required**           | §13 characterization + future coordinator/integration suite                   |
| **Risks**                    | Partial-failure state; bill-level refund limit; no exchange link in reporting |
| **Next action**              | Authorize Phase 4.5 implementation task                                       |

**Do not implement until implementation task authorized. Phase 4.5 is not complete until implementation gates pass.**

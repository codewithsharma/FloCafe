# Phase 4.2 — Retail Returns & Restock Discovery

**Date:** 2026-08-14  
**Status:** DISCOVERY COMPLETE — **ADR-011 ACCEPTED** — see [implementation](phase-4.2-retail-returns-restock.md)  
**Baseline HEAD:** `d89d3da` (Phase 4.1)  
**Schema:** v75 — **unchanged**  
**Production code:** Implemented under ADR-011 (optional restock API + Retail UI)

**Related:** [phase-4-product-completion-discovery.md](phase-4-product-completion-discovery.md) · [phase-4.1-retail-floor-usability.md](phase-4.1-retail-floor-usability.md) · [ADR-009](../14-decisions/ADR-009-refund-model.md) · [ADR-011](../14-decisions/ADR-011-refund-restock-policy.md) · [phase-4.2 implementation](phase-4.2-retail-returns-restock.md) · [phase-2.8-inventory-ledger.md](../03-architecture/phase-2.8-inventory-ledger.md)

---

## 1. Executive summary

Operavia already has a **money-only** refund path (`createBillRefund`). Inventory is **deliberately not restored** on refund — locked in ADR-009, service headers, and source-contract tests.

A credible Retail **RETURN → OPTIONAL RESTOCK** capability is **not SAFE NOW**:

1. Refunds are **amount-only** (no `refund_items`, no product/qty on the API or UI).
2. ADR-009 Consequences explicitly exclude inventory restock/returns.
3. Ledger `movement_type` CHECK allows only `sale` | `cancel_restore` | `adjustment` — no return/restock type.
4. Restaurant F&B and Retail merchandise need different default policies.
5. Coupling restock into the money txn without an item contract invents ambiguous stock math (especially partial refunds).

**Final gate (discovery):** **ADR REQUIRED** — now **Accepted** as [ADR-011](../14-decisions/ADR-011-refund-restock-policy.md).  
**Implementation:** [phase-4.2-retail-returns-restock.md](phase-4.2-retail-returns-restock.md).

P1.6 is out of scope. No REAL→cents, tax cleanup, exchanges, suppliers/PO, or extraction.

---

## 2. Current refund → inventory lifecycle (proven)

```text
Sale / add items
  → Inventory.decrementTrackedStock (movement_type=sale)
  → Bill generate + tender (payment_details = gross; FIN-01)
        ↓
Refund  POST /api/bills/:id/refund  →  createBillRefund (withTxn)
  → INSERT refunds (completed)
  → UPDATE bills.paid_amount / balance / payment_status
  → wallet credit if method=wallet (loyalty_ledger); NO cashback clawback
  → audit payment.refunded
  → cash: assertOpenShift + refunds.shift_id
  → ★ NO inventory call · NO inventory_movements · NO stock_quantity change
        ↓
FIN-01
  → Collectible = bill_total − gross(payment_details)
  → Refunds reduce net paid; never recreate payment capacity
  → payment_details NOT rewritten on refund
        ↓
Shift / day-close
  → expected_cash − completed cash refunds (by refunds.shift_id)
  → day-close snapshot money only
        ↓
Receipt / print (Phase 3.6A/G)
  → Best-effort POST /printers/print-refund (outside money txn)
  → No stock fields on slip
```

### Exact “where inventory is NOT restored”

| Artifact                          | Evidence                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ADR-009                           | Consequences: “no inventory restock/returns”                                                                          |
| `main/services/refund.ts` L8      | “No inventory restock or order reopen.”                                                                               |
| `main/services/inventory.ts` L8–9 | Refunds intentionally do not restock; no refund ledger rows                                                           |
| Schema                            | No `refund_items`; `inventory_movements.movement_type` CHECK excludes refund/restock                                  |
| UI                                | `RefundDialog` — reason, amount, PIN only; **zero** `restock` in `frontend/`                                          |
| Tests                             | Source-contract in `inventory-boundary` §8, `inventory-ledger` §8; **no** runtime assert stock unchanged after refund |

### Contrast: paths that DO change stock

| Path                                          | Stock                 | Ledger type                           |
| --------------------------------------------- | --------------------- | ------------------------------------- |
| Sale / add items                              | −qty                  | `sale`                                |
| Full / last-item cancel (non-voided lines)    | +qty                  | `cancel_restore`                      |
| Void in-progress                              | unchanged (write-off) | none (+ `void_adjustment` order line) |
| Manual adjust UI / `POST /products/:id/stock` | ± / set               | `adjustment`                          |
| **Bill refund**                               | **unchanged**         | **none**                              |

---

## 3. Candidate restock policies

### A. Always restock returned merchandise

| Dimension        | Assessment                                                                  |
| ---------------- | --------------------------------------------------------------------------- |
| Money-path       | Can keep refund math unchanged if restock is side-effect after money commit |
| Inventory        | Needs product/qty contract; always +qty risks restocking damaged goods      |
| Audit            | Must link ledger → refund id                                                |
| Idempotency      | Replay must not double-restock                                              |
| Partial refund   | **Ambiguous** without line items (how many units for ₹X?)                   |
| Already-refunded | No-op if money already done; stock must not move again                      |
| Void/cancel      | Must not double-restore with prior `cancel_restore`                         |
| Oversell         | Restock increases availability — usually OK; wrong qty is the risk          |
| Damaged          | **Fails** — always-restock cannot express unsellable returns                |
| Restaurant       | Dangerous for prepared F&B (food cannot be re-shelved)                      |
| Retail           | Possible for sealed goods; still needs qty                                  |
| Rollback         | Prefer money commit first; restock failure → compensate or flag (policy)    |

### B. Never auto-restock; manager chooses “Restock”

| Dimension   | Assessment                                                                       |
| ----------- | -------------------------------------------------------------------------------- |
| Money-path  | Refund unchanged; optional restock flag / follow-on call                         |
| Inventory   | Best for damaged vs sellable                                                     |
| Audit       | Clear intent on restock decision                                                 |
| Idempotency | Separate key or include `restock` in refund request hash                         |
| Partial     | Still needs qty/product unless “restock all tracked lines proportional” (unsafe) |
| Restaurant  | Can default **off**                                                              |
| Retail      | Matches merchant reality                                                         |
| Rollback    | Restock can be separate txn after successful refund                              |

### C. Restock only when item is sellable/returnable

| Dimension         | Assessment                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Requires          | Product attribute or per-line “condition” (sellable / damaged) — **not in schema today** |
| Money             | Unchanged if orthogonal                                                                  |
| Schema            | Likely new fields → migration                                                            |
| Restaurant/Retail | Could encode F&B as non-returnable                                                       |

### D. Restock only via separate inventory adjustment after refund

| Dimension     | Assessment                                                           |
| ------------- | -------------------------------------------------------------------- |
| Money-path    | **Zero** coupling — already possible today via Phase 3.6C adjust UI  |
| Inventory     | Existing `adjustment` + `quantity_delta` / `stock_after`             |
| Audit         | Weak link to refund unless UI/API requires `reference_type=refund`   |
| Product value | **Does not deliver** “return workflow”; merchants already can adjust |
| Schema        | None if using existing adjust API                                    |
| Verdict       | Useful ops hygiene; **not** Phase 4.2 product capability             |

---

## 4. Recommended policy (evidence-based, not approved)

**Recommendation for ADR approval (not implementation):**

> **Option B for Retail** — money refund remains as today; **optional restock** only when the operator supplies **product + quantity** (or refund line items) and explicitly opts in.  
> **Restaurant default: no restock** (prepared food / F&B).  
> Do **not** infer units from amount-only refunds.

**Why not A:** Damaged goods + Restaurant F&B.  
**Why not C yet:** No sellable/returnable product attribute; expands schema.  
**Why not D alone:** Does not close the Retail return loop as a product feature.

**Blocking ambiguity (forces ADR):** Without `refund_items` (or equivalent product/qty on the request), no safe automatic mapping from amount → stock units. Inventing “restock all order lines on full refund” is a product decision with oversell/void interaction risk — **do not invent in code**.

---

## 5. Retail vs Restaurant ownership

| Question                            | Finding                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Is `refund` shared?                 | Yes — in `OPERVIA_SHARED_COMMERCE_MODULES` (Restaurant + Retail)                                                             |
| Is `inventory` shared?              | Yes                                                                                                                          |
| Should restock be shared always-on? | **No** — Restaurant default should stay “money-only”                                                                         |
| Composition representation          | Prefer **policy flag / capability** (e.g. settings or module capability) rather than forking `createBillRefund` per vertical |
| Restaurant refunds unchanged?       | **Yes** unless explicitly opted in — preserves ADR-009 café behavior                                                         |
| Vertical gates today                | Refund mount is module-gated; **no** inventory coupling                                                                      |

Ownership sketch (post-ADR, not implemented):

- **Payment/Refund service** owns money + optional “restock requested” flag persistence.
- **Inventory service** owns stock write + ledger row (`quantity_delta`, `stock_after`).
- Routes must not SQL-mutate `stock_quantity`.

---

## 6. Money-path impact

| Concern                       | Impact if restock added carefully                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Refund amount / tax snapshots | **Must remain unchanged**                                                                |
| FIN-01 / `payment_details`    | **Must remain unchanged**                                                                |
| Day-close / shift cash        | **Unchanged** (cash refunds already attributed)                                          |
| Idempotency                   | Money replay OK today; restock must be in hash or separate idempotent step               |
| Same-txn vs after-money       | After-money restock avoids rolling back money on stock failure; same-txn couples domains |

Discovery conclusion: restock can be designed **orthogonal** to money math — but only after the **item/qty contract** exists.

---

## 7. Inventory impact

| Concern                          | Finding                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Ledger-driven?                   | Required — use Inventory service only                                                                            |
| `quantity_delta` / `stock_after` | Written by inventory write APIs today                                                                            |
| New `movement_type`?             | **Decision:** add `refund_restock` (migration) **or** reuse `adjustment` with `reference_type='refund'` + reason |
| Direct SQL from routes           | Forbidden                                                                                                        |
| Frontend stock mutation          | Forbidden                                                                                                        |
| Fake `stock_before`              | Forbidden                                                                                                        |
| Double-restore risk              | Cancel already used `cancel_restore`; refund restock must not apply to never-decremented / voided lines          |

---

## 8. API / schema requirements

| Need                        | Existing?               | Implication                                  |
| --------------------------- | ----------------------- | -------------------------------------------- |
| Amount-only refund          | Yes                     | Insufficient for unit restock                |
| `refund_items` / line qty   | **No**                  | API and likely schema if item-linked returns |
| Restock flag on refund body | **No**                  | API change                                   |
| `movement_type` for return  | **No** (CHECK 3 values) | Migration **or** reuse `adjustment`          |
| Product sellable flag       | **No**                  | Option C blocked without schema              |
| Manual adjust after refund  | Yes (3.6C)              | Option D only                                |

**STOP rule satisfied:** Schema/API change is required for a true RETURN→RESTOCK product path → **ADR decision**, not silent fields.

---

## 9. Idempotency / partial-refund / void risks

| Risk                              | Detail                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Idempotent replay                 | Must not double-restock; include restock intent in `request_hash` or separate idempotency |
| Partial amount, no lines          | **Cannot** safely choose qty                                                              |
| Full refund heuristic (all lines) | Conflicts with comps, voids, prior cancels, modifiers                                     |
| Void then refund                  | Void already wrote-off stock; restock would invent inventory                              |
| Cancel then refund                | Cancel may already `cancel_restore`; refund restock would double                          |
| Concurrent refunds                | Money path has over-refund guards; stock needs same discipline                            |

---

## 10. Characterization tests (existing vs missing)

### Existing (do not weaken)

| Suite                                                                        | Protects                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `tests/integration-refunds.test.ts`                                          | Money: full/partial, idempotency, FIN-01, cash recon, PIN |
| `tests/inventory-boundary.test.ts` §8                                        | Source contract: refund does not restock                  |
| `tests/inventory-ledger.test.ts` §8                                          | Source contract: no refund ledger rows                    |
| `tests/order-void-cancel-stock.test.ts`                                      | Void ≠ restock; cancel skip voided                        |
| `tests/refund-receipt-print.test.ts` / `webusb-refund-print`                 | Print ≠ money rollback                                    |
| `tests/restaurant-isolation` / `production-retail` / `synthetic-retail-sale` | Vertical sale isolation (not refund restock)              |

### Missing before implementation (document only)

1. Runtime: after `POST …/refund`, assert `stock_quantity` and ledger row count **unchanged** (characterization of today’s contract).
2. Post-ADR: restock opt-in increases stock once; replay does not.
3. Post-ADR: Restaurant default — refund still no stock change.
4. Post-ADR: voided / already-cancelled lines never restocked.
5. Post-ADR: partial refund without lines rejected if restock requested.

**Do not add implementation tests until policy approved.**

---

## 11. Decision table

| Question                        | Finding                                  | Risk                          | Decision                              |
| ------------------------------- | ---------------------------------------- | ----------------------------- | ------------------------------------- |
| Current refund restock behavior | Never restock (ADR-009 + code)           | Retail inventory loop broken  | Keep until ADR supersedes             |
| Restock ownership               | Inventory service must own writes        | Layer skip / dual paths       | Inventory-owned; refund may request   |
| Retail-only or shared           | Modules shared; **policy** should differ | F&B restock hazard            | Retail opt-in; Restaurant default off |
| Partial refunds                 | Amount-only today                        | Unit ambiguity                | Require product/qty or reject restock |
| Idempotency                     | Money solid; stock not in path           | Double restock                | Extend hash / separate step           |
| Damaged goods                   | No condition field                       | Always-restock wrong          | Prefer Option B                       |
| Schema required                 | For item lines and/or movement type      | Migration discipline          | **ADR** — no silent columns           |
| API required                    | Restock flag + qty/products              | Contract break                | **ADR**                               |
| Money-path impact               | Can stay orthogonal                      | Accidental FIN-01/tax touch   | Freeze money semantics                |
| Inventory impact                | New ledger write path                    | Double-restore vs cancel/void | Inventory service + explicit refs     |

---

## 12. Final gate

```text
ADR REQUIRED
```

Not SAFE NOW — amount-only refunds + ADR-009 + movement_type CHECK + Restaurant/Retail policy split.

Not DEFER forever — capability is the right Phase 4 product bet after 4.1; blocked on **decision**, not architecture rewrite.

Not NOT PHASE 4.2 — this is the correct phase for return/restock; exchanges stay later.

### What approval must choose (ADR-011)

1. Policy: **B** (recommended) vs A / C / D.
2. Contract: item-level `refund_items` vs product+qty on refund vs full-refund line heuristic.
3. Ledger: new `movement_type` vs reuse `adjustment` + `reference_type='refund'`.
4. Vertical default: Restaurant off / Retail on (or settings flag).
5. Transaction: restock inside refund `withTxn` vs after successful money commit.

---

## 13. Files inspected (read-only)

| Area              | Paths                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Refund            | `main/services/refund.ts`, `main/routes/refunds.ts`, `main/validation/refunds.ts`                        |
| Inventory         | `main/services/inventory.ts`, `main/routes/inventory.ts`, `main/db.ts` (v72/v75)                         |
| Orders stock      | `main/routes/orders.ts` (void/cancel restore)                                                            |
| Payment / FIN-01  | `main/services/payment-tender.ts`                                                                        |
| Shift / day-close | `main/services/shift.ts`, `main/services/day-close.ts`                                                   |
| Print             | `main/services/thermal.ts`, printers routes, `frontend/src/lib/refund-receipt-print.ts`                  |
| UI                | `frontend/src/components/orders/RefundDialog.tsx`, `frontend/src/lib/refunds.ts`                         |
| Modules           | `main/modules/shared-commerce-modules.ts`, catalog refund module                                         |
| ADRs / docs       | ADR-009, phase-3.6a, feature-list, phase-4 discovery                                                     |
| Tests             | `integration-refunds`, `inventory-boundary`, `inventory-ledger`, `order-void-cancel-stock`, print suites |

---

## 14. Confirmation

| Item                                        | Status                         |
| ------------------------------------------- | ------------------------------ |
| Production code modified                    | **No**                         |
| Schema / migrations                         | **No**                         |
| Refund / FIN-01 / day-close / tax semantics | **Unchanged**                  |
| Implementation started                      | **No** — awaiting ADR approval |

---

## 15. Next step after approval

Only after ADR-011 is **Accepted** with chosen options:

1. Characterization test: refund leaves stock unchanged (today’s truth).
2. RED→GREEN implementation slice matching the approved contract.
3. Restaurant isolation + Retail restock suites.
4. Explicit non-goals remain: exchanges, suppliers/PO, variants, REAL→cents, 3.5B/C, P1.6.

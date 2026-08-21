# ADR-015: Recipe-linked waste (ROPS-RWASTE)

**Status:** Proposed  
**Date:** 2026-08-21  
**Deciders:** Product + CTO (**human Accept required before any implementation**)  
**Supersedes:** n/a  
**Amends:** none — does **not** change Phase 4.15 / R4 SKU wastage, R5 recipe consume/reverse, ADR-011 refund restock, or R9.6 food-cost SoT until an authorized implement slice explicitly says so  
**Related:**

- Gap: [RESTAURANT-OPS-RECIPES-INGREDIENT-GAP-ANALYSIS.md](../roadmap/RESTAURANT-OPS-RECIPES-INGREDIENT-GAP-ANALYSIS.md) (`ROPS-RWASTE`)
- SKU wastage: [phase-4.15-wastage-stock.md](../04-product/phase-4.15-wastage-stock.md), R4 Inventory OS
- Recipe consume: `main/services/recipe-consumption.ts`, P16/P17
- Food-cost: `main/services/food-cost-report.ts` (R9.6 + ROPS-FC-CSV / ROPS-FC-ING)
- Sibling gap (separate ADR): **ROPS-REFREV** (restaurant refund → recipe reverse)

---

## 1. Context

### What already exists

| Capability                  | Behavior (code truth)                                                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SKU wastage**             | `POST /api/products/:id/stock` `{ action: 'wastage', quantity, wastage_reason? }` — owner/manager; mandatory `Idempotency-Key`; ledger `movement_type='adjustment'`, `reason='wastage'` or `wastage:SPOILAGE\|DAMAGED\|EXPIRED\|SPILLAGE\|OTHER`; audit `inventory.wastage`; **no cost snapshot**; **no `recipe_id`** |
| **Recipe consume**          | Sale-tied; unique per `order_item_id`; snaps BOM/qty/cost into `recipe_consumptions` + `recipe_consumption_lines`; stock via `applyRecipeStockDelta` (`reason='recipe_consumption'`); audit `inventory.recipe_consumed`                                                                                               |
| **Recipe reverse**          | Full cancel / last-item collapse only → `status='reversed'` + `recipe_restore` movements; **not** void / partial cancel / restaurant refund                                                                                                                                                                           |
| **`prep_loss_bps`**         | BOM inflation at **sale consume** only — **not** an operational waste event                                                                                                                                                                                                                                           |
| **Food-cost (theoretical)** | Σ `recipe_consumption_lines.line_cost_cents` for `status='consumed'` in date window; **excludes** all wastage movements and reversed consumptions                                                                                                                                                                     |
| **Capability matrix**       | Waste management 🟢 Existing = **SKU wastage only** (footnote: not ingredient waste)                                                                                                                                                                                                                                  |

### Problem

Operators need to record **ingredient / recipe prep waste** (e.g. burned batch, spoiled mise, discarded portions of a BOM) with:

1. Correct **inventory** decrease (CAS floor),
2. Optional **link to a recipe** and portion math consistent with consume,
3. **Cost snapshot** for ops reporting,
4. Clear separation from sale-driven theoretical food-cost %,
5. Without inventing a second inventory ledger or expanding `movement_type` CHECK casually.

Today they can only SKU-waste each ingredient manually (no recipe link, no COGS snapshot) or absorb loss into unexplained shrink via counts.

**This ADR is policy/design only.** It does **not** authorize schema, API, UI, or report code.

**Baseline at drafting:** schema **v88** · package **3.0.5** · tip includes ROPS-FC-ING (`24ef5d4` lineage).

---

## 2. Decision (Proposed — pending Accept)

### 2.1 Product semantics

1. **Recipe-linked waste is a first-class Restaurant Ops event**, distinct from:
   - SKU wastage (`action=wastage`) — remains for non-recipe / free-SKU disposal
   - Sale recipe consumption (`recipe_consumptions`) — remains sale-tied
   - `prep_loss_bps` — remains theoretical BOM inflate at consume time only

2. **v1 waste shape (authorized intent after Accept):**  
   Waste **N portions** of an **active recipe** for a menu product (same portion math as consume: `portionConsumeQty` + `prep_loss_bps` + yield).  
   Free-form multi-SKU disposal without a recipe stays on **existing SKU wastage**.

3. **Identity:** Each accepted waste request creates a durable **waste event** with its own id (not an `order_item_id`, not a `recipe_consumptions` row).  
   Reason: `recipe_consumptions.order_item_id` is UNIQUE and sale-scoped; overloading it would corrupt consume idempotency and food-cost SoT.

4. **Inventory effect:** For each expanded ingredient line, decrease stock with the same CAS floor semantics as recipe consume (`applyRecipeStockDelta` or equivalent Inventory-owned path). Insufficient stock → **fail closed** (400), no partial waste commit.

5. **Cost calculation:** Snapshot `unit_cost_cents` / `line_cost_cents` at waste time using `preferProductCostCents` (same as consume). Missing cost → line allowed with null cost (parity with consume honesty); do not fabricate 0.

6. **Food-cost / reporting impact (locked):**
   - **Do not** fold waste into R9.6 `theoretical_cogs_cents` or food-cost % (those remain **sale-consumption** theoretical COGS).
   - Expose waste cost as a **separate** report metric / section (e.g. `waste_cogs_cents` / “Waste COGS”) in a later authorized report slice.
   - Until that slice ships, waste remains visible via audit + movements + (after implement) waste event API/UI.

7. **Reversal:** v1 is **no reverse API**. Corrections = new inventory adjust / count variance (documented). Do not invent waste reverse without a follow-on ADR.

8. **Out of scope for this ADR / v1:** actual-vs-theoretical BI, addon BOM waste, multi-location, purchase returns, WAC/FIFO, QR-ORD-IDEM, Apple signing, Live Go-Live, ROPS-REFREV.

---

### 2.2 Ledger conventions (no new `movement_type` in v1)

Keep `inventory_movements.movement_type` CHECK unchanged (`sale` \| `cancel_restore` \| `adjustment`).

| Field            | Value                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `movement_type`  | `adjustment`                                                                                                                            |
| `reference_type` | `recipe_waste`                                                                                                                          |
| `reference_id`   | waste event id (string)                                                                                                                 |
| `reason`         | `recipe_waste` or `recipe_waste:<CODE>` where CODE ∈ existing wastage allowlist (`SPOILAGE`, `DAMAGED`, `EXPIRED`, `SPILLAGE`, `OTHER`) |

**Do not** reuse `reason=wastage` / `wastage:*` for recipe-linked waste (keeps SKU waste filters honest).  
**Do not** add `movement_type=wastage` without a separate migration ADR.

---

### 2.3 Persistence (schema required for Accept → Implement)

v1 **requires** a schema bump (proposed **v89**, name TBD) — **not applied by this ADR**:

**`recipe_waste_events`**

| Column            | Notes                            |
| ----------------- | -------------------------------- |
| `id`              | TEXT PK                          |
| `recipe_id`       | TEXT NOT NULL (snapshot FK soft) |
| `recipe_name`     | TEXT NOT NULL snapshot           |
| `menu_product_id` | TEXT NOT NULL snapshot           |
| `portions`        | REAL NOT NULL (> 0)              |
| `yield_qty`       | REAL NOT NULL snapshot           |
| `wastage_reason`  | TEXT NOT NULL (allowlist code)   |
| `actor_user_id`   | TEXT NULL                        |
| `notes`           | TEXT NULL                        |
| `created_at`      | TEXT NOT NULL                    |

**`recipe_waste_lines`**

| Column                  | Notes                                                     |
| ----------------------- | --------------------------------------------------------- |
| `id`                    | INTEGER PK                                                |
| `waste_event_id`        | TEXT NOT NULL → events                                    |
| `ingredient_product_id` | TEXT NOT NULL                                             |
| `ingredient_name`       | TEXT NULL snapshot                                        |
| `quantity_delta`        | REAL NOT NULL (negative, same sign convention as consume) |
| `unit`                  | TEXT NOT NULL                                             |
| `unit_cost_cents`       | INTEGER NULL                                              |
| `line_cost_cents`       | INTEGER NULL                                              |
| `inventory_movement_id` | INTEGER NULL                                              |
| `created_at`            | TEXT NOT NULL                                             |

Indexes: `waste_event_id`; optional `(created_at)`.

**Rationale vs “metadata-only on SKU wastage”:** Without line snapshots, waste COGS and by-ingredient waste reporting cannot reconcile to a durable SoT (same lesson as R5 consumptions).

---

### 2.4 Transaction boundaries

Single `withTxn` for one waste request:

```text
validate actor + recipe active + portions
        ↓
expand BOM → prepared lines (qty + cost snapshots)
        ↓
for each line: applyRecipeStockDelta(-qty)  // CAS; abort all on failure
        ↓
insert recipe_waste_events + recipe_waste_lines (+ movement ids)
        ↓
insert idempotency row (if keyed)
        ↓
logAuditEvent
```

No inventory write without durable waste event rows in the same transaction.  
No orphan movements if insert fails (same pattern as consume).

---

### 2.5 Idempotency

| Layer    | Mechanism                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP     | Mandatory `Idempotency-Key` (owner/manager mutations)                                                                                                                                              |
| Storage  | New `recipe_waste_idempotency` table **or** reuse pattern of `stock_adjust_idempotency` scoped by `(user_id, idempotency_key)` + request hash of `{ recipe_id, portions, wastage_reason, notes? }` |
| Replay   | Same key + same hash → return stored response; no second stock write                                                                                                                               |
| Conflict | Same key + different hash → 409                                                                                                                                                                    |

Natural keys alone (recipe + time) are **not** sufficient.

---

### 2.6 RBAC

| Role             | Waste create                                                                                                                                           | Waste read (list/get) |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| owner            | Yes                                                                                                                                                    | Yes                   |
| manager          | Yes                                                                                                                                                    | Yes                   |
| chef             | **No** mutate (match recipes mutate / stock adjust); read **optional** in implement slice — default **No** until product asks for chef kitchen logging |
| cashier / waiter | No                                                                                                                                                     | No                    |

Fail closed. Inventory module gate same as recipes/purchasing.

---

### 2.7 Audit events

| Action                    | When                    |
| ------------------------- | ----------------------- |
| `inventory.recipe_wasted` | Successful waste commit |

Metadata (sanitizer-safe): `waste_event_id`, `recipe_id`, `menu_product_id`, `portions`, `wastage_reason`, `line_count`, `waste_cogs_cents` (sum of known line costs).  
Entity: `recipe_waste` / event id.

Do **not** emit `inventory.wastage` for this path (reserved for SKU wastage).

---

### 2.8 API shape (illustrative — not authorized until Accept + implement)

```http
POST /api/recipes/:recipeId/waste
Idempotency-Key: <required>
Content-Type: application/json

{
  "portions": 1.0,
  "wastage_reason": "SPOILAGE",
  "notes": "optional"
}
```

Response: `{ waste_event, lines }` mirroring consumption DTOs where sensible.

List/get endpoints deferred to the implement slice (minimum: create + audit + movements sufficient for ops forensics).

---

### 2.9 Cost & reporting rules (detail)

| Rule                      | Decision                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Qty                       | Same `portionConsumeQty` as sale consume (includes `prep_loss_bps`)                                                    |
| Unit cost                 | `preferProductCostCents` at waste time                                                                                 |
| Line cost                 | `round(                                                                                                                | qty | × unit_cost_cents)` when unit cost known; else null |
| Event waste COGS          | Σ known `line_cost_cents` (null → 0 for sum; track insufficient count)                                                 |
| R9.6 theoretical COGS / % | **Unchanged** — sale consumptions only                                                                                 |
| Future waste report       | Separate query over `recipe_waste_*` (and optionally SKU `wastage%` movements without cost) — **new authorized slice** |
| ROPS-FC-ING               | Unchanged; do not mix waste lines into by-ingredient food-cost without an explicit follow-on ADR                       |

---

### 2.10 Edge cases

| Case                            | Behavior                                                                 |
| ------------------------------- | ------------------------------------------------------------------------ |
| Inactive recipe                 | 400 / 409 — waste only against **active** recipe (same as consume path)  |
| Empty BOM                       | 400 — nothing to waste                                                   |
| `portions <= 0` or non-finite   | 400                                                                      |
| Invalid `wastage_reason`        | 400 (Zod allowlist)                                                      |
| Insufficient ingredient stock   | 400; entire event aborted                                                |
| Concurrent waste + sale consume | Both CAS on stock; one may 400 — no negative stock                       |
| Recipe BOM edited after waste   | Historical waste lines remain snapshotted (immutable)                    |
| Recipe deactivated after waste  | Historical events remain readable                                        |
| Double-submit / retry           | Idempotency replay                                                       |
| Chef attempts waste             | 403                                                                      |
| Want to “undo” waste            | v1: use SKU increase / count — **no** waste reverse                      |
| Confuse with cancel restore     | Cancel restore only for sale consumptions; never auto-created from waste |
| Restaurant refund               | Unrelated (ROPS-REFREV); waste does not restock refunds                  |

---

## 3. Alternatives rejected

| Alternative                                             | Why rejected                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Encode waste as `recipe_consumptions` row without order | Breaks `order_item_id` UNIQUE / sale idempotency; pollutes food-cost SoT                                                        |
| SKU wastage + `recipe_id` only in audit metadata        | No durable line/cost SoT; weak reporting; easy to drift from BOM math                                                           |
| New `movement_type=wastage`                             | Requires CHECK migration; reason convention already works for SKU; recipe waste better as `recipe_waste*` reason + event tables |
| Include waste in theoretical food-cost %                | Misstates “food cost of sales”; mix ops scrap with sold COGS                                                                    |
| Always-reverse / undo waste in v1                       | Policy complexity; defer                                                                                                        |
| Free-form multi-ingredient waste API in v1              | Overlaps SKU wastage; expand later if needed                                                                                    |
| Chef write access by default                            | Stock mutation is O/M today; keep fail-closed                                                                                   |

---

## 4. Consequences

### Positive

- Clear separation: sale COGS vs operational recipe waste
- Inventory CAS + cost snapshot parity with consume
- SKU wastage remains simple for non-recipe disposal
- Food-cost report honesty preserved until a dedicated waste report ships

### Negative / cost

- Requires schema **v89** (events + lines + idempotency) before implement
- Operators must pick recipe + portions (not free-text ingredient bag) in v1
- No undo; training required
- Waste COGS invisible in R9.6 until a follow-on report slice

### Explicit non-goals (remain blocked)

QR-ORD-IDEM · Apple signing · Live Go-Live · multi-location · addon BOM · actual-vs-theoretical BI · refund→recipe reverse (separate ADR)

---

## 5. Acceptance checklist (before coding)

- [ ] Product + CTO mark this ADR **Accepted** (or revise)
- [ ] Confirm chef read/write policy (default: neither)
- [ ] Confirm waste report is a **separate** follow-on slice (recommended)
- [ ] Authorize implement slice with migration v89 + tests + UI
- [ ] Do **not** start ROPS-REFREV or ROPS-AVT under this ADR

---

## 6. Recommendation

| Gate                                 | Result                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| Design completeness                  | **Sufficient** for a thin implement slice after Accept     |
| Schema change required for implement | **Yes** (v89) — blocked until Accept + authorize migration |
| Implementation now                   | **Not authorized** (this task is design-only)              |

### Verdict for the current ask

```text
PROCEED  — to human Accept of ADR-015
BLOCKED  — for code/schema until Accept + explicit implement authorization
```

**Suggested next product step:** Accept (or amend) ADR-015, then authorize **ROPS-RWASTE implement** (migration + `POST …/waste` + O/M UI + tests). Optionally queue **waste COGS report** as ROPS-RWASTE-RPT after events exist.

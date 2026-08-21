# P17 — Recipe & Ingredient Consumption / Food Cost Audit

**Status:** COMPLETE (audit + implementation)  
**Implementation:** `docs/qa/P17-RECIPE-CONSUMPTION-IMPLEMENTATION-REPORT.md`  
**Date:** 2026-08-21  
**Baseline:** P16 COMPLETE (`3cb3806` / docs `dd137f4`, `d6d1357`)  
**Branch:** `restaurant-vertical`  
**Schema tip:** **v88** (unchanged)  
**Live pilot:** NO-GO (unchanged)

### Implementation status (2026-08-21)

| Gap                                       | Status                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| GAP-001 `cost_cents` dead path            | **FIXED** — SELECT + `preferProductCostCents`                  |
| GAP-002 FE BOM edit                       | **FIXED** — detail editors + save/cancel                       |
| GAP-003 prep_loss / yield_unit / PATCH FE | **FIXED**                                                      |
| GAP-004 cost snapshot immutability tests  | **FIXED** — in `test:p17`                                      |
| GAP-005 recipe CAS concurrency tests      | **FIXED** — in `test:p17`                                      |
| GAP-006 consumptions UI                   | **DEFERRED** (API remains; thin UI optional)                   |
| GAP-007 chef API ≠ GUI                    | **DOCUMENTED intentional** (read API; O/M GUI)                 |
| GAP-008 refund recipe reverse             | **POLICY PRESERVED** — no restaurant reverse; tests encode P16 |
| GAP-009 order Idempotency-Key             | **OUT OF RECIPE SCOPE** — existing order infra                 |
| GAP-010 soft FK                           | **DEFERRED** (would need migration)                            |
| GAP-011 docs/r5 schema drift              | **FIXED** — r5 `user_version` assert → 88                      |

P17 dedicated suite: `npm run test:p17` (merge tier).

---

## Executive Summary

Recipe/BOM consumption and theoretical food-cost are **already largely shipped** (R5 schema v79 + services/routes/UI; R9.6 food-cost report). P17 must **not** rebuild this stack.

P16’s atomic CAS floor **does** protect recipe ingredient consume. Multi-ingredient writes share the caller’s `withTxn` — mid-loop failure rolls back prior ingredient deductions. Consumption is idempotent per `order_item_id`. Historical consume lines snapshot qty/cost and are not rewritten when the live BOM or catalog cost changes.

Concrete P17-worthy gaps are primarily **hardening and UX/docs**:

1. Consume prefers `products.cost_cents` but never SELECTs it (**dead path / PARTIAL-BROKEN**).
2. Recipes FE cannot meaningfully edit BOM after create (Save is effectively a no-op UX).
3. FE omits `prep_loss_bps` / `yield_unit` / recipe PATCH.
4. Chef API read vs GUI redirect mismatch.
5. Dedicated consumption-report UI still thin vs Planned “Consumption reports”.
6. Refund never reverses recipe (aligned with P16 restaurant restock gate — document, don’t silently change).
7. Test gaps: cost-snapshot immutability after catalog cost change; recipe CAS race; audit assertions; r5/r9.6 often extended-tier.

**Schema for a harden-first P17: v88 YES** (no migration required for the recommended scope).

---

## Current Baseline

| Field             | Value                                           |
| ----------------- | ----------------------------------------------- |
| Git               | `restaurant-vertical`, clean, tip `d6d1357`     |
| P16               | Inventory OS Hardening COMPLETE — do not weaken |
| Schema            | **v88**                                         |
| Prior recipe work | R5 BOM + R9.6 food-cost report                  |
| Production        | LIVE PILOT NO-GO                                |

---

## Recipe Architecture

```text
products (menu SKU)
   └── recipes (product_id; one active via partial unique index)
         └── recipe_ingredients (ingredient_product_id → products)
               └── consume at order create/add-items/QR
                     ├── inventory_movements (adjustment / recipe_consumption)
                     └── recipe_consumptions + recipe_consumption_lines (snapshots)
```

Ingredients are **the same `products` table** (no separate ingredient master).

| Layer            | Path                                                            |
| ---------------- | --------------------------------------------------------------- |
| DDL              | migrations v79; `main/db.ts` createSchema mirror                |
| Definition       | `main/services/recipe.ts`, `recipe-cost.ts`                     |
| Consume          | `main/services/recipe-consumption.ts` → `applyRecipeStockDelta` |
| HTTP             | `main/routes/recipes.ts` → `/api/recipes` (module `inventory`)  |
| UI               | `/products/recipes`                                             |
| Food-cost report | `main/services/food-cost-report.ts` + `/reports`                |

---

## Recipe CRUD Matrix

| Capability                     | Status             | Evidence                                    |
| ------------------------------ | ------------------ | ------------------------------------------- |
| Create recipe + ingredients    | 🟢 EXISTING        | API + FE create panel                       |
| List / get                     | 🟢 EXISTING        | O/M/chef API; O/M GUI                       |
| Update name / yield            | 🟡 PARTIAL         | API PATCH exists; FE unused                 |
| Replace ingredients            | 🟡 PARTIAL / FE ⚫ | API PUT; FE Save without editors            |
| Activate / deactivate          | 🟢 EXISTING        | API + FE toggle                             |
| Hard delete                    | 🔴 MISSING         | Soft `is_active` only                       |
| Duplicate recipe               | 🔴 MISSING         | —                                           |
| Validation (qty/unit/self-ref) | 🟢 EXISTING        | Zod + service                               |
| Empty recipe (no lines)        | 🟢 EXISTING        | Allowed; consume no-ops without ingredients |

---

## Ingredient Mapping

| Aspect                                         | Status                                |
| ---------------------------------------------- | ------------------------------------- |
| Direct `ingredient_product_id` → `products.id` | 🟢 EXISTING                           |
| Soft FK (no SQL FK to products)                | 🟡 PARTIAL risk                       |
| Soft-deleted product                           | Consume 404; list JOIN may drop lines | 🟡  |
| Self-as-ingredient blocked                     | 🟢 EXISTING                           |

---

## Unit / Conversion Audit

| Aspect          | Status                                                     |
| --------------- | ---------------------------------------------------------- |
| Units allowlist | 🟢 `pcs\|box\|pack\|kg\|g\|L\|ml`                          |
| Conversion      | 🟢 milli-unit convert in `inventory-units` / `recipe-cost` |
| Prep loss       | 🟢 `prep_loss_bps` in math; FE create omits                | 🟡 FE             |
| Qty storage     | REAL + milli round on portion scale                        | 🟡 accepted (P16) |
| `1 kg = 1000 g` | 🟢 via conversion table                                    |

P16 REAL risk applies; portion path already milli-rounds. No schema bump recommended for P17 harden.

---

## POS → Recipe → Inventory Flow

```text
Cart / held     → no consume
Order create / add-items / QR  → withTxn {
  insert line
  decrementTrackedStock(menu)     // P16 sale CAS
  consumeRecipeForOrderItem       // BOM × loss / yield × qty; recipe CAS
}
Payment / complete → no consume
Partial pending cancel → no recipe reverse
Void preparing/ready → no recipe reverse
Full cancel / last-item collapse → reverseRecipe* + SKU restore
Restaurant refund restock → 403; no recipe reverse
```

Consumption is **automatic at order write**, not at payment.

---

## Consumption Logic

| Question                  | Verdict                                     |
| ------------------------- | ------------------------------------------- |
| Automatic?                | YES at create/add/QR                        |
| Once per line?            | YES — UNIQUE `order_item_id` + early return |
| Transactional with order? | YES — caller `withTxn`                      |
| Idempotent?               | YES per order_item                          |
| Fail → partial stock?     | NO — txn rollback                           |
| Payment fail consume?     | Already consumed earlier (P16 policy)       |
| Scale with sold qty?      | YES — `portions = line quantity`            |
| Addon BOM?                | NO                                          |

Formula: `(BOM qty × prep_loss) → inventory unit × portions / yield_qty`.

---

## Multi-Ingredient Atomicity

**Guaranteed under production call sites:** all ingredient UPDATEs + consumption rows share order `withTxn`. If cheese fails CAS, bun/patty mutations roll back.

**Severity if called outside txn:** P2 service contract risk (tests sometimes call bare).

---

## Idempotency

| Layer            | Behavior                                                     |
| ---------------- | ------------------------------------------------------------ |
| Recipe           | UNIQUE `order_item_id`; skip `already_consumed`              |
| Order HTTP retry | Needs Idempotency-Key to avoid second order → second consume |
| Reverse          | Status `reversed` guard                                      |

---

## Modifier / Add-on Consumption

**🔴 MISSING / 🔵 OUT OF SCOPE for rebuild** — addons affect price only; no BOM. Matrix/ADR exclude addon BOM from current OS. Classify as later unless product authorizes P17 slice.

---

## Yield / Portion Handling

| Feature                           | Status                     |
| --------------------------------- | -------------------------- |
| `yield_qty` / `yield_unit`        | 🟢 schema + API            |
| Portion scaling                   | 🟢 `portionConsumeQty`     |
| FE yield_unit / prep_loss editors | 🔴/🟡 MISSING on create UX |
| Batch kitchen production OS       | 🔵 OUT OF SCOPE            |

---

## Recipe Versioning

**No version table.** Live BOM is mutable; consumptions snapshot `recipe_id`, name, yield, line qty/cost. Changing milk 100→120 does **not** rewrite prior lines (R5 S-REC-08).

Risk: historical COGS stable; live cost % changes immediately — by design.

---

## Cost Calculation

| Basis                      | Reality                                          |
| -------------------------- | ------------------------------------------------ |
| Live recipe cost           | Catalog `products.cost` → cents                  |
| Consume snapshot           | `unit_cost_cents` / `line_cost_cents`            |
| Last purchase / WAC / FIFO | Not used for recipes                             |
| `cost_cents` prefer path   | **BROKEN dead code** — SELECT omits `cost_cents` |

---

## Food Cost %

```text
Food Cost % = Theoretical COGS / Net Sales × 100
```

- COGS = Σ snapshot `line_cost_cents` for `status='consumed'` in date window
- Net sales = day-sales **paid_amount** semantics (not gross − refunds)
- Tax/discount only via paid amount; waste not included
- Report + UI Existing (R9.6)

---

## Margin Calculation

**🔵 OUT OF SCOPE / Planned** — contribution bps among ingredients exists; selling margin / profitability not shipped.

---

## Historical Cost

**🟢 EXISTING** (snapshots). January consume keeps January unit cost; March catalog change does not rewrite.

**🟡 PARTIAL tests** — qty history tested; cost-immutability after catalog change not asserted in r5.

---

## Cost Synchronization

Live `GET /recipes/:id/cost` reflects catalog immediately. Past consumptions do not sync. Dual-write `cost`/`cost_cents` is architectural; consume bug makes `cost_cents` unused.

---

## Waste / Yield

Operational wastage = inventory adjust `wastage:*`. Recipe prep loss = BOM `prep_loss_bps`. Food-cost report excludes wastage movements. **Separated — EXISTING.**

---

## Cancel / Void / Refund Interaction

Matches **P16 policy** (not a regression):

| Event                   | Recipe reverse? |
| ----------------------- | --------------- |
| Partial pending cancel  | No              |
| Void                    | No              |
| Full cancel / last-item | Yes             |
| Restaurant refund       | No              |

---

## RBAC

| Role           | Recipes mutate | Recipes read API | Recipes GUI  | Food-cost |
| -------------- | -------------- | ---------------- | ------------ | --------- |
| Owner/Manager  | Y              | Y                | Y            | Y         |
| Chef           | N              | Y                | N (redirect) | N         |
| Cashier/Waiter | N              | N                | N            | N         |

**Mismatch:** chef API vs GUI — PARTIAL.

---

## Audit Logging

| Event                                                             | Status                 |
| ----------------------------------------------------------------- | ---------------------- |
| `recipe.created/updated/activated/deactivated/ingredient_changed` | 🟢                     |
| `inventory.recipe_consumed/restored`                              | 🟢                     |
| Food-cost export audit                                            | 🔴 N/A (read-only GET) |
| Test assertions of audits                                         | 🟡 PARTIAL             |

---

## Frontend / UX

| Surface                                       | Status                  |
| --------------------------------------------- | ----------------------- |
| Recipes list / create / activate / cost panel | 🟢 production-usable    |
| Post-create BOM edit                          | ⚫ BROKEN UX            |
| prep_loss / yield_unit / PATCH                | 🟡 MISSING FE           |
| Consumptions list UI                          | 🔴 MISSING (API exists) |
| Food-cost on Reports                          | 🟢                      |

---

## Reporting

| Report                   | Status      |
| ------------------------ | ----------- |
| Theoretical food-cost %  | 🟢 Existing |
| Recipe cost live         | 🟢 Existing |
| Consumption list API     | 🟢; UI 🔴   |
| Actual vs theoretical BI | 🔵 Planned  |
| Profitability / margin   | 🔵 Planned  |

---

## Test Coverage

| Scenario                    | Coverage                                                |
| --------------------------- | ------------------------------------------------------- |
| Basic consume               | PASS (r5)                                               |
| Qty × sold                  | PASS                                                    |
| Multi-ingredient            | PASS                                                    |
| Insufficient stock BLOCK    | PASS                                                    |
| Atomic rollback mid-BOM     | Implicit via withTxn; no dedicated fail-mid-loop assert |
| Idempotent re-consume       | PASS                                                    |
| Concurrent consume          | PASS (r5)                                               |
| Modifier BOM                | N/A missing                                             |
| Refund reverse              | Documented gap                                          |
| Cancel reverse              | PASS                                                    |
| Cost snapshot immutability  | **NOT TESTED**                                          |
| Recipe CAS race (P16-style) | **NOT TESTED** (sale CAS covered)                       |
| Food-cost report math       | PASS (r9.6; often seeded)                               |
| Merge CI                    | r5/r9.6 often **extended**                              |

---

## Schema Impact

### Can P17 harden on v88?

**YES** for recommended scope (SELECT cost_cents, FE fixes, tests, docs).

**PARTIAL / migration later** only if authorizing: formal recipe versions, reserved_qty, addon BOM tables, typed movements.

Do **not** bump schema for the recommended P17 harden slice.

---

## Architectural Risks

| ID     | Rank | Risk                                                                           |
| ------ | ---- | ------------------------------------------------------------------------------ |
| R-P1-1 | P1   | `cost_cents` dead at consume — inconsistent with dual-write                    |
| R-P1-2 | P1   | FE BOM edit broken / incomplete                                                |
| R-P1-3 | P1   | Client retry without order Idempotency-Key double-consumes via new order       |
| R-P2-1 | P2   | Soft FKs / orphan ingredient after product soft-delete                         |
| R-P2-2 | P2   | Menu SKU track_inventory + recipe double-deduct (documented)                   |
| R-P2-3 | P2   | Partial cancel / void / refund leave ingredients written off (P16 intentional) |
| R-P2-4 | P2   | r5/r9.6 not merge-gated; missing cost-history + audit asserts                  |
| R-P2-5 | P2   | Chef API/GUI mismatch                                                          |
| R-P3-1 | P3   | Consume service not self-transactional                                         |
| R-P3-2 | P3   | No dedicated recipe CAS concurrency test                                       |

No P0 “partial multi-ingredient commit” under production paths.

---

## Concrete P17 Gaps

### P17-GAP-001 — Consume ignores `cost_cents`

- **Problem:** Prefer path never loaded.
- **Current:** SELECT `cost` only; always `toCostCents(cost)`.
- **Expected:** Prefer `cost_cents` when present (match dual-write).
- **Evidence:** `recipe-consumption.ts` loadIngredientProduct ~78–80 vs unitCostCents ~204–207.
- **Severity:** P1
- **Files:** `recipe-consumption.ts`, r5/r9.6 tests
- **Schema:** none
- **Dependency:** P0.3 dual-write

### P17-GAP-002 — Recipes FE cannot edit BOM after create

- **Problem:** Detail Save has no add/edit/remove controls.
- **Severity:** P1 (UX)
- **Files:** `frontend/.../recipes/page.tsx`, `lib/recipes.ts`
- **Schema:** none

### P17-GAP-003 — FE missing prep_loss / yield_unit / PATCH

- **Problem:** Backend supports; create UX defaults only.
- **Severity:** P2
- **Schema:** none

### P17-GAP-004 — Cost snapshot immutability untested

- **Problem:** Design claims historical cost stable; no test after catalog cost change.
- **Severity:** P2
- **Files:** `tests/r5-*.test.ts`
- **Schema:** none

### P17-GAP-005 — Recipe CAS concurrency untested

- **Problem:** Code has P16 floor; no race test for ingredients.
- **Severity:** P2
- **Schema:** none

### P17-GAP-006 — Consumptions API without UI; matrix “Consumption reports” Planned

- **Problem:** List API exists; no operator UI; matrix still Planned for deeper BI.
- **Severity:** P2/P3
- **Schema:** none
- **Note:** Thin UI ≠ full BI; don’t expand into Planned warehouse

### P17-GAP-007 — Chef read API vs GUI

- **Severity:** P2
- **Schema:** none

### P17-GAP-008 — Refund never reverses recipe (restaurant)

- **Problem:** Paid refund leaves ingredients consumed.
- **Current:** Matches P16 restock gate.
- **Expected:** Explicit product decision — restore vs write-off.
- **Severity:** P1 product / P2 eng if only docs+tests
- **Dependency:** Do **not** weaken P16 without authorization

### P17-GAP-009 — Order retry without Idempotency-Key

- **Problem:** New order → new consume.
- **Severity:** P1 ops / existing order infra
- **Schema:** none
- **Direction:** Strengthen FE/docs; not new recipe idempotency system

### P17-GAP-010 — Soft FK orphan risk

- **Severity:** P2
- **Schema:** optional FK later — stop if migration required without auth

### P17-GAP-011 — Docs drift (R5 schema version; matrix food-cost BI note)

- **Severity:** P3
- **Schema:** none

---

## Out-of-Scope Items

- Addon/modifier BOM
- Formal recipe versioning product
- WAC/FIFO / last-purchase recipe basis
- Selling margin / profitability OS
- Actual-vs-theoretical food-cost BI warehouse
- Kitchen production / MRP / multi-location
- Procurement returns
- Reserved quantity model
- Typed inventory movement ledger
- P18 and beyond

---

## Recommended P17 Implementation Scope

**Name:** Recipe Consumption & Cost Hardening (not greenfield BOM)

```text
P17-A — Fix consume cost_cents SELECT + tests          (GAP-001, GAP-004)
P17-B — Recipes FE BOM edit + prep_loss/yield_unit     (GAP-002, GAP-003)
P17-C — Recipe CAS race + mid-loop rollback test       (GAP-005)
P17-D — Encode refund/partial-cancel recipe policy     (GAP-008; docs+tests only unless product changes)
P17-E — Optional thin consumptions UI OR chef read UI  (GAP-006/007 — pick one)
P17-F — Docs/matrix sync + promote critical r5 asserts (GAP-011, CI subset)
P17-G — Regression: p16, r5, r9.6, inv-auto-86, critical
```

**Explicitly exclude from first P17 authorize:** addon BOM, margin OS, typed ledger, schema bump.

---

## Acceptance Criteria (for future implementation)

- [ ] Consume snapshots prefer `cost_cents` when present; tests cover catalog cost change history.
- [ ] Multi-ingredient consume remains atomic under `withTxn`; CAS floor preserved (P16 intact).
- [ ] Idempotent re-consume per order_item remains green.
- [ ] FE can replace BOM ingredients with validation; prep_loss/yield editable where API supports.
- [ ] Cancel/void/refund recipe behavior matches P16 policy (or authorized change documented).
- [ ] No client actor spoofing; recipe audits remain.
- [ ] Schema remains **v88** unless migration explicitly authorized.
- [ ] `test:p16`, `test:r5`, `test:r9.6`, critical remain green.
- [ ] No P18 / addon BOM / profitability rebuild.

---

## Test Plan (future)

1. Catalog cost change after consume → historical `line_cost_cents` unchanged; live cost updates.
2. SELECT includes `cost_cents`; prefer path used.
3. Two concurrent consumes of last ingredient unit → one fail, no partial BOM.
4. Fail second ingredient mid-loop → first ingredient stock restored (txn).
5. FE BOM replace round-trip.
6. Regression p13–p16 + r5 + r9.6.

---

## Stop Condition

P17 implementation is COMPLETE. See `docs/qa/P17-RECIPE-CONSUMPTION-IMPLEMENTATION-REPORT.md`.

Schema remained **v88**. Do not start P18 without a separate audit and authorization.

**Production code and schema were not modified for the audit-only phase;** implementation followed in the same branch under the P17 authorize prompt.

---

## Appendix — Baseline

```text
git status          → clean
git branch          → restaurant-vertical
git log -5          → d6d1357, dd137f4, 3cb3806, e1be5f8, 40f5fb9
schema tip          → v88
```

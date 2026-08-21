# P17 — Recipe & Ingredient Consumption / Food Cost Hardening Implementation Report

**Status:** COMPLETE  
**Feature:** Recipe & Ingredient Consumption / Food Cost Hardening  
**Feature ID:** `RCP-CONSUMPTION-HARDENING`  
**Date:** 2026-08-21  
**Commit:** `2d89064` (`2d8906448b1179b2a52bff2b9e9e14f1791c9f7c`)  
**Schema:** **v88** (no bump)  
**Live pilot:** NO-GO

---

## Executive Summary

P17 hardens the existing R5/R9.6 recipe stack without rebuilding it. Consume and live recipe cost now prefer dual-write `products.cost_cents` when present; historical consumption snapshots remain immutable when catalog cost changes; the recipes FE can edit BOM (qty/unit/prep_loss), PATCH yield/name, and save/cancel; concurrency, multi-ingredient atomicity, idempotency, and P16 cancel/void/refund recipe policy are proven in `npm run test:p17`. Schema stays v88. Addon BOM, WAC/FIFO, profitability OS, and actual-vs-theoretical BI remain deferred.

---

## Implemented Changes

| Area             | Change                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Consume cost     | `loadIngredientProduct` SELECTs `cost_cents`; `preferProductCostCents` |
| Live recipe cost | `listRecipeIngredients` loads `cost_cents`; same prefer helper         |
| Recipes FE       | Detail BOM editors; prep_loss/yield_unit; PATCH meta; create parity    |
| Tests            | `tests/p17-recipe-consumption-hardening.test.ts` + `npm run test:p17`  |
| R5 drift         | Fresh DB `user_version` assert → 88 (GAP-011)                          |
| Docs             | Audit status; this report; feature inventory; `.ai`                    |

---

## Cost Snapshot Fix

**GAP-001 / P17-A.** Prefer path existed but SELECT omitted `cost_cents`, so snapshots always used `toCostCents(cost)`.

- Added `preferProductCostCents` in `main/services/recipe-cost.ts`
- Consume SELECT includes `cost_cents`
- Live cost uses the same prefer path
- Single deterministic source: `cost_cents` when finite, else REAL `cost`

No WAC/FIFO. No second costing engine.

---

## Frontend BOM Fix

**GAP-002 / P17-B.** Detail “Save ingredients” was an identity rewrite with no editors.

- Editable draft lines: quantity, unit, `prep_loss_bps`, remove, add
- Save → `replaceRecipeIngredients`; Cancel → reset from loaded ingredients
- Meta PATCH: name, `yield_qty`, `yield_unit` via `updateRecipe`
- Create form exposes `yield_unit` and `prep_loss_bps`
- Owner/manager GUI only (unchanged)

---

## Prep Loss / Yield Changes

API already supported both. FE now creates/edits `prep_loss_bps` (0–10000) and `yield_unit` (allowlist). Invalid values rejected client-side and server-side.

---

## Concurrency Guarantees

**P17-C.** Competing consumes of last ingredient unit under `withTxn`: exactly one succeeds, stock ends at 0. Stock=0 fails. Uses existing P16 CAS floor in `applyRecipeStockDelta` — no transaction rewrite.

---

## Multi-Ingredient Atomicity

**P17-D.** Recipe A/B/C with B stock=0: consume fails; A/B/C unchanged; no consumption row. Proven under caller `withTxn` (production order path).

---

## Idempotency

**P17-E.** Re-consume same `order_item_id` → `already_consumed`, stock unchanged. Duplicate reverse is a no-op.

---

## Cancel / Void / Refund Policy

**P17-F / GAP-008.** Encoded to match P16 — **no product policy change**:

| Event                            | Recipe reverse?                  |
| -------------------------------- | -------------------------------- |
| Full cancel / last-item collapse | Yes                              |
| Partial pending cancel           | No                               |
| Void                             | No (write-off)                   |
| Restaurant refund / restock      | No (`RESTOCK_VERTICAL_DISABLED`) |

Restaurant refund recipe reverse remains intentionally missing; documented, tested, not enabled.

---

## RBAC

- Mutate recipes: owner/manager (server `requireRole`)
- Read API: owner/manager/**chef**
- Recipes GUI: owner/manager only — **intentional** (chef read API for tools; mutation UI stays O/M)
- No new Chef permissions; no RBAC weaken

---

## Audit Logging

Preserved: `recipe.created/updated/activated/deactivated/ingredient_changed`, `inventory.recipe_consumed/restored`. P17 asserts update + ingredient_changed on BOM/PATCH paths.

---

## Schema

**v88 — no migration.** Soft FKs, reserved_qty, typed ledger, addon BOM tables not introduced.

---

## Test Results

| Suite                         | Result                                      |
| ----------------------------- | ------------------------------------------- |
| `npm run test:p17`            | **42 passed**                               |
| `npm run test:r5`             | **PASS** (after user_version 88 assert fix) |
| `npm run test:r9.6`           | **14 passed**                               |
| `npm run test:discover-guard` | **PASS**                                    |

---

## Regression Results

| Suite                     | Result      |
| ------------------------- | ----------- |
| `test:p16`                | **47 PASS** |
| `test:p15`                | **34 PASS** |
| `test:p14`                | **52 PASS** |
| `test:data-audit` (P13)   | **31 PASS** |
| `test:critical`           | **PASS**    |
| `test:inventory-boundary` | **PASS**    |
| `test:inventory-ledger`   | **PASS**    |
| `order-void-cancel-stock` | **PASS**    |
| `audit-log`               | **PASS**    |

---

## Known Limitations

- Soft FK on `ingredient_product_id` (no SQL FK) — deferred (migration would be required)
- Order retry without Idempotency-Key can create a second order → second consume (order infra; not new recipe idempotency)
- Menu SKU `track_inventory` + recipe can double-deduct (documented R5/P16)
- Frontend lint crashes on pre-existing `eslint/config` module resolution (baseline; 0 new rule errors)

---

## Deferred Items

- Thin consumptions list UI (API exists; optional; deferred)
- Chef read-only recipes GUI (API/GUI mismatch intentional)
- Addon/modifier BOM
- Selling margin / profitability OS
- Actual-vs-theoretical BI
- WAC / FIFO recipe costing
- Restaurant refund recipe reverse (policy: keep disabled)
- Typed ledger / `reserved_qty` / P18

---

## Production Gate

**NO-GO** — unchanged (unsigned RC / OPS-02 / pilot gates).

---

## Stop Condition

None triggered. Schema remained v88; P16 policy preserved; no addon BOM / new costing architecture; no P18.

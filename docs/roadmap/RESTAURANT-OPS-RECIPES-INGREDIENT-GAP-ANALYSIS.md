# Restaurant Operations — Recipes & Ingredient Inventory

**Date:** 2026-08-21  
**Product brand:** Operavia  
**Branch tip:** `971e54f` (pushed; includes `ab4d465` RCP-05 + PRC-DRAFT)  
**Schema:** v88 · **Package:** 3.0.5

**Deferred (unchanged):** QR-ORD-IDEM · Apple signing · Live Go-Live / OPS-02 site gates.

---

## 1. R5 Inventory & Procurement — CLOSE-OUT

Program “R5 Inventory & Procurement” = shipped **R4 Inventory + R5 BOM/Recipes + R6 Purchasing** + P5/P16/P17 + RCP-05 + PRC-DRAFT.

| Pillar                                             | Status                                                         |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Stock ledger, adjust, counts, low-stock, valuation | **COMPLETE**                                                   |
| Auto-86 (SKU + recipe portion)                     | **COMPLETE** (matrix POS/Menu 86 rows still Planned — doc lag) |
| Recipes/BOM CRUD, consume, reverse, cost_cents     | **COMPLETE**                                                   |
| Consumptions API + list UI (RCP-05)                | **COMPLETE**                                                   |
| Theoretical food-cost report (R9.6)                | **COMPLETE**                                                   |
| Purchasing + draft PO line amend (PRC-DRAFT)       | **COMPLETE**                                                   |

### Remaining (do **not** treat as the next major vertical)

| Priority     | Item                                                           | Class              |
| ------------ | -------------------------------------------------------------- | ------------------ |
| P2           | Movements CSV / ledger-check UI                                | Inventory polish   |
| P2           | Soft FK recipe ingredients; inactive-ingredient cost honesty   | Integrity harden   |
| P2           | Supplier edit/reactivate UI                                    | Procurement polish |
| P3           | Waste report UI/CSV; promote r4/r5/r6 to merge                 | Hygiene            |
| Later/Frozen | WAC/FIFO, transfer, expiry, multi-loc, addon BOM, auto-reorder | Out of band        |

**Verdict:** Inventory & Procurement core is **closed** for product deepen of that wave. Next major area is **Restaurant Operations** on top of the recipe/ingredient foundation — not indefinite inventory polish.

---

## 2. Foundation (already strong)

```text
Products → Recipes/BOM → Ingredient consumption → Inventory ledger → Food cost → Auto-86
```

Evidence: `recipe.ts`, `recipe-consumption.ts`, `recipe-cost.ts`, `food-cost-report.ts`, `product-availability.ts`, `/products/recipes`, `/products/recipes/consumptions`, Reports food-cost panel.

---

## 3. Restaurant Operations — feature gap matrix

| Feature                            | ID          | State          | Evidence                                                                                   | Deps ready?            | Priority      |
| ---------------------------------- | ----------- | -------------- | ------------------------------------------------------------------------------------------ | ---------------------- | ------------- |
| BOM + yield + prep_loss            | ROPS-BOM    | **COMPLETE**   | Recipes UI + consume                                                                       | —                      | —             |
| Sale consume / cancel reverse      | ROPS-CON    | **COMPLETE**   | Order txn + RCP-REV                                                                        | —                      | —             |
| Consumptions list UI               | ROPS-HIST   | **COMPLETE**   | RCP-05                                                                                     | —                      | —             |
| Theoretical food-cost report       | ROPS-FC     | **COMPLETE**   | R9.6 JSON + UI                                                                             | —                      | —             |
| Food-cost CSV export               | ROPS-FC-CSV | **COMPLETE**   | `GET /api/reports/export/food-cost.csv` + Reports Download                                 | —                      | —             |
| Food-cost by-ingredient rollup     | ROPS-FC-ING | **COMPLETE**   | `by_ingredient` on food-cost JSON + UI + CSV section; reconciles to period COGS            | —                      | —             |
| Actual vs theoretical BI           | ROPS-AVT    | **LATER**      | Matrix/R9.6/P17 explicit Later                                                             | Eng yes; product Later | Auth required |
| Recipe-linked waste                | ROPS-RWASTE | **COMPLETE**   | ADR-015 Accepted; schema v89; `POST /api/recipes/:id/waste`; O/M UI; `npm run test:rwaste` | —                      | —             |
| Restaurant refund → recipe reverse | ROPS-REFREV | **POLICY GAP** | Cancel reverse exists; refund restock asymmetry                                            | Policy ADR             | P2            |
| Addon/modifier BOM                 | ROPS-ADDON  | **DEFERRED**   | Price-only addons                                                                          | Design + auth          | Deferred      |
| Formal recipe versions             | ROPS-VER    | **MISSING**    | Snapshots only                                                                             | Schema                 | Deferred      |
| Prep / production batches          | ROPS-PREP   | **MISSING**    | Yield is sale math only                                                                    | New model              | Do not invent |
| Ingredient substitution            | ROPS-SUB    | **NONE**       | No code                                                                                    | —                      | Do not invent |
| Allergen / recipe notes ops        | ROPS-ALG    | **NONE**       | No recipe allergen model                                                                   | —                      | Do not invent |
| Matrix 86 doc lag                  | ROPS-86-DOC | **DOC**        | Auto-86 Existing in inventory                                                              | Docs only              | P3            |

---

## 4. Shipped deepens

### Food-cost CSV export (ROPS-FC-CSV) — **COMPLETE**

| Field            | Value                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Status**       | `GET /api/reports/export/food-cost.csv`; Reports Download; audit `report.food_cost_exported`; `test:r9.6` |
| **Out of scope** | Actual-vs-theoretical BI, waste inclusion, WAC, QR-ORD-IDEM, signing                                      |

### By-ingredient food-cost rollup (ROPS-FC-ING) — **COMPLETE**

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Status**         | Same `queryFoodCostReport` SoT; `by_ingredient` on JSON; UI table; CSV second section after blank line           |
| **Reconciliation** | Σ `by_ingredient.theoretical_cogs_cents` == period `theoretical_cogs_cents` (integer cents; null line costs → 0) |
| **Rounding**       | Qty: 6 dp; effective unit cost: round(cogs / known_qty); % of COGS: 2 dp                                         |
| **Filters**        | Same as food-cost: `start_date` / `end_date` only                                                                |

### Recipe-linked waste (ROPS-RWASTE) — **COMPLETE**

| Field            | Value                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**       | Schema v89; `POST /api/recipes/:id/waste` + Idempotency-Key; O/M UI on recipes; ledger `adjustment`/`recipe_waste`; audit `inventory.recipe_wasted`; `test:rwaste` |
| **Out of scope** | Waste reverse; waste COGS report; prep batches; recipe versions; actual-vs-theoretical BI; free-form multi-SKU waste                                               |

### Next deepen candidates

1. **Waste COGS report** (ROPS-RWASTE-RPT) — separate metric over `recipe_waste_*` (do not fold into R9.6 theoretical %)
2. Refund→recipe reverse — **policy ADR first** (ROPS-REFREV)
3. Actual-vs-theoretical BI — Later (auth required)

---

## 5. Explicit non-goals

- Rebuild R4/R5/R6
- Inventory CSV / soft FK / supplier edit as “Restaurant Ops”
- QR-ORD-IDEM, Apple signing, Live Go-Live
- Inventing prep-batch OS / allergens / substitutions without product design

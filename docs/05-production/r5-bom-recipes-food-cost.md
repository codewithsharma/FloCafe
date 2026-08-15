# R5 — BOM / Recipes / Food Cost OS

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v79 (`recipes`, `recipe_ingredients`, `recipe_consumptions`, `recipe_consumption_lines`)  
**Baseline:** R4 `cbfb264` on `restaurant-vertical`  
**Suite:** `npm run test:r5` (S-REC-01 … S-REC-12)

---

## Architecture

```
MENU ITEM (products)
    ↓
RECIPE / BOM (recipes + recipe_ingredients)
    ↓
INGREDIENT SKUs (products.track_inventory)
    ↓
INVENTORY LEDGER (inventory_movements via Inventory service)
    ↓
FOOD COST (integer cents; theoretical)
```

R4 inventory remains the stock SoR. R5 does **not** create a second inventory system.

---

## Recipe model

| Field                      | Role                                                 |
| -------------------------- | ---------------------------------------------------- |
| `product_id`               | Menu / sellable product                              |
| `name`                     | Recipe name                                          |
| `yield_qty` / `yield_unit` | Batch yield (portions)                               |
| `is_active`                | One active recipe per product (partial unique index) |
| actor / timestamps         | Auditability                                         |

Ingredients are existing `products` rows (no separate ingredient catalog).

BOM line: ingredient product, quantity, unit, optional `prep_loss_bps` (0–10000), position.

---

## Units

Reuses R4 `inventory-units.ts`:

- Allowed: pcs, box, pack, kg, g, L, ml
- Same-family only (kg↔g, L↔ml)
- Cross-dimension rejected (no density inventions)

---

## Recipe cost / food cost %

Service: `main/services/recipe-cost.ts`

- Currency: **integer cents** (`Math.round(cost * 100)`)
- Quantity: milli-scaled portion math
- Recipe cost = Σ (qty_with_loss × unit_cost_cents) for the batch
- Portion cost = batch / yield
- Food cost % = portion_cost / selling_price × 100 when price > 0 and **all** ingredient costs present
- Missing / inactive ingredient cost → `status: insufficient_data` (never fabricate 0)

---

## Consumption lifecycle

**Point:** order create / add-items (same boundary as sellable SKU `decrementTrackedStock`).

Not at: cart, payment, KDS ready/preparing, manual complete.

Flow:

1. Resolve active recipe (none → no-op)
2. Compute portion consume qty per ingredient
3. `assertStockAvailable` (BLOCK — existing policy)
4. `applyRecipeStockDelta` → `movement_type=adjustment`, `reason=recipe_consumption`
5. Snapshot `recipe_consumptions` + lines (qty, unit, unit_cost_cents)
6. Audit `inventory.recipe_consumed`

Sellable SKU `sale` movements unchanged when `track_inventory=1` on the menu item.

---

## Idempotency

`recipe_consumptions.order_item_id` is **UNIQUE**.

Duplicate consume for the same order item → no-op (`already_consumed`).

---

## Cancel / refund

| Event                       | Recipe behavior                         |
| --------------------------- | --------------------------------------- |
| Full order cancel           | Reverse consumptions (`recipe_restore`) |
| Last-item cancel collapse   | Reverse consumptions                    |
| Void preparing/ready        | **No** reverse (matches SKU void)       |
| Partial pending item cancel | **No** reverse (matches SKU asymmetry)  |
| Restaurant refund restock   | **Not implemented** (retail-only today) |

Reversal is idempotent (`status=reversed`).

---

## Historical integrity

Consumption lines snapshot quantities and unit costs at sale time.

Changing a recipe later does **not** rewrite past consumptions or past ledger rows.

Cost basis for history = `unit_cost_cents` on `recipe_consumption_lines` at consume time.

---

## Ledger

`inventory_movements` CHECK unchanged (`sale` \| `cancel_restore` \| `adjustment`).

Recipe consume/restore use `adjustment` + reason.

`reconstructQuantityFromLedger` must remain valid including recipe movements.

---

## Insufficient stock

**BLOCK** (existing): `assertStockAvailable` → HTTP 400. No ALLOW_NEGATIVE invented.

---

## Modifiers / addons

**Gap:** addon/modifier-specific BOM not implemented. Addons remain price-only.

---

## RBAC

| Role             | Recipe mutate | Recipe read   | Consume (via order) |
| ---------------- | ------------- | ------------- | ------------------- |
| Owner / Manager  | Yes           | Yes           | Yes (order APIs)    |
| Chef             | No            | Yes           | Yes (order path)    |
| Cashier / Waiter | No            | No (list 403) | Yes (order path)    |

Server `requireRole` is authoritative.

---

## Offline

All local SQLite. No cloud gate for recipe resolve or depletion.

---

## UI

`/products/recipes` — list, create, ingredients, cost / food-cost %, activate/deactivate.

Missing cost shows insufficient-data messaging (not “0”).

Consumption history: `GET /api/recipes/consumptions?order_id=`.

---

## Tests

```sh
npm run test:r5
```

Scenarios: S-REC-01 … S-REC-12.

Regression: `test:r1`–`test:r4`, `test:h1`–`test:h4`, inventory ledger.

---

## Remaining gaps

- Modifier/addon BOM
- Restaurant refund → recipe reverse (retail restock path only today)
- Partial line cancel restock (SKU asymmetry inherited)
- Actual vs theoretical food-cost BI (R12)
- RECIPE_WASTE as separate wastage class (prep_loss_bps is BOM inflation only)
- Purchasing / suppliers / PO (**R6**)

---

## Out of scope (stop)

Suppliers, PO, receiving, multi-location, online ordering, payment gateways, payroll, Retail, Phase 4.16, microservices, cloud migration.

# Phase 4.13 — Restaurant Table Merge Discovery

**Date:** 2026-08-14  
**Status:** COMPLETE (discovery only — **no implementation**)  
**Schema:** v75 — **unchanged**  
**Production code:** unchanged

---

## Verdict

| Slice                                        | Status                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transfer (`POST /api/tables/:id/move-order`) | **EXISTS.** Occupied target → **409** `"Target table already has an active order"`.                                                                                                                                            |
| Merge of two occupied tables                 | **NOT BUILT.** Transfer cannot merge (409 is the invariant).                                                                                                                                                                   |
| **SAFE NOW (future phase)**                  | Unpaid-only: two open dine-in orders, **no bills**, no split, no held carts; **reparent** `order_items` (keep ids/KDS status); cancel source **without** stock restore; free source table; `notifyKdsUpdate`; restaurant-only. |
| **ADR_REQUIRED**                             | Any billed / partial / paid / split merge; combining bill numbers; reallocating payments; FIN-01. **Do not implement in this 10.**                                                                                             |

This phase does **not** ship `/merge`. Feature-list remains **NOT BUILT**.

---

## Current transfer (characterize)

**Path:** `main/routes/tables.ts` `POST /:id/move-order`  
**Auth:** owner | manager | cashier | waiter  
**Body:** `{ target_table_id, order_id? }`

| Step                        | Result                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Same table                  | 400 already on this table                                                                                            |
| Missing table               | 404                                                                                                                  |
| No active order on source   | 404                                                                                                                  |
| **Target has active order** | **409**                                                                                                              |
| Success                     | `UPDATE orders.table_id`; source `available`; target `occupied`; `order.table_moved` cloud sync; `notifyKdsUpdate()` |

Active order = `status NOT IN ('completed', 'cancelled')`, latest `created_at DESC` unless `order_id` is passed.

**Frontend:** no `move-order` caller. Tables UI is CRUD / reserve / mark-available. Transfer is **API-only**.

**Tests:** `tests/tables-string-ids.test.ts` covers happy-path transfer to a **free** table. **No test currently asserts 409 on occupied target** (prompt claim was wrong). Characterization command:

```sh
node tests/run-electron-node-test.cjs tests/tables-string-ids.test.ts
```

Grep lock: `"Target table already has an active order"` lives only in `tables.ts`.

### Transfer gaps (not merge)

- Order create does **not** refuse a second dine-in on an already occupied table. Two actives on one table are possible; move then takes `LIMIT 1`.
- Target `held` / `reserved` / `cleaning` is not checked — only “has an active order.”
- `held_orders` is not consulted. Held JSON can remain on the **source** table after occupy is cleared.

### What transfer does **not** touch

| Surface                 | Behavior                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Bills                   | Untouched. `bills.order_id` FK; no `bills.table_id`. Unpaid bill follows the order. |
| KDS                     | Same `order_id` / items; next broadcast shows new table number.                     |
| Inventory               | No stock calls (correct).                                                           |
| Guest / type / customer | Unchanged.                                                                          |

---

## Merge case matrix (not implemented)

`move-order` **cannot** implement merge. A future restaurant-only endpoint would be required, e.g. `POST /api/tables/:id/merge` `{ source_table_id }` (surviving table = `:id`) — **do not ship**.

| Case                           | Transfer today         | If merge were built                                                                                     | Risk                                                                                                          |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A. Both unpaid, **no bill**    | 409                    | Reparent items onto surviving order; cancel source without `restoreTrackedStock`; free source           | **SAFE NOW** if no split / held carts. **Do not** reuse `POST /orders/:id/items` (it decrements stock again). |
| B. One billed (unpaid/partial) | 409                    | Would rewrite unpaid/partial `bill.total`                                                               | **ADR_REQUIRED** (FIN-01 collectible = total − gross tender)                                                  |
| C. Both billed                 | 409                    | Two bill numbers, payments, refunds                                                                     | **ADR_REQUIRED.** Merge ≠ inverse of split. Paid source is already 404 (completed).                           |
| D. KDS in progress             | Table label updates    | Reparent keeps `order_items.id` + kitchen status; cancel+re-add resets tickets and double-touches stock | Safe **only** if items are reparented                                                                         |
| E. Held carts                  | Transfer ignores holds | Refuse merge if either table has `held_orders`, or define JSON merge                                    | Floor bug already: transfer onto a held cart                                                                  |
| F. Split checks                | Follows order          | Add-items is 409 after split                                                                            | **ADR_REQUIRED**                                                                                              |

**Inventory trap:** add source items onto target then cancel source → decrement then restore (net zero) but **new item rows**, lost KDS progress, new ids.

---

## Vertical isolation

Retail **must not** receive merge.

| Layer              | Evidence                                                 |
| ------------------ | -------------------------------------------------------- |
| Catalog            | `tables` kind `restaurant`, prefix `/api/tables`         |
| Mount              | skipped when module off                                  |
| Retail composition | no `tables` / `kitchen` / `kds`                          |
| Live               | `production-retail.test.ts`: `GET /api/tables` → **404** |
| Frontend           | `/tables` `requiresModule: 'tables'`                     |

Shared `held-orders` **is** mounted on Retail (order module). Merge APIs must still `isModuleEnabled('tables')`.

---

## Recommended future slice (not this 10)

1. Characterization test: occupied-target **409** (documents current transfer).
2. Implementation phase (new prompt, after this roadmap): unpaid-only merge with the SAFE NOW guards above.
3. Separate ADR **before** any billed-check merge.

**Do not** treat `move-order` as merge. Keep 409.

---

## Explicit non-goals (this phase)

Implementation, schema migration, Retail tables, split-check money changes, tips / service charge (4.14).

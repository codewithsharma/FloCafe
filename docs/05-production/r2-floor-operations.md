# R2 — Restaurant Floor Operations

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v76 (`tables.assigned_waiter_id`)  
**Baseline:** R1 `8552546` on `restaurant-vertical`  
**Suite:** `npm run test:r2` (S-FLOOR-01…10)

---

## Objective

Build Restaurant Floor Operations around the existing POS without redesigning the transaction engine. Order/payment remain authoritative for money; table state is operational.

---

## Table model

| Field                       | Notes                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| `id`                        | `tbl-{8 hex}`                                                              |
| `number` / UI `name`        | Unique label                                                               |
| `capacity`                  | Seats                                                                      |
| `status`                    | Soft enum: `available` \| `occupied` \| `reserved` \| `cleaning` \| `held` |
| `floor` / `section`         | Free-text grouping (no first-class entities)                               |
| `position_x` / `position_y` | Schema present; **no visual designer** in R2                               |
| `kitchen_station_id`        | Existing KDS routing assignment                                            |
| `assigned_waiter_id`        | R2 — optional soft FK to `users.id`                                        |
| `is_active`                 | Soft deactivate                                                            |

### Status rules (deterministic)

| Transition                                     | Rule                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| → `occupied`                                   | Via dine-in create / transfer target / unpaid merge-split; CAS from `available`\|`reserved`\|`cleaning` |
| → `available`                                  | Pay complete, cancel (free_table), convert takeaway, transfer source, merge source; clears waiter       |
| Manual PATCH `available`/`reserved`/`cleaning` | Blocked while active order exists (409)                                                                 |
| Manual PATCH `occupied`                        | Requires active order                                                                                   |
| `held`                                         | Held-orders path only — not status PATCH                                                                |

Second dine-in on an occupied table → **409** `TABLE_HAS_ACTIVE_ORDER`.

---

## Floor / sections

- Useful representation: CSS grid status board + free-text **floor** / **section** + optional section filter on `/tables`.
- **Not in R2:** visual floor-plan designer, drag-drop layout, first-class `sections`/`floors` tables.

---

## Order ↔ table relationship

- Active order = `orders.table_id` where `status NOT IN ('completed','cancelled')` (latest by `created_at`).
- Occupied table exposes `activeOrder` / `current_order` on `GET /api/tables`.
- Order domain owns lifecycle; table domain owns occupancy CAS, transfer, unpaid merge/split, waiter assignment.
- Cancel / complete / pay free the table (no phantom occupied). Restart restores from SQLite SoR.

---

## Create order from table

Unchanged R1 POS flow:

`AVAILABLE` → open → create dine-in → add items → KDS/POS → pay → `AVAILABLE`

Financial behavior (discounts, cancel, payments, receipts, refunds, customer) is unchanged by table origin.

---

## Waiter assignment

- `POST /api/tables/:id/assign-waiter` `{ waiter_user_id | null }`
- Auth: **owner / manager**
- Allowed assignee roles: waiter, cashier, manager, owner (active users)
- Cleared when table becomes `available`
- UI: Assign waiter dialog on `/tables` detail cards (`GET /staff`)

---

## Transfer

`POST /api/tables/:id/move-order` `{ target_table_id, order_id? }`

Roles: owner, manager, cashier, waiter.

Guarantees:

- Same order id; items/modifiers/discounts/customer/payment state intact
- Source → available; target → occupied
- Target occupied / held / cleaning / inactive → **409** (no silent overwrite)
- Concurrent transfer to same target → one 200, one 409
- Audit: `table.order_transferred`
- Cloud sync best-effort (`order.table_moved`); does not gate local success
- UI: Transfer dialog on `/tables`

---

## Merge / split

### Unpaid merge (4.13 SAFE NOW) — implemented

`POST /api/tables/:id/merge` `{ source_table_id }` (surviving = `:id`)

- Both active unpaid orders; **no bills**; no held carts; no order-level discount
- Reparent `order_items` (keep ids/KDS status); cancel source **without** stock restore
- Free source table; audit `table.merged`
- Billed / partial / paid merge → **409** `BILLED_MERGE_FORBIDDEN` (**ADR_REQUIRED**)

### Unpaid physical split — implemented (API)

`POST /api/tables/:id/split` `{ target_table_id, order_item_ids[] }`

- Leaves ≥1 item on source; creates new dine-in order on available target
- No bills / order-level discount; audit `table.split`
- Split **check** (bill) remains the existing `POST /api/bills/:id/split-check` path
- UI for physical split: **API-primary** (not a dedicated dialog in R2)

---

## RBAC (H3 preserved)

| Action                              | Roles                           |
| ----------------------------------- | ------------------------------- |
| Table create/edit/deactivate/status | owner, manager                  |
| Assign waiter                       | owner, manager                  |
| Open table / create dine-in         | owner, manager, cashier, waiter |
| Transfer / merge / split            | owner, manager, cashier, waiter |
| Complete / pay                      | existing R1 authorization       |

Server `requireRole` is authoritative.

---

## Offline

Floor ops are **OFFLINE SAFE** under the Restaurant OS offline contract: local SQLite Express API; cloud sync never blocks create/transfer/pay. S-FLOOR-09 exercises local create → transfer → pay.

---

## Concurrency

- Occupy: assert-before-insert + CAS status update
- Transfer: txn + CAS on `orders.table_id` + occupied-target 409
- Merge/split: txn with billed/held guards
- No new concurrency framework

---

## Audit (existing `audit_logs`)

| Action                                    | When           |
| ----------------------------------------- | -------------- |
| `table.created` / `table.updated`         | CRUD           |
| `table.deactivated` / `table.reactivated` | Soft lifecycle |
| `table.status_changed`                    | Status PATCH   |
| `table.order_transferred`                 | Transfer       |
| `table.merged` / `table.split`            | Merge / split  |
| `table.waiter_assigned`                   | Assign waiter  |

---

## Tests

```sh
npm run test:r2
```

| Scenario   | Coverage                        |
| ---------- | ------------------------------- |
| S-FLOOR-01 | Open → pay → close              |
| S-FLOOR-02 | Modify → complete               |
| S-FLOOR-03 | Transfer A→B + audit            |
| S-FLOOR-04 | Transfer race + second-open 409 |
| S-FLOOR-05 | Unpaid merge + billed refuse    |
| S-FLOOR-06 | Unpaid split                    |
| S-FLOOR-07 | Cancel releases table           |
| S-FLOOR-08 | Restart / SoR occupancy         |
| S-FLOOR-09 | Offline-safe local ops          |
| S-FLOOR-10 | RBAC + section + waiter assign  |

Regression (must stay green): `test:r1`, `test:h1`–`test:h4`, `test:tables-string-ids`.

---

## Remaining floor gaps

- Visual floor-plan designer / drag-drop using `position_*`
- First-class section/floor entities
- Occupancy timers / elapsed seating time
- Seat management (per-seat)
- Physical split UI dialog
- Billed merge (ADR required)
- Full reservations product (status stub only; matrix Later)
- Waitlist / turnover analytics (Later)

---

## Out of scope (R2)

R3 Kitchen OS, inventory/BOM/purchasing, CRM/loyalty, QR ordering, marketing/BI, payroll, multi-location, payment gateways, aggregators, Phase 4.16, Retail, frozen features.

---

## Key files

| Path                                | Role                             |
| ----------------------------------- | -------------------------------- |
| `main/services/tables.ts`           | Floor domain service             |
| `main/routes/tables.ts`             | HTTP surface                     |
| `main/routes/orders.ts`             | Occupy CAS + free helpers        |
| `main/services/payment-tender.ts`   | Free table on pay                |
| `frontend/.../tables/*`             | Floor UI + transfer/merge/assign |
| `tests/r2-floor-operations.test.ts` | S-FLOOR suite                    |

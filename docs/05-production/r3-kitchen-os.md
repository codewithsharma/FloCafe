# R3 — Kitchen OS

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v77 (`order_items.preparing_started_at|ready_at|served_at`, `orders.kitchen_priority`)  
**Baseline:** R2 `c7137b9` on `restaurant-vertical`  
**Suite:** `npm run test:r3` (S-KDS-01…10 + priority)

---

## Architecture

KDS remains a **projection / workflow** layer over SQLite order state.

| Concern             | Owner                                                           |
| ------------------- | --------------------------------------------------------------- |
| Order + item money  | Order / Payment (unchanged)                                     |
| Item kitchen status | `order_items.status` via `main/services/kitchen-status.ts`      |
| Stations / routing  | `kitchen_stations` + category_ids + `tables.kitchen_station_id` |
| Notify              | Coalesced `notifyKdsUpdate` (WS + REST poll)                    |
| Offline advertise   | H2 `kds-recovery` (preserved)                                   |

**Not a second SoR.** No durable KDS ticket outbox in R3 (documented gap).

---

## Ticket projection

Operational fields only (restricted chef payloads strip financials via `projectKdsOrder` / `projectKdsItem`):

- order identity, type, notes, table, station_name, kitchen_priority, timestamps
- item identity, name, qty, status, modifiers/addons, special_instructions
- preparing_started_at / ready_at / served_at for timers after refresh/restart

---

## Item kitchen states

Bumpable: `pending` → `preparing` → `ready` → `served`

Also present (not bumpable from KDS): `voided`, `void_adjustment`, `completed`, `cancelled`

Every bump:

- authorization (chef/manager/owner + station/category scope)
- CAS `expected_status` → 409 on conflict
- audit `kitchen.item_status_changed`
- timestamp set/clear rules (unbump clears later timestamps)

H2 CAS / stale / advertise behavior unchanged.

---

## Queue / priority

List sort: `kitchen_priority DESC`, then `created_at ASC`.

`PATCH /api/kds/orders/:id/priority` `{ priority: 0–9 }` — **owner/manager** only. Audit `kitchen.priority_changed`.

No AI priority. No expediter lane.

---

## Stations / routing

Existing configurable stations (Grill/Bar/etc. are data, not hard-coded).

Routing model (unchanged, hardened by tests):

1. Dine-in: `tables.kitchen_station_id`
2. Tableless: product **category** ∈ station `category_ids`
3. KOT: `routeItemsToStations()` → station printers

Per-product station FK: **not** added (remaining gap). Stations are workflow destinations only — not inventory locations.

---

## Timers

Authoritative DB timestamps + UI aging bands:

| Age         | UI           |
| ----------- | ------------ |
| &lt; 5 min  | default      |
| 5–10 min    | warning tint |
| &gt; 10 min | danger tint  |

Clock uses `preparing_started_at` when set, else order/item `created_at`. Survives refresh/reconnect/restart via SQLite.

---

## Bump / unbump

Advance + revert on tabs/kanban/modal with CAS. Companion `:3002` PATCH also uses `kitchen-status` service.

KDS never mutates payments/bills.

---

## Notes / modifiers

KDS projection includes item addons (names on tabs + kanban), special instructions, order notes. Financial modifier model unchanged.

---

## KOT

Existing `POST /printers/print-kot` + `printKOT` / `routeItemsToStations`. R3 characterizes no-printer failure as structured non-500 error. Durable print queue deferred to R13.

---

## Offline / recovery

H2 preserved:

- live-companion-only advertise
- stale-board UX
- one silent status retry
- CAS 409
- SQLite SoR

R3 deepens timestamps/audits/priority without rewriting H2. **Durable KDS outbox:** remaining Hardening gap (not required for R3 correctness while SoR + notify + REST poll hold).

---

## RBAC

| Action                | Roles                                      |
| --------------------- | ------------------------------------------ |
| View KDS / bump items | chef, manager, owner                       |
| Station config        | owner, manager (existing kitchen-stations) |
| Priority override     | owner, manager                             |
| Cashier/waiter        | no status bump (H3)                        |

---

## Audit

| Action                        | When           |
| ----------------------------- | -------------- |
| `kitchen.item_status_changed` | Bump/unbump    |
| `kitchen.priority_changed`    | Priority PATCH |

No heartbeat/poll audit noise.

---

## Concurrency

CAS on item status (REST + WS + companion). Concurrent same-expected → one 200, one 409.

---

## Tests

```sh
npm run test:r3
```

| Scenario | Coverage                                |
| -------- | --------------------------------------- |
| S-KDS-01 | POS order → KDS board                   |
| S-KDS-02 | Multi-station category routing          |
| S-KDS-03 | Start→ready→served + timestamps + audit |
| S-KDS-04 | Concurrent CAS                          |
| S-KDS-05 | H2 frontend stale/retry source contract |
| S-KDS-06 | Companion advertise start/stop          |
| S-KDS-07 | Cancelled order excluded                |
| S-KDS-08 | Notes/addons visibility                 |
| S-KDS-09 | KOT no-printer contract                 |
| S-KDS-10 | SoR persistence after bump              |
| priority | RBAC + rush sort                        |

Regression: `test:r1`, `test:r2`, `test:h1`–`test:h4`.

---

## Remaining kitchen gaps

- Durable KDS ticket/status outbox
- Expediter / recall tray / sound-visual alerts
- Per-product station routing column
- Prep SLA analytics / kitchen performance reporting
- Print queue / retry product (R13)
- Manager rush UI on the board (API exists)
- Exponential reconnect backoff (beyond H2 fixed 3s)

---

## Out of scope

Inventory, BOM, recipes, purchasing, food cost, QR/online ordering, aggregators, payment gateways, CRM/loyalty, marketing/BI, payroll, multi-location, Retail, Phase 4.16, R4.

---

## Key files

| Path                                                      | Role                     |
| --------------------------------------------------------- | ------------------------ |
| `main/services/kitchen-status.ts`                         | Status + priority domain |
| `main/routes/kds.ts` / `order-items.ts` / `kds-server.ts` | HTTP surfaces            |
| `main/services/kds.ts`                                    | WS + notify              |
| `frontend/src/lib/kds-ticket-age.ts`                      | Aging helper             |
| `frontend/src/components/kds/*`                           | Board UX                 |
| `tests/r3-kitchen-os.test.ts`                             | S-KDS suite              |

# Phase 3.5A — Inventory Ledger UI

**Date:** 2026-08-14  
**Decision:** **COMPLETE** (Option A only)  
**Schema:** v75 — **NO SCHEMA CHANGE**  
**Verticals:** Shared `inventory` module (Restaurant + Retail)

Related: [phase-3.5-scope-discovery.md](phase-3.5-scope-discovery.md), [phase-2.12-inventory-movement-read-api.md](phase-2.12-inventory-movement-read-api.md)

---

## User story

As an owner/manager, I need to inspect inventory movements so that I can audit stock changes without SQL access.

---

## Existing backend contract (reused — no new API)

|             |                                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| **Route**   | `GET /api/inventory/movements`                                                     |
| **Auth**    | `requireRole('owner', 'manager')`                                                  |
| **Query**   | `product_id` (required), `limit` (1–500, default 100), `before_id` (keyset cursor) |
| **Service** | `listInventoryMovements` in `main/services/inventory.ts`                           |
| **Module**  | `inventory` (`kind: shared`) — mounted for restaurant and retail                   |

**Response fields (display as returned — do not invent):**

| Field                             | Notes                                             |
| --------------------------------- | ------------------------------------------------- |
| `id`                              | Movement id                                       |
| `product_id`                      | Product id                                        |
| `quantity_delta`                  | Signed delta (e.g. `-2`)                          |
| `movement_type`                   | `sale` \| `cancel_restore` \| `adjustment`        |
| `reference_type` / `reference_id` | Optional source refs                              |
| `reason`                          | Optional                                          |
| `stock_after`                     | Stock after this movement (**no `stock_before`**) |
| `created_at`                      | Timestamp                                         |
| `nextCursor`                      | Present only when more pages exist                |

---

## UI behavior

| Item           | Choice                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| **Location**   | `/products/movements` (keeps Inventory nav active via `/products` prefix) |
| **Entry**      | Link from Products page (owner/manager)                                   |
| **Filter**     | Product select (required — matches API)                                   |
| **Columns**    | Date, Type, Delta, Stock after, Reason, Reference                         |
| **Pagination** | “Load more” using `nextCursor` → `before_id`                              |
| **States**     | Loading / empty / error toast or inline error                             |
| **Roles**      | Redirect non–owner/manager to `/pos` (reports pattern)                    |
| **Module**     | Page usable when `inventory` module enabled (shared commerce)             |

**Non-goals:** stock_before fabrication, recalculating stock, suppliers/PO, recipes, schema, tax cleanup.

---

## Vertical behavior

| Vertical                     | Ledger UI                    |
| ---------------------------- | ---------------------------- |
| Restaurant                   | Available (shared inventory) |
| Retail                       | Available (shared inventory) |
| Restaurant-only (tables/KDS) | **Not** introduced           |

---

## Schema

```text
No schema change.
```

---

## Tests

- Vitest: movement display helpers (delta formatting; no invented fields)
- Source contract: page consumes `/api/inventory/movements`
- Existing `inventory-movements-api` remains green
- Phase 3.4 regression matrix + lint/build/`npm test`

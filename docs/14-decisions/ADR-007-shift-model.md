# ADR-007: Per-Terminal Shift Model

## Status
Accepted (M4-C service/API implemented; M4-D1 client terminal identity implemented; POS `shift_id` writes pending M4-D2+)

## Context

RestaurantOS requires accountable cashier sessions before cash reconciliation (M5), day close, and cash drawer integration (M8). FloCafe today has:

- Single SQLite database per installation (single-location)
- Multiple LAN clients (Electron host + browser POS via `/api/pos-info`)
- Staff attribution on orders via `orders.user_id` (JWT-derived, not client-supplied)
- Payments recorded on `bills` with `payment_details` JSON (cash, card, wallet, custom methods)
- No shift or session entity

Candidate models: per-cashier, per-terminal, per-location, or store-wide shared shift.

## Decision

Adopt a **per-terminal (register) shift** with:

1. **One `open` shift per `terminal_id`** enforced by a partial unique index.
2. **`opened_by_user_id`** records accountability; other staff may work during the shift (orders keep their own `user_id`).
3. **`shift_id` on `bills`** (set when payment is recorded) as the primary payment→shift link.
4. **Optional `shift_id` on `orders`** (set at creation when an active shift exists) for operational reporting of unpaid work.
5. **Monetary amounts in integer cents** in the `shifts` table; reconciliation math deferred to M5.

`terminal_id` is a stable client identifier (local UUID), distinct from `cloud_pos_id` (FloAdmin cloud registration).

## Alternatives considered

| Model | Rejected because |
|-------|------------------|
| Per cashier | LAN tablets share one physical drawer; forces close/reopen on every staff change; does not match register-centric cash counts |
| Per location | Redundant — FloCafe is single-location per DB today |
| Store-wide shared shift | Cannot attribute cash variance to a register; breaks multi-terminal LAN deployments |

## Consequences

### Positive
- Aligns with master plan (“one active shift per terminal”)
- Supports multiple open shifts across terminals on one install
- Bill-level linkage reuses existing payment storage (`payment_details`) without duplication
- M5 can aggregate cash per shift from `bills.shift_id` + `payment_details` JSON

### Negative
- Requires each POS client to persist a `terminal_id` (localStorage + optional settings sync)
- Browser POS on same machine as Electron must not share `terminal_id` unless intentionally the same register
- Partial unique index (`WHERE status = 'open'`) is SQLite-specific — acceptable per ADR-002

## Evidence

- `main/db.ts` — single-writer SQLite, no shift tables
- `main/routes/bills.ts` — payment batch, `payment_details`, cents math
- `main/routes/orders.ts` — `user_id` from authenticated user
- `main/routes/pos-info.ts` — multi-device LAN POS
- `docs/15-project-management/master-implementation-plan.md` §1.3, M4

## Related

- [`m4-shift-management-rfc.md`](../15-project-management/m4-shift-management-rfc.md)
- M5 cash reconciliation (expected vs counted)
- M8 cash drawer kick (per-terminal printer context)

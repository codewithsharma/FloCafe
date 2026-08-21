# P18 Order Idempotency Hardening

**Status:** COMPLETE  
**Feature ID:** `ORD-IDEM-HARDENING`  
**Date:** 2026-08-21  
**Commit:** _(filled after commit)_  
**Schema:** **v88** (no bump)  
**Live pilot:** NO-GO

---

## Executive Summary

P18 makes `Idempotency-Key` **mandatory** on staff order create and add-items, matching payment-key discipline. Same key + same canonical payload safely replays (one order, one stock/recipe effect, one `order.created` audit). Same key + different payload returns **409 `ORDER_IDEMPOTENCY_CONFLICT`**. Existing `order_idempotency` table and payment-parity validation are reused; cancel/discount keys remain optional; public QR create remains an documented exception. Schema stays v88.

---

## Baseline

P13–P17 COMPLETE. Tip before P18: `9e0cda3`. Schema v88. Production NO-GO (R16).

---

## Existing Payment Idempotency Reuse

| Piece                                         | Decision                                                           |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Validation rules (128 chars, printable ASCII) | Mirrored as `requireOrderIdempotencyKey` (payment codes unchanged) |
| User-scoped PK `(user_id, idempotency_key)`   | Reused `order_idempotency`                                         |
| Store after domain writes inside `withTxn`    | Preserved (same atomic pattern as payment)                         |
| Payment `applyPaymentBatch` / table           | **Not rewritten**                                                  |
| Shared lib extraction                         | Deferred — order helpers in `orders-shared.ts` only                |

---

## Protected Order Mutation Surface

| Endpoint                     | P18                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| `POST /api/orders`           | **Required** key                                             |
| `POST /api/orders/:id/items` | **Required** key                                             |
| Cancel / discount / status   | Unchanged (optional key where already used)                  |
| `POST /api/public/qr/orders` | **Exception** — no staff JWT scope; deferred guest-key slice |

---

## Idempotency-Key Requirements

| Case                     | Status | Code                         |
| ------------------------ | ------ | ---------------------------- |
| Missing / empty          | 400    | `ORDER_IDEMPOTENCY_REQUIRED` |
| Invalid / too long       | 400    | `ORDER_IDEMPOTENCY_INVALID`  |
| Same key, different hash | 409    | `ORDER_IDEMPOTENCY_CONFLICT` |

---

## Key Scope

Scoped by **authenticated `user_id`** (same as payment). Different actors may reuse the same key string → separate operations.

---

## Request Fingerprinting

`canonicalizeOrderRequest` (sorted object keys) + SHA-256 via `hashOrderIdempotencyPayload`. Replaces unstable `JSON.stringify(body)` for create/add-items.

---

## Replay Semantics

First success: 201 (create) / 200 (add-items); store response JSON.  
Replay: 200 with stored body; **no** second stock/recipe; **no** second `order.created` audit; **no** second KDS notify.

---

## Same Key / Different Request

Deterministic **409 `ORDER_IDEMPOTENCY_CONFLICT`**. No silent execute or wrong replay.

---

## Concurrency Handling

SQLite `withTxn` serializes writers; PK on `(user_id, idempotency_key)`. Concurrent same-key same-payload → one order id / one stock delta (`test:p18`).

---

## Transaction Boundaries

Lookup → mutate (order/items/stock/recipe) → `storeOrderIdempotency` → audit → commit. Failure before store rolls back; key not poisoned.

---

## Failure Semantics

Match payment: failed mutation does not insert success idempotency row. Same key may retry after stock restored.

---

## Frontend Key Lifecycle

| Client                                                | Behavior                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| POS `checkout-coordinator` + localStorage fingerprint | Already stable (unchanged)                                                          |
| Server App                                            | Sticky `useRef` key for in-flight send; cleared on success; add-items now sends key |

---

## Inventory / Recipe Protection

Outer order-level gate. P16 CAS and P17 recipe idempotency unchanged. Replay cannot double-consume.

---

## KDS Effects

`notifyKdsUpdate` skipped on idempotent replay (`!idempotentReplay`).

---

## Payment Interaction

Separate keys/tables. Order key ≠ payment key. Payment suite 85/85 PASS.

---

## Authorization

JWT + `requireRole` unchanged. Keys cannot cross-user replay protected responses.

---

## Audit Logging

`order.created` once per logical create; replay skips audit write path.

---

## Schema

**v88** — no migration. Uses existing `order_idempotency`.

---

## Tests

`npm run test:p18` — **46 PASS** (validation, replay, conflict, canonical hash, concurrency, add-items, failure non-poison, user scope).

---

## Regression Results

| Suite                        | Result       |
| ---------------------------- | ------------ |
| p18                          | 46 PASS      |
| p17                          | 42 PASS      |
| p16                          | 47 PASS      |
| p15                          | 34 PASS      |
| p14                          | 52 PASS      |
| data-audit (P13)             | 31 PASS      |
| critical                     | PASS         |
| r5                           | PASS         |
| issue-214 payment            | 85 PASS      |
| inventory-boundary           | PASS         |
| order-void-cancel-stock      | PASS         |
| audit-log                    | PASS         |
| discover-guard               | PASS         |
| `npm run build`              | PASS         |
| `npm run build:frontend`     | PASS         |
| eslint (touched order files) | 0 new errors |

---

## Known Limitations

- Public QR order create still keyless (guest scope exception)
- Cancel/discount Idempotency-Key still optional (R1 residual; not consumption-create)
- Durable offline mutation queue out of scope
- Concurrent UNIQUE race without recovery path still theoretically possible under extreme conditions (same as payment); SQLite + sync txn covers Node HTTP concurrency in practice

---

## Explicitly Deferred

QR guest keys; durable offline queue; Phase C; REAL→cents; P19; R16 ops

---

## Production Gate

**NO-GO** — unchanged (R16)

---

## Stop Condition

None. Implementation complete; P19 not started.

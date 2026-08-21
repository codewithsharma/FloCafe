# P14 — POS / Offline Conflict & Recovery Hardening Plan

**Feature ID:** `POS-OFFLINE-CONFLICT-HARDENING`  
**Date:** 2026-08-21  
**Schema decision:** **Remain v88** (no bump)  
**Status:** PLAN COMPLETE — ready for minimal implementation  
**Live pilot:** NO-GO (R16 / OPS-02 unchanged)

---

## Current behavior (code evidence)

### Order status mutations

| Path                           | Location                          | Conditional UPDATE?            | Conflict surface                                          |
| ------------------------------ | --------------------------------- | ------------------------------ | --------------------------------------------------------- |
| `PATCH /api/orders/:id/status` | `main/routes/orders/status.ts`    | **No** — `WHERE id = ?` only   | Terminals only via pre-read → `ILLEGAL_STATUS_TRANSITION` |
| Payment settle → `completed`   | `main/services/payment-tender.ts` | **No** — `WHERE id = ?`        | Can overwrite non-completed (incl. cancelled race)        |
| Last-item auto-cancel          | `main/routes/orders/cancel.ts`    | **No**                         | Narrow                                                    |
| Table merge cancel source      | `main/services/tables.ts`         | **No**                         | Narrow                                                    |
| Kitchen item bump              | `main/services/kitchen-status.ts` | **Yes** when `expected_status` | `409 STATUS_CONFLICT`                                     |
| Item restore                   | `main/routes/orders/cancel.ts`    | Re-check in txn                | `409 ITEM_STATUS_CONFLICT`                                |
| Item cancel (already done)     | H4                                | No-op                          | 200 idempotent                                            |

Schema tip **v88**: `orders` has `status` + `updated_at` but **no** version/revision column. Kitchen CAS already proves status-equality CAS needs no migration.

### Stock adjustment

| Fact                      | Evidence                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Endpoint                  | `POST /api/products/:id/stock` — Owner/Manager                                              |
| Idempotency               | Mandatory `Idempotency-Key`; table `stock_adjust_idempotency` since **v78**                 |
| Same key + same body      | Replay stored response; **no** double ledger                                                |
| Same key + different body | `409 STOCK_ADJUST_IDEMPOTENCY_CONFLICT`                                                     |
| Missing key               | `400 STOCK_ADJUST_IDEMPOTENCY_REQUIRED`                                                     |
| FE client                 | `frontend/src/lib/stock-adjust.ts` generates **new UUID per call** unless caller passes key |

**Server idempotency is already closed by R4.** Residual gap is client key stability on retry/double-submit.

### Offline / reconnect (frontend)

| Mechanism                     | Persistence      | Auto-retry?         | 409 handling                                        |
| ----------------------------- | ---------------- | ------------------- | --------------------------------------------------- |
| General POS sync queue        | **None**         | N/A                 | N/A                                                 |
| POS prepaid/postpaid attempts | `localStorage`   | No — user re-submit | **Undifferentiated** — sticky attempt on all errors |
| TanStack mutations            | N/A              | `retry: 0`          | N/A                                                 |
| KDS status pending            | `sessionStorage` | Yes on reconnect    | **Clears on 409** (correct)                         |
| KDS WS backoff                | in-memory        | WS only             | Leave alone (P4/H2)                                 |
| Stock adjust                  | none             | no                  | toast only                                          |
| Online badge                  | cosmetic         | does not flush      | —                                                   |

Architecture remains local-first: SQLite SoR; FE does not invent a distributed sync engine.

### Existing conflict mechanisms (reuse)

- Kitchen: optional `expected_status` + `WHERE id AND status` + `changes !== 1` → 409
- H4: cancel TOCTOU re-read; restore `ITEM_STATUS_CONFLICT`
- R1: terminal illegal transitions
- R4: stock adjust idempotency table
- P13: success audits inside `withTxn`; no false-success on rejected paths

---

## Concrete gaps (authorized for P14)

### P0 — Implement

1. **Order-status stale write** — `PATCH /api/orders/:id/status` can silently overwrite newer non-terminal status (e.g. ready→served then stale preparing wins). No `expected_status` CAS.
2. **Payment complete race** — tender path sets `orders.status='completed'` with `WHERE id=?` only; can overwrite cancelled/other states in a race.
3. **POS sticky attempts after permanent conflicts** — prepaid/postpaid `localStorage` attempts retained on 409/4xx → next click re-fires same logical mutation blindly.
4. **Stock-adjust FE key instability** — dialog/handlers do not hold a stable Idempotency-Key across retry/double-click → legitimate network retry can double-apply if two keys are sent.

### P1 — Implement if small / harden

5. **Require or strongly prefer `expected_status` on active (non-cancel) order status transitions** — mirror kitchen; optional for cancel if already at cancelled (idempotent).
6. **KDS pending clear on non-retryable non-409 4xx** — silent flush can leave pending forever on 400; tiny deepen, do **not** change reconnect backoff.
7. **Concurrent same-key stock adjust test** — document/assert SQLite serialization (optional test depth).

### P2 — Out of scope / document only

- Durable KDS outbox rebuild (P4 complete)
- Drive backup-now PIN (R4.1 closed)
- Disaster / device-failure recovery product
- DB append-only audit triggers (P13 deferred)
- New sync queue / event sourcing / version column
- Money, reports, print queue redesign
- Multi-location / payroll / AI / gateways
- P15 and beyond

---

## Affected mutation paths

| Area          | Paths                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Order CAS     | `PATCH /api/orders/:id/status`; payment settle order complete                 |
| Stock         | `POST /api/products/:id/stock` (server verify + FE key); UI dialogs           |
| Offline FE    | POS prepaid/postpaid attempt clear taxonomy; optional shared error classifier |
| KDS FE (tiny) | Clear pending on permanent 4xx only — no backoff change                       |

---

## Proposed minimal solution

### Order status CAS (no schema bump)

1. Extend `orderStatusBodySchema` with optional `expected_status` (same status enum).
2. Inside `withTxn` on status PATCH:
   - If already at target and (`expected_status` absent or matches) → idempotent 200 (no false re-audit if already audited pattern exists; preserve cancel idempotency).
   - Else UPDATE `… WHERE id = ? AND status = ?` using `expected_status` when provided.
   - When `expected_status` omitted for **non-cancel** transitions: still protect with `WHERE id = ? AND status = ?` using the **pre-txn re-read** status as the CAS predicate (server-locked expected), so concurrent writers cannot silently clobber.
   - If `changes !== 1` → `409` + code `ORDER_STATUS_CONFLICT` (message: refresh and retry).
3. Preserve R1 terminals (`ILLEGAL_STATUS_TRANSITION`), tender cancel guard, PIN/RBAC, H4 cancel restock re-read.
4. Payment complete: `UPDATE orders SET status='completed' … WHERE id=? AND status NOT IN ('cancelled','completed')`; if `changes=0`, do not invent completed; leave bill money path unchanged (document skip vs hard fail — prefer no money rollback; log skip if needed without false audit).

### Stock adjustment

1. **Server:** leave R4 path; add P14 regression coverage (replay, conflict, concurrent same-key).
2. **FE:** hold stable key in `StockAdjustmentDialog` (ref) for one submit attempt; pass to `postProductStockAdjust`; clear on success / dialog close (mirror PaymentModal).

### Offline / reconnect

1. Add small `classifyMutationError` helper: `retryable` | `conflict` | `auth` | `permanent`.
2. POS prepaid/postpaid catch: clear attempt on conflict/permanent/auth; retain on retryable network/5xx.
3. Do **not** auto-retry 409.
4. KDS: on permanent 4xx (not already handled), delete pending entry; leave exponential reconnect alone.
5. Document restart: server commit authoritative; POS localStorage resume is operator-driven; KDS pending is session-scoped.

### Audit

- Success path: existing P13 transactional audits unchanged.
- Stale 409: **no** success audit insert.
- Idempotent stock replay: **no** duplicate audit (already R4).
- Optional: do not spam conflict audits.

---

## Schema decision

**Remain v88.** Status-equality CAS + existing `stock_adjust_idempotency` are sufficient.  
If during implementation a version column appears necessary → **STOP**, document why v88 is insufficient, and do not casually bump.

---

## Tests

Create `tests/p14-pos-offline-conflict.test.ts` + `npm run test:p14`.

Minimum coverage:

1. Stale order status → 409 `ORDER_STATUS_CONFLICT`
2. Current-state mutation → 200
3. Illegal terminal transition → existing rejection
4. Stale mutation does not overwrite newer status
5. Successful mutation creates expected audit (where applicable)
6. Stale mutation does not create false success audit
7. Stock adjust with Idempotency-Key
8. Same-key replay does not double-apply
9. Same key + different payload → 409
10. Concurrent stock adjusts remain correct (serialized SQLite)
11. Rollback leaves no partial state
12. FE/helper: 409 classified as non-retryable (unit)
13. Network retry remains bounded / attempt retained only for retryable
14. Successful path clears pending attempt
15. Restart/reconnect semantics documented + idempotent replay safe
16. RBAC on status + stock
17. Single-store boundary preserved (no cross-store queries introduced)
18. P13 audit behavior intact (spot / rely on `test:data-audit`)

Register in `tests/test-tiers.json` like `data-audit-hardening`.

---

## Matrix / inventory update policy

| Row                                          | Policy                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Offline → Conflict handling                  | Deepen description; remain **🟡 Hardening** unless evidence justifies Existing (prefer stay Hardening — not full offline DR) |
| Offline → App restart recovery               | Deepen; remain **🟡 Hardening**                                                                                              |
| Inventory → Stock adjustment                 | Already **🟢 Existing**; note FE key stability deepen only                                                                   |
| FEATURE-INVENTORY OFF-05 / OFF-06            | Update depth wording; do not claim full disaster recovery                                                                    |
| Device failure / DR / KDS recovery / printer | **Do not promote**                                                                                                           |

---

## Files expected to change

- `main/validation/orders.ts` — `expected_status`
- `main/routes/orders/status.ts` — CAS UPDATE + 409
- `main/services/payment-tender.ts` — completed UPDATE guard
- `frontend/src/lib/mutation-errors.ts` (new) — classify helper
- `frontend/src/app/(dashboard)/pos/page.tsx` — clear attempts on permanent/conflict
- `frontend/src/lib/stock-adjust.ts` + StockAdjustmentDialog / callers — stable key
- `frontend/src/hooks/useKdsConnection.ts` — clear pending on permanent 4xx only
- Orders UI status callers — send `expected_status` when known
- `tests/p14-pos-offline-conflict.test.ts` (**new**)
- `package.json`, `tests/test-tiers.json`
- `docs/qa/P14-*-PLAN.md` (this file) + IMPLEMENTATION-REPORT
- `docs/00-product/capability-matrix.md`, `docs/qa/FEATURE-INVENTORY.md`
- `.ai/context.md`, `.ai/decisions.md`, `.ai/tasks.md`, `.ai/patterns.md`, `.ai/risks.md`

---

## Out of scope

- P4 KDS outbox rebuild / reconnect backoff redesign
- P5–P13 feature reopens (except regressions)
- P15+
- Schema v89
- Financial/report semantic changes
- New sync architecture / distributed locks
- Multi-location, payroll, AI, gateways, terminals

---

## Production readiness

**LIVE PILOT: NO-GO** unless OPS-02 independently changes.

---

## Acceptance gate (pre-impl)

- [x] Order mutation paths audited
- [x] Concrete stale-write gap identified (`status.ts` WHERE id only)
- [x] Stock server idempotency audited (R4 closed; FE residual)
- [x] Offline retry semantics audited (no general queue; POS sticky attempts)
- [x] Schema: no bump planned
- [ ] Implementation + tests + docs + conservative matrix update

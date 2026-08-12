# M5 Cash Reconciliation — Impact Analysis

**Status:** ANALYSIS COMPLETE (M5-A); **M5-B–G GREEN**; **M5-H docs sync COMPLETE** (full production gate pending)  
**Date:** 2026-08-12 (implementation status refreshed 2026-08-12)  
**Depends on:** M4-A through M4-E3 (GREEN), M3 audit log (GREEN)  
**Implementation:** M5-B through M5-G shipped; this document’s §1–12 describe pre-implementation design impact. §16 slices carry live status.

> **Source code is authoritative.** Design sections below reflect verified repository state as of M5-A; slice status tables are updated through M5-G.

---

## 1. Executive summary

M5 adds **expected cash**, **variance**, and **day close** on top of M4's per-terminal shift model. No second payment or reconciliation system is required.

**Safest integration points:**

| Concern | Module | Function / route |
|---------|--------|------------------|
| Expected cash computation | `main/services/shift.ts` (new) or `main/services/shift-reconciliation.ts` | `computeExpectedCashCents(shiftId)` |
| Persist on close | `main/services/shift.ts` | `closeShift`, `forceCloseShift` inside existing `withTxn()` |
| Close preview | `main/routes/shifts.ts` | New `GET /:id/reconciliation-preview` |
| Cash line source | `main/routes/bills.ts` | Read-only query on `bills.payment_details` WHERE `shift_id` |
| Day close | `main/services/day-close.ts` (new), `main/routes/reports.ts` | M5-G |
| UI | `CloseShiftModal`, `ShiftHistoryPanel` | M5-F |

**Do not modify** M4-D2/D3/D4 attribution rules or terminal identity semantics.

---

## 2. Current integration points (M4)

### 2.1 Schema v69

- `shifts` — no `expected_cash_cents`, `variance_cents`
- `bills.shift_id`, `orders.shift_id` — nullable, indexed
- Settings: `shifts_enabled=false` default

### 2.2 Payment attribution (frozen)

```
POST /api/orders → orders.shift_id (creation, soft)
POST /api/bills/:id/payment(s) → bills.shift_id (first payment, soft)
```

Cash gate: optional `require_open_shift_for_cash` — independent of reconciliation.

### 2.3 Close path today

```
CloseShiftModal → POST /api/shifts/:id/close
  → closeShift() withTxn
       → UPDATE shifts SET status=closed, counted_cash_cents, ...
       → logAuditEvent(shift.closed)
  → { shift }
```

No payment rollup query exists.

---

## 3. Expected cash — implementation analysis

### 3.1 Query strategy (recommended)

Single read query + in-memory JSON parse (matches `reports.ts` pattern):

```sql
SELECT id, payment_details
FROM bills
WHERE shift_id = ?
  AND payment_details IS NOT NULL
  AND payment_details != '[]'
```

For each bill, parse JSON array; for each line where `method === 'cash'`, add `Math.round(amount * 100)` to sum (use existing cent-safe helper from bills.ts).

**Do not** SUM in SQL via `json_each` unless proven necessary — consistency with `paymentMethodBreakdown` matters more than micro-optimization at shift scale.

### 3.2 Predicate alignment

Must match:

- `main/routes/bills.ts` L660 — cash gate: `method === 'cash' && amountCents > 0`
- `main/routes/reports.ts` L73 — `json_extract(line, '$.method')`

Custom method named `cash` stored as `method: "cash"` after resolution — included.

### 3.3 Dual shift column semantics (critical test case)

```
Shift A OPEN → POST /orders (orders.shift_id=A)
Shift A CLOSED
Shift B OPEN → POST /bills/:id/payments (bills.shift_id=B)
```

Expected cash for shift B includes payment; shift A expected does not (unless payment happened under A's bill attribution).

**Test:** extend `tests/shift-bill-payment-integration.test.ts` or new `tests/shift-reconciliation.test.ts`.

---

## 4. Files expected to change (M5-B → M5-H)

| File | Slice | Change |
|------|-------|--------|
| `main/db.ts` | M5-B | Migration v70 |
| `main/services/shift.ts` | M5-C, M5-D | Reconciliation functions + close integration |
| `main/routes/shifts.ts` | M5-E | Preview route, extended responses |
| `main/services/day-close.ts` | M5-G | **New** |
| `main/routes/reports.ts` | M5-G | Day close routes |
| `frontend/src/lib/shifts.ts` | M5-F | Preview client, extended types |
| `frontend/src/lib/types.ts` | M5-F | M5 shift fields |
| `frontend/src/components/shifts/CloseShiftModal.tsx` | M5-F | Wizard + variance |
| `frontend/src/components/shifts/ShiftHistoryPanel.tsx` | M5-F | Expected/variance columns |
| `frontend/src/components/shifts/ForceCloseShiftModal.tsx` | M5-F | Preview |
| `tests/shift-schema.test.ts` | M5-B | Flip column assertions |
| `tests/shift-service.test.ts` | M5-D | Reconciliation on close |
| `tests/shift-reconciliation.test.ts` | M5-C/D | **New** focused suite |
| `tests/day-close.test.ts` | M5-G | **New** |
| `docs/05-api/api-specification.md` | M5-H | API docs |
| `docs/06-database/data-model.md` | M5-H | Column docs |

**Unchanged:** `orders.ts` attribution, `applyPaymentBatch` shift stamp logic, `terminal-id.ts`, cash gate.

---

## 5. Database impact

### 5.1 Migration v70 (proposed)

```sql
-- v70: m5_shift_reconciliation
ALTER TABLE shifts ADD COLUMN expected_cash_cents INTEGER;
ALTER TABLE shifts ADD COLUMN variance_cents INTEGER;
-- optional:
ALTER TABLE shifts ADD COLUMN variance_note TEXT;

-- M5-G:
CREATE TABLE day_closes (...);
```

### 5.2 Upgrade path

- v69 installs: ALTER ADD COLUMN — existing closed shifts get NULL expected/variance
- Fresh install: runs v69 then v70
- **Required:** extend `tests/upgrade-path.test.ts`

### 5.3 Rollback

- Restore backup; columns additive — old app ignores new columns
- Day close table unused if feature not invoked

---

## 6. API impact

| Endpoint | Breaking? | Notes |
|----------|-----------|-------|
| POST `/shifts/:id/close` | **Additive response** | New fields on shift object |
| GET `/shifts/:id` | Additive | |
| GET `/shifts/:id/reconciliation-preview` | **New** | |
| POST `/reports/day-close` | **New** (M5-G) | |

No changes to `/api/bills/*` or `/api/orders/*`.

---

## 7. Frontend impact

| Component | Gap today | M5-F target |
|-----------|-----------|-------------|
| CloseShiftModal | ~~No expected/variance~~ | ✅ Preview + live variance |
| ForceCloseShiftModal | ~~No preview~~ | ✅ Same preview strip |
| ShiftHistoryPanel | ~~7 columns~~ | ✅ + expected, variance |
| Dashboard | No day close | M5-G card |
| useShift | Active only | Optional preview hook (deferred) |

**Product alignment (OD-M5-1):** Frontend requires counted cash on close; backend optional — intentional per locked decision.

---

## 8. Audit impact

Enhance `shift.closed` / `shift.force_closed` metadata — **no new action required for basic M5**.

Optional M5-G: `day.closed` on `entity_type='day_close'`.

---

## 9. Security impact

- Preview endpoint: same roles as close (cashier sees own terminal shift only via shift id + terminal match for close; preview must validate shift is open and caller authorized)
- Reconciliation history: owner/manager only (existing list/get RBAC)
- No new attack surface on payment routes
- Client cannot supply `expected_cash_cents` — server computes only

---

## 10. Concurrency

| Race | Behavior |
|------|----------|
| Payment + close concurrent | SQLite serializes; close txn sees payments committed before its BEGIN or after — operator may need recount (UI warn) |
| Double close | 409 |
| Preview during payment | Preview is point-in-time read; may change before submit |

No advisory locks required.

---

## 11. Test gap analysis

| Area | Existing | M5 needed |
|------|----------|-----------|
| Reconciliation math | **None** | **New suite** |
| Close persists expected | shift-service close tests only | Extend |
| Preview API | **None** | **New** |
| Day close | **None** | **New** |
| Frontend variance UI | shift-ui structure tests | Extend |
| Upgrade v70 | shift-schema | Extend |
| Payment integration | shift-bill-payment | + reconciliation assert |
| Reports shift filter | **None** | M5-G |

---

## 12. M6 / M8 compatibility

| Future | M5 hook |
|--------|---------|
| M6 refunds | `qualifying_cash_outflow_cents` function |
| M8 drawer kick | Unchanged; per-terminal |
| Accounting export | Day close `summary_json` |

---

## 13. Documentation conflicts to fix (M5-H)

| Doc | Issue | M5-H status |
|-----|-------|-------------|
| `data-model.md` | Missing expected/variance; stale M4-D status | **Resolved** — Shift + DayClose rows documented |
| `database-schema.md` | No shifts / day_closes detail | **Resolved** — v70 columns + v71 `day_closes` |
| `api-specification.md` | No preview/day-close | **Resolved** — preview, summary responses, day-close |
| `permissions.md` | No day-close roles | Optional follow-up (roles documented in API spec) |
| `audit-logging.md` | No `day.closed` event | Optional follow-up (event live in service + progress) |
| `m3-audit-log.md` | M5/M6 milestone numbering swap vs master plan | Deferred (historical numbering) |

---

## 14. Open product decisions

See RFC §19 (`OD-M5-1` through `OD-M5-8`). **None block M5-B start** once approved.

---

## 15. Risks

See RFC §20.

---

## 16. Implementation slices (detailed)

### M5-A — Design / RFC ✅

| Field | Detail |
|-------|--------|
| **Objective** | Authoritative M5 design package |
| **Deliverables** | This file, RFC, ADR-008 |
| **Dependencies** | M4 complete |
| **Tests** | N/A |
| **Rollback** | N/A |

### M5-B — Database foundation

| Field | Detail |
|-------|--------|
| **Objective** | Additive schema for reconciliation columns (+ optional day_closes defer to M5-G if split) |
| **Files** | `main/db.ts`, `tests/shift-schema.test.ts`, `tests/upgrade-path.test.ts` |
| **Migration** | v70 |
| **Acceptance** | Fresh + upgrade green; columns exist, NULL on legacy rows |
| **Security** | None |
| **Rollback** | Restore backup |

### M5-C — Reconciliation service

| Field | Detail |
|-------|--------|
| **Status** | **IMPLEMENTED** (2026-08-12) |
| **Objective** | Pure `computeExpectedCashCents(shiftId)` + cash line extractor |
| **Files** | `main/services/shift.ts`, `main/services/payment-cash.ts`, `main/routes/bills.ts` (shared gate helper) |
| **Dependencies** | M5-B |
| **Tests** | `tests/shift-reconciliation.test.ts` — 23 scenarios |
| **Acceptance** | Deterministic sums match manual calculation; no DB writes to reconciliation columns |
| **Security** | Read-only; no user input in formula |

### M5-D — Close integration

| Field | Detail |
|-------|--------|
| **Status** | **IMPLEMENTED** (2026-08-12) |
| **Objective** | Wire computation into `closeShift` / `forceCloseShift` |
| **Files** | `main/services/shift.ts`, `main/services/payment-cash.ts` (count aggregator) |
| **Dependencies** | M5-C |
| **Tests** | `tests/shift-reconciliation.test.ts` (M5-D); `tests/shift-service.test.ts` |
| **Acceptance** | expected/variance persisted; audit metadata; counted optional → variance NULL; 409/404 unchanged; atomic with audit |
| **Rollback** | Revert service; columns remain unused |

### M5-E — Reconciliation API

| Field | Detail |
|-------|--------|
| **Status** | **IMPLEMENTED** (2026-08-12) |
| **Objective** | Preview endpoint; extended GET/close responses with summary |
| **Files** | `main/services/payment-cash.ts`, `main/services/shift.ts`, `main/routes/shifts.ts` |
| **Dependencies** | M5-D |
| **Tests** | `tests/shift-reconciliation.test.ts` (M5-E); `tests/shift-service.test.ts` (HTTP preview + summary) |
| **Acceptance** | Preview does not mutate; RBAC enforced; non_cash in summary |
| **Rollback** | Revert routes/service; M5-D close persistence unchanged |

### M5-F — Reconciliation UI

| Field | Detail |
|-------|--------|
| **Objective** | Close wizard, variance display, history columns |
| **Files** | `CloseShiftModal`, `ForceCloseShiftModal`, `ShiftHistoryPanel`, `ShiftReconciliationPreviewStrip`, `shifts.ts`, `types.ts`, i18n |
| **Dependencies** | M5-E |
| **Tests** | `shift-ui.test.ts`, `shift-e3.test.ts`, `shift-client.test.ts` extensions |
| **Acceptance** | Live variance; preview before close; OD-M5-1 resolved |
| **Status** | **IMPLEMENTED** (2026-08-12) |

### M5-G — Day close / reporting

| Field | Detail |
|-------|--------|
| **Objective** | `day_closes` + POST/GET API + dashboard entry |
| **Files** | `main/db.ts` v71, `day-close.ts`, `reports.ts`, `DayCloseCard`, `day-close.ts` client |
| **Dependencies** | M5-D |
| **Migration** | **v71** for `day_closes` (v70 shipped without day_closes) |
| **Tests** | `tests/day-close.test.ts`, `tests/day-close-ui.test.ts` |
| **Acceptance** | Immutable snapshot; timezone business date (OD-M5-5); open-shift warn (OD-M5-6) |
| **Status** | **IMPLEMENTED** (2026-08-12) |

### M5-H — Production verification

| Field | Detail |
|-------|--------|
| **Objective** | Full gate + documentation sync |
| **Docs sync** | **COMPLETE** (2026-08-12) — API, schema, PM, RFC/impact final status |
| **Commands** | `npm test`, `test:upgrade-path`, `test:coverage:baseline`, `build`, `lint` — **not fully run** as of docs sync |
| **Docs targets** | `api-specification.md`, `data-model.md`, `database-schema.md`, progress, milestones, task-breakdown, RFC, impact |

---

## 17. Recommendation

M5-B through M5-G are **GREEN**. Documentation sync for M5-H is **COMPLETE**. Remaining M5-H work is the full production verification gate when approved.

**Do not** backfill historical shifts. **Do not** change M4 attribution. **Do not** implement refunds in M5 (M6).

---

## Final status: **M5-A ANALYSIS COMPLETE**; **M5-B GREEN**; **M5-C GREEN**; **M5-D GREEN**; **M5-E GREEN**; **M5-F GREEN**; **M5-G GREEN**; **M5-H docs sync COMPLETE** (full production gate pending)

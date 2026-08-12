# M5-A — Cash Reconciliation RFC / Design

**Status:** DESIGN READY (M5-A); **M5-B–G GREEN**; **M5-H docs sync COMPLETE** (full production gate pending)  
**Date:** 2026-08-12 (implementation status refreshed 2026-08-12)  
**Schema:** v70 reconciliation columns; v71 `day_closes`  
**Depends on:** M4-A through M4-E3 (GREEN), M3 audit log (GREEN)  
**Implementation:** M5-B through M5-G shipped — see §21 status tables. §2 “Current state” is the pre-M5 baseline.

> **Authoritative for implementation:** This document + [ADR-008](../14-decisions/ADR-008-cash-reconciliation-model.md).  
> Source code overrides planning docs where they disagree.

---

## 1. Executive summary

M4 tracks register sessions (shifts) and attributes payments to shifts via `bills.shift_id`. Operators can record opening float and counted cash on close, but the system **does not compute expected drawer cash or variance**.

**M5** adds **shift-level cash reconciliation**: derive expected cash from opening float plus qualifying cash payments, compare to counted cash, persist variance, and audit the outcome. **M5-G** adds **day close** — an immutable business-day snapshot across closed terminal shifts.

M5 extends the existing shift close path. It does **not** introduce a second payment system, reconciliation ledger, or refund workflow (M6).

---

## 2. Current state (code-verified at M5-A — pre-implementation baseline)

> Historical snapshot before M5-B–G. For shipped behavior see §14–15, §21, and `docs/05-api/api-specification.md`.

### 2.1 Shift storage (`main/db.ts` v69)

| Column | Type | M4 behavior |
|--------|------|-------------|
| `id` | INTEGER PK | Auto |
| `terminal_id` | TEXT NOT NULL | Per-register UUID |
| `status` | `'open'` \| `'closed'` | Partial unique open per terminal |
| `opened_by_user_id` | TEXT FK users | Required |
| `closed_by_user_id` | TEXT FK users | Set on close |
| `opening_float_cents` | INTEGER ≥ 0 | Required at open |
| `opening_note` | TEXT | Optional |
| `closing_note` | TEXT | Optional |
| `counted_cash_cents` | INTEGER ≥ 0 or NULL | Optional at close |
| `opened_at`, `closed_at`, `created_at`, `updated_at` | TEXT | Server timestamps |

**Not in v69 (M5):** `expected_cash_cents`, `variance_cents` — confirmed absent in `tests/shift-schema.test.ts`.

**Related columns:** `orders.shift_id`, `bills.shift_id` (nullable, FK `shifts.id`).

**Settings:** `shifts_enabled` (default `false`), `require_open_shift_for_cash`, `shift_stale_hours`, `terminal_id`.

### 2.2 Order → shift link (`main/routes/orders.ts`)

- Set **once** on `POST /api/orders` INSERT via `resolveActiveShiftForOrder(terminalIdHeader)`.
- Requires `shifts_enabled=true`, `X-Flo-Terminal-Id`, active open shift.
- **Operational only** — not used for M5 cash math.

### 2.3 Bill → shift link (`main/routes/bills.ts` `applyPaymentBatch`)

- Set on **first successful payment** if `bills.shift_id IS NULL`.
- Uses same terminal header resolution; never overwritten on partial payments.
- **Primary M5 attribution key.**

### 2.4 Payment lines (`payment_details` JSON array)

Each line (after `preparePaymentBatch`):

| Field | Relevance |
|-------|-----------|
| `method` | Resolved to `'cash'`, `'card'`, `'wallet'`, or custom catalog **name** |
| `amount` | **Applied** payment (decimal dollars) — use for cash sum |
| `tendered_amount`, `change_amount` | Cash only; tender includes change — **do not sum tender** |
| `timestamp` | Per line |

**Cash predicate (verified):** `method === 'cash'` && applied cents &gt; 0 (lines with zero applied filtered before write).

**Custom method named `cash`:** Treated as cash (same as M4-D4 gate).

### 2.5 Partial payments

- Multiple batches append to `payment_details`.
- First batch sets `bills.shift_id`; later batches retain it.
- Each cash line in any batch counts toward shift if bill is attributed.

### 2.6 Split checks (`POST /api/bills/:id/split-check`)

- Creates additional unpaid bills; `shift_id` NULL until each bill is paid independently.
- Each paid split bill may attribute to the shift active at **that bill's** first payment.

### 2.7 Split payment batch (multi-method one POST)

- Single `shift_id` on bill; M5 sums all cash lines in JSON.

### 2.8 Shift close today (`main/services/shift.ts`)

**Normal close:** Updates `status='closed'`, `closed_by_user_id`, `closed_at`, `counted_cash_cents`, `closing_note`. Audit: `shift.closed`.

**Force close:** Same fields + audit `shift.force_closed` with required `reason`. Owner/manager only.

**Does not compute:** expected cash, variance, payment summary.

**Response:** `{ shift: ShiftRecord }` only.

### 2.9 Refunds and cash adjustments

| Capability | Exists? |
|------------|---------|
| Payment refund API | **No** |
| Negative cash lines in `payment_details` | **No** |
| Cash drawer adjustment entity | **No** |
| Item void/cancel | Yes — adjusts order/bill totals, **not** payment_details |

M5 refund term = **0** until M6.

### 2.10 Reports (`main/routes/reports.ts`)

- `GET /api/reports/daily-stats`, `/summary`, `/sales` — UTC calendar day, **not shift-scoped**.
- `paymentMethodBreakdown()` — parses `payment_details` by date; reusable pattern, no `shift_id` filter today.
- **No** day-close endpoints or `day_closes` table.

### 2.11 Frontend (M4-E)

- `CloseShiftModal` — **requires** counted cash (frontend); backend allows NULL.
- `ForceCloseShiftModal` — reason required; counted cash optional.
- `ShiftHistoryPanel` — no expected/variance columns.
- No reconciliation preview or day-close UI.

### 2.12 Audit (M3)

Existing shift events (transactional with mutation):

| Action | Metadata |
|--------|----------|
| `shift.opened` | `terminal_id`, `opening_float_cents`, `opening_note` |
| `shift.closed` | `terminal_id`, `counted_cash_cents`, `closing_note`, `opened_by_user_id` |
| `shift.force_closed` | + `reason`, `closed_by_user_id` |

---

## 3. Goals (M5)

1. Compute **deterministic expected cash** per shift from existing payment data.
2. Persist **expected_cash_cents** and **variance_cents** on close.
3. Provide **close preview** (expected + payment breakdown) before commit.
4. Extend audit trail for reconciliation outcomes.
5. Add **day close** immutable snapshot (M5-G).
6. Preserve M4 behavior when `shifts_enabled=false`.
7. Integer cents end-to-end; no floating-point persistence.

## 4. Non-goals (M5)

- Refunds / payment reversal (M6)
- Cash drawer kick (M8)
- Automatic shift close / stale auto-close
- Shift reopen
- New payment workflows
- Global mandatory shift enforcement changes
- Multi-location day close
- Accounting export
- Real-time expected cash on every payment (preview on demand only)
- Stock/inventory reconciliation

---

## 5. Expected cash (authoritative formula)

### 5.1 Definition

```
expected_cash_cents =
    opening_float_cents
  + qualifying_cash_inflow_cents
  - qualifying_cash_outflow_cents
```

Where:

```
qualifying_cash_inflow_cents =
    SUM(
      applied_cents(line)
      FOR EACH bill B
      WHERE B.shift_id = :shift_id
      FOR EACH line IN parse_json(B.payment_details)
      WHERE line.method === 'cash'
        AND applied_cents(line) > 0
    )

qualifying_cash_outflow_cents =
    SUM(cash_refund_cents)   // hardcoded 0 until M6
```

```
applied_cents(line) = round_to_cents(line.amount)   // from JSON decimal dollars
```

### 5.2 Qualification matrix

| Payment type | Counts toward expected? |
|--------------|-------------------------|
| Cash (`method === 'cash'`) | **Yes** — applied amount |
| Card | No |
| Wallet | No |
| Custom method (name ≠ `cash`) | No |
| Custom method (name === `cash`) | **Yes** |
| Zero-value cash line | **No** (filtered pre-write today) |
| Negative amount line | **Does not exist** in current writes; if ever introduced, exclude until product decision |

### 5.3 Partial payments

All cash lines on bills with `shift_id = shift` count, regardless of which batch added them.

### 5.4 Split checks

Each bill's cash lines count when that bill's `shift_id` matches.

### 5.5 Order vs bill shift divergence

| Scenario | Order `shift_id` | Bill `shift_id` | M5 uses |
|----------|------------------|-----------------|---------|
| Order in shift A, paid in shift B | A | B (first payment) | **B** for cash |
| Order before any shift, paid in shift B | NULL | B | **B** |
| Unpaid order in shift A | A | NULL | No payment lines yet |

**Never copy `orders.shift_id` onto bills for reconciliation.**

### 2.5.6 Unattributed bills (`bills.shift_id IS NULL`)

Cash on unattributed bills **does not** enter any shift's expected cash. This is correct — no drawer session ownership.

### 5.7 Future refunds (M6)

When M6 ships, extend outflow term:

```
cash_refund_cents = SUM(refund.amount WHERE method='cash' AND refund.shift_id = shift)
```

M5 implementation must isolate refund term behind a function returning `0`.

---

## 6. Opening float

| Question | M5 design |
|----------|-----------|
| Who enters? | owner, manager, cashier (unchanged M4) |
| Editable after open? | **No** — immutable after `shift.opened` audit |
| Editable after payments? | **No** |
| Included in expected? | **Yes** — base term |
| Force-close effect? | Unchanged float; expected computed at force-close time |

---

## 7. Counted cash

| Question | M5 design |
|----------|-----------|
| Who enters? | owner, manager, cashier on normal close; owner/manager on force-close |
| Manager override? | Manager may force-close with optional count; normal close rules unchanged |
| When entered? | At close (normal or force) |
| Editable after close? | **No** — closed shifts immutable |
| Required on close? | **OPEN DECISION OD-M5-1** — backend allows NULL today; frontend requires. Recommend: **optional** with variance NULL when omitted; UI warns but allows card-only close |
| Force-close requires count? | **No** (unchanged M4-E3) |
| Nullable in DB? | **Yes** (`counted_cash_cents` already nullable) |
| Close without counting | Allowed at API; `variance_cents` = NULL; audit records `counted_cash_cents: null` |
| Reason required without count? | **No** for normal close; force-close still requires `reason` |

---

## 8. Variance

```
variance_cents = counted_cash_cents - expected_cash_cents   // when counted provided
variance_cents = NULL                                         // when counted omitted
```

| Case | Meaning |
|------|---------|
| Positive | Overage (more cash than expected) |
| Negative | Shortage |
| Zero | Balanced |
| NULL | No physical count submitted |

| Question | M5 design |
|----------|-----------|
| Block close on variance? | **Default: No** — record and audit (OPEN DECISION OD-M5-2 for threshold block) |
| Reason required on non-zero? | **OPEN DECISION OD-M5-3** — recommend optional `variance_note` when \|variance\| &gt; 0 |
| Manager approval over threshold? | **OPEN DECISION OD-M5-4** — recommend M5-F UI + setting `shift_variance_approval_cents`; defer hard block to product sign-off |
| Immutable after close? | **Yes** |

---

## 9. Shift close state machine

**Decision:** Keep M4 two-state model (`open` → `closed`). Reconciliation is **close-time computation + persisted columns**, not separate DB states.

```
open ──(close with reconciliation)──► closed [immutable]
  │
  └──(force-close)──► closed [immutable]
```

UI may show wizard steps (Preview → Count → Confirm) — **UI-only**, not stored status.

---

## 10. Day close

### 10.1 Required in M5?

**Yes** per master plan milestone M5 and RFC §19 — delivered in slice **M5-G** after per-shift reconciliation (M5-B–F) is green.

### 10.2 Business day

**OPEN DECISION OD-M5-5:** Recommend `settings.timezone` local date boundaries (consistent with RFC §19), **not** UTC (reports today use UTC for sales — day close should document timezone explicitly).

### 10.3 Behavior

| Rule | Design |
|------|--------|
| Multiple terminal shifts | Each closes independently; day close aggregates **closed** shifts whose `closed_at` falls in business date |
| Open shift at day close | **Warn** — day close allowed with open shifts flagged in summary (OPEN DECISION OD-M5-6: block vs warn) |
| Day close with variance | **Allowed** — snapshot includes per-shift variance |
| Late payments after shift close | Payment attributes to **new** open shift or NULL — not retroactive |
| Separate entity | **Yes** — `day_closes` table |
| Block orders after day close | **Deferred** — master plan §1.5 policy TBD; default **no block** in M5 |

### 10.4 Proposed `day_closes` (M5-G)

```sql
CREATE TABLE day_closes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_date TEXT NOT NULL,          -- YYYY-MM-DD in settings.timezone
  closed_by_user_id TEXT NOT NULL,
  summary_json TEXT NOT NULL,           -- immutable snapshot
  created_at TEXT NOT NULL,
  UNIQUE(business_date)
);
```

---

## 11. Audit model (M5)

Extend existing events — **do not duplicate** `shift.closed` / `shift.force_closed`.

### 11.1 Enhanced metadata on existing events

Add to `shift.closed` / `shift.force_closed` metadata (same transaction):

| Field | Content |
|-------|---------|
| `expected_cash_cents` | Computed value |
| `variance_cents` | Nullable |
| `cash_payment_count` | Integer |
| `cash_payment_total_cents` | Sum of qualifying lines |
| `variance_note` | Optional, if provided |

### 11.2 New events (evaluate necessity)

| Action | When | Required? |
|--------|------|-----------|
| `shift.reconciliation_previewed` | Close preview API called | **No** — read-only; skip unless product wants preview audit |
| `day.closed` | Day close success | **Yes** (M5-G) |
| `shift.variance_approved` | Manager approves over-threshold | **If** OD-M5-4 approval workflow ships |

**Sensitive data:** No customer PII in metadata; amounts in cents only.

**Transaction boundary:** Audit writes inside same `withTxn()` as shift/day-close mutation (M3 pattern).

---

## 12. Security / RBAC

Uses existing `requireRole()` — no permissions table.

| Action | owner | manager | cashier | waiter | chef |
|--------|-------|---------|---------|--------|------|
| View close preview (own terminal) | ✓ | ✓ | ✓ | — | — |
| Close shift (own terminal) | ✓ | ✓ | ✓ | — | — |
| Force close | ✓ | ✓ | — | — | — |
| View shift history / reconciliation | ✓ | ✓ | — | — | — |
| View variance on closed shifts | ✓ | ✓ | — | — | — |
| Override / approve variance | ✓ | ✓ | — | — | — |
| Day close | ✓ | ✓ | — | — | — |
| Reopen closed shift | **Denied all** | | | | |

Cashier close: must supply matching `terminal_id` (unchanged M4).

---

## 13. Database design (M5-B)

### 13.1 Migration v70 (proposed)

**Alter `shifts`:**

```sql
ALTER TABLE shifts ADD COLUMN expected_cash_cents INTEGER;
ALTER TABLE shifts ADD COLUMN variance_cents INTEGER;
-- Optional M5-F:
ALTER TABLE shifts ADD COLUMN variance_note TEXT;
```

| Column | Nullability | When set |
|--------|-------------|----------|
| `expected_cash_cents` | NOT NULL after close | Computed at close |
| `variance_cents` | NULL if no count | `counted - expected` when count provided |
| `variance_note` | NULL | Optional operator note |

**Constraints:** No CHECK on variance sign — negative allowed.

**Historical rows:** Pre-M5 closed shifts keep NULL expected/variance (backfill **not** required).

**Fresh install:** v69 creates base table; v70 adds columns before any shifts exist.

### 13.2 Separate reconciliation table?

**Not required** — one reconciliation per shift at close. Extend `shifts`.

### 13.3 Settings seeds (optional M5)

| Key | Default | Purpose |
|-----|---------|---------|
| `shift_variance_approval_cents` | `500` (OPEN) | Threshold for manager approval UI |
| `shift_require_counted_cash` | `false` (OPEN) | Align with OD-M5-1 |

### 13.4 Indexes

Existing `idx_bills_shift_id`, `idx_shifts_terminal_closed` sufficient for aggregation. No new index required unless profiling shows otherwise.

---

## 14. API design (M5-E — **IMPLEMENTED**)

### 14.1 Extend existing

| Method | Path | M5 change |
|--------|------|-----------|
| POST | `/api/shifts/:id/close` | Compute expected/variance; persist; enhanced response |
| POST | `/api/shifts/:id/force-close` | Same reconciliation math |
| GET | `/api/shifts/:id` | Include expected/variance + optional payment summary |
| GET | `/api/shifts` | Include expected/variance in list rows |

### 14.2 New endpoints

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/shifts/:id/reconciliation-preview` | owner, manager, cashier | Expected cash + breakdown **without** closing |

**Close request body (extended):**

```json
{
  "counted_cash_cents": 125000,
  "closing_note": "optional",
  "variance_note": "optional",
  "terminal_id": "optional-for-cashier"
}
```

**Close response (extended):**

```json
{
  "shift": { "...": "...", "expected_cash_cents": 124500, "variance_cents": 500 },
  "summary": {
    "cash_payment_count": 42,
    "cash_payment_total_cents": 99500,
    "non_cash_payment_total_cents": 350000
  }
}
```

**Preview response:** Same `summary` + top-level `opening_float_cents`, `expected_cash_cents`, `counted_cash_cents`, `variance_cents`; open shifts keep counted/variance `null`.

**Day close (M5-G — IMPLEMENTED):**

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/api/reports/day-close` | owner, manager | Body `{ business_date? }`; **201** `{ day_close, summary }`; **409** duplicate |
| GET | `/api/reports/day-close/:date` | owner, manager | **200** `{ day_close, summary }` or **404** |

Independent of `shifts_enabled`. Does not block POS. Business date = `settings.timezone` calendar day.

**Errors (shifts):** 409 if shift already closed; 400 validation; 503 shifts disabled. **Errors (day close):** 409 `DAY_CLOSE_EXISTS`; 400 invalid date; 404 missing.

---

## 15. UI design (M5-F — **IMPLEMENTED**)

Extend M4-E components — **no parallel system**.

| Surface | M5 change |
|---------|-----------|
| `CloseShiftModal` | Step 1: fetch preview → show expected + cash/card totals; Step 2: counted input with live variance; optional variance note |
| `ForceCloseShiftModal` | Same preview; keep reason required |
| `ShiftStatusSection` | Optional “Expected in drawer” readout (OPEN) |
| `ShiftHistoryPanel` | Columns: expected, variance; filter by date/terminal |
| Dashboard | Day close card (M5-G) |
| Settings | Optional variance threshold (M5-G) |

Align counted-cash required/optional per OD-M5-1.

---

## 16. Reporting (M5 scope)

| Report | Slice | Notes |
|--------|-------|-------|
| Shift reconciliation summary | M5-E/F | On close + history |
| Per-shift cash expected/count/variance | M5-E/F | Core |
| Payment method totals (shift-scoped) | M5-E | In close preview/summary |
| Day close Z-report snapshot | M5-G | `day_closes.summary_json` |
| Cross-day analytics | **Post-M5** | Extend existing `/reports/sales` later |

---

## 17. Failure / edge cases

| # | Case | Expected behavior |
|---|------|-------------------|
| 1 | Close with no payments | `expected = opening_float`; variance = count − float |
| 2 | Card-only shift | `expected = opening_float`; no cash lines |
| 3 | Cash-only shift | Expected = float + sum(cash lines) |
| 4 | Mixed cash/card | Only cash lines in expected |
| 5 | Partial payments | All cash lines on attributed bill count |
| 6 | Split checks | Each bill's cash counted when attributed |
| 7 | Pay after order shift closed | Bill shift = payment shift; order shift ignored |
| 8 | Payment on another terminal | Bill gets payer terminal's shift (first payment wins) |
| 9 | No terminal header | `shift_id` NULL — cash not in any shift expected |
| 10 | Cash gate on | Does not change reconciliation math |
| 11 | Cash gate off | Same |
| 12 | Force-close | Same math; reason audited |
| 13 | Missing counted cash | `variance_cents` NULL |
| 14 | Counted = 0 | Valid; variance = −expected |
| 15 | Negative variance | Stored; warn in UI |
| 16 | Positive variance | Stored; warn in UI |
| 17 | Zero variance | Stored as 0 |
| 18 | Duplicate close | 409 `SHIFT_ALREADY_CLOSED` |
| 19 | Concurrent close | SQLite serializes; one wins |
| 20 | Payment during close txn | Payment txn separate; close sees committed payments before its txn snapshot |
| 21 | DB failure mid-close | Rollback — shift stays open |
| 22 | Audit failure mid-close | Rollback entire txn |
| 23 | Upgrade v69→v70 | Additive columns NULL on old rows |
| 24 | Historical closed shifts | NULL expected/variance — display “—” |
| 25 | `shifts_enabled=false` | Shift APIs 503; no reconciliation |

---

## 18. Test strategy

### 18.1 Unit / service

- `computeExpectedCashCents(shiftId)` — pure function with fixture bills
- Cash line extraction from malformed/legacy JSON (wrapped single object)
- Refund term returns 0
- Variance NULL when no count

### 18.2 Integration

- Open → cash payment → close → expected/variance persisted
- Card-only close
- Partial payments across batches
- Split checks
- Order shift A / bill shift B
- Cross-terminal partial payment (first-payment-wins)
- Force-close with reconciliation
- Preview does not close shift
- Audit metadata includes expected/variance
- RBAC matrix
- `shifts_enabled=false` regression

### 18.3 Migration

- Fresh install v70 includes columns
- Upgrade v69→v70 preserves data; new columns NULL

### 18.4 Frontend

- Extend `shift-ui.test.ts` / new `shift-reconciliation.test.ts`
- Close modal shows variance
- History columns

### 18.5 Day close (M5-G)

- Snapshot JSON golden file
- Idempotent second close same date → 409

### 18.6 Acceptance criteria (M5 complete)

1. Migration v70 additive; upgrade-path green
2. Close computes and persists expected + variance
3. Preview API matches close computation
4. Bill `shift_id` attribution unchanged from M4
5. Audit enhanced on close
6. Day close snapshot (M5-G)
7. No M6 refund logic
8. `npm test` green

---

## 19. Open product decisions

| ID | Decision | Recommendation | Blocker? |
|----|----------|----------------|----------|
| OD-M5-1 | Counted cash required on close? | Optional at API; UI warns | No |
| OD-M5-2 | Block close on non-zero variance? | Record only (default) | No |
| OD-M5-3 | Variance note required when non-zero? | Optional | No |
| OD-M5-4 | Manager approval over threshold? | UI prompt; soft gate first | No |
| OD-M5-5 | Business date timezone | `settings.timezone` | No |
| OD-M5-6 | Day close with open shifts | Warn in summary | No |
| OD-M5-7 | Backfill historical expected/variance | No backfill | No |
| OD-M5-8 | Include non-cash totals in close summary | Yes (display only) | No |

---

## 20. Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R-M5-01 | JSON aggregation performance | Shift-scoped query on indexed `bills.shift_id`; small N |
| R-M5-02 | Frontend/backend counted-cash mismatch | OD-M5-1 alignment in M5-F |
| R-M5-03 | Cross-terminal partial payment mis-attribution | Document; M4 accepted |
| R-M5-04 | UTC vs local day close | OD-M5-5; explicit timezone in service |
| R-M5-05 | Payment during count | Operational warning in UI (M4-E3 stale pattern) |
| R-M5-06 | Scope creep into M6 refunds | Hardcode refund term 0 |

---

## 21. Implementation sequence (M5-B → M5-H)

See [`m5-cash-reconciliation-impact-analysis.md`](m5-cash-reconciliation-impact-analysis.md) §16 for slice detail.

| Slice | Objective |
|-------|-----------|
| **M5-A** | Design / RFC (**this document**) |
| **M5-B** | Migration v70 + settings seeds |
| **M5-C** | `computeExpectedCashCents` service (**IMPLEMENTED**) |
| **M5-D** | Wire computation into close/force-close (**IMPLEMENTED**) |
| **M5-E** | Preview API + extended responses (**IMPLEMENTED** — **GREEN**) |
| **M5-F** | Close wizard UI + history columns (**IMPLEMENTED** — **GREEN**) |
| **M5-G** | Day close table + API + dashboard (**IMPLEMENTED** — **GREEN**) |
| **M5-H** | Documentation sync (**COMPLETE**); full production verification gate pending |

### M5-G implementation status (2026-08-12)

**GREEN — day close snapshot across closed terminal shifts.**

| Item | Detail |
|------|--------|
| Migration | v71 `day_closes` + `UNIQUE(business_date)` + `idx_day_closes_created_at` |
| Timezone | OD-M5-5: `settings.timezone` via `businessDateInTimezone` / `localDayBoundsUtc` |
| Open shifts | OD-M5-6: warn in summary (`open_shifts_warning`), still allow |
| Service | `main/services/day-close.ts` — owner/manager; empty day allowed |
| API | `POST /api/reports/day-close`, `GET /api/reports/day-close/:date` |
| Duplicate | 409 `DAY_CLOSE_EXISTS`; no duplicate row/audit |
| UI | Dashboard `DayCloseCard` for owner/manager |
| Audit | `day.closed` / `entity_type=day_close` inside `withTxn` |
| Unchanged | No POS block after day close; M5-H docs sync done; full production gate not fully run; M6 not started |
| Tests | `tests/day-close.test.ts`, `tests/day-close-ui.test.ts` |

### M5-F implementation status (2026-08-12)

**GREEN — reconciliation UI in close/force-close modals and shift history.**

| Item | Detail |
|------|--------|
| Client | `fetchReconciliationPreview`, `formatVarianceLabel`, `ShiftMutationResult` in `frontend/src/lib/shifts.ts` |
| Modals | `CloseShiftModal` + `ForceCloseShiftModal` fetch preview on open; live variance (counted required on close, optional on force-close) |
| History | `ShiftHistoryPanel` columns: expected cash, variance (Over/Short/Balanced) |
| i18n | en, es, pt keys for preview strip and history columns |
| OD-M5-1 | Frontend requires counted cash on close; API remains optional |
| OD-M5-2 | No block on non-zero variance — labels only |
| Unchanged | (at M5-F ship) No day close; no verification gate; no new migration |
| Tests | `tests/shift-ui.test.ts`, `tests/shift-e3.test.ts`, `tests/shift-client.test.ts` |

### M5-E implementation status (2026-08-12)

**GREEN — read-only preview API + extended shift responses.**

| Item | Detail |
|------|--------|
| Preview route | `GET /api/shifts/:id/reconciliation-preview` — owner, manager, cashier |
| Service | `getShiftReconciliationPreview`, `getShiftPaymentSummary` in `main/services/shift.ts` |
| Summary | `cash_payment_count`, `cash_payment_total_cents`, `non_cash_payment_total_cents` |
| Open shift | Live expected; `counted_cash_cents` / `variance_cents` always null (no counted input) |
| Closed shift | Persisted expected/variance/count; summary recomputed from bills (no writes) |
| Extended responses | Close, force-close, GET `/:id` → `{ shift, summary }` |
| RBAC | Cashier own terminal; owner/manager any shift |
| Unchanged | No frontend; no migration; no `variance_note`; list rows unchanged |
| Tests | `tests/shift-reconciliation.test.ts` (M5-E); `tests/shift-service.test.ts` |

---

## Final status: **DESIGN READY** (M5-A); **M5-B GREEN**; **M5-C GREEN**; **M5-D GREEN**; **M5-E GREEN**; **M5-F GREEN**; **M5-G GREEN**; **M5-H docs sync COMPLETE** (full production gate pending)

### M5-C implementation status (2026-08-12)

**GREEN — read-only computation slice.**

| Item | Detail |
|------|--------|
| Service | `computeExpectedCashCents(shiftId)` in `main/services/shift.ts` |
| Cash classification | `main/services/payment-cash.ts` — shared with M4-D4 gate (`method === 'cash'` && applied `amount > 0`) |
| Formula | `opening_float_cents + SUM(cash applied on bills WHERE bills.shift_id = shiftId)` |
| Attribution | `bills.shift_id` only; NULL bill shift contributes zero; `orders.shift_id` ignored |
| Partial payments | Every qualifying cash line on attributed bills included |
| Writes | None from `computeExpectedCashCents` — columns written only at close (M5-D) |
| Refunds | Zero contribution (M6 deferred) |
| Feature flag | `shifts_enabled` does not alter computation |
| Tests | `tests/shift-reconciliation.test.ts` |

### M5-D implementation status (2026-08-12)

**GREEN — close/force-close reconciliation persistence.**

| Item | Detail |
|------|--------|
| Helper | `computeShiftReconciliation(shiftId, countedCashCents)` inside `withTxn` |
| Persist | UPDATE sets `expected_cash_cents`, `variance_cents` with status close |
| Formula | `expected = opening_float + cash_payment_total`; `variance = counted - expected` or `NULL` if counted omitted |
| Force-close | Same persistence + audit fields |
| Audit | Adds `expected_cash_cents`, `variance_cents`, `cash_payment_total_cents`, `cash_payment_count` |
| Atomicity | Recon compute + UPDATE + audit in one transaction; audit failure leaves shift open and columns NULL |
| Unchanged | Counted cash optional; no reopen; no schema bump; no frontend |
| Refunds | Still zero until M6 |
| Tests | `tests/shift-reconciliation.test.ts` (M5-D block) + `tests/shift-service.test.ts` |

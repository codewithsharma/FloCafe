# Progress

**Last updated:** 2026-08-12

## Phase 0 — Discovery & Documentation

| Task | Status |
|------|--------|
| Git safety verification | ✅ Complete |
| Backend architecture discovery | ✅ Complete |
| Frontend architecture discovery | ✅ Complete |
| Database schema analysis | ✅ Complete |
| Test/CI audit | ✅ Complete |
| Feature inventory | ✅ Complete |
| Security findings documented | ✅ Complete |
| docs/ structure generated | ✅ Complete |
| Second-pass audit | ✅ Complete |
| §11 documentation corrections | ✅ Complete |
| Master implementation plan | ✅ Complete |

## M1 — Engineering baseline

| Task | Status |
|------|--------|
| c8 coverage baseline (auth/tax/payments) | ✅ Complete |
| M1 engineering gate test | ✅ Complete |
| CI coverage artifact | ✅ Complete |
| Backup/restore verification | ✅ Complete |
| Rollback procedure documented | ✅ Complete |

**Report:** [`m1-engineering-baseline.md`](m1-engineering-baseline.md) — **GREEN**

No product behavior or schema changes (v66 unchanged).

## M2 — Privacy & consent ✅

| Task | Status |
|------|--------|
| Explicit telemetry opt-in | ✅ Complete |
| Explicit diagnostics opt-in | ✅ Complete |
| Migration v67 | ✅ Complete |
| Fail-closed transmission | ✅ Complete |
| Setup + Settings UI | ✅ Complete |

**Report:** [`m2-privacy-consent.md`](m2-privacy-consent.md) — **GREEN**

## M3 — Audit log foundation ✅

| Task | Status |
|------|--------|
| `audit_logs` schema (migration v68) | ✅ Complete |
| Central audit service | ✅ Complete |
| Sensitive metadata sanitization | ✅ Complete |
| Owner/manager read API | ✅ Complete |
| Auth + staff + void integrations | ✅ Complete |
| Tests + upgrade path | ✅ Complete |

**Report:** [`m3-audit-log.md`](m3-audit-log.md) — **GREEN**

## M4-A — Shift management RFC ✅

| Task | Status |
|------|--------|
| Current-state analysis (code-verified) | ✅ Complete |
| Shift model decision (per-terminal) | ✅ Complete |
| Lifecycle, permissions, audit events | ✅ Complete |
| Database + API + UI proposals | ✅ Complete |
| M5 dependency mapping | ✅ Complete |
| ADR-007 | ✅ Complete |

**RFC:** [`m4-shift-management-rfc.md`](m4-shift-management-rfc.md) — **DESIGN READY**
**ADR:** [`ADR-007-shift-model.md`](../14-decisions/ADR-007-shift-model.md)

No application code modified.

## M4-B — Shift database foundation ✅

| Task | Status |
|------|--------|
| Migration v69 (`m4_shift_foundation`) | ✅ Complete |
| `shifts` table + indexes/constraints | ✅ Complete |
| `orders.shift_id`, `bills.shift_id` (nullable) | ✅ Complete |
| Settings seeds (`shifts_enabled=false`, etc.) | ✅ Complete |
| Schema tests (`tests/shift-schema.test.ts`) | ✅ Complete |

**Schema version:** 70 (M5-B adds `expected_cash_cents`, `variance_cents` on `shifts`)
**Behavior:** Unchanged — `shifts_enabled` defaults to `false`; no shift API/UI/service.

## M4-C — Shift service + API ✅

| Task | Status |
|------|--------|
| Shift service (`open` / `active` / `get` / `list` / `close` / `force-close`) | ✅ Complete |
| HTTP API (`/api/shifts/*`) + existing RBAC | ✅ Complete |
| Duplicate-open 409 + unique-index mapping | ✅ Complete |
| Audit events inside `withTxn()` | ✅ Complete |
| Host `terminal_id` generate-once persistence | ✅ Complete |
| Tests (`tests/shift-service.test.ts`) | ✅ Complete |

**Behavior:** Shift APIs exist but are **503** while `shifts_enabled=false`. Orders and payments are **not** gated. No POS UI.

**Not in M4-C:** M4-D POS integration, M4-E UI, M5 reconciliation, M8 cash drawer.

## M4-D1 — Terminal identity ✅

| Task | Status |
|------|--------|
| Per-origin `flo_terminal_id` in browser `localStorage` | ✅ Complete |
| `X-Flo-Terminal-Id` on POS order/payment/shift requests | ✅ Complete |
| Browser POS does not inherit `GET /api/shifts/terminal-id` | ✅ Complete |
| Host `settings.terminal_id` unchanged | ✅ Complete |
| Tests (`tests/terminal-identity.test.ts` + shift-service cases) | ✅ Complete |

**M4-D1 = IMPLEMENTED.**

## M4-D2 — Order Shift Integration ✅

| Task | Status |
|------|--------|
| `resolveActiveShiftForOrder(terminalIdHeader)` helper | ✅ Complete |
| `POST /api/orders` `shift_id` assignment in `withTxn()` | ✅ Complete |
| Feature flag OFF & missing header -> `shift_id = NULL` | ✅ Complete |
| Active shift -> `orders.shift_id = active_shift.id` | ✅ Complete |
| Malformed header -> HTTP 400 & rollback | ✅ Complete |
| No host terminal fallback on order create | ✅ Complete |
| Order `shift_id` immutability across item/discount/void edits | ✅ Complete |
| Tests (`tests/shift-order-integration.test.ts`) | ✅ Complete |

**M4-D2 = IMPLEMENTED.**

## M4-D3 — Bill/Payment Shift Integration ✅

| Task | Status |
|------|--------|
| `resolveActiveShiftForTerminal(terminalIdHeader)` helper | ✅ Complete |
| `applyPaymentBatch` `bills.shift_id` assignment on FIRST payment | ✅ Complete |
| `orders.shift_id != bills.shift_id` (independent attribution) | ✅ Complete |
| Subsequent partial payments do NOT overwrite `bills.shift_id` | ✅ Complete |
| Feature flag OFF & missing header -> `bills.shift_id = NULL` | ✅ Complete |
| Malformed header -> HTTP 400 & transaction rollback | ✅ Complete |
| Multi-terminal isolation (T1 -> S1, T2 -> S2) | ✅ Complete |
| Tests (`tests/shift-bill-payment-integration.test.ts`) | ✅ Complete |

**M4-D3 = IMPLEMENTED.** Cash enforcement (M4-D4), shift UI (M4-E), and M5 are **not** implemented.

## M4-D4 — Cash Payment Gate ✅

| Task | Status |
|------|--------|
| `isCashPaymentGateEnabled()` + `assertOpenShiftForCashPayment()` in shift service | ✅ Complete |
| Gate enforced in `applyPaymentBatch()` before payment writes | ✅ Complete |
| Opt-in only (`shifts_enabled` + `require_open_shift_for_cash` both true) | ✅ Complete |
| Cash identified via resolved `method === 'cash'` | ✅ Complete |
| Missing terminal / no open shift → HTTP 409 for gated cash | ✅ Complete |
| Non-cash payments unaffected | ✅ Complete |
| Mixed payment batches atomic on block | ✅ Complete |
| No host terminal fallback | ✅ Complete |
| Tests (`tests/cash-payment-gate.test.ts`) | ✅ Complete |

**M4-D4 = IMPLEMENTED.** M4-D5, M4-E1, and later slices tracked separately below.

## M4-D5 — Shift Enforcement Foundation ✅

| Task | Status |
|------|--------|
| `readTerminalIdHeaderFromRequest()` shared header parser | ✅ Complete |
| `assertOpenShiftForPosTerminal()` strict opt-in helper | ✅ Complete |
| `requireOpenShiftForTerminal()` Express middleware | ✅ Complete |
| Consolidated header parsing in orders/bills/shifts routes | ✅ Complete |
| No production routes wired to strict enforcement (RFC §9/§20) | ✅ Complete |
| M4-D4 cash gate unchanged | ✅ Complete |
| M4-D2/D3 soft attribution unchanged | ✅ Complete |
| Tests (`tests/shift-enforcement.test.ts`) | ✅ Complete |

**M4-D5 = IMPLEMENTED.** Shift UI client foundation (M4-E1) implemented. M4-E2+ and M5 are **not** implemented.

## M4-E1 — Shift UI Client Foundation ✅

| Task | Status |
|------|--------|
| `frontend/src/lib/shifts.ts` — typed shift API client | ✅ Complete |
| `Shift` / `ShiftStatus` types in `frontend/src/lib/types.ts` | ✅ Complete |
| `useShift()` hook — loading/active/inactive/disabled/error states | ✅ Complete |
| `refresh()` explicit re-fetch, no polling | ✅ Complete |
| Browser uses `flo_terminal_id` + `X-Flo-Terminal-Id` only | ✅ Complete |
| No call to `GET /api/shifts/terminal-id` from browser client | ✅ Complete |
| No visible POS UI changes (foundation only) | ✅ Complete |
| Tests (`tests/shift-client.test.ts`) | ✅ Complete |

**M4-E1 = IMPLEMENTED.** M4-E2 shift status UI implemented. M4-E3+ and M5 are **not** implemented.

## M4-E2 — Shift Status & Open/Close UI ✅

| Task | Status |
|------|--------|
| StatusBar shift indicator via `ShiftStatusSection` | ✅ Complete |
| Open shift modal (float + note, integer cents) | ✅ Complete |
| Close shift modal (counted cash + note) | ✅ Complete |
| Role-gated controls (owner/manager/cashier only) | ✅ Complete |
| `refresh()` after successful open/close | ✅ Complete |
| Shifts disabled (503) → hidden, no error banner | ✅ Complete |
| Browser LAN footer when shifts enabled | ✅ Complete |
| i18n en/es/pt | ✅ Complete |
| Tests (`tests/shift-ui.test.ts`) | ✅ Complete |

**M4-E2 = IMPLEMENTED.** M4-E3 shift UI polish implemented. M5 is **not** implemented.

## M4-E3 — Shift UI Polish (Stale Warnings + History) ✅

| Task | Status |
|------|--------|
| Stale shift detection via `shift_stale_hours` setting | ✅ Complete |
| Stale-shift banner in StatusBar (`ShiftStatusSection`) | ✅ Complete |
| Manager/owner force-close modal with required reason | ✅ Complete |
| Shift history panel (owner/manager, paginated `GET /api/shifts`) | ✅ Complete |
| Client helpers: `isShiftStale`, `listShifts`, `forceCloseShift` | ✅ Complete |
| i18n en/es/pt | ✅ Complete |
| Tests (`tests/shift-e3.test.ts`) | ✅ Complete |

**M4-E3 = IMPLEMENTED.** M5 implementation **not** started.

## M5-A — Cash Reconciliation Design ✅

| Task | Status |
|------|--------|
| Current-state analysis (code-verified) | ✅ Complete |
| Expected cash / variance model | ✅ Complete |
| Day close design | ✅ Complete |
| Database / API / UI proposals | ✅ Complete |
| Audit + RBAC design | ✅ Complete |
| Edge cases + test strategy | ✅ Complete |
| Implementation slice plan (M5-B → M5-H) | ✅ Complete |
| ADR-008 | ✅ Complete |

**RFC:** [`m5-cash-reconciliation-rfc.md`](m5-cash-reconciliation-rfc.md) — **DESIGN READY**
**Impact analysis:** [`m5-cash-reconciliation-impact-analysis.md`](m5-cash-reconciliation-impact-analysis.md)
**ADR:** [`ADR-008-cash-reconciliation-model.md`](../14-decisions/ADR-008-cash-reconciliation-model.md)

No application code modified.

## M5-B — Reconciliation Database Foundation ✅

| Task | Status |
|------|--------|
| Migration v70 (`m5_cash_reconciliation_columns`) | ✅ Complete |
| `shifts.expected_cash_cents` nullable column | ✅ Complete |
| `shifts.variance_cents` nullable column | ✅ Complete |
| v69 → v70 upgrade-path test | ✅ Complete |
| Fresh install schema v70 | ✅ Complete |
| No backfill of historical reconciliation values | ✅ Complete |
| No application writes to new columns | ✅ Complete |
| Tests (`tests/shift-schema.test.ts`) | ✅ Complete |

**M5-B = IMPLEMENTED.** **M5-C = IMPLEMENTED.** **M5-D = IMPLEMENTED.** **M5-E = IMPLEMENTED** (preview API + extended close/GET responses). **M5-F = IMPLEMENTED** (reconciliation UI). **M5-G = IMPLEMENTED** (day close). **M5-H = COMPLETE** (docs sync + full verification gate). M6 **not** started.

### M5-C — Expected cash computation (2026-08-12)

| Item | Status |
|------|--------|
| `computeExpectedCashCents(shiftId)` in `main/services/shift.ts` | ✅ Complete |
| Shared cash classification `main/services/payment-cash.ts` (M4-D4 + M5-C) | ✅ Complete |
| Formula: `opening_float_cents + SUM(cash applied on bills WHERE shift_id = shift)` | ✅ Complete |
| Attribution: `bills.shift_id` only (not `orders.shift_id`) | ✅ Complete |
| Read-only until close (M5-D writes columns) | ✅ Complete |
| Refunds deferred (hardcoded zero contribution) | ✅ Complete |
| Tests (`tests/shift-reconciliation.test.ts`) | ✅ Complete |

### M5-D — Close reconciliation persistence (2026-08-12)

| Item | Status |
|------|--------|
| `computeShiftReconciliation` inside close/force-close `withTxn` | ✅ Complete |
| Persist `expected_cash_cents` + `variance_cents` on UPDATE | ✅ Complete |
| Counted cash optional → `variance_cents` NULL when omitted | ✅ Complete |
| Audit metadata: expected, variance, cash_payment_total_cents, cash_payment_count | ✅ Complete |
| Atomicity: audit failure rolls back close (columns stay NULL) | ✅ Complete |
| No new migration / no frontend / no preview API | ✅ Complete |
| Tests (`tests/shift-reconciliation.test.ts` M5-D + `tests/shift-service.test.ts`) | ✅ Complete |

### M5-E — Reconciliation preview API (2026-08-12)

| Item | Status |
|------|--------|
| `GET /api/shifts/:id/reconciliation-preview` | ✅ Complete |
| `getShiftReconciliationPreview` (read-only; no counted input) | ✅ Complete |
| `getShiftPaymentSummary` (cash + non_cash totals) | ✅ Complete |
| Non-cash aggregation in `main/services/payment-cash.ts` | ✅ Complete |
| Close / force-close / GET `/:id` return `{ shift, summary }` | ✅ Complete |
| Open shifts: live expected; `variance_cents` / `counted_cash_cents` null | ✅ Complete |
| Closed shifts: persisted expected/variance/count; summary recomputed | ✅ Complete |
| Cashier terminal scoping; owner/manager any shift | ✅ Complete |
| No frontend / no new migration / no variance_note column | ✅ Complete |
| Tests (`tests/shift-reconciliation.test.ts` M5-E + `tests/shift-service.test.ts`) | ✅ Complete |

### M5-F — Reconciliation UI (2026-08-12)

| Item | Status |
|------|--------|
| `fetchReconciliationPreview` + `formatVarianceLabel` in `frontend/src/lib/shifts.ts` | ✅ Complete |
| `Shift` type extended with `expected_cash_cents`, `variance_cents` | ✅ Complete |
| Terminal header on GET reconciliation-preview | ✅ Complete |
| `CloseShiftModal` preview strip + live variance (counted required) | ✅ Complete |
| `ForceCloseShiftModal` preview strip (counted optional) | ✅ Complete |
| `ShiftHistoryPanel` expected + variance columns | ✅ Complete |
| i18n keys (en, es, pt) | ✅ Complete |
| `closeShift` / `forceCloseShift` parse `{ shift, summary }` | ✅ Complete |
| Tests (`shift-ui.test.ts`, `shift-e3.test.ts`, `shift-client.test.ts`) | ✅ Complete |
| No new migration / no M5-G / no M5-H | ✅ Complete (as of M5-F ship) |

### M5-G — Day close (2026-08-12)

| Item | Status |
|------|--------|
| Migration v71 `day_closes` + UNIQUE(business_date) | ✅ Complete |
| `businessDateInTimezone` / `localDayBoundsUtc` (OD-M5-5) | ✅ Complete |
| `DayCloseService` + open-shift warn (OD-M5-6) | ✅ Complete |
| POST/GET `/api/reports/day-close` owner/manager; 409 duplicate | ✅ Complete |
| Dashboard `DayCloseCard` + i18n (en/es/pt) | ✅ Complete |
| Audit `day.closed` in withTxn; no audit on 409 | ✅ Complete |
| Does not block POS after day close | ✅ Complete |
| Tests (`day-close.test.ts`, `day-close-ui.test.ts`) | ✅ Complete |
| M5-H documentation sync (API, schema, PM, RFC status) | ✅ Complete |
| M5-H full production verification gate | ✅ Complete |
| M6 | ❌ Not started |

## Next steps

1. **M6:** Refund workflow — only after explicit approval
2. Do not start M6 until explicitly approved

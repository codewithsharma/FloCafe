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

**Schema version:** 69
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

**M4-E3 = IMPLEMENTED.** M5 is **not** implemented.

## Next steps

1. **M5:** Cash reconciliation (only when explicitly approved)
2. Do not start M5 until explicitly approved

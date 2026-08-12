# Milestones

> **Authoritative milestone definitions:** [`master-implementation-plan.md`](master-implementation-plan.md) §17  
> This file is a **summary index**. Full scope, acceptance criteria, and rollback for each milestone are in the master plan.

## M0 — Documentation complete ✅

**Target:** Documentation system live in `docs/`  
**Exit criteria:** All docs/ files created; second-pass audit corrections applied; team sign-off pending

---

## M1 — Engineering baseline ✅

**Target:** Measurable, safe development gate  
**Exit criteria:** c8 coverage on payment/tax/auth; backup/restore verified; `npm test` green  
**Report:** [`m1-engineering-baseline.md`](m1-engineering-baseline.md)

## M2 — Privacy & consent

**Target:** Explicit consent before telemetry/diagnostics transmission (TARGET behavior)  
**Exit criteria:** Fresh-install consent test; opt-out persistence; legal sign-off

## M2 — Privacy & consent ✅

**Target:** Explicit consent before telemetry/diagnostics transmission  
**Exit criteria:** Fail-closed; setup opt-in; tests pass; migration v67  
**Report:** [`m2-privacy-consent.md`](m2-privacy-consent.md)

## M3 — Audit log foundation ✅

**Target:** Central immutable audit trail  
**Exit criteria:** `audit_logs` table; owner read API; integration test for action → audit row  
**Report:** [`m3-audit-log.md`](m3-audit-log.md)

## M4 — Shift open/close

**Target:** Cashier session tracking with opening float

**Exit criteria:** Shift lifecycle integration test; single active shift policy enforced

**Design:** [`m4-shift-management-rfc.md`](m4-shift-management-rfc.md) — **DESIGN READY** (M4-A)

**Schema:** Migration v69 — **COMPLETE** (M4-B)

**Service + API:** **COMPLETE** (M4-C)

**Terminal identity:** **COMPLETE** (M4-D1) — per-origin `flo_terminal_id` + `X-Flo-Terminal-Id` on POS order/payment/shift requests. Host `settings.terminal_id` unchanged.

**Order shift integration:** **COMPLETE** (M4-D2) — initial `POST /api/orders` assigns `orders.shift_id` when active shift exists for request terminal. Immutable on subsequent order updates.

**Bill payment shift integration:** **COMPLETE** (M4-D3) — initial payment on bill assigns `bills.shift_id` when active shift exists for payment terminal. Immutable on subsequent partial payments; independent from `orders.shift_id`.

**Cash payment gate:** **COMPLETE** (M4-D4) — when `shifts_enabled=true` and `require_open_shift_for_cash=true`, cash payments require an open shift for `X-Flo-Terminal-Id`. HTTP 409 when blocked. Non-cash unaffected. Default off.

**Shift enforcement foundation:** **COMPLETE** (M4-D5) — `assertOpenShiftForPosTerminal()` + `requireOpenShiftForTerminal()` middleware for opt-in POS mutations. Active only when `shifts_enabled=true`. Not wired to orders/payments (soft attribution unchanged). No host fallback.

**Shift UI client foundation:** **COMPLETE** (M4-E1) — `frontend/src/lib/shifts.ts` + `useShift()` hook. Fetches `GET /api/shifts/active` via browser terminal header. No polling. No visible UI yet.

**Shift status & open/close UI:** **COMPLETE** (M4-E2) — StatusBar shift indicator, open/close modals, role-gated controls, integer-cent money inputs, `refresh()` after mutations. No M5 reconciliation.

**Shift UI polish:** **COMPLETE** (M4-E3) — Stale-shift banner (`shift_stale_hours`), manager force-close modal, owner/manager shift history in Settings.

**M5:** **NOT STARTED**

**ADR:** [`ADR-007-shift-model.md`](../14-decisions/ADR-007-shift-model.md)



## M5 — Cash reconciliation & day close

**Target:** End-of-day accountability  
**Exit criteria:** Expected vs counted cash variance recorded; day close snapshot test

## M6 — Refund workflow

**Target:** Post-payment reversal with audit  
**Exit criteria:** Partial/full refund tests; decimal integrity; payment_status updated correctly

## M7 — Void/comp audit integration

**Target:** Complete audit coverage for existing void flows  
**Exit criteria:** All void/cancel paths write audit_logs entries

## M8 — Cash drawer kick

**Target:** Open drawer on cash payment  
**Exit criteria:** ESC/POS kick bytes test; auto-kick setting works

## M9 — Stock movement ledger

**Target:** Append-only inventory history  
**Exit criteria:** Ledger reconciles with `stock_quantity`; extends existing stock — does not replace

## M10 — Multi-location RFC (design only)

**Target:** Approved architecture before any multi-location code  
**Exit criteria:** ADR-006 approved; migration impact documented

---

## Future milestones (post M10)

| Milestone | Target |
|-----------|--------|
| M11 | Procurement v1 (suppliers + PO) |
| M12 | Payment terminal adapter |
| M13 | RestaurantOS 1.0 release |

See [`master-implementation-plan.md`](master-implementation-plan.md) for release strategy and Definition of Done.

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

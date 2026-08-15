# Roadmap

Canonical strategy / freeze list: [`STRATEGY.md`](../../STRATEGY.md)

Canonical product plan: [`capability-matrix.md`](capability-matrix.md) (Existing / Hardening / Planned / Later / Frozen, adopted 2026-08-14)

Complete Restaurant OS blueprint (R0): [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md) · waves [`restaurant-os-roadmap.md`](restaurant-os-roadmap.md)

Code evidence: [`feature-list.md`](feature-list.md)

Execution backlog: [`.ai/tasks.md`](../../.ai/tasks.md)

Prompt pipeline 4.6–4.15: **COMPLETE** (`prompts/STATE.md`). Do not invent Phase 4.16. Post-4.15 sequencing uses **R0–R16** (Restaurant OS roadmap), not 4.16+.

Historical plan: [`15-project-management/master-implementation-plan.md`](../15-project-management/master-implementation-plan.md)

**North-star KPI:** 3 cafés × 30 days × zero critical failures.

**Development target:** Operavia Restaurant only (Retail/other verticals deferred).

Priorities: **P0** production/pilot human gates · **P1** 🟡 Hardening · **P2** 🔵 Planned slices (authorized only) · **P3** ⚪ Later / 🔴 Frozen.

---

## Now (do not skip)

Live café remains **NO-GO** until human gates: signed/notarized RC, OPS-01/OPS-02 site checklist, PIN escrow, backup policy, printer/KDS/restore drills, training/sign-off. OPS-02 audit: `docs/05-production/ops-02-live-pilot-rc-site-readiness.md`.

Software bar: Restaurant **PILOT READY WITH CONDITIONS** (engineering). Schema **v79**. ADR-014 still **Proposed**. **R0 blueprint COMPLETE** — do not auto-start **R1**.

Retail store pilot is **not** the current development target.
---

## Next software (🟡 Hardening — prefer before new surfaces)

From the capability matrix. Requires an authorized slice; not auto-started.

| Cluster            | Items                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| POS                | Void order, discounts, receipt generation — **H1 closed** (audit + tender guards + print-bill logs); remaining Hardening depth in matrix |
| KDS                | Offline KDS, KDS recovery                                                                                                                |
| Staff / security   | Permissions, authorization, role-based access, audit trail                                                                               |
| Offline / recovery | Conflict handling, app restart recovery, KDS offline behavior, restore                                                                   |
| Reliability / data | Error handling, data integrity validation, audit logging                                                                                 |

---

## Initial-scope build (🔵 Planned)

Full list: [`capability-matrix.md`](capability-matrix.md). Highlights:

- POS/menu: 86 depth, item notes, combos, courses, priority, reopen, coupons/promotions, service charge (ADR-014 Accept first), receipt reprint/digital, order source
- Floor: visual floor plan, sections, merge tables (4.13 discovery already done), seats
- KDS: routing/stations/expediter, timers, alerts, analytics
- Print: queue/retry/health/recovery, bar printer, cash drawer depth
- Inventory: ingredients, recipes/BOM, PO/receiving/suppliers, waste/expiry/count, food-cost, auto-86
- CRM/loyalty: visit frequency, segmentation, CLV, rewards/redemption, gift cards, coupons
- Digital ordering: QR menu/order/table, self-ordering, customer notifications (online payment stays frozen)
- Delivery: rider + status (aggregators stay later/frozen)
- Reports/tests/ops: payment/product/void/staff/food-cost dashboards; workflow/E2E/pilot tests; incident + device-setup procedures

Do not rebuild shipped slices listed in the matrix **Engineering alignment** section (86, cash drawer kick, SKU wastage, valuation, addon groups, stations).

---

## Closed until the matrix or STRATEGY changes

| Status                  | Examples                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🔴 Frozen               | Card terminal, payment gateway, online payment, multi-location (central menu/inventory/transfers/reporting/franchise)                                                                                                                |
| 🔴 Out of initial scope | Payroll                                                                                                                                                                                                                              |
| ⚪ Later                | Tips, pay-at-table, Bluetooth print, barcode/scale, aggregators (Swiggy/Zomato/Uber Eats/DoorDash), reservations/waitlist, kiosk, branded online ordering, e-invoicing, accounting integrations, AI, catering/events/central kitchen |

---

## Already shipped (do not reopen as greenfield)

Phase 2 **CLOSED**. Phase 3.1–3.4 **COMPLETE** (3.5B deferred; 3.5C no safe extraction). Phase 3.5A + 3.6A–G **COMPLETE**. Phase 4.1–4.15 **COMPLETE** (4.6 ADR-013 Accepted, no matrix; 4.14 ADR-014 Proposed, not wired).

Core POS: orders, cart, held/prepaid/split, modifiers, tenders (cash/card/UPI record), refunds + idempotency + restock, tax packs, tables transfer/split, KDS statuses, thermal 58/80 + KOT, inventory ledger/low-stock/adjust, CRM/loyalty/wallet, five roles + PIN + shifts, offline SQLite billing, FloAdmin/WhatsApp/Drive/RevFlo, modular `ACTIVE_VERTICAL_ID`.

---

## How a next phase starts

1. Human authorizes a slice (or writes `prompts/ACTIVE.md`).
2. Prefer 🟡 Hardening over 🔵 Planned.
3. Reuse existing APIs; no silent schema or money-path change.
4. Update `feature-list.md` when behavior ships; update the capability matrix when posture changes.

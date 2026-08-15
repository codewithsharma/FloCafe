<!-- Last updated: 2026-08-15, schema v82 -->

# Operavia Restaurant OS — Roadmap (R0–R16)

**Status:** Product plan overlay (documentation only)  
**Canonical statuses:** [`capability-matrix.md`](capability-matrix.md)  
**Blueprint:** [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md)  
**Does not authorize implementation.** Do **not** invent Phase 4.16. R-ids replace post-4.15 sequencing.

North-star KPI unchanged: **3 cafés × 30 days × zero critical failures** ([`STRATEGY.md`](../../STRATEGY.md)). Live go-live currently **NO-GO** (OPS-02) until signed RC + site gates.

---

## Wave overview

| Wave    | Name                              | Primary matrix posture                       | Depends on                   |
| ------- | --------------------------------- | -------------------------------------------- | ---------------------------- |
| **R0**  | Product Blueprint                 | Docs only                                    | —                            |
| **R1**  | POS Core Completion               | Hardening + deepen Planned POS               | R0                           |
| **R2**  | Tables / Floor Operations         | Planned floor depth                          | R1 money/order stable        |
| **R3**  | Kitchen OS                        | Hardening residual + Planned stations        | R1; KDS SoR rule             |
| **R4**  | Inventory depth                   | Planned inventory                            | R1 stock guards              |
| **R5**  | Recipes / BOM / Food Cost         | **COMPLETE** (Existing depth)                | R4 ingredients               |
| **R6**  | Purchasing                        | **COMPLETE** (2026-08-15)                    | R4/R5                        |
| **R7**  | Customer / CRM / Loyalty          | **COMPLETE** (2026-08-15)                    | R1 payments                  |
| **R8**  | Staff / Shift / Attendance        | **COMPLETE** (2026-08-15)                    | R1 RBAC                      |
| **R9**  | Finance / Compliance              | Hardening audit + Planned expenses/tax depth | R1 finance                   |
| **R10** | Online / QR Ordering              | Planned; online pay Frozen                   | R1–R3; no gateway            |
| **R11** | Marketing                         | Planned/Later                                | R7                           |
| **R12** | Reporting / BI                    | Planned deepen                               | R1–R9 data                   |
| **R13** | Integrations / Hardware           | Planned print queue; Frozen terminals        | R1–R3                        |
| **R14** | Reliability / Backup / DR         | Hardening + Planned DR                       | Continuous; parallel         |
| **R15** | Restaurant Simulation Environment | Testing                                      | Parallel from R1             |
| **R16** | Production Release                | Ops + signed RC                              | Pilot gates + chosen R-waves |

Human pilot gates (signed RC, escrow, site drills) sit **across** R0/R14/R16 — they are not optional “later features.”

---

## R0 — Product Blueprint (THIS WAVE)

Delivered: blueprint, architecture, offline/financial contracts, simulation design, this roadmap.  
**Exit:** Docs committed. **No code.**

---

## R1 — POS Core Completion

**Status:** COMPLETE (2026-08-15) — depth closed per `docs/05-production/r1-pos-core-completion.md`.  
**Goal:** Make daily POS the most trustworthy surface before floor/kitchen/ERP depth.

**Delivered:** illegal terminal transitions; cancel/discount Idempotency-Key; required addon groups; reprint coerce; digital preview foundation; create/item-discount audits; WebUSB print-log parity.

**Remaining (not R2):** see R1 doc remaining gaps. Void/Discounts/Receipt generation stay Hardening.

**Exclude:** BOM, PO, QR, aggregators, REAL→cents without approval, Phase 4.16, R2 floor.

**Exit criteria:** `npm run test:r1` PASS; H1–H4 green; matrix R1 depth table updated.

---

## R2 — Tables / Floor Operations

Sections, visual floor plan, merge/split tables, seats, occupancy timers, waiter assignment depth.  
**Depends on:** stable order/bill identity from R1.  
**ADR** if merge billed tables changes money attribution.

---

## R3 — Kitchen OS

Stations, routing, timers, priorities, expediter, recall, kitchen performance. Preserve H2 (advertise, stale, CAS). Optional print-queue coupling deferred to R13 unless thin slice authorized.  
**Never** make KDS a second SoR.

---

## R4 — Inventory

Ingredient model (if not only SKU), unit conversion, stock count, spoilage, transfer (single location), deepen valuation/wastage.  
**No multi-location stock** (Frozen).

---

## R4.1 — Foundation Stabilization

**Status:** COMPLETE (2026-08-15) — [`docs/05-production/r4-1-foundation-stabilization.md`](../05-production/r4-1-foundation-stabilization.md).  
**Suite:** `npm run test:r4.1`. Schema **v80** unchanged.

Correctness/architecture/money-audit/validation/release-hygiene. Drive backup-now Master PIN; Zod money bodies; partial db/orders extraction; P1.3 matrix. Full REAL→cents **STOPPED** (dual-write plan required).

---

## R5 — Recipes / BOM / Food Cost

**Status:** COMPLETE (2026-08-15) — depth closed per [`docs/05-production/r5-bom-recipes-food-cost.md`](../05-production/r5-bom-recipes-food-cost.md).  
**Suite:** `npm run test:r5`. Schema **v80**.

**Delivered:** recipes/BOM linked to menu products; ingredients = product SKUs; deduction at order create/add-items; theoretical food cost (integer cents) + basic food-cost %; cancel reverse; BLOCK on insufficient stock.

**Exclude / remaining:** returns / invoices polish; full consumption/food-cost BI; auto-86; expiry; stock transfer; addon BOM; refund restock gap.

**Shipped:** R6 Purchasing (v80).

---

## R6 — Purchasing

**Status:** COMPLETE (2026-08-15) — [`docs/05-production/r6-purchasing-supplier-os.md`](../05-production/r6-purchasing-supplier-os.md).  
**Suite:** `npm run test:r6`. Schema **v80**.

Suppliers, supplier↔SKU mapping, PO lifecycle, partial/full receiving, inventory ledger `purchase_receipt`, cents money on PO fields, RBAC, idempotency, concurrency CAS, UI `/products/purchasing`.

**Exclude / remaining:** supplier returns, auto-reorder, forecasting, multi-location, WAC/FIFO ADR, supplier portal.

**Next (if authorized):** R9 — do not start without explicit authorization. R8 Staff COMPLETE (`docs/05-production/r8-staff-workforce-os.md`).

---

## R7 — Customer / CRM / Loyalty

Deepen profiles, preferences, points/cashback/wallet, rewards, gift cards (if authorized), segmentation foundations.

**Status (2026-08-15):** COMPLETE for authorized deepen (no gift cards / rewards catalog). See `docs/05-production/r7-customer-crm-os.md`.

---

## R8 — Staff / Shift / Attendance

**Status (2026-08-15):** COMPLETE for authorized deepen (no payroll / scheduling / biometric attendance). See `docs/05-production/r8-staff-workforce-os.md`.

Fine-grained permissions product, attendance clocks, scheduling, leave remain Later/Planned unless matrix edited. Keep shift cash model (ADR-007/008).

**Next (if authorized):** R9 — do not start without explicit authorization.

---

## R9 — Finance / Compliance

**Status:** IN PROGRESS — **Slice 1 Expenses COMPLETE**; **Slice 2 Financial Audit-Trail Hardening COMPLETE** (2026-08-15). Schema **v83** (unchanged for Slice 2). Suites `npm run test:r9` / `npm run test:r9.2`. Docs: [`../05-production/r9-expenses-slice-1.md`](../05-production/r9-expenses-slice-1.md), [`../05-production/r9-audit-trail-slice-2.md`](../05-production/r9-audit-trail-slice-2.md).

**Slice 1 delivered:** expenses table (integer cents), API, Owner/Manager UI, RBAC, audits, offline SQLite.

**Slice 2 delivered:** audit viewer + CSV export + `until` filter + `audit.exported`; Owner/Manager; schema tip remains v83.

**Remaining R9 (not started):** tax reporting depth + accountant export; day-close/Z polish; ops finance reports v1; food-cost report v1.

**Out:** Service charge (ADR-014 Proposed); tips; QR; gift cards; REAL→cents cutover; Frozen rows.

Tips = Later unless matrix updated.

---

## R10 — Online / QR Ordering

QR menu, acceptance, kitchen flow, pickup/delivery status. **Online payment remains Frozen** — record-only or pay-at-counter until unfrozen.

---

## R11 — Marketing

Campaigns, offers, coupons, WhatsApp marketing (vs transactional), analytics. Depends on R7.

---

## R12 — Reporting / BI

Food cost / profit / hourly trends / staff performance reports consuming R4–R9 data. No separate warehouse required for single-location v1.

---

## R13 — Integrations / Hardware

Print queue/retry, multi-printer routing depth, cash drawer depth. Payment terminals / aggregators stay Frozen.

---

## R14 — Reliability / Backup / Disaster Recovery

Corrupt-openable DB policy, DR product depth, Drive PIN (DRV-01), observability. Parallel with R1+.

---

## R15 — Restaurant Simulation Environment

Virtual café: seeds, scenarios, Playwright, failure injection. See [`restaurant-simulation.md`](restaurant-simulation.md). Build incrementally beside R1+.

---

## R16 — Production Release

Signed/notarized RC, café install, OPS-02 checklist PASS, pilot KPI tracking. May ship a **supervised pilot** before complete OS (R5–R12) — completeness ≠ blocking first café once gates pass.

---

## Parallelism rules

- R14 + R15 may run in parallel with R1–R3.
- R5 before R6.
- R10 after kitchen/order acceptance path is solid (R1/R3).
- R11 after R7.
- Never open Frozen rows via R-wave without STRATEGY + matrix edit.

---

## Mapping note vs historical phases

Prompt pipeline **Phase 4.1–4.15 COMPLETE**. Future work uses **R-waves**, not 4.16+.  
Matrix Hardening H1–H4 slices remain historical labels for closed depth — not the same as R1–R4.

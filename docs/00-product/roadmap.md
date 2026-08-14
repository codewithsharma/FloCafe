# Roadmap

> **Canonical strategy / freeze list:** [`STRATEGY.md`](../../STRATEGY.md)  
> **Execution backlog:** [`.ai/tasks.md`](../../.ai/tasks.md)  
> Historical plan: [`15-project-management/master-implementation-plan.md`](../15-project-management/master-implementation-plan.md)  
> Status vocabulary: COMPLETE / PARTIAL / PLACEHOLDER / PLANNED / NOT FOUND — **code is source of truth**.

**North-star KPI:** 3 cafés × 30 days × zero critical failures → then RestaurantOS depth.

Priorities: **P0** production blockers · **P1** pilot reliability · **P2** RestaurantOS foundation · **P3** frozen until pilots.

---

## Phase 0 — Documentation & engineering foundation

| Item                                                    | Priority | Status                                                                     |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| Evidence-based documentation                            | P0       | **COMPLETE**                                                               |
| Second-pass audit + corrections                         | P0       | **COMPLETE**                                                               |
| CEO+CTO reality audit + strategy mandate                | P0       | **COMPLETE** (`STRATEGY.md`, 2026-08-12)                                   |
| Test baseline + coverage measurement                    | P0       | **COMPLETE** (M1; `npm test` green)                                        |
| Documentation truth sync (identity + status drift)      | P0       | **PARTIAL** (vision/strategy/.ai done; feature-list/master-plan remaining) |
| Backup/restore verification checklist (destroy→restore) | P1       | PARTIAL (tests exist; pilot destroy→restore gate open)                     |
| Extract db migrations from monolith                     | Eng P1   | NOT STARTED (refactor-on-touch)                                            |
| Order/bill service extraction                           | Eng P1   | NOT STARTED (refactor-on-touch with M6)                                    |

## Phase 1 — Operavia POS production core (P0–P1)

| Item                                   | Priority | Status                                                |
| -------------------------------------- | -------- | ----------------------------------------------------- |
| Privacy & telemetry consent            | P1       | **COMPLETE** (M2)                                     |
| General audit logging                  | P0/P1    | **PARTIAL** (M3 foundation; money-path coverage open) |
| Shift management                       | P1       | **COMPLETE** (M4)                                     |
| Cash reconciliation & day close        | P1       | **COMPLETE** (M5)                                     |
| **Refunds**                            | **P0**   | **NOT BUILT** (M6 — next money-critical)              |
| Void/cancel financial audit depth      | **P0**   | PARTIAL (void exists; audit gaps)                     |
| Money-path financial correctness audit | **P0**   | NOT STARTED                                           |
| LAN security deployment model          | **P0**   | NOT STARTED                                           |
| JWT secret storage design              | **P0**   | NOT STARTED                                           |
| Electron sandbox review                | **P0**   | NOT STARTED                                           |
| Cash drawer kick                       | P1       | NOT BUILT                                             |
| Permission matrix update               | P1       | PARTIAL                                               |
| Failure/recovery test matrix           | P1       | NOT STARTED                                           |
| 3 café pilots                          | P1       | NOT STARTED                                           |

## Phase 2 — Inventory (P2 — after pilots)

| Item                            | Priority | Status                      |
| ------------------------------- | -------- | --------------------------- |
| Stock movement ledger           | **P2**   | NOT BUILT                   |
| Low-stock UI alerts             | P2       | PARTIAL (API filter exists) |
| Menu 86 / availability workflow | P2       | PARTIAL                     |
| Recipe/BOM                      | P2       | NOT BUILT                   |
| Wastage tracking                | P2       | NOT BUILT                   |

Basic product stock tracking is **COMPLETE** — ledger extends it. **Do not start until pilot KPI.**

## Phase 3 — Procurement (P2–P3)

| Item                        | Priority | Status    |
| --------------------------- | -------- | --------- |
| Suppliers                   | P2       | NOT BUILT |
| Purchase orders & receiving | P2       | NOT BUILT |
| Purchase invoices & returns | P3       | NOT BUILT |

## Phase 4 — Payments & hardware (P2–P3)

| Item                              | Priority      | Status    |
| --------------------------------- | ------------- | --------- |
| Payment terminal adapter          | **P3 frozen** | NOT BUILT |
| Configurable service charge (POS) | P2            | NOT BUILT |
| Tips                              | P2            | NOT BUILT |
| Bluetooth printing                | **P3 frozen** | NOT BUILT |

Receipt/kitchen printing, barcode scanner, printer routing are **COMPLETE** — maintain.

## Phase 5 — Multi-location (design only)

| Item                         | Priority | Status      |
| ---------------------------- | -------- | ----------- |
| Multi-location RFC (ADR-006) | P2       | NOT STARTED |

**No implementation** until ADR approved and pilots succeed.

## Phase 6 — Online & external integrations (P3 frozen for aggregators)

| Item                                      | Priority      | Status                             |
| ----------------------------------------- | ------------- | ---------------------------------- |
| Accounting export (CSV/API)               | P2            | NOT BUILT                          |
| Cloud config management                   | P2            | PARTIAL (FloAdmin outbound bridge) |
| Online ordering adapter                   | **P3 frozen** | NOT BUILT                          |
| Delivery aggregators (Swiggy/Zomato/ONDC) | **P3 frozen** | NOT BUILT                          |

WhatsApp, Google Drive backup, RevFlo pairing are **COMPLETE** — maintain.

## Phase 7 — Analytics (P2)

Extends COMPLETE in-app reports. Non-blocking to POS. Accounting/BI export still open.

## Phase 8 — Optional AI (P3 frozen)

Demand forecasting, anomaly detection, NL reports — **explicitly postponed** until core POS reliability is proven. Core must work with AI disabled.

## Inherited from upstream FloCafe

Per `README.md` Direction section — tax/country expansion, inventory/loyalty polish, companion devices. Track via `upstream`: `FreeOpenSourcePOS/FloCafe`.

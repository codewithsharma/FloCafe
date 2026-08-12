# Roadmap

> **Authoritative roadmap:** [`15-project-management/master-implementation-plan.md`](../15-project-management/master-implementation-plan.md)  
> This file is a **timeline view**. If anything conflicts, the master plan wins.

Priorities: **P0** foundational · **P1** critical · **P2** important · **P3** future

Engineering-only tasks are labeled **Eng P1** when they do not deliver direct restaurant operator value.

## Phase 0 — Documentation & engineering foundation

| Item | Priority | Status |
|------|----------|--------|
| Evidence-based documentation | P0 | **COMPLETE** |
| Second-pass audit + corrections | P0 | **COMPLETE** |
| Test baseline + coverage measurement | P0 | NOT STARTED |
| Backup/restore verification checklist | P0 | NOT STARTED |
| Extract db migrations from monolith | Eng P1 / Product P3 | NOT STARTED |
| Order/bill service extraction | Eng P1 | NOT STARTED |

## Phase 1 — Restaurant operations core (P1)

| Item | Priority | Status |
|------|----------|--------|
| Privacy & telemetry consent (TARGET) | **P1** | NOT STARTED |
| General audit logging | **P1** | PARTIAL |
| Shift management | **P1** | NOT BUILT |
| Cash reconciliation & day close | **P1** | PARTIAL |
| Refunds | **P1** | NOT BUILT |
| Void audit integration | **P1** | BUILT void + audit gap |
| Cash drawer kick | **P1** | NOT BUILT |
| Permission matrix update | **P1** | PARTIAL |

## Phase 2 — Inventory (P2)

| Item | Priority | Status |
|------|----------|--------|
| Stock movement ledger | **P2** | NOT BUILT |
| Low-stock UI alerts | P2 | PARTIAL (API filter exists) |
| Menu 86 / availability workflow | P2 | PARTIAL |
| Recipe/BOM | P2 | NOT BUILT |
| Wastage tracking | P2 | NOT BUILT |

Basic stock tracking (adjust, decrement, low-stock filter) is **already BUILT** — ledger extends it.

## Phase 3 — Procurement (P2–P3)

| Item | Priority | Status |
|------|----------|--------|
| Suppliers | P2 | NOT BUILT |
| Purchase orders & receiving | P2 | NOT BUILT |
| Purchase invoices & returns | P3 | NOT BUILT |

## Phase 4 — Payments & hardware (P2–P3)

| Item | Priority | Status |
|------|----------|--------|
| Payment terminal adapter | P2 | NOT BUILT |
| Configurable service charge (POS) | P2 | NOT BUILT |
| Tips | P2 | NOT BUILT |
| Bluetooth printing | P3 | NOT BUILT |

Receipt/kitchen printing, barcode scanner, printer routing are **BUILT** — maintain, do not rebuild.

## Phase 5 — Multi-location (design only)

| Item | Priority | Status |
|------|----------|--------|
| Multi-location RFC (ADR-006) | P2 | NOT STARTED |

**No implementation** until RFC approved. See master plan §Phase 5.

## Phase 6 — Online & external integrations (P2–P3)

| Item | Priority | Status |
|------|----------|--------|
| Accounting export (CSV/API) | P2 | NOT BUILT |
| Cloud config management | P2 | PARTIAL (FloAdmin sync) |
| Online ordering adapter | P3 | NOT BUILT |
| Delivery aggregator adapters | P3 | NOT BUILT |

WhatsApp, Google Drive backup, RevFlo pairing are **BUILT** — maintain.

## Phase 7 — Analytics (P2)

Extends BUILT reports API. Non-blocking to POS workflows.

## Phase 8 — Optional AI (P3)

Demand forecasting, anomaly detection, NL reports — **optional**, must work with AI disabled.

## Inherited from upstream FloCafe

Per `README.md` Direction section:

- Tax and country support expansion
- Inventory and loyalty workflow improvements
- Companion device improvements

Track upstream via `upstream` remote: `FreeOpenSourcePOS/FloCafe`.

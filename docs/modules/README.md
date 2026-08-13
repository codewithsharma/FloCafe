# Opervia Modules

**Status:** Phase 2 **CONTINUATION in progress** — CURRENT **2.14 Order** domain boundary ([phase-2.14-order-domain-boundary.md](../03-architecture/phase-2.14-order-domain-boundary.md)). INTERIM exit gate preserved ([phase-2-exit-gate.md](../03-architecture/phase-2-exit-gate.md) — PASS WITH DOCUMENTED DEFERMENTS). Phase 3 = extraction / multi-vertical / fail-closed.
**Contract:** [module-system.md](../03-architecture/module-system.md)
**Platform:** [opervia-platform.md](../00-product/opervia-platform.md)

Modules are reusable business capabilities. Phase 2 ships a **lightweight registry** (`main/modules/`) that describes capabilities and the Opervia Restaurant vertical. Implementations remain colocated; formal packages are **Phase 3 TARGET**.

## How to read this index

| Label | Meaning |
|-------|---------|
| **CURRENT** | Capability ships in Opervia Restaurant today |
| **REGISTERED** | Listed in `main/modules/catalog.ts` |
| **PLANNED** | Boundary or depth not yet first-class |
| **TARGET** | Full contract fields — see module-system / Phase 3 |

---

## Core & cross-cutting

| Module | Status | Phase 1 mapping |
|--------|--------|-----------------|
| Auth / Core (`core`) | CURRENT · REGISTERED | JWT, Master PIN, security middleware, settings |
| Settings | CURRENT (part of `core`) | Settings API + hub; feature flags |

## Catalog & people

| Module | Status | Phase 1 mapping |
|--------|--------|-----------------|
| Staff (`staff`) | CURRENT · REGISTERED | Users, roles, PIN |
| Customer (`customer`) | CURRENT · REGISTERED | Customer CRM |
| Product (`product`) | CURRENT · REGISTERED | Products API/UI |
| Category (`category`) | CURRENT · REGISTERED | Categories |
| Menu (`menu`) | CURRENT · REGISTERED (Restaurant) | Menu CSV / catalog presentation |
| Addons (`addons`) | CURRENT · REGISTERED (Restaurant) | Addon-groups / modifiers |
| Inventory (`inventory`) | CURRENT (stock writes + ledger v75+ + history API) · REGISTERED | Writes via Inventory; history `GET /api/inventory/movements`; UI PLANNED (Phase 3) |

## Commerce

| Module | Status | Phase 1 mapping |
|--------|--------|-----------------|
| POS (`pos`) | CURRENT · REGISTERED | POS UI + sell flows |
| Order (`order`) | CURRENT · REGISTERED · **2.14 ownership facade** | Orders / held orders; item cancel/restore on `orderRoutes`; stock via Inventory |
| Payment (`payment`) | CURRENT · REGISTERED | Bills / tender |
| Refund (`refund`) | CURRENT · REGISTERED | M6 refunds |
| Tax (`tax`) | CURRENT · REGISTERED | Tax facade + engine + **tax-packs** |
| Shift (`shift`) | CURRENT · REGISTERED | Shifts, cash recon, day-close |
| Loyalty (`loyalty`) | CURRENT · REGISTERED | Loyalty features |
| Reporting (`reporting`) | CURRENT · REGISTERED | Reports core |

## Restaurant depth

| Module | Status | Phase 1 mapping |
|--------|--------|-----------------|
| Tables (`tables`) | CURRENT · REGISTERED | Table service |
| Kitchen (`kitchen`) | CURRENT · REGISTERED | Kitchen stations |
| KDS (`kds`) | CURRENT · REGISTERED | Kitchen display |

## Ops & integrations

| Module | Status | Phase 1 mapping |
|--------|--------|-----------------|
| Printing (`printing`) | CURRENT · REGISTERED | Receipts / KOT / printers |
| Notification (`notification`) | CURRENT · REGISTERED | WhatsApp delivery |
| Backup (`backup`) | CURRENT · REGISTERED | Backup/restore, Drive |

---

## Platform work

1. ~~Module registry + Restaurant vertical definition~~ — **Phase 2.1 done**
2. ~~Broaden consumers + soft dependency diagnostics~~ — **Phase 2.2 done**
3. ~~Read-only composition snapshot~~ — **Phase 2.3 done**
4. ~~Composition read API + settings module gates~~ — **Phase 2.4 done**
5. ~~Synthetic multi-vertical composition validation~~ — **Phase 2.5 done**
6. ~~Module contract + capabilities~~ — **Phase 2.6 done**
7. ~~Inventory + Tax domain boundaries~~ — **Phase 2.7 done**
8. ~~Inventory movement ledger~~ — **Phase 2.8 done**
9. ~~Product↔Inventory stock write ownership~~ — **Phase 2.9 done**
10. ~~Tax HTTP consolidation~~ — **Phase 2.10 done**
11. ~~Tax snapshot contract freeze~~ — **Phase 2.11 done**
12. ~~Inventory movement history read API~~ — **Phase 2.12 done**
13. ~~Product ↔ Tax ownership boundary~~ — **Phase 2.13 done**
14. ~~Phase 2 exit gate~~ — **INTERIM Phase 2.14 done** ([phase-2-exit-gate.md](../03-architecture/phase-2-exit-gate.md)) — preserved; not deleted
15. ~~Order domain boundary~~ — **CURRENT Phase 2.14 done** ([phase-2.14-order-domain-boundary.md](../03-architecture/phase-2.14-order-domain-boundary.md)) — ownership facade + cancel/restore on `orderRoutes`; void×cancel pinned
16. Fail-closed dependency enforcement — **Phase 3**
17. Inventory UI / legacy tax column cleanup — **Phase 3**
18. Formal events bus for modules — **Phase 3**
19. Additional verticals’ module sets ([verticals.md](../00-product/verticals.md)) — **Phase 3**

**Do not** create Opervia Custom or extract every folder into packages yet.

## Related architecture

- [phase-2.14-order-domain-boundary.md](../03-architecture/phase-2.14-order-domain-boundary.md) (CURRENT 2.14)
- [phase-2-exit-gate.md](../03-architecture/phase-2-exit-gate.md) (INTERIM 2.14)
- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [module-system.md](../03-architecture/module-system.md)
- [module-contract.md](../03-architecture/module-contract.md)
- [module-ownership.md](../03-architecture/module-ownership.md)
- [extraction-readiness.md](../03-architecture/extraction-readiness.md)
- [vertical-architecture.md](../03-architecture/vertical-architecture.md)
- [ADR-010](../14-decisions/ADR-010-opervia-platform.md)

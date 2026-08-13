# Opervia Modules

**Status:** Index of CURRENT Phase 1 capabilities vs PLANNED modular boundaries
**Contract:** [module-system.md](../03-architecture/module-system.md)
**Platform:** [opervia-platform.md](../00-product/opervia-platform.md)

Modules are reusable business capabilities. Phase 2.1 adds a **lightweight registry** (`main/modules/`) that describes capabilities and the Opervia Restaurant vertical. Implementations remain colocated; formal packages are TARGET.

## How to read this index

| Label | Meaning |
|-------|---------|
| **CURRENT** | Capability ships in Opervia Restaurant today |
| **REGISTERED** | Listed in `main/modules/catalog.ts` (Phase 2.1) |
| **PLANNED** | Boundary or depth not yet first-class |
| **TARGET** | Full contract fields — see module-system |

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
| Inventory (`inventory`) | CURRENT (stock writes + ledger v75+) · REGISTERED | All app stock writes via Inventory; history API/UI PLANNED |

## Commerce

| Module | Status | Phase 1 mapping |
|--------|--------|-----------------|
| POS (`pos`) | CURRENT · REGISTERED | POS UI + sell flows |
| Order (`order`) | CURRENT · REGISTERED | Orders / held orders (F&B-hybrid) |
| Payment (`payment`) | CURRENT · REGISTERED | Bills / tender |
| Refund (`refund`) | CURRENT · REGISTERED | M6 refunds |
| Tax (`tax`) | CURRENT · REGISTERED | Tax engine + **tax-packs** |
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

1. ~~Module registry + Restaurant vertical definition~~ — **Phase 2.1 done** ([phase-2.1-module-registry.md](../03-architecture/phase-2.1-module-registry.md))
2. ~~Broaden consumers + soft dependency diagnostics~~ — **Phase 2.2 done** ([phase-2.2-module-consumers.md](../03-architecture/phase-2.2-module-consumers.md))
3. ~~Read-only composition snapshot~~ — **Phase 2.3 done** ([phase-2.3-composition-snapshot.md](../03-architecture/phase-2.3-composition-snapshot.md))
4. ~~Composition read API + settings module gates~~ — **Phase 2.4 done** ([phase-2.4-platform-composition-api.md](../03-architecture/phase-2.4-platform-composition-api.md))
5. ~~Synthetic multi-vertical composition validation~~ — **Phase 2.5 done** ([phase-2.5-vertical-composition-validation.md](../03-architecture/phase-2.5-vertical-composition-validation.md))
6. ~~Module contract + capabilities~~ — **Phase 2.6 done** ([module-contract.md](../03-architecture/module-contract.md))
7. ~~Inventory + Tax domain boundaries~~ — **Phase 2.7 done** ([phase-2.7-domain-boundaries.md](../03-architecture/phase-2.7-domain-boundaries.md))
8. ~~Inventory movement ledger~~ — **Phase 2.8 done** ([phase-2.8-inventory-ledger.md](../03-architecture/phase-2.8-inventory-ledger.md))
9. ~~Product↔Inventory stock write ownership~~ — **Phase 2.9 done** ([phase-2.9-product-inventory-boundary.md](../03-architecture/phase-2.9-product-inventory-boundary.md))
10. ~~Tax HTTP consolidation~~ — **Phase 2.10 done** ([phase-2.10-tax-http-boundary.md](../03-architecture/phase-2.10-tax-http-boundary.md))
11. ~~Tax snapshot contract freeze~~ — **Phase 2.11 done** ([phase-2.11-tax-snapshot-contract.md](../03-architecture/phase-2.11-tax-snapshot-contract.md))
12. ~~Inventory movement history read API~~ — **Phase 2.12 done** ([phase-2.12-inventory-movement-read-api.md](../03-architecture/phase-2.12-inventory-movement-read-api.md))
13. ~~Product ↔ Tax ownership boundary~~ — **Phase 2.13 done** ([phase-2.13-product-tax-ownership.md](../03-architecture/phase-2.13-product-tax-ownership.md))
14. Fail-closed dependency enforcement — deferred (after pilot proof)
15. Inventory UI / legacy tax column cleanup — next
16. Formal events bus for modules — deferred
17. Additional verticals’ module sets ([verticals.md](../00-product/verticals.md)) — deferred

**Do not** create Opervia Custom or extract every folder into packages yet.

## Related architecture

- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [module-system.md](../03-architecture/module-system.md)
- [phase-2.1-module-registry.md](../03-architecture/phase-2.1-module-registry.md)
- [phase-2.2-module-consumers.md](../03-architecture/phase-2.2-module-consumers.md)
- [phase-2.3-composition-snapshot.md](../03-architecture/phase-2.3-composition-snapshot.md)
- [phase-2.4-platform-composition-api.md](../03-architecture/phase-2.4-platform-composition-api.md)
- [phase-2.5-vertical-composition-validation.md](../03-architecture/phase-2.5-vertical-composition-validation.md)
- [module-contract.md](../03-architecture/module-contract.md)
- [phase-2.7-domain-boundaries.md](../03-architecture/phase-2.7-domain-boundaries.md)
- [phase-2.8-inventory-ledger.md](../03-architecture/phase-2.8-inventory-ledger.md)
- [phase-2.9-product-inventory-boundary.md](../03-architecture/phase-2.9-product-inventory-boundary.md)
- [phase-2.10-tax-http-boundary.md](../03-architecture/phase-2.10-tax-http-boundary.md)
- [phase-2.11-tax-snapshot-contract.md](../03-architecture/phase-2.11-tax-snapshot-contract.md)
- [phase-2.12-inventory-movement-read-api.md](../03-architecture/phase-2.12-inventory-movement-read-api.md)
- [phase-2.13-product-tax-ownership.md](../03-architecture/phase-2.13-product-tax-ownership.md)
- [module-ownership.md](../03-architecture/module-ownership.md)
- [extraction-readiness.md](../03-architecture/extraction-readiness.md)
- [vertical-architecture.md](../03-architecture/vertical-architecture.md)
- [ADR-010](../14-decisions/ADR-010-opervia-platform.md)

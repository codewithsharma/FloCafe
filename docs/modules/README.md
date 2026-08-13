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
| Inventory (`inventory`) | CURRENT (light) · REGISTERED / PLANNED (ledger) | Stock counts; ledger is P2 |

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
4. Fail-closed dependency enforcement — deferred (multi-vertical)
5. Formal events bus for modules — deferred
6. Deeper Inventory ledger (after pilots)
7. Additional verticals’ module sets ([verticals.md](../00-product/verticals.md)) — deferred

**Do not** create Opervia Custom or extract every folder into packages yet.

## Related architecture

- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [module-system.md](../03-architecture/module-system.md)
- [phase-2.1-module-registry.md](../03-architecture/phase-2.1-module-registry.md)
- [phase-2.2-module-consumers.md](../03-architecture/phase-2.2-module-consumers.md)
- [phase-2.3-composition-snapshot.md](../03-architecture/phase-2.3-composition-snapshot.md)
- [vertical-architecture.md](../03-architecture/vertical-architecture.md)
- [ADR-010](../14-decisions/ADR-010-opervia-platform.md)

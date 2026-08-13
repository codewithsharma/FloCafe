# Opervia Module System

**Status:** Phase 2.1 registry IMPLEMENTED (metadata seam); full TARGET contract still PLANNED
**Code:** `main/modules/`
**Index:** [modules/README.md](../modules/README.md)
**Implementation:** [phase-2.1-module-registry.md](phase-2.1-module-registry.md)

## Purpose

Define what a **module** is on the Opervia platform so enablement and future extraction stay consistent.

## CURRENT (Phase 2.1)

| Fact | Note |
|------|------|
| Module registry | `main/modules/catalog.ts` + `registry.ts` |
| Vertical definition | Opervia Restaurant in `main/modules/verticals.ts` |
| Enablement API | `isModuleEnabled`, `getEnabledModules`, `isFeatureAvailable` |
| Route mounting | Still **static** `registerRoutes` — registry is descriptive |
| Feature flags | Still in `settings`; combine with module enablement |
| Only plugin-like system | **Tax-packs** remain separate from the module registry |
| Capabilities live in | Existing `main/routes/*`, `main/services/*`, `frontend/` |

## Module metadata implemented now

| Field | Phase 2.1 |
|-------|-----------|
| **identity** (`id`, `name`) | Yes |
| **version** | Yes |
| **dependencies** | Yes (metadata; **not enforced**) |
| **featureFlags** | Optional list on module |
| **routePrefixes** | Descriptive only |
| **kind** | `core` \| `shared` \| `restaurant` |
| permissions / events / schema ownership / lifecycle | PLANNED |

## Feature availability rule

```text
isModuleEnabled(moduleId)  ∧  featureFlag (when applicable)  ⇒  feature available
```

## Lifecycle (TARGET — not Phase 2.1)

1. Register → 2. Resolve deps → 3. Enable → 4. Mount → 5. Configure

Phase 2.1 implements **Register** + declarative **Enable** (vertical list) only. Mount remains static routes.

## Deferred

Package extraction · dynamic install · marketplace · dep enforcement · multi-vertical · Opervia Custom · Retail/Grocery/Salon.

## Related

- [vertical-architecture.md](vertical-architecture.md)
- [modular-architecture.md](modular-architecture.md)
- [architecture-gap-report.md](architecture-gap-report.md) §H
- [principles.md](../00-product/principles.md)

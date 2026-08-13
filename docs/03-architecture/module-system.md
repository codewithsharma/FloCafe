# Opervia Module System

**Status:** Phase 2 **COMPLETE** (registry through capabilities, composition, Inventory/Tax boundaries). Full TARGET (fail-closed / packages / lifecycle) = **Phase 3**.
**Code:** `main/modules/`
**Index:** [modules/README.md](../modules/README.md)
**Exit gate:** [phase-2-exit-gate.md](phase-2-exit-gate.md)
**Implementation:** [phase-2.1-module-registry.md](phase-2.1-module-registry.md)

## Purpose

Define what a **module** is on the Opervia platform so enablement and future extraction stay consistent.

## CURRENT (Phase 2 complete)

| Fact                    | Note                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Module registry         | `main/modules/catalog.ts` + `registry.ts`                                                            |
| Vertical definition     | Opervia Restaurant in `main/modules/verticals.ts`                                                    |
| Synthetic vertical      | `retail-test` in `fixtures/` + `SYNTHETIC_VERTICALS` only                                            |
| Enablement API          | `isModuleEnabled`, `getEnabledModules`, `isFeatureAvailable`                                         |
| Composition             | Snapshot + `GET /api/platform/composition` (owner/manager)                                           |
| Capabilities            | Domain `CapabilityId` — discovery only, not authz                                                    |
| Soft diagnostics        | Integrity + vertical deps report (non-throwing for valid verticals)                                  |
| Route mounting          | Phase 3.1 fail-closed remount — [phase-3.1-fail-closed-remount.md](phase-3.1-fail-closed-remount.md) |
| Feature flags           | Still in `settings`; combine with module enablement                                                  |
| Only plugin-like system | **Tax-packs** remain separate from the module registry                                               |
| Capabilities live in    | Existing `main/routes/*`, `main/services/*`, `frontend/`                                             |

## Module metadata implemented now

| Field                                               | Phase 2                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| **identity** (`id`, `name`)                         | Yes                                                      |
| **version**                                         | Yes                                                      |
| **dependencies**                                    | Yes (soft metadata; fail-closed at remount in Phase 3.1) |
| **capabilities**                                    | Yes (Phase 2.6)                                          |
| **featureFlags**                                    | Optional list on module                                  |
| **routePrefixes**                                   | Descriptive only (aligned to mounts in 2.14)             |
| **kind**                                            | `core` \| `shared` \| `restaurant`                       |
| permissions / events / schema ownership / lifecycle | Phase 3 TARGET                                           |

## Feature availability rule

```text
isModuleEnabled(moduleId)  ∧  featureFlag (when applicable)  ⇒  feature available
```

## Lifecycle (TARGET — Phase 3)

1. Register → 2. Resolve deps → 3. Enable → 4. Mount → 5. Configure

Phase 2 implements **Register** + declarative **Enable** (vertical list) + soft diagnostics. Mount remains static routes. Fail-closed / dynamic mount = Phase 3.

## Deferred (Phase 3)

Package extraction · dynamic install · marketplace · fail-closed dep enforcement · multi-vertical runtime · Opervia Custom · production Retail/Grocery/Salon.

## Related

- [phase-2-exit-gate.md](phase-2-exit-gate.md)
- [vertical-architecture.md](vertical-architecture.md)
- [modular-architecture.md](modular-architecture.md)
- [architecture-gap-report.md](architecture-gap-report.md)
- [principles.md](../00-product/principles.md)

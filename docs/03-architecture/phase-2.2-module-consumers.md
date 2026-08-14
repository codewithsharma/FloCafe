# Phase 2.2 — Module Consumers + Soft Dependency Diagnostics

**Status:** IMPLEMENTED
**Date:** 2026-08-13
**Depends on:** [Phase 2.1 module registry](phase-2.1-module-registry.md)
**Code:** `main/modules/diagnostics.ts`, broader consumers in `frontend/` + `main/routes/index.ts`
**Tests:** `tests/module-diagnostics.test.ts`, extended `tests/module-registry.test.ts`, `tests/flo-ui-shell.test.ts`

## Goal

Widen safe module-registry consumers and introduce optional soft dependency diagnostics so the registry becomes a useful internal architectural source of truth — **without** becoming a runtime plugin system.

## Architectural decision

```text
Phase 2.2 establishes the module registry as a safe capability-discovery layer.

It does not yet make the application dynamically modular.

Modules remain physically located in the existing monolith.

Verticals remain statically defined.

Express route registration remains static.

Feature flags remain supported.

The registry is currently an architectural source of truth and capability boundary, not a plugin runtime.
```

## What Phase 2.2 implemented

### Soft dependency diagnostics (`main/modules/diagnostics.ts`)

| API                                         | Role                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| `validateVerticalDependencies(verticalId?)` | Direct deps of enabled modules ⊆ enabled set                  |
| `validateEnabledSetDependencies(enabled)`   | Same check for synthetic sets (tests/tooling)                 |
| `validateRegistryIntegrity()`               | Unique ids, deps/verticals reference catalog, optional cycles |
| `detectDependencyCycles(adjacency)`         | Small DFS helper                                              |
| `formatModuleDiagnosticsLog()`              | `[Operavia Modules]` multi-line string                        |
| `getModuleDiagnosticsSnapshot()`            | Non-throwing report pair                                      |
| `logModuleDiagnosticsIfDev()`               | Logs only when `NODE_ENV !== 'production'`                    |

Hook: `registerRoutes` calls `logModuleDiagnosticsIfDev()` after composition summary. **Never throws. Never blocks startup. Never fail-closes mounts.**

### Registry integrity

Validates:

- Unique module IDs
- Dependencies reference registered modules
- Vertical enabled modules reference registered modules
- No duplicate vertical module listings
- No circular dependencies in the catalog DAG

### `isFeatureAvailable`

Already existed in Phase 2.1. Phase 2.2 **adopts** it in navigation and selected UI gates:

```ts
isFeatureAvailable(moduleId, featureFlagEnabled);
// ≡ isModuleEnabled(moduleId) ∧ featureFlagEnabled
```

Flags are **not** removed. Semantics unchanged for Operavia Restaurant (all modules enabled ⇒ availability ≡ flag).

### Module consumer expansion

| Surface             | Change                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation          | `requiresModule` on pos, orders, customers, inventory, reports, operations, team, settings, whatsapp; tables/kitchen drop redundant `businessTypes`; flags via `isFeatureAvailable` |
| Products / addons   | `business_type === 'restaurant'` → `isModuleEnabled('addons')`                                                                                                                      |
| POS tables          | `isRestaurant` → `isModuleEnabled('tables')`                                                                                                                                        |
| Dashboard / reports | Tables tiles gated by `isModuleEnabled('tables')`                                                                                                                                   |
| KDS / orders        | KDS flag wrapped with `isFeatureAvailable('kds', …)`                                                                                                                                |
| Frontend barrel     | Re-exports diagnostics APIs from `main/modules` (no duplicate catalog)                                                                                                              |
| Backend             | Dev-only diagnostics log only — Express mounts unchanged                                                                                                                            |

## Feature availability rule (unchanged)

```text
module enabled ∧ existing feature flag (when applicable) ⇒ feature available
```

## What remains legacy

- Settings feature flags are still the real runtime gates for KDS, shifts, tax, loyalty, KOT printing, etc.
- Express `registerRoutes` is still a static mount list.
- `business_type` remains restaurant-only in auth/setup.
- Backend money / KDS / shift / tax services do **not** gate on the registry.
- Dependency metadata is soft — warnings only.

## Restaurant gate classification (Part G)

### Category 1 — Keep (vertical-specific)

- Auth/setup `business_type: 'restaurant'` hardcodes
- Type literals / i18n labels / fixtures
- Default `businessType \|\| 'restaurant'` fallbacks

### Category 2 — Converted in 2.2 (capability/module)

- Nav tables/kitchen `businessTypes` → module + flag
- Products addons UI → `addons`
- POS table picker / hold / dine-in visibility → `tables`
- Dashboard/reports tables tiles → `tables`
- KDS enabled check → `isFeatureAvailable('kds', flag)`

### Category 3 — Deferred

- Server-app / tableside (no catalog module yet)
- AuthGuard public `/kds` policy
- Deep-link empty states for `/tables` when flags off
- KOT vs shared printing split
- Fail-closed backend gates
- Settings tab inventory fully module-gated (optional later)

## Out of scope (deliberately deferred)

- Package extraction / dynamic loading / marketplace
- Fail-closed dependency enforcement
- Multi-vertical tenants / Operavia Custom / Retail / Grocery / Salon
- `db.ts` rewrite / schema migrations / module tables
- Express route remounting from registry
- Feature-flag removal
- HTTP `/api/platform/*` (optional later)

## Frontend / backend interaction

- Canonical registry: `main/modules/`
- Frontend: `frontend/src/lib/modules.ts` re-exports only (same pattern as countries)
- Do not maintain a second catalog

## Acceptance

- Restaurant UX unchanged when flags unchanged (all modules enabled)
- Soft deps: Restaurant reports `valid: true`
- Integrity: production catalog `valid: true`
- Tests: `npm run test:module-registry`, `npm run test:flo-ui-shell`

## Related

- [modular-architecture.md](modular-architecture.md)
- [module-system.md](module-system.md)
- [dependency-model.md](dependency-model.md)
- [docs/modules/README.md](../modules/README.md)
- ADR-010

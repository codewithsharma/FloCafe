# Phase 2.1 — Module Registry + Operavia Restaurant Vertical

**Status:** IMPLEMENTED (lightweight seam)
**Date:** 2026-08-13
**Code:** `main/modules/`
**Tests:** `tests/module-registry.test.ts` (`npm run test:module-registry`)
**Assessment:** [phase-2.1-module-registry.md](phase-2.1-module-registry.md) (assessment section retained above history)

## Implemented now

### Module registry

Pure TypeScript catalog under `main/modules/` (no package extraction, no plugin host):

| File           | Role                                              |
| -------------- | ------------------------------------------------- |
| `types.ts`     | `OperviaModule`, `VerticalDefinition`, `ModuleId` |
| `catalog.ts`   | All known modules + metadata                      |
| `verticals.ts` | Operavia Restaurant definition                    |
| `registry.ts`  | Read-only query API                               |
| `index.ts`     | Public exports                                    |

### Module metadata (per module)

- `id`, `name`, `version`, `dependencies`, `kind` (`core` | `shared` | `restaurant`)
- Optional: `featureFlags`, `routePrefixes`, `description`

### Read-only API

```ts
listModules();
getModule(id);
getActiveVerticalId();
getVerticalDefinition();
getEnabledModules();
isModuleEnabled(id);
isFeatureAvailable(id, featureFlagEnabled); // module ∧ flag
getModuleDependencies(id); // metadata only — not enforced
getRouteModuleMap(); // descriptive prefix → module
verticalIdForBusinessType(businessType);
getPlatformCompositionSummary();
```

### Operavia Restaurant composition

Enabled modules: `core`, `customer`, `product`, `category`, `inventory`, `pos`, `order`, `payment`, `refund`, `tax`, `shift`, `staff`, `loyalty`, `reporting`, `printing`, `notification`, `backup`, `tables`, `kitchen`, `kds`, `menu`, `addons`.

### Relationship to feature flags

```text
Module enabled (vertical)
        ∧
Feature flag enabled (settings)   // when the module declares featureFlags / UI gates
        ⇒
Feature available
```

Examples:

| Capability | Module    | Flag / gate       |
| ---------- | --------- | ----------------- |
| KDS UI     | `kds`     | `kds_enabled`     |
| Tables UI  | `tables`  | `tables_required` |
| Loyalty    | `loyalty` | `loyalty_enabled` |
| Shifts     | `shift`   | `shifts_enabled`  |
| Tax        | `tax`     | `taxes_enabled`   |

Flags are **not** removed. Phase 1 semantics preserved.

### Integration points

1. **Navigation** (`frontend/src/config/navigation.ts`) — `tables` / `kitchen` items set `requiresModule`; `filterNavItems` checks `isModuleEnabled` **and** existing flag gates **and** legacy `businessTypes`.
2. **Route registration** (`main/routes/index.ts`) — imports composition summary; mounts remain static.
3. **Frontend barrel** — `frontend/src/lib/modules.ts` re-exports `main/modules` (countries pattern).

### Dependencies

Represented as metadata (e.g. `kds` → `order`, `kitchen`, `product`; `tables` → `order`). **Not enforced** at runtime in 2.1.

---

## Intentionally NOT implemented (deferred)

- Package extraction / separate module packages
- Dynamic module installation or marketplace
- Module lifecycle hooks / runtime loading
- Full dependency resolver / fail-closed dep checks
- Multi-vertical tenant configuration
- Vertical builder / Operavia Custom
- Retail, Grocery, Salon (and other) verticals
- Rewriting `db.ts` or Express route mounting
- Removing `business_type` or wholesale flag migration
- HTTP platform module API (in-process API only for now)

---

## Planned later (Phase 2.2+)

**Phase 2.2 is implemented** — see [phase-2.2-module-consumers.md](phase-2.2-module-consumers.md) (broader consumers + soft dependency diagnostics). Remaining later work: optional read-only `/api/platform/*`, settings tab inventory gating, fail-closed deps (post multi-vertical), package extraction — still deferred.

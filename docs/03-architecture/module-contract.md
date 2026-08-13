# Module Contract

**Status:** IMPLEMENTED (Phase 2.6)
**Date:** 2026-08-13
**Code:** `main/modules/types.ts`, `main/modules/catalog.ts`, `main/modules/diagnostics.ts`
**Tests:** `tests/module-contract.test.ts` (`npm run test:module-contract`)

## 1. What is a module?

An Opervia module is a **named business capability** with a metadata contract in the registry. Implementations remain in the monolith (`main/routes`, `main/services`, `frontend/`).

> Module metadata is not a runtime plugin system.

## 2. Module identity

Every module has:

| Field | Rule |
|-------|------|
| `id` | Unique `ModuleId` |
| `name` | Non-empty display name |
| `version` | Semver-like `X.Y.Z…` |
| `kind` | `core` \| `shared` \| `restaurant` |

Formal type alias: `ModuleDefinition` (= `OperviaModule`).

## 3. Dependencies

`dependencies: ModuleId[]` — soft, direct (non-transitive). Validated by existing Phase 2.2 diagnostics. **Not fail-closed at startup.**

## 4. Capabilities

Domain-level verbs owned by exactly one module:

```text
{domain}.{verb}
```

Examples: `customer.manage`, `payment.tender`, `kds.display`.

Rules:

- Prefer one coarse capability per module (core may declare several).
- No CRUD explosion (`customer.create` / `customer.read` / …).
- No role names inside capability IDs.

> Capabilities describe what a module provides; they do not grant user authorization.

## 5. Feature flags

Unchanged:

```text
module enabled + feature flag enabled = feature available
```

Flags such as `kds_enabled`, `tables_required`, `taxes_enabled`, `shifts_enabled`, `loyalty_enabled` remain.

## 6. Routes

`routePrefixes` are **descriptive**. Express mounts remain static in `registerRoutes()`.

## 7. Navigation

Navigation stays in `frontend/src/config/navigation.ts` (`requiresModule` + flags). Not duplicated into the catalog in Phase 2.6.

## 8. Settings

Settings gates use `isModuleEnabled`. No dynamic Settings renderer.

## 9. Permissions

User auth remains `requireRole()` / existing middleware. Capability metadata is never an auth check.

Conceptual stack (not a new engine):

```text
Module → Capability → Feature flag → User permission
```

## 10. Registry

Source of truth: `MODULE_CATALOG` + `VERTICALS` (+ `SYNTHETIC_VERTICALS` for fixtures). Soft integrity via `validateRegistryIntegrity` / `validateModuleDefinitions`.

## 11. Vertical composition

Verticals list `enabledModules`. Restaurant is production-active. `retail-test` is synthetic only.

## 12. What a module is NOT

- Not a package
- Not a dynamically loaded plugin
- Not an authorization grant
- Not a DB schema owner table
- Not a marketplace listing

## 13. Future lifecycle

Deferred: install/uninstall, enable/disable at runtime, marketplace.

## 14. Future package extraction

See [extraction-readiness.md](extraction-readiness.md). Contract + ownership docs are prerequisites; extraction is not Phase 2.6.

## Related

- [module-ownership.md](module-ownership.md)
- [modular-architecture.md](modular-architecture.md)
- [module-system.md](module-system.md)

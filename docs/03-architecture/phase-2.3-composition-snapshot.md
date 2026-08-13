# Phase 2.3 — Opervia Composition Snapshot

**Status:** IMPLEMENTED
**Date:** 2026-08-13
**Depends on:** [Phase 2.2 module consumers](phase-2.2-module-consumers.md)
**Code:** `main/modules/composition.ts`
**Tests:** `tests/module-composition.test.ts` (`npm run test:module-composition`)

## Purpose

Provide a **read-only, deterministic** view of what a vertical is composed of today:

```text
Registry → Vertical Definition → Composition Snapshot
```

The snapshot answers: *“What exactly is enabled for this vertical right now?”*

It is **observability, not configuration**. It does not install, uninstall, or modify modules.

## Architectural decision

```text
Phase 2.3 establishes a read-only composition snapshot as the canonical
observability layer over the module registry and vertical definition.

It does not make the application dynamically modular.

Modules remain physically located in the existing monolith.

Verticals remain statically defined.

Express route registration remains static.

Feature flags remain supported.

The snapshot describes capability composition; flags describe runtime enablement.
```

## Data model

`getCompositionSnapshot(options?)` returns:

| Section | Content |
|---------|---------|
| `schemaVersion` | `'2.3'` — snapshot contract version |
| `vertical` | `id`, `name`, `version`, optional `description` |
| `modules.enabled` | Sorted enabled module ids |
| `modules.entries` | Per-module `{ id, name, version, kind, dependencies, featureFlags? }` |
| `modules.counts` | Enabled/registered counts, `byKind`, enabled route prefix count |
| `dependencies` | Reused from Phase 2.2 soft dependency report |
| `registryIntegrity` | Reused from Phase 2.2 integrity report |
| `diagnostics` | `{ valid, warnings[] }` — aggregated non-blocking warnings |

### Feature flags vs modules

| Concept | Meaning |
|---------|---------|
| **Module** | Capability exists in the vertical composition |
| **Feature flag** | Runtime setting further gates availability |

The snapshot lists `featureFlags` keys from catalog metadata only. It does **not** read settings from the database. Runtime availability remains `isFeatureAvailable(module, flag)` at call sites.

Optional `enabledModules` override (tests/tooling) evaluates dependencies against a synthetic set without mutating vertical definitions.

## Source of truth

```text
main/modules/catalog.ts     — module metadata
main/modules/verticals.ts   — vertical enabledModules
main/modules/registry.ts      — lookup helpers
main/modules/diagnostics.ts   — soft validation (reused, not duplicated)
main/modules/composition.ts   — snapshot assembly only
```

No second module catalog. No duplicate dependency algorithms.

## Diagnostics reuse

Composition calls:

- `getModuleDiagnosticsSnapshot()` for dependency + integrity slices
- `validateEnabledSetDependencies()` when `enabledModules` override is supplied

Warnings aggregate missing dependencies and registry integrity issues. **Never fail-closed at startup.**

## Development diagnostics

Non-production boot logs (via `logCompositionSnapshotIfDev()` in `registerRoutes`):

```text
[Opervia Composition]
Vertical: Opervia Restaurant
Modules: 22
Dependencies: valid
Diagnostics: none
```

Production (`NODE_ENV=production`) does not emit these logs.

## HTTP API

**Not implemented in Phase 2.3.**

Rationale: the frontend already re-exports `main/modules` at build time; Restaurant vertical is compile-time static; no LAN client needs a runtime composition API today. A thin authenticated GET may be added later when a non-bundled consumer exists.

## Restaurant composition (current)

| Field | Value |
|-------|-------|
| Vertical id | `restaurant` |
| Name | Opervia Restaurant |
| Enabled modules | 22 (all catalog modules) |
| Dependencies | `valid: true` |
| Registry integrity | `valid: true` |

Modules: `core`, `customer`, `product`, `category`, `inventory`, `pos`, `order`, `payment`, `refund`, `tax`, `shift`, `staff`, `loyalty`, `reporting`, `printing`, `notification`, `backup`, `tables`, `kitchen`, `kds`, `menu`, `addons`.

## Frontend / backend interaction

- Backend: `getCompositionSnapshot()` in-process
- Frontend barrel: `frontend/src/lib/modules.ts` re-exports snapshot API (no duplicate catalog)
- **No new UI** in Phase 2.3 — settings tab module gating remains deferred

## Future use

Same snapshot model will apply when additional verticals are defined:

```text
Restaurant → getCompositionSnapshot({ verticalId: 'restaurant' })
Retail     → getCompositionSnapshot({ verticalId: 'retail' })      // future
Grocery    → getCompositionSnapshot({ verticalId: 'grocery' })     // future
```

Support tooling, admin diagnostics, and optional platform APIs can consume the same DTO.

## Out of scope (deferred)

- Package extraction / dynamic loading / marketplace
- Fail-closed dependency enforcement
- Multi-vertical tenants / Opervia Custom
- Retail, Grocery, Salon, Pharmacy, Hospitality implementations
- Route remounting from registry
- Feature-flag removal
- Database module tables / migrations
- Settings tab inventory UI gating (Phase 2.3 secondary; deferred)
- HTTP `/api/platform/composition` (until needed)

## Acceptance

- Restaurant snapshot deterministic and valid
- Reuses Phase 2.2 diagnostics without duplication
- No behavior change to Restaurant pilots
- Tests: `npm run test:module-composition`, full module chain via `npm run test:module-registry`

## Related

- [phase-2.1-module-registry.md](phase-2.1-module-registry.md)
- [phase-2.2-module-consumers.md](phase-2.2-module-consumers.md)
- [modular-architecture.md](modular-architecture.md)
- [module-system.md](module-system.md)
- [dependency-model.md](dependency-model.md)

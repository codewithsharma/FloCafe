# Phase 2.4 — Platform Composition Read API & Settings Capability Gating

**Status:** IMPLEMENTED
**Date:** 2026-08-13
**Depends on:** [Phase 2.3 composition snapshot](phase-2.3-composition-snapshot.md)
**Code:** `main/routes/platform.ts`, `main/modules/composition.ts` (`getPlatformCompositionResponse`)
**Tests:** `tests/platform-composition-api.test.ts`, `tests/flo-settings-module-gating.test.ts`

## Purpose

Expose a **minimal authenticated read-only** view of the active vertical composition for support/platform tooling, and gate a small number of Settings tabs using the existing module registry.

This phase does **not** introduce module management UI, package extraction, or multi-vertical runtime configuration.

## HTTP API

### `GET /api/platform/composition`

| Aspect        | Detail                                         |
| ------------- | ---------------------------------------------- |
| Auth          | Global JWT (`requireAuth` in `main/server.ts`) |
| Authorization | `requireRole('owner', 'manager')`              |
| Body          | None                                           |
| Mutations     | None — read-only GET only                      |

### Response (minimal projection)

```json
{
  "verticalId": "restaurant",
  "verticalName": "Operavia Restaurant",
  "enabledModules": ["addons", "backup", "category", "..."],
  "diagnostics": {
    "valid": true
  }
}
```

The endpoint calls `getPlatformCompositionResponse()`, which wraps `getCompositionSnapshot()` and **does not** expose:

- dependency internals
- registry integrity issues
- per-module entries
- database paths or settings values
- secrets, tokens, or environment details

### Status codes

| Scenario                          | Code  |
| --------------------------------- | ----- |
| Authenticated owner/manager       | `200` |
| Missing/invalid JWT               | `401` |
| Authenticated cashier/waiter/chef | `403` |
| Handler failure                   | `500` |

## Security

- Uses existing JWT authentication — no bypass.
- Uses existing owner/manager RBAC — no new roles (`PlatformAdmin`, etc.).
- Does not accept `enabledModules` override via HTTP (test/tooling only).
- No Master PIN required (read-only diagnostic, same tier as audit logs / tax pack catalog).

## Source of truth

```text
Module Registry (catalog.ts)
        ↓
Vertical Definition (verticals.ts)
        ↓
Composition Snapshot (getCompositionSnapshot)
        ↓
HTTP Projection (getPlatformCompositionResponse)
        ↓
GET /api/platform/composition
```

The API is a **read-only projection**. Registry + vertical definitions remain authoritative.

## Read-only guarantee

The endpoint cannot modify module configuration, vertical definitions, feature flags, or route registration.

## Settings capability gating

Settings tabs now use `isModuleEnabled(module, verticalId)` for visibility. Feature flags inside tabs are unchanged.

| Tab             | Module    | Gate                                                  |
| --------------- | --------- | ----------------------------------------------------- |
| Tax Config      | `tax`     | `isModuleEnabled('tax')` **and** owner/manager role   |
| Shift history   | `shift`   | `isModuleEnabled('shift')` **and** owner/manager role |
| Kitchen Display | `kds`     | `isModuleEnabled('kds')`                              |
| Loyalty         | `loyalty` | `isModuleEnabled('loyalty')`                          |

**Not changed in this phase:**

- Feature flags (`kds_enabled`, `shifts_enabled`, `taxes_enabled`, `loyalty_enabled`) remain inside tabs.
- `isFeatureAvailable(module, flag)` continues to gate runtime routes (POS, KDS page, sidebar nav).
- Restaurant-specific configuration (tables, server-app) keeps existing vertical/flag behavior.

For Operavia Restaurant today, all four modules are enabled — **pilot UX is unchanged**.

## Frontend client

`frontend/src/lib/platform.ts` exports `fetchPlatformComposition()` for future tooling. No UI consumer is required in Phase 2.4.

## Deferred (explicitly out of scope)

- Module installation / lifecycle
- Package extraction or npm workspaces
- Multi-vertical tenant runtime selection
- Dynamic vertical configuration / marketplace
- Operavia Custom builder
- Module management Settings screen
- Database schema for modules or verticals

## Verification

```sh
npm run test:module-registry
npm run test:platform-composition-api
npm run test:flo-settings-module-gating
npm run build
```

## Related

- [Phase 2.3 composition snapshot](phase-2.3-composition-snapshot.md)
- [Module system](module-system.md)
- [Modular architecture](modular-architecture.md)

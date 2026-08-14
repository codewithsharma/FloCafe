# Phase 2.5 — Vertical Composition Validation & Shared Module Hardening

**Status:** IMPLEMENTED
**Date:** 2026-08-13
**Depends on:** [Phase 2.4 platform composition API](phase-2.4-platform-composition-api.md)
**Code:** `main/modules/fixtures/retail-test-vertical.ts`, `main/modules/registry.ts`
**Tests:** `tests/module-vertical-composition.test.ts`

## 1. Purpose

Prove the Operavia principle without building a production Retail product:

> **One reusable capability implementation can be composed into multiple verticals without duplicating the implementation.**

Phase 2.5 introduces a **synthetic** vertical composition used only for architecture validation and tests.

## 2. Restaurant (production)

| Field   | Value                                                           |
| ------- | --------------------------------------------------------------- |
| Id      | `restaurant`                                                    |
| Name    | Operavia Restaurant                                             |
| Role    | Only entry in production `VERTICALS`                            |
| Active  | `ACTIVE_VERTICAL_ID === 'restaurant'`                           |
| Modules | All 22 catalog modules including tables/kitchen/kds/menu/addons |

## 3. Synthetic Retail Test

| Field                  | Value                                           |
| ---------------------- | ----------------------------------------------- |
| Id                     | `retail-test`                                   |
| Name                   | Operavia Retail Test                            |
| Version                | `0.0.0-test`                                    |
| Location               | `main/modules/fixtures/retail-test-vertical.ts` |
| Production `VERTICALS` | **Not included**                                |
| Active vertical        | **Never**                                       |

Lookup is opt-in via `SYNTHETIC_VERTICALS` inside `getVerticalDefinition(id)`.

**Operavia Retail is NOT a production vertical yet.**

## 4. Shared Modules

Intersection of Restaurant and Retail Test (same catalog `ModuleId`s, one implementation each):

```text
core, customer, product, category, inventory, pos, order,
payment, refund, tax, shift, staff, loyalty, reporting,
printing, notification, backup
```

Each shared id has `kind` `core` or `shared` in the catalog.

## 5. Vertical-Specific Modules

Restaurant-only (excluded from Retail Test):

```text
tables, kitchen, kds, menu, addons
```

This proves `Restaurant ≠ Retail-Test` while reusing commerce modules.

## 6. Dependency Validation

Still **soft**:

- `validateVerticalDependencies('restaurant')` → valid
- `validateVerticalDependencies('retail-test')` → valid
- Invalid synthetic sets (e.g. `kds` without `kitchen`) → `valid: false` with diagnostics
- Never throws; never blocks startup or route mounting

## 7. Why Fail-Closed Is Deferred

Fail-closed startup enforcement needs:

1. More real-world Restaurant pilot validation
2. Clear product rules for partial enablement
3. Operator-facing recovery UX when composition is invalid

Soft diagnostics + CI assertions are enough for Phase 2.5.

## 8. Production Status

> Operavia Restaurant behavior unchanged.
> Operavia Retail is NOT production-enabled.
> `GET /api/platform/composition` always reports the active restaurant composition.
> `?verticalId=` is **not** supported (ignored if present).
> `business_type` never maps to `retail-test`.

## 9. Settings hardening (safe gates)

Additional Settings tabs now use `isModuleEnabled`:

| Tab           | Module         |
| ------------- | -------------- |
| Printers      | `printing`     |
| WhatsApp      | `notification` |
| Backup & Data | `backup`       |

Feature flags and role gates inside tabs are unchanged. Google Drive, network mode, and security settings remain non-module surfaces.

## 10. business_type audit (summary)

| Class         | Examples                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------- |
| **KEEP**      | Tenant `business_type` field; nav bridge via `verticalIdForBusinessType`; login display   |
| **CONVERTED** | Settings/nav capability checks already on `isModuleEnabled`                               |
| **DEFER**     | Type unions limited to `'restaurant'`; register default; future multi-vertical onboarding |

## 11. Future Path

```text
Synthetic Retail Test
      ↓
Pilot validation (Restaurant)
      ↓
Real Retail requirements
      ↓
Production Retail vertical (id: retail)
```

## Deferred

- Fail-closed dependency enforcement at startup
- Package extraction / workspaces
- Production Retail / Grocery / Salon
- Multi-tenant vertical selection
- Module lifecycle / marketplace
- HTTP `?verticalId=` selection

## Verification

```sh
npm run test:module-vertical-composition
npm run test:module-registry
npm run build
```

## Related

- [phase-2.4-platform-composition-api.md](phase-2.4-platform-composition-api.md)
- [modular-architecture.md](modular-architecture.md)
- [module-system.md](module-system.md)

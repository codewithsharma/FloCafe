# Phase 3.1 — Fail-Closed Vertical Remount

**Date:** 2026-08-13  
**Decision:** **PHASE 3.1 COMPLETE**  
**Schema:** v75 (unchanged)  
**Production ACTIVE vertical:** `restaurant` (unchanged)

Related: [phase-2-closeout-and-phase-3-gate.md](phase-2-closeout-and-phase-3-gate.md)

---

## 1. Existing route mounting architecture (before)

```
startServer()  →  registerRoutes(app)  →  unconditional app.use(...) for every router
```

- Live registry: imperative list in `main/routes/index.ts`
- Module catalog `routePrefixes` / `getRouteModuleMap()` were **descriptive only**
- Soft-gates (`isModuleEnabled`) skipped restaurant **side effects** inside Order/Payment handlers
- Restaurant HTTP surfaces (`/api/tables`, `/api/kds`, …) remained reachable under any composition

## 2. Existing vertical resolution

| Mechanism                   | Behavior                                      |
| --------------------------- | --------------------------------------------- |
| `ACTIVE_VERTICAL_ID`        | Compile-time constant = `restaurant`          |
| `VERTICALS`                 | Production list: Restaurant only              |
| `SYNTHETIC_VERTICALS`       | `retail-test` fixture (tests/tooling only)    |
| `getVerticalDefinition(id)` | **Was:** unknown → silent restaurant fallback |
| `business_type` mapping     | Never selects synthetic / future retail       |

No runtime vertical switching. No capability admin UI (Phase 3.2).

## 3. Problem discovered

Soft-gates alone left Restaurant routes **statically mounted**. A retail composition (or future production Retail) could still call `/api/tables`, `/api/kds`, etc. over HTTP — frontend hiding is not sufficient.

## 4. Fail-closed design

```
Load / resolve vertical
        ↓
assertFailClosedComposition (integrity + deps)
        ↓
Mount Core / enabled shared routes
        ↓
Mount only enabled restaurant routes
        ↓
Listen
```

Rules:

- Unknown vertical → `CompositionValidationError` (no restaurant fallback)
- Registry integrity failure → throw (do not mount)
- Missing module dependency in enabled set → throw
- Disabled module → **route not registered** (Express 404), not “feature disabled” inside handler
- Never “mount everything” on unknown/error

## 5. Core routes (always enabled in restaurant + retail-test)

Catalog-backed prefixes for shared/core modules remain mounted when their modules are enabled, including:

`/api/auth`, `/api/settings`, `/api/audit-logs`, `/api/products`, `/api/categories`, `/api/inventory`, `/api/orders`, `/api/order-items`, `/api/held-orders`, `/api/bills`, `/api/payment-methods`, `/api/refunds`, `/api/tax`, `/api/tax-packs`, `/api/pos-info`, `/api/shifts`, `/api/staff`, `/api/users`, `/api/customers`, `/api/reports`, `/api/printers`, `/api/whatsapp`, `/api/db`, `/api/db-tools`

Always-on uncatalogued ops (not vertical-gated): `/api/platform`, `/api/server-app-info`, `/api/more-apps`, `/api/support-ticket`, `/api/mobile/*`, `/api/customers-search`, `/api/crm/lookup`. Health stays inline in `main/server.ts` (`GET /api/health`).

## 6. Restaurant routes (conditional)

| Prefix                                  | Module  |
| --------------------------------------- | ------- |
| `/api/tables`                           | tables  |
| `/api/kitchen`, `/api/kitchen-stations` | kitchen |
| `/api/kds`, `/api/kds-info`             | kds     |
| `/api/menu-csv`                         | menu    |
| `/api/addon-groups`                     | addons  |

Mounted only when `shouldMountModule(moduleId, verticalId)` is true.

## 7. Capability / dependency handling

- Enablement source of truth: vertical `enabledModules` (existing catalog)
- Direct dependency check: `validateEnabledSetDependencies` (existing)
- Phase 3.1 makes that check **fail-closed** at remount via `assertFailClosedComposition`
- Soft `logModuleDiagnosticsIfDev` / composition log remain for observability

## 8. Startup / readiness

- Validation runs inside `registerRoutes` **before** any `app.use` of gated routers
- `startServer` still registers `/api/health` then `registerRoutes`; if composition throws, listen never succeeds → readiness never advertised
- No redesign of health payload

## 9. Behaviors

| Mode                                                          | Result                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| Restaurant (`ACTIVE`)                                         | Core + restaurant routes mounted; Phase 2 UX unchanged |
| retail-test (`registerRoutes({ verticalId: 'retail-test' })`) | Core mounted; restaurant prefixes absent → HTTP 404    |
| Unknown vertical                                              | Throw `CompositionValidationError`                     |
| Missing deps in enabled set                                   | Throw `CompositionValidationError`                     |

Production Retail (`ACTIVE_VERTICAL_ID = retail`) is **not** introduced (Phase 3.3). Case B uses synthetic `retail-test` mount override.

## 10. Frontend

- No IA redesign
- Existing `isModuleEnabled` / `isFeatureAvailable` remain compatible with restaurant ACTIVE
- Backend remount is authoritative; UI gates are defense-in-depth only
- Deep links to `/tables` / `/kds` under a future retail ACTIVE would hit API 404 — document for Phase 3.2/3.3 frontend vertical alignment

## 11. Tests

- `tests/fail-closed-remount.test.ts`
- Script: `npm run test:fail-closed-remount` (also wired into `test:module-registry`)

Matrix: Restaurant present; retail-test absent; unknown fails; disabled modules omit routes; missing dependency fails; live HTTP 404 for restaurant prefixes under retail-test.

## 12. Implementation files

| Path                             | Role                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| `main/modules/errors.ts`         | `CompositionValidationError`                                            |
| `main/modules/route-mounting.ts` | `assertFailClosedComposition`, `getRouteMountPlan`, `shouldMountModule` |
| `main/modules/registry.ts`       | Fail-closed `resolveKnownVertical` / `getVerticalDefinition`            |
| `main/routes/index.ts`           | Capability-aware `registerRoutes(app, { verticalId? })`                 |

## 13. Deferred (Phase 3.2+)

- Runtime / deploy-time vertical selection UI or settings
- Production Retail in `VERTICALS`
- Capability marketplace / hot-swap without restart
- Remount of sibling KDS process (`main/kds-server.ts`) as optional depth
- Soft-gate residuals (`notifyOrderUpdated`, held-orders tables) — Phase 3.4

---

**Verdict:** Fail-closed remount is live for the Express POS API using existing vertical/module metadata. Phase 3.2 not started.

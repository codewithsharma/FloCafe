# Phase 2.10 — Tax HTTP Boundary Consolidation

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.9 (`3be41f5`)

## 1. Existing Tax route surface

Before this phase:

| Method | Path | Location |
| --- | --- | --- |
| `POST` | `/api/tax/preview` | Inline in `main/routes/index.ts` |
| `GET` | `/api/tax/categories` | Inline in `main/routes/index.ts` |
| `*` | `/api/tax-packs/*` | `main/routes/tax-packs.ts` (already separate) |
| `GET/PUT` | `/api/settings/tax` | `main/routes/settings.ts` |
| `GET/PUT` | `/api/settings/taxes_enabled` | Settings wildcard |

## 2. New Tax router

`main/routes/tax.ts` exports `taxRoutes`, mounted as:

```ts
app.use('/api/tax', taxRoutes);
```

Relative paths: `POST /preview`, `GET /categories`.

## 3. Routes moved

- `POST /api/tax/preview` → thin call to `calculateTaxPreview`
- `GET /api/tax/categories` → handler moved verbatim (same JSON contract)

## 4. Routes intentionally not moved

| Surface | Why |
| --- | --- |
| `/api/tax-packs/*` | Pack install/activate/overrides lifecycle — already a clean router; Tax compute does not own pack lifecycle (Phase 2.7) |
| `/api/settings/tax`, `taxes_enabled` | Application configuration under Settings domain |
| `/api/reports/tax-components` | Reporting aggregation |
| Order/bill cancel tax rollups in `index.ts` | Order/POS orchestration consumers of Tax **services**, not Tax HTTP |

`index.ts` may still compose: `app.use('/api/tax', taxRoutes)`.

## 5. Auth behavior

| Endpoint | Auth |
| --- | --- |
| `POST /preview` | Global `requireAuth` only (any authenticated role) |
| `GET /categories` | `requireRole('owner', 'manager')` |

No new roles. No HTTP gate on `isModuleEnabled('tax')`.

## 6. Feature flag behavior

`taxes_enabled` remains a settings string flag read at compute time (preview zeros tax when false). Module enablement ∧ flag = feature available (Phase 2.4 UI). Flags were not removed or replaced with module-only checks.

## 7. Service boundary

Route → `main/services/tax.ts` adapters → `tax-engine`. No calculation logic in the router. No second engine. `calculateTax` facade unchanged.

## 8. Database boundary

No new queries beyond what categories already did (`getSettingValue`, `getActiveCountryPack`). No tax DB package. No schema migration.

## 9. Transaction behavior

Preview and categories are read-only (no txn). Pack mutations and order money-path txns unchanged.

## 10. Frontend compatibility

Zero frontend changes. Clients still call `/tax/preview`, `/tax/categories`, `/tax-packs/*`, `/settings/taxes_enabled`.

## 11. Remaining coupling

- Denormalized tax snapshots on products/orders/bills
- Order/bill money-path orchestration still calls Tax services
- Tax-pack lifecycle separate under same module id
- Product tax columns still Product-owned
- Preview Decimal discount scale vs money-path Math.round (intentional)

## 12. Future extraction path

Freeze snapshot contract → prefer facade imports over direct `tax-engine` in money routes → clarify pack vs compute sub-boundary → product tax column port → package extraction (deferred).

## Schema

**No migration.** Still schema **v75**.

## Related

- [phase-2.7-domain-boundaries.md](phase-2.7-domain-boundaries.md)
- [phase-2.9-product-inventory-boundary.md](phase-2.9-product-inventory-boundary.md)
- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)

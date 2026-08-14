# Phase 3.3 — Production Retail Vertical

**Date:** 2026-08-13  
**Decision:** **PHASE 3.3 COMPLETE**  
**Schema:** v75 (unchanged — no migration)  
**Default vertical:** `restaurant` (unset `ACTIVE_VERTICAL_ID`)  
**Production Retail:** `ACTIVE_VERTICAL_ID=retail`

Related: [phase-3.2-capability-configuration.md](phase-3.2-capability-configuration.md), [phase-3.1-fail-closed-remount.md](phase-3.1-fail-closed-remount.md)

---

## 1. Objective

Graduate the proven Core-only composition into a **production** Retail vertical:

```
ACTIVE_VERTICAL_ID=retail
        ↓
resolve + validate
        ↓
mount Core routes only
        ↓
Restaurant routes absent (404)
        ↓
Product → Order → Tax → Bill → Payment
```

## 2. `retail` vs `retail-test`

| Id            | Where                                           | Purpose                                  |
| ------------- | ----------------------------------------------- | ---------------------------------------- |
| `retail`      | `VERTICALS` (`main/modules/retail-vertical.ts`) | **Production** Operavia Retail           |
| `retail-test` | `SYNTHETIC_VERTICALS` (fixtures)                | Architecture / synthetic validation only |

Both share `OPERVIA_SHARED_COMMERCE_MODULES` (17 modules). Do **not** rename one into the other.

## 3. Enabled modules (production retail)

Same shared commerce set as restaurant **minus** restaurant-only:

`core`, `customer`, `product`, `category`, `inventory`, `pos`, `order`, `payment`, `refund`, `tax`, `shift`, `staff`, `loyalty`, `reporting`, `printing`, `notification`, `backup`

## 4. Disabled (not mounted)

`tables`, `kitchen`, `kds`, `menu`, `addons`  
→ `/api/tables`, `/api/kds`, `/api/kitchen`, `/api/menu-csv`, `/api/addon-groups`, …

## 5. Startup

```bash
ACTIVE_VERTICAL_ID=retail   # restart required
# unset → restaurant (café default)
```

Invalid retail composition → `CompositionValidationError` → no listen. No restaurant fallback.

## 6. Core sale flow

Uses existing Product / Inventory / Tax facade / Order / Payment tender. No Retail-specific domain services.

## 7. Frontend (minimal)

- `GET /api/platform/composition` readable by POS roles (cashier/waiter/chef)
- Nav / POS / Settings / Cart / Topbar consume `composition.verticalId` for `isModuleEnabled`
- When tables module off → force cart `takeaway`; hide table UX
- Restaurant vertical unchanged when composition reports `restaurant`

## 8. Database / seed

No schema bump. Fresh retail does not require seeded tables/KDS. Existing Core init path sufficient for smoke sale.

**Tax note:** Tenant `business_type` (settings) is still used by tax-pack rule filters (`businessTypes` on rules). Production Retail composition (`ACTIVE_VERTICAL_ID=retail`) is independent. Current IN packs list `restaurant`/`salon`; retail deployments can keep `business_type=restaurant` for tax until packs add `retail`, or update pack catalogs later (not a vertical remount concern).

## 9. Tests

- `tests/production-retail.test.ts` — `npm run test:production-retail`
- Also via `test:synthetic-retail` chain
- Phase 3.1 / 3.2 suites remain green

## 10. Limitations / deferred (Phase 3.5+)

- Soft-gate / correctness residuals → **CLOSED** in [phase-3.4-correctness-residuals.md](phase-3.4-correctness-residuals.md)
- Broader settings “tables required” UX cleanup
- Dual i18n / OTel exporter
- Grocery/Salon/etc. verticals

## 11. Ops

```bash
# Café (default)
# ACTIVE_VERTICAL_ID unset or =restaurant

# Retail store
ACTIVE_VERTICAL_ID=retail
```

Restart after changing env. No runtime switch.

---

**Verdict:** Production `retail` vertical is registered and startable. Phase 3.4 not started.

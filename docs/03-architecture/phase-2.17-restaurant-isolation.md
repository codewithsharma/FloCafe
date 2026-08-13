# Phase 2.17 — Restaurant Isolation

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.15 Payment domain boundary

## Goal

Prove Restaurant-specific side effects are isolated behind module checks. Shared **Order** / **Payment** must not **require** tables or KDS to function.

## Dependency direction

```
Shared commerce (order, payment, product, tax, inventory, …)
        ▲
        │  may depend on shared only
        │
Restaurant modules (tables, kitchen, kds, menu, addons)
        │
        └── soft-gated call sites in Order/Payment routes/services
            (isModuleEnabled) — never hard deps in MODULE_CATALOG
```

| Rule | Meaning |
|------|---------|
| Shared ↛ Restaurant | Catalog `dependencies` of `kind: 'shared'\|'core'` must not list restaurant modules |
| Restaurant → Shared | Allowed (e.g. `tables` → `order`, `kds` → `order`) |
| Soft side effects | Order/Payment may *call* table occupy/free or `notifyKdsUpdate` only when the module is enabled |

## Soft-gates (Order)

In `main/routes/orders.ts`:

```ts
if (isModuleEnabled('tables') && table_id && type === 'dine_in') { /* occupy */ }
if (isModuleEnabled('tables') && order.table_id) { /* free */ }
if (isModuleEnabled('kds')) notifyKdsUpdate();
```

| Call site | Gate |
|-----------|------|
| POST create dine-in occupy | `tables` |
| PATCH status completed / cancelled free | `tables` |
| convert-to-takeaway free | `tables` |
| last-item cancel free | `tables` |
| All `notifyKdsUpdate()` | `kds` |

Payment bill-paid gates remain as Phase 2.15 (`payment-tender.ts` / `bills.ts`).

## CURRENT vs TARGET vs DEFERRED

| Layer | State |
|-------|--------|
| **CURRENT** | Soft `isModuleEnabled` gates on Order table/KDS side effects; Restaurant ACTIVE vertical enables `tables`+`kds` → **identical UX**; catalog forbids shared→restaurant deps; Express routes stay statically mounted |
| **TARGET** | Vertical-neutral shared commerce; Restaurant depth optional via composition |
| **DEFERRED (Phase 3)** | Fail-closed remount / unload of restaurant HTTP when modules off; package extraction; production Retail+; multi-vertical runtime |

## Vertical matrix

| Vertical | `tables` | `kds` | Order side effects |
|----------|----------|-------|--------------------|
| **restaurant** (ACTIVE production) | enabled | enabled | Occupy/free + KDS notify — **unchanged** |
| **retail-test** (synthetic only) | excluded | excluded | Soft-gates skip; Order/Payment still compose |

Production `ACTIVE_VERTICAL_ID` remains `restaurant`. `retail-test` is composition validation only — **not** production-enabled.

## What did NOT change

- Restaurant UX when modules ON (default)
- Express route mounting (no unmount)
- Money / inventory / tax math
- Schema (**v75**)
- Production Retail enablement

## Tests

- `tests/restaurant-isolation.test.ts` — source contract + catalog + composition + dine-in occupy/free
- `tests/order-restaurant-isolation.test.ts` — takeaway neutrality + cancel free

```sh
npm run test:restaurant-isolation
```

## Related

- [phase-2.15-payment-domain-boundary.md](./phase-2.15-payment-domain-boundary.md)
- [phase-2.14-order-domain-boundary.md](./phase-2.14-order-domain-boundary.md)
- [phase-2.5-vertical-composition-validation.md](./phase-2.5-vertical-composition-validation.md)
- [dependency-model.md](./dependency-model.md)

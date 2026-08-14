# Operavia Vertical Architecture

**Status:** TARGET model; Restaurant CURRENT as implicit composition
**Catalog:** [verticals.md](../00-product/verticals.md)
**Layers:** [modular-architecture.md](modular-architecture.md)

## Definition

A **vertical** is:

```
Vertical = modules enabled
         + configuration
         + navigation
         + workflows
```

It is **not**:

- A separate Electron app
- A separate git repository
- A fork of Operavia per industry

All verticals share one codebase and one Core.

## Composition

```
┌────────────────────────────────────────────┐
│  VERTICAL: Operavia Restaurant (CURRENT)    │
│  modules: Order, Tables, KDS, Payment, …   │
│  config:  kds_*, tables_*, kot_*, taxes_*  │
│  nav:     POS, Tables, Kitchen, Shifts, …  │
│  flows:   dine-in, counter, day-close      │
└────────────────────────────────────────────┘
            │ uses
            ▼
┌────────────────────────────────────────────┐
│  SHARED MODULES + CORE                     │
└────────────────────────────────────────────┘
```

Future verticals (Retail, Grocery, Salon, …) swap the module set and config — they do not copy Payment or Tax.

## Configuration over forking

| Need                   | Prefer                                     | Avoid                                        |
| ---------------------- | ------------------------------------------ | -------------------------------------------- |
| Restaurant kitchen     | Enable KDS + Kitchen + KOT flags           | Fork `orders.ts` into `restaurant-orders.ts` |
| Retail SKU focus       | Enable Inventory depth; disable Tables/KDS | New `retail` app repo                        |
| Different roles labels | Config / i18n / role map (TARGET)          | Hard-fork role enum per vertical             |
| Tax rules by region    | Tax-packs                                  | Country-specific product forks               |

## CURRENT Phase 1 mapping

| Vertical concept  | Phase 1 mechanism                               |
| ----------------- | ----------------------------------------------- |
| Module enablement | Settings flags + always-on routes               |
| Vertical id       | Effectively restaurant (`business_type` locked) |
| Nav               | Frontend routes / sidebar gated ad-hoc          |
| Workflows         | Hard-coded F&B POS, KDS, table flows            |

TARGET: a declarative **vertical definition** file (or settings document) listing module ids, default flags, and nav. Restaurant’s definition must reproduce today’s behavior exactly.

## Operavia Custom

Custom is a long-term **composer** of the same vertical architecture. **Do not build** the Custom builder in Phase 1. See [opervia-platform.md](../00-product/opervia-platform.md).

## Related

- [dependency-model.md](dependency-model.md)
- [module-system.md](module-system.md)
- [architecture-gap-report.md](architecture-gap-report.md) §F

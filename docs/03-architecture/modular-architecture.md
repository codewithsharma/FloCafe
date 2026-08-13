# Opervia Modular Architecture

**Status:** TARGET vision; Phase 2.1 registry + Phase 2.2 consumers/diagnostics **implemented**; Phase 1 runtime **preserved**
**Product:** [opervia-platform.md](../00-product/opervia-platform.md) · [principles.md](../00-product/principles.md)
**Decision:** [ADR-010](../14-decisions/ADR-010-opervia-platform.md)

## Lego model

Opervia is built like Lego:

1. **Core** — the baseplate (runtime, auth, data, security)
2. **Modules** — bricks (reusable business capabilities)
3. **Verticals** — finished builds (industry products made by composing bricks)

**Do not rewrite Phase 1 now.** Documentation defines the TARGET shape so future work can make composition explicit without breaking café pilots.

## Three layers

| Layer | CURRENT (Phase 1) | TARGET |
|-------|-------------------|--------|
| **Core** | Electron main, Express app, SQLite/`db.ts`, JWT/Master PIN, security middleware | Same runtime; clearer core vs capability boundaries |
| **Modules** | Route/service files + settings flags; tax-packs as plugin-like packs | Declared modules with contract + registry |
| **Verticals** | Implicit: `business_type` locked to restaurant + F&B flags | Declarative vertical definition (module set + config + nav) |

## Mental model

```
                    ┌──────────────────────┐
                    │   OPERVIA PLATFORM   │
                    └──────────┬───────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │   CORE   │       │ MODULES  │       │VERTICALS │
     └────┬─────┘       └────┬─────┘       └────┬─────┘
          │                  │                  │
   runtime · auth     Order · Payment    Restaurant (CURRENT)
   SQLite · security  Tax · Inventory    Retail / Grocery / …
   settings shell     KDS · Tables       Custom (long-term only)
                      Printing · …
```

Composition flows **upward**: Core enables Modules; Verticals select and configure Modules.

## CURRENT vs TARGET

| Aspect | CURRENT (incl. Phase 2.1) | TARGET |
|--------|---------------------------|--------|
| Routing | Static `registerRoutes`; descriptive `routePrefixes` in registry | Module-contributed routes via registry |
| Features | Settings flags + `isModuleEnabled` / `isFeatureAvailable` | Vertical + module enablement + settings |
| Business type | Locked / restaurant-oriented; maps to Restaurant vertical | Multi-vertical definitions |
| Packaging | Single desktop app = Restaurant | Same app binary; vertical profile selects capabilities |
| Contracts | Phase 2.1 metadata (`id`, deps, flags); informal file boundaries | Full identity, deps enforcement, permissions, events, UI, schema |
| Plugin precedent | Tax-packs (separate from module registry) | Generalize carefully; no Custom builder yet |

## How Phase 1 maps

| Phase 1 reality | Modular interpretation |
|-----------------|------------------------|
| Monolithic Express routes + services | Pre-extracted **module implementations** colocated in `main/` |
| Settings feature flags | **Configuration** on top of vertical module enablement |
| `business_type` ≈ restaurant | **CURRENT** vertical: Opervia Restaurant (`main/modules/verticals.ts`) |
| Frontend nav | Broader `requiresModule` + `isFeatureAvailable` (Phase 2.2) |
| Tax-packs | Only existing **plugin-like** system (not the module registry) |

**Phase 2.1 done:** lightweight module registry + Restaurant vertical — see [phase-2.1-module-registry.md](phase-2.1-module-registry.md).
**Phase 2.2 done:** broaden consumers + soft dep diagnostics — see [phase-2.2-module-consumers.md](phase-2.2-module-consumers.md).
**Next (2.3):** optional read-only composition API / deeper settings gates — still no package extraction.

## Explicit non-goals (now)

- Microservices / Kubernetes
- Separate codebase per vertical
- Opervia Custom builder
- Mass folder moves or package extraction for its own sake

## Related

- [module-system.md](module-system.md)
- [vertical-architecture.md](vertical-architecture.md)
- [dependency-model.md](dependency-model.md)
- [architecture-gap-report.md](architecture-gap-report.md)

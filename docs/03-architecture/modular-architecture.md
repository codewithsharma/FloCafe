# Opervia Modular Architecture

**Status:** Phase 2 **COMPLETE** — final gate [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md) (**PASS WITH DOCUMENTED DEFERMENTS**). Interim catalog exit: [phase-2-exit-gate.md](phase-2-exit-gate.md). Phase 1 Restaurant runtime **preserved**. Phase 3 TARGET = packages / fail-closed / production multi-vertical.
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

| Aspect | CURRENT (Phase 2 complete) | TARGET (Phase 3+) |
|--------|---------------------------|--------|
| Routing | Static `registerRoutes`; descriptive `routePrefixes` aligned to mounts | Optional module-contributed / gated routes |
| Features | Settings flags + `isModuleEnabled` / `isFeatureAvailable` | Vertical + module enablement + settings |
| Business type | Locked to Restaurant; `retail-test` synthetic only | Multi-vertical runtime definitions |
| Packaging | Single desktop app = Restaurant | Same binary; vertical profile selects capabilities |
| Contracts | Identity, soft deps, capabilities, composition API, Inventory/Tax boundaries | Dep enforcement, ports, packages, permissions, events, schema ownership |
| Plugin precedent | Tax-packs (separate from module registry) | Generalize carefully; no Custom builder yet |

## How Phase 1 maps

| Phase 1 reality | Modular interpretation |
|-----------------|------------------------|
| Monolithic Express routes + services | Pre-extracted **module implementations** colocated in `main/` |
| Settings feature flags | **Configuration** on top of vertical module enablement |
| `business_type` ≈ restaurant | **CURRENT** vertical: Opervia Restaurant (`main/modules/verticals.ts`) |
| Frontend nav | Broader `requiresModule` + `isFeatureAvailable` (Phase 2.2) |
| Tax-packs | Only existing **plugin-like** system (not the module registry) |

**Phase 2.1–2.18 COMPLETE** — final gate [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md):

- 2.1–2.13 registry through Product↔Tax (prior)
- INTERIM 2.14 catalog exit (preserved)
- CURRENT 2.14 Order · 2.15 Payment · 2.16 POS · 2.17 Restaurant isolation · 2.18 synthetic Retail

**Phase 3 (future):** package extraction, fail-closed remount, Inventory UI, void×cancel product fix, production Retail+ — do not start without explicit kickoff.

## Explicit non-goals (now)

- Microservices / Kubernetes
- Separate codebase per vertical
- Opervia Custom builder
- Mass folder moves or package extraction for its own sake

## Related

- [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md)
- [phase-2-exit-gate.md](phase-2-exit-gate.md)
- [module-system.md](module-system.md)
- [extraction-readiness.md](extraction-readiness.md)
- [vertical-architecture.md](vertical-architecture.md)
- [dependency-model.md](dependency-model.md)
- [architecture-gap-report.md](architecture-gap-report.md)

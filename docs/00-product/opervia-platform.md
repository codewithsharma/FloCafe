# Operavia Platform

**Status:** CURRENT product brand + TARGET modular platform vision
**Decision:** [ADR-010](../14-decisions/ADR-010-opervia-platform.md) (Accepted 2026-08-13)
**Canonical strategy:** [`STRATEGY.md`](../../STRATEGY.md) (pilot reliability remains the north star)

## Guiding statement

> Operavia is a modular business platform designed to power multiple industry-specific products from a single shared codebase. Business capabilities are implemented as reusable modules, while vertical products are compositions of those modules configured for specific industries.

## Motto

**Build once. Reuse everywhere. Fix once. Benefit everywhere. Compose without duplication.**

## Branding

| Name                    | Role                                             |
| ----------------------- | ------------------------------------------------ |
| **Operavia**            | Canonical platform **and** product brand         |
| **Operavia Restaurant** | CURRENT Phase 1 vertical (this codebase)         |
| Operavia POS            | **Retired** as the active product name           |
| FloCafe                 | Repository / fork legacy name only               |
| Operavia Custom         | Long-term composer vision — **do not build now** |

Historical audits under `docs/15-project-management/` may still use Operavia / FloCafe / Flo POS. Do not rewrite those files to chase branding.

## Three-layer model

```
┌─────────────────────────────────────────┐
│  VERTICALS — industry products          │
│  Restaurant · Retail · Grocery · …      │
├─────────────────────────────────────────┤
│  MODULES — reusable business capability │
│  Order · Payment · Tax · Inventory · …  │
├─────────────────────────────────────────┤
│  CORE — runtime, auth, data, security   │
└─────────────────────────────────────────┘
```

| Layer         | Responsibility                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| **Core**      | Electron/Express/SQLite runtime, auth, settings shell, security middleware, migrations, backup primitives |
| **Modules**   | Reusable capabilities (orders, payments, tax, printing, …) with clear boundaries                          |
| **Verticals** | Compositions of modules + config + nav + workflows for an industry                                        |

Details: [modular-architecture.md](../03-architecture/modular-architecture.md) · [module-system.md](../03-architecture/module-system.md) · [vertical-architecture.md](../03-architecture/vertical-architecture.md)

## Relationship to Phase 1

Phase 1 **preserves** the existing architecture: Electron + Express + SQLite monolith shipping **Operavia Restaurant** capabilities (POS, KDS, tables, payments, shifts, and related café ops).

| Vocabulary  | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| **CURRENT** | What ships today as Operavia Restaurant on the shared codebase   |
| **TARGET**  | Explicit module registry, vertical definitions, formal contracts |
| **PLANNED** | Future verticals and deeper module extraction                    |

This documentation describes the **modular vision**. It does **not** authorize rewriting Phase 1 into packages, microservices, or separate apps.

## What Operavia Custom means

**Operavia Custom** (PLANNED, long-term) is a composer that would let operators assemble modules into a bespoke vertical without forking the codebase.

**Do not build now.** No Custom UI, no marketplace, no arbitrary module picker in Phase 1. Restaurant remains the only CURRENT vertical.

## Related docs

- [verticals.md](verticals.md) — vertical catalog and compositions
- [principles.md](principles.md) — platform principles 1–10
- [architecture-gap-report.md](../03-architecture/architecture-gap-report.md) — CURRENT vs TARGET gaps
- [modules/README.md](../modules/README.md) — module index
- [`STRATEGY.md`](../../STRATEGY.md) — pilot KPI and frozen scope

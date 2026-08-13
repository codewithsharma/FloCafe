# ADR-010: Opervia platform brand and modular vision

**Status:** Accepted
**Date:** 2026-08-13
**Deciders:** CEO + CTO (platform branding + architecture direction)
**Supersedes:** Active product naming as “Nexora POS” (name retired; historical docs unchanged)
**Related:** [`STRATEGY.md`](../../STRATEGY.md), [opervia-platform.md](../00-product/opervia-platform.md), [architecture-gap-report.md](../03-architecture/architecture-gap-report.md)

## Context

The codebase is a mature local-first Electron + Express + SQLite café/restaurant POS (Phase 1), previously marketed under Nexora / FloCafe / Flo POS names. Leadership approved **Opervia** as the canonical platform and product brand, with a modular multi-vertical vision, while pilots still depend on Phase 1 reliability.

Pilot north star remains: **3 cafés × 30 days × zero critical failures**. Architecture rewrites, microservices, and Custom builders would dilute that focus.

## Decision

1. **Opervia** is the canonical **platform and product** brand.
2. **Nexora POS** is **retired** as the active product name (historical audits may keep the old name).
3. Phase 1 product is **Opervia Restaurant** — the current vertical on the shared codebase.
4. Guiding statement: *Opervia is a modular business platform designed to power multiple industry-specific products from a single shared codebase. Business capabilities are implemented as reusable modules, while vertical products are compositions of those modules configured for specific industries.*
5. Motto: *Build once. Reuse everywhere. Fix once. Benefit everywhere. Compose without duplication.*
6. **No application rewrite** in this phase — documentation and branding consolidation only for this decision’s immediate work.
7. Preserve Phase 1 architecture (monolith, settings flags, static routes). Modular TARGET is documented; extraction is later.
8. **Opervia Custom** is long-term only — do not build now.
9. Next technical step when approved: lightweight **module registry + vertical definition** (declarative enablement) without package extraction; Restaurant behavior stays identical.
10. Principles 1–10 in [principles.md](../00-product/principles.md) are normative for TARGET design.

## Consequences

- Positive: one brand story; clear CURRENT vs TARGET; pilots undisturbed; future verticals have a documented composition model.
- Negative: interim doc/code brand drift until packaging and UI strings catch up; historical audits still say Nexora/FloCafe.
- Follow-ups: lightweight module registry after pilot gates; residual legacy Flo\* technical identifiers (`appId`, `executableName`, CSS `flo-*` tokens) may remain until a deliberate packaging migration.

## Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Keep Nexora as product, Opervia as platform-only | Conflicts with approved canonical brand |
| Rewrite into packages/microservices now | Violates pilot reliability mandate and ADR spirit |
| Build Opervia Custom composer now | Premature; no multi-vertical demand proven |
| Separate repo per vertical | Duplicates fixes; breaks “one codebase” |
| Mass-rename historical audits | Noise; evidence trail must stay intact |

## Evidence

- [opervia-platform.md](../00-product/opervia-platform.md)
- [verticals.md](../00-product/verticals.md)
- [principles.md](../00-product/principles.md)
- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [architecture-gap-report.md](../03-architecture/architecture-gap-report.md)
- [modules/README.md](../modules/README.md)

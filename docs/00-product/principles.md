# Operavia Platform Principles

**Status:** Accepted with [ADR-010](../14-decisions/ADR-010-opervia-platform.md)
**Motto:** Build once. Reuse everywhere. Fix once. Benefit everywhere. Compose without duplication.

These principles govern TARGET modular design. Phase 1 (Operavia Restaurant) remains a working monolith; principles guide incremental evolution, not a rewrite.

---

## 1. One Codebase

Operavia is a single shared codebase. Industry products are verticals on that codebase, not separate repositories or forked apps per industry.

## 2. Reusable Modules

Business capabilities are implemented as reusable modules (Order, Payment, Tax, Inventory, …). Modules exist to be composed, not copied.

## 3. Composition Over Duplication

Verticals assemble modules. Do not duplicate order/payment/tax logic per industry. Prefer composition and configuration over copy-paste product lines.

## 4. Clear Module Boundaries

Each module owns a coherent responsibility: identity, API surface, services, schema concerns, UI, and config belonging to that capability. Boundaries are documented even when Phase 1 code is still colocated in `main/` and `frontend/`.

## 5. Minimal Coupling

Modules depend on other modules only through **explicit** contracts. Avoid hidden cross-imports and silent assumptions. Prefer declared dependencies (see [dependency-model.md](../03-architecture/dependency-model.md)).

## 6. Configuration Over Forking

Industry differences are expressed with settings, feature flags, navigation, and workflows — not by forking the repository. Example: enable Tables + KDS for Restaurant; leave them off for Retail.

## 7. Vertical Independence

A vertical may enable a different module set and UX without requiring unrelated verticals to change. Restaurant pilots must not be blocked by Retail or Custom experiments.

## 8. Shared Bug Fixes

A fix in a shared module benefits every vertical that uses it. Do not maintain parallel bugfix trees per industry product.

## 9. Extensibility

New modules and verticals can be added without rewriting Core. Extension points (registry, config, events) are TARGET; tax-packs are the CURRENT plugin-like precedent.

## 10. Backward Compatibility With Phase 1

Preserve Phase 1 Operavia Restaurant behavior while moving toward modularity. No mass extraction, microservices split, or Custom builder in this phase. Composition becomes explicit first; behavior for Restaurant stays identical.

---

## Related

- [opervia-platform.md](opervia-platform.md)
- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [architecture-gap-report.md](../03-architecture/architecture-gap-report.md)

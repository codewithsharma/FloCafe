# Opervia Dependency Model

**Status:** TARGET rules; Phase 1 dependencies are mostly implicit in code
**Modules:** [module-system.md](module-system.md) · [modular-architecture.md](modular-architecture.md)

## Goal

Make module dependencies **explicit**, avoid hidden coupling, and eventually **validate** that enabled modules satisfy required deps before the app mounts routes/UI.

## Explicit dependencies

Dependencies are declared on the module contract (`dependencies` field). Examples:

| Module | Depends on | Why |
|--------|------------|-----|
| **KDS** | Order, Product | Tickets need order lines and product metadata |
| **Kitchen** | Order, Product | Station routing and item prep |
| **Tables** | Order | Seating binds to open orders |
| **POS** | Product, Order, Payment (typical) | Sell → order → tender |
| **Payment** | Order (bill context) | Tender against bills/orders |
| **Refund** | Payment | Reverses collected tender |
| **Loyalty** | Customer, Order/Payment | Points against patrons and spend |
| **Reporting** | Order, Payment, Shift (as needed) | Aggregates domain facts |
| **Menu / Addons** | Product | Modifier groups attach to products |
| **Notification / WhatsApp** | Customer, Order/Payment (as needed) | Delivery of bills/notices |
| **Tax** | Order / Payment path | Calculation at settle |

Exact graphs are declared in `main/modules/catalog.ts` (soft metadata). Rule: **if module A cannot function without B, A lists B**. Soft diagnostics report missing declared deps; fail-closed enforcement is Phase 3.

## Avoid hidden dependencies

| Anti-pattern | Prefer |
|--------------|--------|
| Importing another domain’s tables “just this once” with no declaration | Declare dep or move shared type to Core |
| Settings flag on while required routes never registered | Registry validates enablement |
| UI nav link to a disabled module | Nav contributed only when module enabled |
| Assuming Restaurant-only columns in a “shared” service | Guard behind vertical/module config |

## Validation (TARGET)

The platform should eventually:

1. Load vertical definition → enabled module set
2. Resolve transitive `deps`
3. Fail closed (or warn in dev) if a required module is missing
4. Mount only routes/nav for the resolved set

**CURRENT:** soft diagnostics exist (`validateVerticalDependencies`, `validateRegistryIntegrity` in `main/modules/diagnostics.ts`). They warn / report only — never fail-closed at boot. See [phase-2.2-module-consumers.md](phase-2.2-module-consumers.md).

**TARGET:** fail-closed validation before mounting routes/UI when multi-vertical / partial enablement is real. Do not implement a heavy orchestration framework yet.

## Phase 1 guidance

When touching coupled areas (orders, KDS, payments):

- Document the logical module boundary in PR/notes
- Do not introduce new silent cross-domain imports
- Prefer settings gates already used by peers (`kds_enabled`, `shifts_enabled`, …)

## Related

- [architecture-gap-report.md](architecture-gap-report.md) §D–E
- [principles.md](../00-product/principles.md) (Minimal Coupling, Clear Module Boundaries)

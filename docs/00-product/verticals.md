# Opervia Verticals

**Platform:** [opervia-platform.md](opervia-platform.md)
**Architecture:** [vertical-architecture.md](../03-architecture/vertical-architecture.md)

A **vertical** is an industry product assembled from shared modules, configuration, navigation, and workflows — not a separate application or codebase.

| Status | Meaning |
|--------|---------|
| **CURRENT** | Ships today (Phase 1) |
| **PLANNED** | Future composition on the same platform |
| **Long-term** | Vision only — do not build now |

---

## Restaurant — CURRENT (Phase 1)

**Product name:** Opervia Restaurant
**Codebase:** this repository (shared Opervia platform)

**Example module composition**

| Modules | Role in Restaurant |
|---------|-------------------|
| Auth / Core, Settings | Login, roles, feature flags |
| Employee / Staff | Waiter, chef, manager, owner |
| Customer, Product, Category, Menu / Addons | Catalog and F&B modifiers |
| Tables, Order, POS | Dine-in / counter service |
| Kitchen, KDS, Printing | KOT / kitchen display / receipts |
| Payment, Refund, Tax, Shift | Money and cash ops |
| Inventory (light), Loyalty, Reporting | Stock counts, points, reports |
| Notification / WhatsApp, Backup | Optional delivery and continuity |

Restaurant-specific depth today includes tables, KDS/kitchen stations, KOT printing, addon-groups, held-order F&B patterns, and flags such as `tables_required`, `kds_*`, `kot_*`.

---

## Retail — PLANNED

**Example composition:** Auth · Staff · Customer · Product · Category · Inventory · POS · Order · Payment · Refund · Tax · Shift · Loyalty · Reporting · Printing · Backup · Settings

Emphasis: SKU-centric checkout, stronger inventory, no tables/KDS by default.

---

## Grocery — PLANNED

**Example composition:** Auth · Staff · Customer · Product · Category · Inventory · POS · Order · Payment · Refund · Tax · Shift · Loyalty · Reporting · Printing · Backup · Settings

Emphasis: high-volume barcode/SKU flow, inventory depth, perishables (future), no F&B kitchen stack by default.

---

## Salon — PLANNED

**Example composition:** Auth · Staff · Customer · Product · Category · POS · Order · Payment · Refund · Tax · Shift · Loyalty · Reporting · Printing · Notification · Backup · Settings

Emphasis: appointment-oriented staff/customer workflows (future modules), retail product attach, no tables/KDS by default.

---

## Health & Beauty — PLANNED

**Example composition:** Auth · Staff · Customer · Product · Category · Inventory · POS · Order · Payment · Refund · Tax · Shift · Loyalty · Reporting · Printing · Backup · Settings

Emphasis: service + retail mix; compliance-sensitive catalog fields (future); no restaurant kitchen stack by default.

---

## Pharmacy — PLANNED

**Example composition:** Auth · Staff · Customer · Product · Category · Inventory · POS · Order · Payment · Refund · Tax · Shift · Reporting · Printing · Backup · Settings

Emphasis: regulated inventory and prescription workflows (future specialized modules); strict audit. Do not enable ad-hoc Custom composition for pharmacy compliance.

---

## Hospitality — PLANNED

**Example composition:** Auth · Staff · Customer · Product · Category · Tables · Order · POS · Payment · Refund · Tax · Shift · Kitchen · KDS · Printing · Loyalty · Reporting · Notification · Backup · Settings · Menu / Addons

Emphasis: property/front-desk extensions (future) composing Restaurant-like F&B modules where needed — still one codebase.

---

## Custom — Long-term only

**Opervia Custom** is a **composer**, not a vertical shipped in Phase 1.

- Operator selects modules + config to form a bespoke product
- **Do not build now** — no Custom builder UI, marketplace, or arbitrary enablement matrix in Phase 1
- See [opervia-platform.md](opervia-platform.md#what-opervia-custom-means)

---

## Related

- [principles.md](principles.md)
- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [architecture-gap-report.md](../03-architecture/architecture-gap-report.md) §F

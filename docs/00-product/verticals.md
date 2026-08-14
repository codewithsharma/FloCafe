<!-- Last verified against codebase: 2026-08-14, schema v75 -->

# Opervia Verticals

**Platform:** [opervia-platform.md](opervia-platform.md)
**Architecture:** [vertical-architecture.md](../03-architecture/vertical-architecture.md)
**Deploy/start config:** `ACTIVE_VERTICAL_ID` in `.env` (see `.env.example` and [phase-3.2-capability-configuration.md](../03-architecture/phase-3.2-capability-configuration.md))

A **vertical** is an industry product assembled from shared modules, configuration, navigation, and workflows — not a separate application or codebase.

| Status        | Meaning                                         |
| ------------- | ----------------------------------------------- |
| **CURRENT**   | Production vertical selectable at deploy/start  |
| **SYNTHETIC** | Validation-only composition — not for merchants |
| **PLANNED**   | Future composition on the same platform         |
| **Long-term** | Vision only — do not build now                  |

**Deploy note:** Retail is selectable via `ACTIVE_VERTICAL_ID=retail` in `.env`. It shares commerce modules with Restaurant but does **not** include table management, KDS, kitchen, menu, or addon groups. Retail-native UX (barcode-first checkout, purchase orders) is **not** yet implemented. Café pilots must leave `ACTIVE_VERTICAL_ID` unset or set `restaurant`. Empty/unknown values fail closed (server will not start).

---

## Restaurant — CURRENT (default)

**Product name:** Opervia Restaurant  
**Code id:** `restaurant`  
**Default:** yes — when `ACTIVE_VERTICAL_ID` is **unset**  
**Code:** `main/modules/verticals.ts` · Phase 2 CLOSED · Phase 3.1–3.4 complete for remount/composition

**Module composition (22):** shared commerce (17) + `tables`, `kitchen`, `kds`, `menu`, `addons`

| Modules                                    | Role in Restaurant               |
| ------------------------------------------ | -------------------------------- |
| Auth / Core, Settings                      | Login, roles, feature flags      |
| Employee / Staff                           | Waiter, chef, manager, owner     |
| Customer, Product, Category, Menu / Addons | Catalog and F&B modifiers        |
| Tables, Order, POS                         | Dine-in / counter service        |
| Kitchen, KDS, Printing                     | KOT / kitchen display / receipts |
| Payment, Refund, Tax, Shift                | Money and cash ops               |
| Inventory (light), Loyalty, Reporting      | Stock counts, points, reports    |
| Notification / WhatsApp, Backup            | Optional delivery and continuity |

Restaurant-specific depth today includes tables, KDS/kitchen stations, KOT printing, addon-groups, held-order F&B patterns, and flags such as `tables_required`, `kds_*`, `kot_*`.

---

## Retail — CURRENT (production composition; partial UX)

**Product name:** Opervia Retail  
**Code id:** `retail`  
**Select:** `ACTIVE_VERTICAL_ID=retail` (restart required)  
**Code:** `main/modules/retail-vertical.ts` · shared modules: `main/modules/shared-commerce-modules.ts` · Phase 3.3 COMPLETE

**Module composition (17):** `core`, `customer`, `product`, `category`, `inventory`, `pos`, `order`, `payment`, `refund`, `tax`, `shift`, `staff`, `loyalty`, `reporting`, `printing`, `notification`, `backup`

**Includes:** shared commerce money path (Product → Inventory → Order → Tax → Bill → Pay), shifts, refunds, loyalty, reporting, printing, backup.

**Excludes:** `tables`, `kitchen`, `kds`, `menu`, `addons`.

**Honest gap:** This is a **production-selectable composition**, not a finished retail product. POS checkout is **takeaway (counter) only** — café dine-in and delivery chrome are hidden (Phase 4.12). Retail-native UX (barcode-first checkout depth, suppliers/PO) is **not** implemented. Do not market as a full retail ERP.

---

## Retail-test — SYNTHETIC (not for merchants)

**Code id:** `retail-test`  
**Select:** `ACTIVE_VERTICAL_ID=retail-test` for automated composition checks only  
**Code:** `main/modules/fixtures/retail-test-vertical.ts` · `SYNTHETIC_VERTICALS`

Same 17 shared commerce modules as production Retail. Used to prove Lego composition without restaurant modules. **Never** use for café pilots or merchant installs.

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

**Opervia Custom** is a **composer**, not a vertical shipped today.

- Operator selects modules + config to form a bespoke product
- **Do not build now** — no Custom builder UI, marketplace, or arbitrary enablement matrix
- See [opervia-platform.md](opervia-platform.md#what-opervia-custom-means)

---

## Related

- [principles.md](principles.md)
- [modular-architecture.md](../03-architecture/modular-architecture.md)
- [phase-3.3-production-retail.md](../03-architecture/phase-3.3-production-retail.md)
- [architecture-gap-report.md](../03-architecture/architecture-gap-report.md) §F

# Opervia Architecture Gap Report

**Date:** 2026-08-13
**Scope:** Docs-only assessment of Phase 1 vs modular platform TARGET
**Decisions:** [ADR-010](../14-decisions/ADR-010-opervia-platform.md)
**Vision:** [opervia-platform.md](../00-product/opervia-platform.md)

This report does **not** rewrite historical audits in `docs/15-project-management/`.

---

## A. Current architecture (Phase 1 reality)

| Aspect | Reality |
|--------|---------|
| Runtime | Electron + Express + SQLite monolith |
| Schema | `PRAGMA user_version` → **v74** |
| Routing | Static `registerRoutes` |
| Features | Settings feature flags (`'true'` / `'false'` strings) |
| Business type | Locked to **restaurant** |
| Tenancy | Single-tenant per install |
| Module registry | **None** |
| Product shipped | **Opervia Restaurant** capabilities (POS, KDS, tables, payments, shifts, refunds, loyalty, printing, backup, …). Canonical brand **Opervia** (ADR-010); historical audits may still say Nexora/FloCafe |

Local-first offline billing remains mandatory. Cloud/optional services must not block core money paths ([`STRATEGY.md`](../../STRATEGY.md)).

---

## B. Reusable capabilities (shared / platform-shaped)

These behave as **reusable modules** even though they are not yet registered as such:

| Capability | Notes |
|------------|-------|
| Auth / JWT / Master PIN | Core security |
| Staff | Users and roles |
| Customers | CRM |
| Products / categories | Catalog |
| Light inventory | Stock counts (not full ledger module) |
| Bills / payments / refunds | Money path |
| Shifts / day-close | Cash ops |
| Tax engine | Incl. tax-packs |
| Receipt printing | ESC/POS and related |
| Loyalty | Points / rewards |
| Reports core | Sales and ops summaries |
| Backup / Drive | Continuity |
| Cloud-sync | Outbound, non-blocking |
| WhatsApp | Optional notification |
| Audit | `audit_logs` and money audits |
| Security middleware | LAN mode, IPC hardening, etc. |
| Settings hub | Feature flags and config UI |

---

## C. Vertical-specific (Restaurant)

| Area | Restaurant-specific today |
|------|---------------------------|
| Tables | Floor / seating |
| KDS / kitchen stations | Kitchen display |
| KOT printing | Kitchen tickets |
| Addon-groups | F&B modifiers |
| Held-orders | F&B hold patterns |
| Roles | Waiter / chef naming |
| Flags | `tables_required`, `kds_*`, `kot_*`, … |
| Flows | Dine-in and café service paths |

---

## D. Gaps vs TARGET modular platform

| Gap | Description |
|-----|-------------|
| No module registry / lifecycle | Cannot declaratively enable/disable capabilities as modules |
| Routes/services coupled | Domain logic crosses informal file boundaries |
| Fat `db.ts` | Schema and access concentrated |
| Inventory not a module | Light stock only; ledger is P2 |
| Orders hybrid restaurant | Shared order core entangled with F&B patterns |
| `business_type` not multi-vertical | Cannot express Retail/Grocery profiles |
| No vertical composer | No declarative vertical definition |
| Roles F&B-named | Waiter/chef bias in a platform meant for multiple industries |
| Nav gated ad-hoc | Sidebar/routes not module-contributed |
| No formal module contracts | Identity/deps/events/UI not declared |
| No module events bus | Cross-module signaling is direct calls |

---

## E. Recommended module boundaries

| Module | Responsibility |
|--------|----------------|
| **Auth / Core** | Runtime identity, JWT, Master PIN, security primitives |
| **Settings / Config** | Settings store, flags, hub UI |
| **Employee / Staff** | Users, roles, PIN verify |
| **Customer** | Patrons / CRM |
| **Product** | Sellable items |
| **Category** | Catalog grouping |
| **Menu / Addons** | Modifier groups and F&B menu structure |
| **Inventory** | Stock (light now; ledger later) |
| **POS** | Selling surface / cart UX orchestration |
| **Order** | Orders, lines, status |
| **Tables** | Seating (Restaurant) |
| **Kitchen** | Stations / prep routing |
| **KDS** | Kitchen display server/UI |
| **Payment** | Tender, bills settlement |
| **Refund** | Payment reversal |
| **Tax** | Calculation + packs |
| **Shift** | Open/close, cash recon, day-close hooks |
| **Loyalty** | Points and rewards |
| **Reporting** | Aggregates and exports |
| **Printing** | Receipts, KOT, device config |
| **Notification / WhatsApp** | Outbound messaging |
| **Backup** | Backup/restore, Drive hooks |

Boundaries are **logical**. Phase 1 code may remain colocated until a deliberate extraction.

---

## F. Vertical compositions (examples)

### Restaurant — CURRENT

Auth, Staff, Customer, Product, Category, Menu/Addons, Tables, Order, POS, Kitchen, KDS, Payment, Refund, Tax, Shift, Inventory (light), Loyalty, Reporting, Printing, Notification/WhatsApp, Backup, Settings.

### Retail — PLANNED

Auth, Staff, Customer, Product, Category, Inventory, POS, Order, Payment, Refund, Tax, Shift, Loyalty, Reporting, Printing, Backup, Settings.
*(No Tables/KDS/Kitchen by default.)*

### Grocery — PLANNED

Auth, Staff, Customer, Product, Category, Inventory, POS, Order, Payment, Refund, Tax, Shift, Loyalty, Reporting, Printing, Backup, Settings.
*(Inventory-forward; no F&B kitchen stack by default.)*

### Salon — PLANNED

Auth, Staff, Customer, Product, Category, POS, Order, Payment, Refund, Tax, Shift, Loyalty, Reporting, Printing, Notification, Backup, Settings.
*(Appointment depth future; no Tables/KDS by default.)*

### Hospitality — PLANNED

Auth, Staff, Customer, Product, Category, Menu/Addons, Tables, Order, POS, Kitchen, KDS, Payment, Refund, Tax, Shift, Loyalty, Reporting, Printing, Notification, Backup, Settings.
*(Plus future property modules — still one codebase.)*

Full catalog: [verticals.md](../00-product/verticals.md).

---

## G. Naming

| Name | Use |
|------|-----|
| **Opervia** | Canonical platform **and** product brand |
| **Opervia Restaurant** | CURRENT Phase 1 vertical |
| **Nexora POS** | **Retired** as active product name |
| **FloCafe** | Repo / fork legacy only |
| **RestaurantOS** | Interpret as Opervia Restaurant vertical depth / platform depth **after** pilots — not a separate current product |
| **Flo POS** | Legacy → Opervia |
| Historical audits | **Preserve** old names in `docs/15-project-management/`; do not mass-rewrite |

---

## H. Highest-priority next technical step

~~Introduce a lightweight **module registry + vertical definition**~~ — **Phase 2.1 COMPLETE** (`main/modules/`, [phase-2.1-module-registry.md](phase-2.1-module-registry.md)).

**Recommended Phase 2.2 (smallest next seam):** broaden consumers (more nav items / settings surfaces use `isModuleEnabled` / `isFeatureAvailable`); optional soft dependency warnings in diagnostics; still **no** package extraction, dep fail-closed enforcement, or additional verticals.

| Do | Do not (yet) |
|----|----------------|
| Expand registry consumers | Microservices |
| Keep Restaurant behavior identical | Separate codebase per vertical |
| Soft dep diagnostics later | Opervia Custom builder |
| | Mass folder moves / package extraction |

**Recommended NOT to do yet**

- Microservices or Kubernetes
- Separate apps/repos per vertical
- Opervia Custom composer UI
- Mass folder moves or “clean architecture” rewrites unrelated to pilot reliability

---

## Related

- [modular-architecture.md](modular-architecture.md)
- [module-system.md](module-system.md)
- [vertical-architecture.md](vertical-architecture.md)
- [dependency-model.md](dependency-model.md)
- [modules/README.md](../modules/README.md)

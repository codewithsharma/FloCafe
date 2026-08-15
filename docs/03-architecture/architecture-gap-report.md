# Operavia Architecture Gap Report

**Date:** 2026-08-13 (baseline) · **Superseded for Phase 2 claims by:** [phase-2-exit-gate.md](phase-2-exit-gate.md) (2026-08-13 exit)
**Scope:** Historical docs-only assessment of Phase 1 vs modular platform TARGET; updated summary below for post–Phase 2 readers
**Decisions:** [ADR-010](../14-decisions/ADR-010-opervia-platform.md)
**Vision:** [opervia-platform.md](../00-product/opervia-platform.md)

This report does **not** rewrite historical audits in `docs/15-project-management/`.

> **Phase 2 status:** COMPLETE ([phase-2-final-exit-gate.md](phase-2-final-exit-gate.md) — PASS WITH DOCUMENTED DEFERMENTS). Schema **v80**. Registry exists. Order/Payment/POS seams + synthetic retail-test. Soft composition; fail-closed / packages / production Retail remain **Phase 3**.

---

## A. Current architecture (Phase 2 reality)

| Aspect          | Reality                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Electron + Express + SQLite monolith                                                                                                                                                                       |
| Schema          | `PRAGMA user_version` → **v79** (`inventory_movements` from Phase 2.8)                                                                                                                                     |
| Routing         | Static `registerRoutes` (modules do not dynamically mount/unmount)                                                                                                                                         |
| Features        | Settings feature flags + `isModuleEnabled` / `isFeatureAvailable`                                                                                                                                          |
| Business type   | Locked to **restaurant**; `retail-test` synthetic only                                                                                                                                                     |
| Tenancy         | Single-tenant per install                                                                                                                                                                                  |
| Module registry | **Yes** — `main/modules/` (22 modules, soft deps, capabilities)                                                                                                                                            |
| Product shipped | **Operavia Restaurant** capabilities (POS, KDS, tables, payments, shifts, refunds, loyalty, printing, backup, …). Canonical brand **Operavia** (ADR-010); historical audits may still say Operavia/FloCafe |

Local-first offline billing remains mandatory. Cloud/optional services must not block core money paths ([`STRATEGY.md`](../../STRATEGY.md)).

---

## B. Reusable capabilities (shared / platform-shaped)

These are **registered modules** with colocated implementations:

| Capability                 | Notes                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Auth / JWT / Master PIN    | Core security                                               |
| Staff                      | Users and roles                                             |
| Customers                  | CRM                                                         |
| Products / categories      | Catalog                                                     |
| Inventory                  | Stock writes + append-only ledger (v75+) + history read API |
| Bills / payments / refunds | Money path                                                  |
| Shifts / day-close         | Cash ops                                                    |
| Tax                        | Facade + engine + tax-packs                                 |
| Receipt printing           | ESC/POS and related                                         |
| Loyalty                    | Points / rewards                                            |
| Reports core               | Sales and ops summaries                                     |
| Backup / Drive             | Continuity                                                  |
| Cloud-sync                 | Outbound, non-blocking                                      |
| WhatsApp                   | Optional notification                                       |
| Audit                      | `audit_logs` and money audits                               |
| Security middleware        | LAN mode, IPC hardening, etc.                               |
| Settings hub               | Feature flags and config UI                                 |

---

## C. Vertical-specific (Restaurant)

| Area                   | Restaurant-specific today                             |
| ---------------------- | ----------------------------------------------------- |
| Tables                 | Floor / seating                                       |
| KDS / kitchen stations | Kitchen display                                       |
| KOT printing           | Kitchen tickets                                       |
| Addon-groups           | F&B modifiers                                         |
| Held-orders            | F&B hold patterns                                     |
| Roles                  | Waiter / chef naming                                  |
| Flags                  | `tables_required`, `kds_*`, `kot_printing_enabled`, … |
| Flows                  | Dine-in and café service paths                        |

---

## D. Remaining gaps vs TARGET (Phase 3)

| Gap                         | Description                                                |
| --------------------------- | ---------------------------------------------------------- |
| Soft registry only          | Cannot fail-closed enable/disable or unload Express routes |
| Routes/services coupled     | Domain logic still crosses informal file boundaries        |
| Fat `db.ts`                 | Schema and access concentrated                             |
| Inventory columns colocated | Stock still on `products`; write HTTP product-nested       |
| Orders hybrid restaurant    | Shared order core entangled with F&B patterns              |
| No multi-vertical runtime   | Cannot activate Retail/Grocery profiles in production      |
| No package extraction       | Modules are metadata + colocated code                      |
| No marketplace / lifecycle  | Install/uninstall not in scope                             |

Historical “next = Phase 2.2” guidance is obsolete — see exit gate.

Residual Phase 3 gaps also include: F&B-named roles, events bus, and package-level contracts beyond soft catalog metadata.

---

## E. Recommended module boundaries

| Module                      | Responsibility                                         |
| --------------------------- | ------------------------------------------------------ |
| **Auth / Core**             | Runtime identity, JWT, Master PIN, security primitives |
| **Settings / Config**       | Settings store, flags, hub UI                          |
| **Employee / Staff**        | Users, roles, PIN verify                               |
| **Customer**                | Patrons / CRM                                          |
| **Product**                 | Sellable items                                         |
| **Category**                | Catalog grouping                                       |
| **Menu / Addons**           | Modifier groups and F&B menu structure                 |
| **Inventory**               | Stock writes + ledger (v75+) + history read API        |
| **POS**                     | Selling surface / cart UX orchestration                |
| **Order**                   | Orders, lines, status                                  |
| **Tables**                  | Seating (Restaurant)                                   |
| **Kitchen**                 | Stations / prep routing                                |
| **KDS**                     | Kitchen display server/UI                              |
| **Payment**                 | Tender, bills settlement                               |
| **Refund**                  | Payment reversal                                       |
| **Tax**                     | Calculation + packs                                    |
| **Shift**                   | Open/close, cash recon, day-close hooks                |
| **Loyalty**                 | Points and rewards                                     |
| **Reporting**               | Aggregates and exports                                 |
| **Printing**                | Receipts, KOT, device config                           |
| **Notification / WhatsApp** | Outbound messaging                                     |
| **Backup**                  | Backup/restore, Drive hooks                            |

Boundaries are **logical**. Phase 1/2 code may remain colocated until deliberate Phase 3 extraction.

---

## F. Vertical compositions (examples)

### Restaurant — CURRENT

Auth, Staff, Customer, Product, Category, Menu/Addons, Tables, Order, POS, Kitchen, KDS, Payment, Refund, Tax, Shift, Inventory, Loyalty, Reporting, Printing, Notification/WhatsApp, Backup, Settings.

### Retail — CURRENT (production composition; partial UX); `retail-test` is SYNTHETIC only

Auth, Staff, Customer, Product, Category, Inventory, POS, Order, Payment, Refund, Tax, Shift, Loyalty, Reporting, Printing, Backup, Settings / Notification.
_(No Tables/KDS/Kitchen/Menu/Addons.)_ Select via `ACTIVE_VERTICAL_ID=retail`. See [verticals.md](../00-product/verticals.md) and [phase-3.3-production-retail.md](phase-3.3-production-retail.md).

### Grocery / Salon / Hospitality — PLANNED

See [verticals.md](../00-product/verticals.md). Not production-enabled.

---

## G. Naming

| Name                    | Use                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Operavia**            | Canonical platform **and** product brand                                                                           |
| **Operavia Restaurant** | CURRENT production vertical                                                                                        |
| **Operavia POS**        | **Retired** as active product name                                                                                 |
| **FloCafe**             | Repo / fork legacy only                                                                                            |
| **RestaurantOS**        | Interpret as Operavia Restaurant vertical depth / platform depth **after** pilots — not a separate current product |
| **Flo POS**             | Legacy → Operavia                                                                                                  |
| Historical audits       | **Preserve** old names in `docs/15-project-management/`; do not mass-rewrite                                       |

---

## H. Highest-priority next technical step

**Phase 2 COMPLETE** — [phase-2-exit-gate.md](phase-2-exit-gate.md).

**Phase 3 (when explicitly kicked off):** fail-closed deps after pilots, package ports, Inventory UI, legacy tax cleanup, void×cancel restock characterization, multi-vertical runtime — still **no** speculative marketplace or Custom builder.

| Do                                 | Do not (yet)                                                   |
| ---------------------------------- | -------------------------------------------------------------- |
| Follow exit-gate deferments        | Microservices                                                  |
| Keep Restaurant behavior identical | Separate codebase per vertical                                 |
| Pilot reliability first            | Operavia Custom builder                                        |
|                                    | Mass folder moves / package extraction without Phase 3 kickoff |

**Recommended NOT to do yet**

- Microservices or Kubernetes
- Separate apps/repos per vertical
- Operavia Custom composer UI
- Mass folder moves or “clean architecture” rewrites unrelated to pilot reliability

---

## Related

- [phase-2-exit-gate.md](phase-2-exit-gate.md)
- [modular-architecture.md](modular-architecture.md)
- [module-system.md](module-system.md)
- [vertical-architecture.md](vertical-architecture.md)
- [dependency-model.md](dependency-model.md)
- [modules/README.md](../modules/README.md)

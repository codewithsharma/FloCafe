<!-- Last updated: 2026-08-15, schema v80 -->

# Operavia Restaurant OS — Product Blueprint (R0)

**Status:** ACCEPTED as product blueprint (documentation only)  
**Branch baseline:** `restaurant-vertical` @ OPS-02 `ff97f1f` · Engineering H4 `24966ba`  
**Vertical focus:** **Operavia Restaurant only.** Retail and other verticals are deferred for development.  
**Canonical capability statuses:** [`capability-matrix.md`](capability-matrix.md) — this blueprint does **not** replace matrix row marks.  
**Does not authorize implementation.** Do not invent Phase 4.16. Do not start R1 without explicit authorization.

## Mission

Build a **complete, production-grade restaurant/café operating system** — not an MVP feature dump. Scope eventually spans POS, floor, kitchen, inventory, recipes/BOM, purchasing, CRM/loyalty, online/QR, staff, finance, reporting, marketing, integrations, reliability, and multi-location **readiness** (ADR before code).

Preserve: H1–H4 hardening depth, SQLite local SoR (ADR-002), offline-first billing, financial correctness, server-side authz, KDS as non-SoR.

---

## Companion contracts (R0 set)

| Document                                                                     | Role                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`capability-matrix.md`](capability-matrix.md)                               | Canonical Existing / Hardening / Planned / Later / Frozen |
| [`restaurant-os-roadmap.md`](restaurant-os-roadmap.md)                       | R0–R16 waves mapped to matrix                             |
| [`restaurant-os-architecture.md`](restaurant-os-architecture.md)             | Domains, boundaries, dependency graph                     |
| [`restaurant-os-offline-contract.md`](restaurant-os-offline-contract.md)     | Offline SAFE / LIMITED / ONLINE REQUIRED                  |
| [`restaurant-os-financial-contract.md`](restaurant-os-financial-contract.md) | Immutable money rules                                     |
| [`restaurant-simulation.md`](restaurant-simulation.md)                       | Virtual café until real sites exist                       |
| [`STRATEGY.md`](../../STRATEGY.md)                                           | North-star KPI + freezes                                  |
| [`feature-list.md`](feature-list.md)                                         | Code evidence                                             |

---

## 1. Current capability inventory (summary)

Posture counts are approximate from the matrix (~2026-08-15): **~127 Existing · ~16–29 Hardening · ~110 Planned · ~53 Later · ~11 Frozen**.

### Engineering already closed (depth remains Hardening where matrix says so)

| Slice  | Commit    | What closed                                                       |
| ------ | --------- | ----------------------------------------------------------------- |
| H1     | `c5bfc19` | Void/discount audit + post-tender guards; print-bill `print_logs` |
| H2     | (same)    | KDS advertise honesty, stale board, reconnect retry               |
| H3     | `6b85950` | RBAC `requireRole` + discount/settings UI gates                   |
| H4     | `24966ba` | Backup integrity, restore audit, cancel/restore conflicts         |
| OPS-01 | `d3322a4` | Pilot ops docs / config / drills (suite)                          |
| OPS-02 | `ff97f1f` | Live RC audit → **NO-GO** (no signed site)                        |

### Representative Existing (do not rebuild)

Order create/edit/lifecycle · modifiers · held/prepaid/split · cash/card/UPI record · refunds+idempotency · tax packs · tables transfer · KDS statuses · thermal/KOT · SKU inventory ledger · CRM/loyalty basics · five roles+PIN · shifts+cash recon+Z · offline SQLite billing · backup/restore · audit_logs

### Representative Hardening (prefer before new Planned)

Void order · discounts · receipt generation · offline KDS/recovery · permissions/RBAC · conflict/restart/restore · audit trail depth · error handling · data integrity validation

### Representative Planned (authorized slice + ADR if schema/money)

86 depth · notes/combos/courses · coupons · service charge (ADR-014 Proposed) · floor plan/sections/merge · KDS stations/timers · print queue · recipes/BOM · PO/suppliers · loyalty rewards/gift cards · QR ordering · advanced reports · attendance/scheduling

### Later / Frozen (closed unless matrix edited)

Tips product · Bluetooth · aggregators · AI · reservations · e-invoice depth · **Frozen:** card terminals, payment gateways, online payment, multi-location implementation, payroll

**Shipped-slice tension (intentional):** Some Planned rows have a partial ship (86 API, addon groups, cash drawer kick, wastage, valuation). Rule: **deepen**, do not mark Existing until accepted, do not rebuild.

---

## 2. Complete Restaurant OS capability map (A–N)

Statuses below are **target product coverage** for the complete OS. Authoritative mark for each named feature remains the matrix (or a future matrix edit). New names not yet in the matrix are proposed additions under Planned/Later — **not** Existing.

### A. POS

| Capability                                         | Typical matrix posture                |
| -------------------------------------------------- | ------------------------------------- |
| Order creation / editing / items                   | Existing                              |
| Modifiers / addon groups                           | Existing / Planned (groups depth)     |
| Discounts / voids / cancellations                  | Hardening / Planned (item void depth) |
| Refunds                                            | Existing                              |
| Held / prepaid / split bills                       | Existing                              |
| Merge orders / reopen / courses / priority / notes | Planned                               |
| Customer association                               | Existing                              |
| Order types (dine-in/takeaway/delivery)            | Existing                              |
| Receipts / reprints / digital                      | Hardening / Planned                   |
| Taxes / service charge / tips                      | Existing / Planned / Later            |
| Payment methods / reconciliation                   | Existing (+ Frozen terminals)         |

### B. Table / floor

Tables, status, transfer · Existing. Sections, floor plans, merge/split table, seats, timers, waiter assignment depth · Planned.

### C. Kitchen

KDS + bump statuses · Existing. Offline/recovery · Hardening. KOT · Existing. Stations/routing/timers/expediter/recall/analytics · Planned. Printer fallback · Existing + Planned queue.

### D. Inventory

SKU stock, adjustments, movements, low stock, wastage (SKU), valuation · Existing/Planned depth. Ingredients as first-class, unit conversion depth, stock count, spoilage, transfer between stores · Planned (multi-location Frozen).

### E. Recipes / food cost

Recipes, BOM, yield, loss, versions, theoretical/actual food cost, margin · Planned (needs ADR).

### F. Purchasing

Suppliers, PO, receiving, invoices, returns, balances · Planned (needs ADR).

### G. Customers / CRM

Profiles, history, loyalty/points/wallet · Existing/Planned depth. Gift cards, segmentation, feedback · Planned/Later.

### H. Online / QR

QR menu, acceptance, pickup/delivery workflows · Planned. Online payment · Frozen initially.

### I. Staff

Staff, roles, PIN, shifts · Existing. Fine-grained permissions, attendance, scheduling, leave · Planned/Later. Inventory Manager / Accountant as product roles · blueprint (not auto-created).

### J. Finance

Payments, refunds, drawer, float, shift recon, variance, Z, day close, tax reporting, audit · Existing/Hardening. Expenses product · Planned.

### K. Reporting / BI

Core sales/payment/refund/shift reports · Existing. Food cost, profit, hourly BI, advanced analytics · Planned/Later.

### L. Marketing

WhatsApp transactional · Existing. Campaigns, coupons, segments · Planned/Later.

### M. Administration

Restaurant profile, menu, tax, printers, KDS, staff, backup, audit, diagnostics · Existing/Hardening. Branches · Frozen (multi-location).

### N. Integrations

Printers, WhatsApp, Drive backup, FloAdmin · Existing/Hardening. Payment providers, aggregators, accounting, delivery platforms · Later/Frozen per matrix.

---

## 3. Missing capabilities (gaps vs complete OS)

Largest gaps vs complete Restaurant OS (matrix Planned/Later, not bugs):

1. Recipe/BOM + true food costing
2. Purchasing / supplier AP / receiving
3. Visual floor plan + table merge depth
4. Kitchen stations / routing / timers / expediter
5. Print queue / durable retry
6. QR / online ordering (sans online pay until unfrozen)
7. Fine-grained RBAC + extra roles
8. Expenses, gift cards, advanced BI
9. Multi-location readiness (ADR-006 first — Frozen to implement)
10. Live signed RC + site ops (OPS-02 NO-GO)

---

## 4–8. Pointers

Dependency graph, domain boundaries → [`restaurant-os-architecture.md`](restaurant-os-architecture.md)  
Offline → [`restaurant-os-offline-contract.md`](restaurant-os-offline-contract.md)  
Financial → [`restaurant-os-financial-contract.md`](restaurant-os-financial-contract.md)  
Roles → architecture § Role model  
Roadmap R0–R16 → [`restaurant-os-roadmap.md`](restaurant-os-roadmap.md)  
Simulation → [`restaurant-simulation.md`](restaurant-simulation.md)

---

## 9. Acceptance model (all future R-phases)

Every authorized phase must define and pass:

| Gate            | Requirement                                             |
| --------------- | ------------------------------------------------------- |
| Functional      | Documented operator workflow works end-to-end           |
| Financial       | Obeys financial contract; cents; no duplicate money     |
| Authorization   | Server `requireRole` (or successor); UI mirrors         |
| Offline         | Classified; billing never blocked by cloud              |
| Failure         | Explicit failure UX; no silent success                  |
| Audit           | Sensitive mutations audited without secrets             |
| Automated tests | Happy / fail / edge / authz / validation                |
| UI              | Staff can complete without developer for in-scope flows |

---

## 10. Competitive coverage (principle)

| Lens               | Rule                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Market expectation | Matrix Planned rows = initial competitive set                                                     |
| Current state      | Existing + Hardening depth                                                                        |
| Planned state      | Blue rows + R-waves                                                                               |
| Differentiator     | Offline-first SQLite SoR, local ownership, financial/shift integrity, honest KDS (not second SoR) |
| Parity             | **Not** required for aggregators, terminals, AI, multi-tenant SaaS until unfrozen                 |

Do not chase feature count. Prefer reliability and money correctness over channel breadth.

---

## 11. Differentiators

1. Local-first billing that survives internet loss
2. Deterministic tender / refund / shift / Z semantics
3. Kitchen board as projection of SQLite orders — not a parallel ledger
4. Operator-owned backups with integrity checks
5. Explicit Hardening before Planned expansion
6. Restaurant-complete OS vision with deferred Retail/other verticals

---

## 12. Risks

| Risk                                       | Mitigation                                         |
| ------------------------------------------ | -------------------------------------------------- |
| Blueprint scope explosion before live café | OPS-02 NO-GO until signed RC; R1 gated             |
| Money architecture churn (REAL→cents)      | Financial contract; human approve migration        |
| BOM/PO schema without ADR                  | R5/R6 require ADR                                  |
| Online pay / aggregators pressure          | Frozen until matrix + STRATEGY edit                |
| Dual SoT (matrix vs feature-list)          | Matrix plan; feature-list evidence; deepen shipped |
| Retail/other vertical distraction          | Development target = Restaurant only               |

---

## 13. Recommended R1 (not started)

**R1 — POS Core Completion** (see roadmap): finish remaining POS Hardening depth (void/discount/receipt), deepen shipped Planned POS slices that already exist in code (86, modifiers groups, notes) under one authorized slice — **without** BOM, QR, aggregators, or schema money rewrite.

Explicit authorization required before any R1 code.

---

## Non-negotiable principles (R0)

1. Restaurant is the only active product vertical for development.
2. Retail/other verticals deferred.
3. Preserve H1–H4.
4. SQLite local SoR unless future ADR changes it.
5. Offline-first core.  
   6–10. Financial correctness, deterministic mutations, idempotency, server+UI authz.  
   11–12. KDS not SoR; no parallel stores.  
   13–15. No tech fashion; no feature without workflow; no vanity features.
6. Every major capability: domain, API, UI, permissions, offline, failure, audit, tests, acceptance.  
   17–20. Compatibility, no silent schema, no float money math, respect Frozen.

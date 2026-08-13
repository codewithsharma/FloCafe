# Opervia Product Vision

> **Canonical strategy:** [`STRATEGY.md`](../../STRATEGY.md) (updated 2026-08-13).
> **Platform brand:** **Opervia**. **Nexora POS** is retired as an active product name.
> **Do not blur:** Opervia Restaurant (CURRENT Phase 1) ≠ multi-vertical Opervia platform (TARGET).

## Guiding statement

> **Opervia is a modular business platform designed to power multiple industry-specific products from a single shared codebase. Business capabilities are implemented as reusable modules, while vertical products are compositions of those modules configured for specific industries.**

**Motto:** Build once. Reuse everywhere. Fix once. Benefit everywhere. Compose without duplication.

See [opervia-platform.md](opervia-platform.md) · [verticals.md](verticals.md) · [principles.md](principles.md) · [ADR-010](../14-decisions/ADR-010-opervia-platform.md).

## CURRENT PRODUCT — Opervia Restaurant (Phase 1)

A **mature local-first café POS with KDS and operational management capabilities** — Electron desktop, SQLite, offline billing. Evidence: `package.json` (`productName: Opervia`), `main/index.ts`, schema v74, `STRATEGY.md`.

**Honest description (use this):** local-first, offline-capable restaurant and café POS (Opervia Restaurant vertical) designed to keep businesses operating when the internet is unavailable.

Core value today:
- Counter and table service on one machine
- SQLite persistence with automatic migration and backup
- Kitchen display (KDS), kitchen stations, KOT printing
- ESC/POS receipt printing (USB, network, WebUSB)
- Customer CRM, loyalty, discounts, configurable tax packs
- Staff roles, shifts, cash reconciliation, day close
- Optional cloud coordination (FloAdmin), Google Drive backup, WhatsApp bill delivery
- English, Spanish, Brazilian Portuguese UI

MIT / free core; no tiered feature gating in code. Packaging/UI brand consolidates to **Opervia**. Repo/fork identity may still say FloCafe.

**Not current product:** finished multi-vertical platform, Opervia Custom composer, AI-powered POS, multi-location platform, multi-tenant SaaS, aggregator platform, ERP.

## FUTURE — Opervia modular platform

After pilot KPI (**3 cafés × 30 days × zero critical failures**), evolve the shared codebase into an explicit **Core + reusable modules + vertical compositions** model. Additional verticals (Retail, Grocery, Salon, Health & Beauty, Pharmacy, Hospitality, Custom) compose shared modules — they are **not** separate applications.

Planned Restaurant depth (PLANNED — not built): inventory ledger, recipes/BOM, procurement, multi-location (ADR-006 first), cloud ops, accounting, payment terminals, aggregators, advanced analytics, optional AI.

### Guiding principles

1. **Local-first remains default** — billing and kitchen must work without internet (`docs/cloud-v2-plan.md`).
2. **Incremental evolution** — extend `main/` + `frontend/`; no premature microservices.
3. **Composition over duplication** — build capabilities once; verticals enable modules via configuration.
4. **Single-tenant per install today → optional multi-location later** — no `locations` table; ADR-006 before code.
5. **AI is P3 / optional** — core POS must function without AI; no AI until reliability is proven.
6. **Data safety** — additive migrations; customer data survives upgrades (`AGENTS.md`).
7. **Backward compatibility with Phase 1** — do not break Opervia Restaurant for the sake of architecture.

### Branding map

| Aspect | CURRENT | TARGET |
|--------|---------|--------|
| Brand | **Opervia** | **Opervia** (unchanged) |
| Product you install | **Opervia Restaurant** | Same vertical + deeper modules; other verticals compose later |
| Scope | Single-location POS + KDS + ops (shifts/cash/day close) | Modular platform; multi-vertical composition |
| Architecture | LAN servers, 1 SQLite DB, static routes + settings flags | Same core; explicit module registry + vertical definitions |
| Cloud | Optional FloAdmin coordination | Enhanced cloud ops (PLANNED; never blocks billing) |
| Inventory | Product-level stock | Ledger + BOM + purchasing (PLANNED) |
| Retired names | Nexora POS, Flo POS (active use) | Historical audits may retain old names |

## Evidence

- Strategy: `STRATEGY.md`
- Platform docs: `docs/00-product/opervia-platform.md`, gap report `docs/03-architecture/architecture-gap-report.md`
- Execution backlog: `.ai/tasks.md`
- Version: `package.json` `"version": "3.0.5"` · schema v74 in `main/db.ts`
- Fork: `origin` → `codewithsharma/FloCafe`, `upstream` → `FreeOpenSourcePOS/FloCafe`

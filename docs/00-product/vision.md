# Nexora Product Vision

> **Canonical strategy:** [`STRATEGY.md`](../../STRATEGY.md) (CEO+CTO mandate 2026-08-12).  
> **Do not blur:** Nexora POS (current) ≠ Nexora RestaurantOS (future).

## CURRENT PRODUCT — Nexora POS (v3.0.5)

A **mature local-first café POS with KDS and operational management capabilities** — Electron desktop, SQLite, offline billing. Evidence: `package.json`, `main/index.ts`, schema v71, `STRATEGY.md`.

**Honest description (use this):** local-first, offline-capable restaurant and café POS designed to keep businesses operating when the internet is unavailable.

Core value today:
- Counter and table service on one machine
- SQLite persistence with automatic migration and backup
- Kitchen display (KDS), kitchen stations, KOT printing
- ESC/POS receipt printing (USB, network, WebUSB)
- Customer CRM, loyalty, discounts, configurable tax packs
- Staff roles, shifts, cash reconciliation, day close
- Optional cloud coordination (FloAdmin), Google Drive backup, WhatsApp bill delivery
- English, Spanish, Brazilian Portuguese UI

MIT / free core; no tiered feature gating in code. Packaging brand names (FloCafe / Flo POS / Nexora) are being consolidated toward **Nexora** — no mass rename without a migration plan.

**Not current product:** RestaurantOS, AI-powered POS, multi-location platform, multi-tenant SaaS, aggregator platform, ERP.

## FUTURE PLATFORM — Nexora RestaurantOS

RestaurantOS evolves Nexora POS into a **production-grade restaurant operating platform** while preserving local-first foundations. **Not** a greenfield rewrite. Work starts only after pilot KPI: **3 cafés × 30 days × zero critical failures**.

Planned depth (PLANNED — not built): inventory ledger, recipes/BOM, procurement, multi-location (ADR-006 first), cloud ops, accounting, payment terminals, aggregators, advanced analytics, optional AI.

### Guiding principles

1. **Local-first remains default** — billing and kitchen must work without internet (`docs/cloud-v2-plan.md`).
2. **Incremental evolution** — extend `main/` + `frontend/`; no premature microservices.
3. **Single-tenant per install today → optional multi-location later** — no `locations` table; ADR-006 before code.
4. **AI is P3 / optional** — core POS must function without AI; no AI until reliability is proven.
5. **Data safety** — additive migrations; customer data survives upgrades (`AGENTS.md`).

### Branding map

| Aspect | CURRENT | FUTURE |
|--------|---------|--------|
| Product | **Nexora POS** | **Nexora RestaurantOS** |
| Scope | Single-location POS + KDS + ops (shifts/cash/day close) | Full restaurant ops platform |
| Architecture | LAN servers, 1 SQLite DB per install | Same core; extended modules |
| Cloud | Optional FloAdmin coordination | Enhanced cloud ops (PLANNED; never blocks billing) |
| Inventory | Product-level stock | Ledger + BOM + purchasing (PLANNED) |

## Evidence

- Strategy: `STRATEGY.md`
- Execution backlog: `.ai/tasks.md`
- Version: `package.json` `"version": "3.0.5"` · schema v71 in `main/db.ts`
- Fork: `origin` → `codewithsharma/FloCafe`, `upstream` → `FreeOpenSourcePOS/FloCafe`

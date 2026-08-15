# Operavia Product Vision

> **Canonical strategy:** [`STRATEGY.md`](../../STRATEGY.md) (updated 2026-08-14).
> **Canonical product plan:** [`capability-matrix.md`](capability-matrix.md).
> **Platform brand:** **Operavia**. **Operavia POS** is retired as an active product name.
> **Do not blur:** Operavia Restaurant (CURRENT Phase 1) ≠ multi-vertical Operavia platform (TARGET).

## Guiding statement

> **Operavia is a modular business platform designed to power multiple industry-specific products from a single shared codebase. Business capabilities are implemented as reusable modules, while vertical products are compositions of those modules configured for specific industries.**

**Motto:** Build once. Reuse everywhere. Fix once. Benefit everywhere. Compose without duplication.

See [opervia-platform.md](opervia-platform.md) · [verticals.md](verticals.md) · [principles.md](principles.md) · [ADR-010](../14-decisions/ADR-010-opervia-platform.md).

## CURRENT PRODUCT — Operavia Restaurant (Phase 1)

A **mature local-first café POS with KDS and operational management capabilities** — Electron desktop, SQLite, offline billing. Evidence: `package.json` (`productName: Operavia`), `main/index.ts`, schema **v79**, `STRATEGY.md`.

**Honest description (use this):** local-first, offline-capable restaurant and café POS (Operavia Restaurant vertical) designed to keep businesses operating when the internet is unavailable.

Core value today:

- Counter and table service on one machine
- SQLite persistence with automatic migration and backup
- Kitchen display (KDS), kitchen stations, KOT printing
- ESC/POS receipt printing (USB, network, WebUSB)
- Customer CRM, loyalty, discounts, configurable tax packs
- Staff roles, shifts, cash reconciliation, day close
- Optional cloud coordination (FloAdmin), Google Drive backup, WhatsApp bill delivery
- English, Spanish, Brazilian Portuguese UI

MIT / free core; no tiered feature gating in code. Packaging/UI brand consolidates to **Operavia**. Repo/fork identity may still say FloCafe.

**Not current product:** finished multi-vertical platform, Operavia Custom composer, AI-powered POS, multi-location platform, multi-tenant SaaS, aggregator platform, ERP.

## FUTURE — Operavia modular platform

After pilot KPI (**3 cafés × 30 days × zero critical failures**), deepen modular verticals beyond Restaurant. **Operavia Retail** already exists as a deploy/start composition (`ACTIVE_VERTICAL_ID=retail`) with shared commerce modules — retail-native UX depth is still incomplete. Additional verticals (Grocery, Salon, Health & Beauty, Pharmacy, Hospitality, Custom) remain PLANNED.

Restaurant depth vs freeze is in [`capability-matrix.md`](capability-matrix.md): 🟡 Hardening first; 🔵 Planned includes 86 depth, recipes/BOM, procurement, QR ordering; 🔴 Frozen remains terminals, gateways, multi-location; ⚪ Later remains aggregators, AI, reservations. Ledger UI at `/products/movements` is already 🟢 Existing.

### Guiding principles

1. **Local-first remains default** — billing and kitchen must work without internet (`docs/cloud-v2-plan.md`).
2. **Incremental evolution** — extend `main/` + `frontend/`; no premature microservices.
3. **Composition over duplication** — build capabilities once; verticals enable modules via configuration.
4. **Single-tenant per install today → optional multi-location later** — no `locations` table; ADR-006 before code.
5. **AI is P3 / optional** — core POS must function without AI; no AI until reliability is proven.
6. **Data safety** — additive migrations; customer data survives upgrades (`AGENTS.md`).
7. **Backward compatibility with Phase 1** — do not break Operavia Restaurant for the sake of architecture.

### Branding map

| Aspect              | CURRENT                                                            | TARGET                                             |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Brand               | **Operavia**                                                       | **Operavia** (unchanged)                           |
| Product you install | **Operavia Restaurant** (default); Retail selectable via env       | Deeper retail UX + more verticals after pilots     |
| Scope               | Single-location POS + KDS + ops (shifts/cash/day close/refunds)    | Modular platform; multi-vertical composition       |
| Architecture        | LAN servers, 1 SQLite DB, module registry + fail-closed remount    | Same core; optional package extraction later       |
| Cloud               | Optional FloAdmin coordination                                     | Enhanced cloud ops (PLANNED; never blocks billing) |
| Inventory           | Product stock + v75 movement ledger API + `/products/movements` UI | BOM + purchasing (PLANNED)                         |
| Retired names       | Operavia POS, Flo POS (active use)                                 | Historical audits may retain old names             |

## Evidence

- Strategy: `STRATEGY.md`
- Product plan: `docs/00-product/capability-matrix.md`
- Platform docs: `docs/00-product/opervia-platform.md`, gap report `docs/03-architecture/architecture-gap-report.md`
- Execution backlog: `.ai/tasks.md`
- Version: `package.json` `"version": "3.0.5"` · schema **v79** in `main/db.ts`
- Fork: `origin` → `codewithsharma/FloCafe`, `upstream` → `FreeOpenSourcePOS/FloCafe`

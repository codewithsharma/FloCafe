# RestaurantOS Vision

## CURRENT STATE (FloCafe v3.0.5)

FloCafe is a **local-first, offline-capable Electron desktop POS** for single-location cafés and restaurants. Evidence: `package.json`, `README.md`, `main/index.ts`.

Core value today:
- Counter and table service on one machine
- SQLite persistence with automatic migration and backup
- Kitchen display (KDS), kitchen stations, KOT printing
- ESC/POS receipt printing (USB, network, WebUSB)
- Customer CRM, loyalty points, discounts, configurable tax packs
- Optional cloud coordination (FloAdmin), Google Drive backup, WhatsApp bill delivery
- English, Spanish, Brazilian Portuguese UI

FloCafe is **free, open-source (MIT)**, with no tiered feature gating in code.

## TARGET STATE (RestaurantOS)

RestaurantOS evolves FloCafe into a **production-grade restaurant operating platform** while preserving its local-first foundation. RestaurantOS is **not** a greenfield rewrite.

### Guiding principles

1. **Local-first remains default** — billing and kitchen operations must work without internet (`docs/cloud-v2-plan.md`, billing-never-blocks rule).
2. **Incremental evolution** — extend existing `main/` + `frontend/` architecture; no microservices unless proven necessary.
3. **Single-tenant per install today → optional multi-location later** — current schema has no `locations` table (`main/db.ts`); multi-location is PLANNED.
4. **AI is optional** — core POS must function without AI (`docs/10-ai/ai-requirements.md`).
5. **Data safety** — migrations remain additive; customer data survives upgrades (`AGENTS.md`).

### RestaurantOS north star

A restaurant operator can run daily service—order taking, kitchen fulfillment, payment, reporting, inventory awareness, staff management—from a reliable desktop platform, with optional cloud management and integrations when connectivity allows.

### What changes vs FloCafe branding

| Aspect | CURRENT | TARGET |
|--------|---------|--------|
| Product name | Flo Cafe / FloCafe | RestaurantOS (working title) |
| Scope | Single-location POS + KDS | Full restaurant ops platform |
| Architecture | 3 LAN servers, 1 SQLite DB | Same core; extended modules |
| Cloud | Optional FloAdmin coordination | Enhanced cloud management (PLANNED) |
| Inventory | Product-level stock tracking | Recipe/BOM, purchasing (PLANNED) |

## Evidence

- Repository fork: `origin` → `codewithsharma/FloCafe`, `upstream` → `FreeOpenSourcePOS/FloCafe`
- Version: `package.json` `"version": "3.0.5"`
- Architecture diagram: `README.md` Development section

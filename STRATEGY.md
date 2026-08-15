---
name: Operavia
last_updated: 2026-08-15
---

# Operavia Strategy

## Platform

**Operavia** is the canonical platform and product brand: a modular business platform that powers industry-specific verticals from a single shared codebase.

> Operavia is a modular business platform designed to power multiple industry-specific products from a single shared codebase. Business capabilities are implemented as reusable modules, while vertical products are compositions of those modules configured for specific industries.

**Motto:** Build once. Reuse everywhere. Fix once. Benefit everywhere. Compose without duplication.

**Phase 1 vertical (CURRENT):** **OPERAVIA Restaurant** — local-first Electron café/restaurant POS (formerly branded Operavia POS / Flo POS / FloCafe). Those names are **retired** as an active product name.

**Future verticals (PLANNED):** Grocery, Salon, Health & Beauty, Pharmacy, Hospitality, Custom. **Retail** is a production-selectable composition (`ACTIVE_VERTICAL_ID=retail`) with partial UX — see [`docs/00-product/verticals.md`](docs/00-product/verticals.md).

**Restaurant capability plan:** [`docs/00-product/capability-matrix.md`](docs/00-product/capability-matrix.md) (Existing / Hardening / Planned / Later / Frozen). Does not authorize implementation.  
**Complete Restaurant OS blueprint (R0):** [`docs/00-product/restaurant-os-blueprint.md`](docs/00-product/restaurant-os-blueprint.md) · [`docs/00-product/restaurant-os-roadmap.md`](docs/00-product/restaurant-os-roadmap.md) (R0–R16). Docs only until an R-wave is authorized.  
**Architecture vision:** [`docs/00-product/opervia-platform.md`](docs/00-product/opervia-platform.md) · ADR-010 · gap report in `docs/03-architecture/architecture-gap-report.md`.  
**Active development vertical:** **Operavia Restaurant only.** Retail and other verticals are deferred (maintenance isolation only unless critically broken).  
**Do not** rewrite Phase 1 into packages/microservices before pilot reliability is proven.  
**Do not** invent Phase 4.16 — use R-waves for sequencing.

## Target problem

Café and restaurant operators lose money and trust when their POS depends on the internet, seat fees, or cloud lock-in — and when financial workflows (refunds, cash, shifts) are incomplete or untrustworthy during real service.

## Our approach

Ship a boringly reliable local-first desktop POS (Electron + SQLite) as **Operavia Restaurant** that keeps billing, kitchen, and cash ops running offline; prove it with real cafés before expanding modular depth and additional verticals.

## Who it's for

**Primary (Phase 1):** Owner-operator of a single-location café or small restaurant — hiring Operavia Restaurant to take orders, run the kitchen, collect payment, reconcile cash, and recover from failure without calling a developer.

## Key metrics

- **Pilot reliability** - 3 cafés × 30 days × zero critical operational failures
- **Financial correctness** - payments, refunds, shifts, day close, and reports match reality
- **Offline continuity** - normal POS operations complete with no internet
- **Recovery** - backup → destroy DB → restore restores business continuity
- **Unaided usability** - staff complete core workflows without developer assistance

## Tracks

### Production hardening (P0)

Refunds, void/cancel audit, money-path correctness, LAN security, JWT secret design, Electron sandbox justification.

_Why it serves the approach:_ Trust and financial safety are the gate to any pilot.

### Pilot readiness (P1)

Cash drawer, backup/restore verification, failure testing, critical E2E, install/ops docs, three real café deployments.

_Why it serves the approach:_ Reliability is proven only in live service, not in feature lists.

### Modular platform + Restaurant depth (P2 — after pilots)

Lightweight module registry / vertical composition (declarative first), inventory ledger, recipes/BOM, purchasing, cloud ops (non-blocking), multi-location ADR before code. Additional verticals only after Restaurant composition model is real.

_Why it serves the approach:_ Platform depth only after the POS is trusted.

### Deferred intelligence & integrations (P3)

Payment terminals, aggregators, accounting export, AI — adapters on top of a reliable core. Operavia Custom (module composer) is long-term only.

_Why it serves the approach:_ Avoids building impressive surfaces on untrusted money paths.

## Milestones

- **2026-Q3** - Operavia Restaurant v1.0 candidate: refunds + financial/security hardening + tests green
- **2026-Q3/Q4** - Pilot-ready release: install, backup/restore, recovery, operator docs
- **+30 days post-pilot start** - 3 cafés × 30 days × zero critical failures → earn modular depth + additional vertical work

## Not working on

- AI / LLM features until core POS reliability is proven
- Swiggy / Zomato / ONDC / aggregator ingest
- Multi-tenant SaaS or premature multi-location implementation (ADR-006 first)
- ERP inventory / full procurement until an authorized `capability-matrix.md` slice (recipes/BOM/PO are Planned there, not auto-started)
- Bluetooth printing, payment terminals, microservices, Kubernetes, architecture rewrites
- Building Operavia Custom or additional verticals before Restaurant pilot success
- Describing an unfinished build as a finished multi-vertical platform you install today
- Keeping **Nexora** / **FloCafe** as active product names (retired; historical audits may still say them)
- Auto-starting R1+ or inventing Phase 4.16 without authorization

## Marketing

**One-liner:** Operavia Restaurant — local-first café POS that keeps your restaurant running when the internet does not.

**Key message:** Operavia is the platform. Operavia Restaurant is the Phase 1 vertical you install today. Moat = reliability, offline billing, data ownership — not AI. Additional verticals compose shared modules later.

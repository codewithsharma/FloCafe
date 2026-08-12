---
name: Nexora POS
last_updated: 2026-08-12
---

# Nexora POS Strategy

## Target problem

Café and restaurant operators lose money and trust when their POS depends on the internet, seat fees, or cloud lock-in — and when financial workflows (refunds, cash, shifts) are incomplete or untrustworthy during real service.

## Our approach

Ship a boringly reliable local-first desktop POS (Electron + SQLite) that keeps billing, kitchen, and cash ops running offline; prove it with real cafés before expanding into RestaurantOS.

## Who it's for

**Primary:** Owner-operator of a single-location café or small restaurant — hiring Nexora POS to take orders, run the kitchen, collect payment, reconcile cash, and recover from failure without calling a developer.

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

### RestaurantOS foundation (P2 — after pilots)

Inventory ledger first, then recipes/BOM, purchasing, cloud ops (non-blocking), multi-location ADR before code.

_Why it serves the approach:_ Platform depth only after the POS is trusted.

### Deferred intelligence & integrations (P3)

Payment terminals, aggregators, accounting export, AI — adapters on top of a reliable core.

_Why it serves the approach:_ Avoids building impressive surfaces on untrusted money paths.

## Milestones

- **2026-Q3** - Nexora POS v1.0 candidate: refunds + financial/security hardening + tests green
- **2026-Q3/Q4** - Pilot-ready release: install, backup/restore, recovery, operator docs
- **+30 days post-pilot start** - 3 cafés × 30 days × zero critical failures → earn RestaurantOS work

## Not working on

- AI / LLM features until core POS reliability is proven
- Swiggy / Zomato / ONDC / aggregator ingest
- Multi-tenant SaaS or premature multi-location implementation (ADR-006 first)
- ERP inventory / full procurement before ledger foundation
- Bluetooth printing, payment terminals, microservices, Kubernetes, architecture rewrites
- Describing the current product as RestaurantOS, AI-powered, or multi-location

## Marketing

**One-liner:** Local-first café POS that keeps your restaurant running when the internet does not.

**Key message:** Nexora POS is a mature single-location desktop POS with KDS and ops management. Nexora RestaurantOS is the future platform — not the product you install today. Moat = reliability, offline billing, data ownership — not AI.

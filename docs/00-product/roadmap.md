# Roadmap

Priorities: **P0** foundational · **P1** critical · **P2** important · **P3** future

## Phase 0 — Documentation & baseline (CURRENT)

**Status:** In progress

- Complete evidence-based documentation (`docs/`)
- Establish current-state vs target-state conventions
- No application code changes

## Phase 1 — Production hardening (P0–P1)

| Item | Priority | Depends on | Status |
|------|----------|------------|--------|
| LAN security documentation & pairing | P1 | — | PARTIAL (audit exists) |
| Extract db migrations from monolith | P0 | — | NOT STARTED |
| Order/bill service extraction | P1 | Tests | NOT STARTED |
| Coverage metrics for payment/tax paths | P1 | — | NOT STARTED |
| Renderer sandbox evaluation | P2 | — | NOT STARTED |

## Phase 2 — Operational completeness (P1–P2)

| Item | Priority | Status |
|------|----------|--------|
| Shift management & cash drawer | P1 | NOT BUILT |
| General audit logging | P1 | PARTIAL |
| Refund workflow | P1 | NOT BUILT |
| Enhanced reporting exports | P2 | PARTIAL |

## Phase 3 — Inventory evolution (P1–P2)

| Item | Priority | Status |
|------|----------|--------|
| Stock movement ledger | P1 | NOT BUILT |
| Low-stock alerts (UI) | P2 | PARTIAL (API filter exists) |
| Recipe/BOM | P2 | NOT BUILT |
| Suppliers & purchasing | P3 | NOT BUILT |

## Phase 4 — Scale & integrations (P2–P3)

| Item | Priority | Status |
|------|----------|--------|
| Multi-location schema | P2 | NOT BUILT |
| Cloud config management | P2 | PARTIAL (FloAdmin sync) |
| Payment terminal integration | P2 | NOT BUILT |
| Online ordering API | P3 | NOT BUILT |
| Accounting export (CSV/API) | P2 | NOT BUILT |

## Phase 5 — Optional AI (P3)

| Item | Priority | Status |
|------|----------|--------|
| Demand forecasting | P3 | NOT BUILT |
| Anomaly detection | P3 | NOT BUILT |
| NL analytics queries | P3 | NOT BUILT |

All AI features are **optional** and must not block core POS.

## Inherited from upstream FloCafe

Per `README.md` Direction section:
- Tax and country support expansion
- Inventory and loyalty workflow improvements
- Companion device improvements

Track upstream via `upstream` remote: `FreeOpenSourcePOS/FloCafe`.

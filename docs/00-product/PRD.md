# Product Requirements Document

## Document status

- **Operavia CURRENT STATE:** v3.0.5 (verified `package.json`); schema **v75**
- **TARGET STATE:** Modular platform depth after pilots — see `vision.md`, `roadmap.md`, `STRATEGY.md`

## Executive summary

Operavia Restaurant is a production-grade local-first café/restaurant POS (Electron + SQLite + Express). The modular registry and deploy/start verticals (`restaurant`, `retail`) extend that foundation without rewriting Phase 1.

## Current product (Operavia Restaurant)

Single-location, offline-first desktop POS with KDS, printing, CRM, loyalty, tax packs, shifts, day close, money refunds, and optional cloud/WhatsApp/Drive integrations. Evidence: `docs/00-product/feature-list.md`.

**Also available:** Operavia Retail as `ACTIVE_VERTICAL_ID=retail` (shared commerce composition; partial retail UX).

## Target product (platform depth)

Same local-first core plus: inventory ledger UI, recipes/BOM, procurement, multi-location readiness (ADR-006), integration surfaces — phased per `STRATEGY.md`. Do not treat TARGET items as shipped.

## Success metrics (TARGET / pilot)

| Metric                  | Target                                     |
| ----------------------- | ------------------------------------------ |
| Pilot reliability       | 3 cafés × 30 days × zero critical failures |
| Order completion uptime | 99.9% during service hours                 |
| Migration success rate  | 100% on upgrade-path tests                 |
| Payment integrity       | Zero decimal drift (existing tests)        |
| Offline operation       | Full POS without network                   |

## Out of scope (now)

Microservices, mandatory cloud, AI-dependent core flows, payment terminals, aggregators — see `STRATEGY.md` “Not working on.”

## Traceability

Requirements → `01-requirements/` · Architecture → `03-architecture/` · Feature truth → `feature-list.md` · Strategy → `STRATEGY.md`

# Product Requirements Document

## Document status
- **FloCafe CURRENT STATE:** v3.0.5 (verified `package.json`)
- **RestaurantOS TARGET STATE:** Evolution plan — see `vision.md`, `roadmap.md`

## Executive summary

RestaurantOS evolves the FloCafe fork into a production-grade restaurant operating platform. The existing Electron + SQLite + Express architecture remains the foundation.

## Current product (FloCafe)

Single-location, offline-first desktop POS with KDS, printing, CRM, loyalty, tax packs, and optional cloud/WhatsApp integrations. Evidence: `docs/00-product/feature-list.md`.

## Target product (RestaurantOS)

Same local-first core plus: shift management, refunds, inventory ledger, audit logging, multi-location readiness, and integration surfaces — phased per `roadmap.md`.

## Success metrics (TARGET)

| Metric | Target |
|--------|--------|
| Order completion uptime | 99.9% during service hours |
| Migration success rate | 100% on upgrade-path tests |
| Payment integrity | Zero decimal drift (existing tests) |
| Offline operation | Full POS without network |

## Out of scope

Microservices, mandatory cloud, AI-dependent core flows.

## Traceability

Requirements → `01-requirements/` · Architecture → `03-architecture/` · Gaps → `15-project-management/implementation-plan.md`

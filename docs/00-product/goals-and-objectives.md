# Goals and Objectives

## CURRENT STATE goals (FloCafe — achieved)

1. **Free open-source POS** — MIT license, no paywalled features (`LICENSE`)
2. **Offline-first operation** — SQLite local DB (`README.md`)
3. **Single-machine restaurant ops** — POS + KDS + printing
4. **International tax support** — signed tax packs (`docs/tax-packs.md`)
5. **Cross-platform desktop** — Windows, macOS, Linux (`electron-builder` config)

## TARGET STATE goals (RestaurantOS)

### P0 — Foundational
- Preserve data safety across all schema changes
- Maintain backward compatibility with FloCafe databases
- Document all subsystems with evidence-based current state

### P1 — Critical
- Shift and cash reconciliation workflows
- Refund and void audit trail
- Production observability (structured logging, correlation IDs — partial in cloud plan)

### P2 — Important
- Ingredient-level inventory and stock ledger
- Multi-location schema design (not required for v1 RestaurantOS)
- Payment terminal abstraction

### P3 — Future
- Online ordering integration
- Optional AI analytics module

## Non-goals
- Replacing SQLite for single-terminal installs
- SaaS-only deployment model

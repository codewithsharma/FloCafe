# Goals and Objectives

## CURRENT STATE goals (Opervia Restaurant — largely achieved)

1. **Free open-source POS** — MIT license, no paywalled features (`LICENSE`)
2. **Offline-first operation** — SQLite local DB (`README.md`)
3. **Single-machine restaurant ops** — POS + KDS + printing
4. **International tax support** — signed tax packs (`docs/tax-packs.md`)
5. **Cross-platform desktop** — Windows, macOS, Linux (`electron-builder` config)
6. **Shifts, cash recon, day close, refunds** — M4–M6 (built; pilot validation still open)

## TARGET STATE goals (Opervia platform depth)

### P0 — Foundational

- Preserve data safety across all schema changes
- Maintain backward compatibility with existing Opervia/FloCafe databases
- Keep product docs truthful (`feature-list.md`, `verticals.md`)

### P1 — Critical (pilot)

- Prove KPI: 3 cafés × 30 days × zero critical failures
- Cash drawer kick; failure/recovery matrix; signed production artifacts
- Production observability expansion

### P2 — Important

- Inventory ledger UI; recipes/BOM; suppliers/PO
- Multi-location schema design (ADR-006 first)
- Retail-native UX depth beyond composition switch

### P3 — Deferred

- Payment terminals, aggregators, AI — after reliability proven (`STRATEGY.md`)

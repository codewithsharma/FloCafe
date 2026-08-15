# Goals and Objectives

## CURRENT STATE goals (Operavia Restaurant — largely achieved)

1. **Free open-source POS** — MIT license, no paywalled features (`LICENSE`)
2. **Offline-first operation** — SQLite local DB (`README.md`)
3. **Single-machine restaurant ops** — POS + KDS + printing
4. **International tax support** — signed tax packs (`docs/tax-packs.md`)
5. **Cross-platform desktop** — Windows, macOS, Linux (`electron-builder` config)
6. **Shifts, cash recon, day close, refunds** — M4–M6 (built; pilot validation still open)

## TARGET STATE goals (Operavia platform depth)

### P0 — Foundational

- Preserve data safety across all schema changes
- Maintain backward compatibility with existing Operavia/FloCafe databases
- Keep product docs truthful (`capability-matrix.md` plan, `feature-list.md` code, `verticals.md`)

### P1 — Critical (pilot)

- Prove KPI: 3 cafés × 30 days × zero critical failures
- Cash drawer kick; failure/recovery matrix; signed production artifacts
- Production observability expansion

### P2 — Important

- 🟡 Hardening first (void/discounts/receipts, KDS offline, permissions, restore) per `capability-matrix.md`
- 🔵 Planned depth (86, recipes/BOM, PO/receiving, QR ordering) only as authorized slices
- Multi-location schema design (ADR-006 first)
- Retail-native UX depth beyond composition switch

### P3 — Deferred

- Payment terminals, aggregators, AI — after reliability proven (`STRATEGY.md`)

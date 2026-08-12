# Scalability

## CURRENT STATE

FloCafe targets **single-location, single-primary-machine** deployment.

| Dimension | Current limit | Evidence |
|-----------|---------------|----------|
| Locations | 1 | No location entity |
| Concurrent POS terminals | 1 writer (SQLite) | better-sqlite3 sync |
| KDS clients | Multiple readers + WS | WAL mode |
| Waiter devices | Multiple via :3003 proxy | server-app.ts |
| Order volume | Stress test CSV exists | `test-data/stress-products.csv` |
| Database size | SQLite practical limits | No sharding |

### LAN scaling
Multiple tablets can use KDS (:3002) and Server App (:3003) against one POS machine.

## TARGET STATE

### Multi-location (PLANNED)
- Hub-and-spoke: cloud config + aggregated reporting
- Each location retains local SQLite for offline billing
- Sync conflict resolution TBD — not designed yet

### When to reconsider architecture
- >5 simultaneous write terminals at one location
- Centralized reporting across >50 locations
- Sub-second cross-location inventory sync

Until then: **retain monolithic Electron architecture**.

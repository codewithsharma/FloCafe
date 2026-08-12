# Project Risks

## CURRENT STATE risks

| ID | Risk | Likelihood | Impact | Mitigation (existing) | Evidence |
|----|------|------------|--------|----------------------|----------|
| R-01 | Data loss on failed migration | Low | Critical | Pre-migration auto-backup | `main/db.ts` runMigrations |
| R-02 | LAN token interception | Medium | High | JWT + CORS; no TLS | SEC-01 |
| R-03 | Renderer compromise | Low | High | contextIsolation, no nodeIntegration | SEC-02 |
| R-04 | WhatsApp session theft | Low | Medium | OS dir permissions; not encrypted | SEC-05 |
| R-05 | better-sqlite3 ABI mismatch | Medium | Medium | Electron test runner, verify script | `run-electron-node-test.cjs` |
| R-06 | Concurrent DB write conflicts | Low | Medium | WAL + busy_timeout 5000ms | `main/db.ts` |
| R-07 | Cloud outage blocks nothing | Low | Low | Outbox pattern, offline-first | `cloud-sync.ts` |
| R-08 | Baileys breaking change | Medium | Medium | Optional feature; tests exist | whatsapp tests |
| R-09 | Schema newer than app | Low | High | SchemaVersionMismatchError | `main/db.ts` |
| R-10 | Unsigned Windows installer | Medium | Medium | User education; SmartScreen | SEC-03 |

## TARGET STATE risks (RestaurantOS evolution)

| ID | Risk | Mitigation plan |
|----|------|-----------------|
| R-11 | Multi-location schema migration breaks upgrades | Additive migrations only; upgrade-path tests |
| R-12 | Feature scope creep delays production readiness | Phased roadmap; P0/P1 gates |
| R-13 | Inventory module complexity | Start with stock ledger; defer full BOM |
| R-14 | AI cost/quality unpredictability | Optional module; guardrails doc |

## Operational risks

| Risk | Notes |
|------|-------|
| Single machine failure | No HA; backup/restore is primary recovery |
| Printer driver issues | Documented in README troubleshooting |
| Long service day memory | No profiling data; monitor in production |

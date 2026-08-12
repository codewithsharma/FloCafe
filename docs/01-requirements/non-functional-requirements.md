# Non-Functional Requirements

## CURRENT STATE

| ID | Category | Requirement | Evidence |
|----|----------|-------------|----------|
| NFR-C-01 | Availability | Core POS functions without internet | README, SQLite local |
| NFR-C-02 | Performance | SQLite WAL mode for concurrent access | `main/db.ts` |
| NFR-C-03 | Security | JWT per-installation secret | `settings.jwt_secret` |
| NFR-C-04 | Security | Rate limiting on auth endpoints | `middleware/security.ts` |
| NFR-C-05 | Data integrity | Pre-migration backup | `runMigrations()` |
| NFR-C-06 | Portability | Windows, macOS, Linux builds | electron-builder |
| NFR-C-07 | i18n | en, es, pt UI | `frontend/src/lib/i18n/` |
| NFR-C-08 | Maintainability | 95+ backend test files | `tests/` |

## TARGET STATE

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-T-01 | Observability | Structured logs with correlation IDs for print/cloud failures |
| NFR-T-02 | Security | TLS or VPN-only mode for LAN deployments on untrusted networks |
| NFR-T-03 | Scalability | Multi-location config sync without blocking local billing |
| NFR-T-04 | Testability | Code coverage reporting on payment/tax/auth paths |

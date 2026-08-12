# Technical Debt Register

## CURRENT STATE — Verified debt

| ID | Area | Description | Severity | Evidence |
|----|------|-------------|----------|----------|
| TD-01 | Database | `main/db.ts` is a monolith (~4500+ lines): schema, 66 migrations, utilities | HIGH | `main/db.ts` |
| TD-02 | Architecture | Business logic mixed in route handlers | MEDIUM | `main/routes/orders.ts`, `bills.ts` |
| TD-03 | Architecture | No repository layer; direct SQL everywhere | MEDIUM | All routes |
| TD-04 | Security | LAN traffic unencrypted (HTTP/WS) | MEDIUM | `docs/security-audit-2.7.0.md` SEC-01 |
| TD-05 | Security | Electron renderer sandbox disabled | MEDIUM | SEC-02 |
| TD-06 | Security | Windows installer unsigned without cert | MEDIUM | SEC-03, `release.yml` |
| TD-07 | Dependencies | WhatsApp via Baileys RC | MEDIUM | `package.json` |
| TD-08 | Testing | No code coverage measurement | LOW | No nyc/c8 |
| TD-09 | Testing | Some tests not in default `npm test` | LOW | `integration-inclusive-tax.test.ts` |
| TD-10 | Schema | Partial FK coverage; logical refs without constraints | LOW | `main/db.ts` |
| TD-11 | Docs | API.md may drift from actual routes | LOW | `docs/API.md` vs `main/routes/` |
| TD-12 | CI | `main/migrations/**` referenced but empty | INFO | CI path filter |
| TD-13 | Specs | Private `specs` repo referenced, not in tree | INFO | `AGENTS.md`, cloud plan |

## INFERRED debt

| ID | Description | Rationale |
|----|-------------|-----------|
| TD-14 | Settings stored as flat key-value | Hard to validate/version settings schema |
| TD-15 | Dual printing paths (main + WebUSB) | Complexity for operators troubleshooting |

## Remediation priorities (RestaurantOS)

| Priority | Item | Approach |
|----------|------|----------|
| P0 | TD-01 | Extract migrations to separate module files (no behavior change) |
| P1 | TD-04 | Document LAN trust model; plan TLS for shared Wi-Fi |
| P1 | TD-02 | Extract order/bill services with existing test coverage |
| P2 | TD-05 | Sandbox enablement spike on main + KDS windows |
| P2 | TD-08 | Add coverage reporting for critical paths |
| P3 | TD-11 | Generate API spec from route registry |

## Do NOT refactor prematurely

- SQLite → PostgreSQL (no proven need for single terminal)
- Express → NestJS (disproportionate migration cost)
- Microservices extraction

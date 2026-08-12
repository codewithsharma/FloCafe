# Security Testing

## CURRENT STATE

| Test | Focus |
|------|-------|
| security-hardening.test.ts | CSP, auth boundaries |
| cors-security.test.ts | CORS allowlist |
| url-allowlist.test.ts | External URL validation |
| staff-authz.test.ts | Staff RBAC |
| orders-authz.test.ts | Order operation RBAC |
| authz-matrix-phase3.test.ts | Comprehensive matrix |
| customer-auth.test.ts | Customer endpoint auth |
| jwt-logout-lifecycle.test.ts | Token lifecycle |
| master-pin.test.ts | Master PIN policy |

CI: dependency-review on PRs (high severity fails).

Manual: `docs/security-audit-2.7.0.md`

## TARGET STATE
- Periodic OWASP ZAP scan against local API
- Fuzz test for SQL injection on search endpoints

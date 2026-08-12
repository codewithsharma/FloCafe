# Security Overview

## CURRENT STATE

Based on `docs/security-audit-2.7.0.md` and code review.

### Strengths
- Per-install JWT secrets
- Token revocation and staleness checks
- Role-based authorization with regression tests
- CORS restricted to private IPs + localhost
- CSP blocks remote scripts; contextIsolation enabled
- SSRF protection on URL fetch endpoints
- Tax pack Ed25519 signature verification
- Master PIN for destructive operations
- Rate limiting on auth paths
- DB export redacts secrets

### Open findings
| ID | Severity | Issue |
|----|----------|-------|
| SEC-01 | MEDIUM | LAN traffic not encrypted |
| SEC-02 | MEDIUM | Renderer sandbox disabled |
| SEC-03 | MEDIUM | Unsigned Windows installer (without cert) |
| SEC-04 | LOW | Incomplete repo scanning (CodeQL) |
| SEC-05 | LOW | WhatsApp credentials not OS-encrypted |

### Privacy defaults (CURRENT STATE)

**VERIFIED:** New installs seed `telemetry_enabled='true'` and `diagnostics_consent='true'` (`main/db.ts` `seedInstallDefaults()`). Owners can disable in Settings → Privacy. This is **default-on**, not opt-in — a product/privacy concern for strict-consent jurisdictions.

## TARGET STATE
- TLS for LAN or documented VPN-only deployment
- Renderer sandbox enabled
- Code signing mandatory for Windows releases
- General audit log for financial operations

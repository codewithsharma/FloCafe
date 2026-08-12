# Security Requirements

## CURRENT STATE (implemented)

| ID | Requirement | Verification |
|----|-------------|--------------|
| SR-C-01 | All API routes require auth except allowlist | security-hardening.test.ts |
| SR-C-02 | Passwords hashed with bcrypt | auth.ts |
| SR-C-03 | SQL parameterized queries | code review |
| SR-C-04 | CORS blocks public origins | cors-security.test.ts |
| SR-C-05 | External URLs validated | url-allowlist.test.ts |
| SR-C-06 | Destructive ops require master PIN | master-pin tests |
| SR-C-07 | Auth rate limited | security middleware |
| SR-C-08 | Explicit consent before telemetry/diagnostics transmission | privacy-consent.test.ts |

## TARGET STATE

| ID | Requirement | Priority |
|----|-------------|----------|
| SR-T-01 | Encrypt LAN traffic or mandate VPN | P1 |
| SR-T-02 | Enable Electron renderer sandbox | P2 |
| SR-T-03 | Encrypt WhatsApp credentials with safeStorage | P2 |
| SR-T-04 | Enable GitHub CodeQL + secret scanning | P2 |
| SR-T-05 | Audit log for payment/refund/void actions | P1 |

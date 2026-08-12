# Authentication

## CURRENT STATE

### Mechanism
JWT Bearer tokens via `jsonwebtoken`.

### Login
`POST /api/auth/login` with email/password.
Optional `remember_me` extends expiry to 10 days (default 24h).

### Token storage
Frontend: `localStorage` (axios interceptor in `frontend/src/lib/api.ts`)

### Token payload
`{ userId, email, role, jti }`

### Secret
Per-installation random 32-byte hex in `settings.jwt_secret`.

### Invalidation
| Event | Mechanism |
|-------|-----------|
| Logout | `revoked_tokens` table |
| Password/PIN change | `tokens_valid_after` timestamp |
| User deactivated | `getUserAuthStatus()` rejection |
| Role change | Fresh DB lookup on each request |

### First-run
No users exist until `POST /api/auth/setup/initialize`.

### Rate limiting
Auth endpoints rate-limited including from private IPs.

**Evidence:** `main/routes/auth.ts`, `main/middleware/security.ts`, `tests/jwt-logout-lifecycle.test.ts`

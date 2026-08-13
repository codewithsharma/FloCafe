# Secrets Management

## CURRENT STATE (post P0.2)

| Secret | Storage | Evidence |
|--------|---------|----------|
| JWT secret | Electron `safeStorage` → `userData/jwt-secret.enc` | `main/services/jwt-secret.ts` |
| Password hashes | `users.password` column (bcrypt) | `main/routes/staff.ts` |
| PIN hashes | `users.pin_hash` (bcrypt) | staff routes |
| Master PIN | Electron safeStorage → `master-pin.enc` | `master-pin.ts` |
| Google Drive tokens | OS-encrypted file | `google-drive.ts` |
| WhatsApp session | Local directory (not encrypted) | SEC-05 |
| Cloud credentials | settings + encrypted fields | cloud-sync.ts |

### Environment variables
- `JWT_SECRET` — **CI/test/controlled only** (`ELECTRON_RUN_AS_NODE`, `NODE_ENV=test`, or `FLO_ALLOW_JWT_SECRET_ENV=1`). Forbidden in packaged production.
- `PORT`, `KDS_PORT`, `SERVER_APP_PORT` — server ports
- `MAS_BUILD` — Mac App Store build flag

### Operator notes
- Same-machine DB restore keeps `jwt-secret.enc` in userData → sessions remain valid.
- New machine / missing `.enc` → owner recovery (`/api/auth/jwt-secret/recover`) generates a new secret; re-login required.
- Linux production needs a desktop credential store for `safeStorage` (libsecret/kwallet). Headless without keyring is not a supported production mode for JWT secrets.
- Do not upload `jwt-secret.enc` to Google Drive or external backup.

## TARGET STATE
- Encrypt WhatsApp session material with safeStorage (SEC-05)
- Never log tokens or PII

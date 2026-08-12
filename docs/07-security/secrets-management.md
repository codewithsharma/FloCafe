# Secrets Management

## CURRENT STATE

| Secret | Storage | Evidence |
|--------|---------|----------|
| JWT secret | `settings.jwt_secret` (random per install) | auth.ts |
| Password hashes | `users.password_hash` (bcrypt) | staff routes |
| PIN hashes | `users.pin_hash` (bcrypt) | staff routes |
| Master PIN | Electron safeStorage | master-pin.ts |
| Google Drive tokens | OS-encrypted file | google-drive.ts |
| WhatsApp session | Local directory (not encrypted) | SEC-05 |
| Cloud credentials | settings + encrypted fields | cloud-sync.ts |

### Environment variables
- `JWT_SECRET` — optional override
- `PORT`, `KDS_PORT`, `SERVER_APP_PORT` — server ports
- `MAS_BUILD` — Mac App Store build flag

### .env files
Not committed (`.gitignore`). No `.env.example` in repo root (UNKNOWN).

## TARGET STATE
- Document required env vars in `11-devops/configuration.md`
- Encrypt all third-party session material with safeStorage
- Never log tokens or PII

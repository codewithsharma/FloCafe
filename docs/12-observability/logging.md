# Logging

## CURRENT STATE

### Backend

`electron-log` — file-based logging in main process.

Access: Help → Open Logs Folder (README troubleshooting).

Printer failures log `[Printer]` lines with error details.

Shared Express/domain logger: `main/lib/logger.ts` (pino).

- Development → `pino-pretty`
- Production → structured JSON
- Request logging via `pino-http` (`main/middleware/http-observability.ts`) with request IDs; redacts auth/payment secrets

### Frontend

Browser console in dev; limited production logging.

### Structured logging

`pino` used for Baileys/WhatsApp subsystem and Express HTTP logs.

### Sensitive data

DB exports redact passwords, PIN hashes, JWT secrets (security audit verified).
HTTP logs redact authorization headers, passwords, tokens, CVV, and similar paths.

## TARGET STATE

- Structured JSON logs with correlation IDs (partial — request id + optional OTel trace id)
- Log rotation policy
- Never log tokens, PINs, or customer PII

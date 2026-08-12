# Logging

## CURRENT STATE

### Backend
`electron-log` — file-based logging in main process.

Access: Help → Open Logs Folder (README troubleshooting).

Printer failures log `[Printer]` lines with error details.

### Frontend
Browser console in dev; limited production logging.

### Structured logging
`pino` used for Baileys/WhatsApp subsystem.

### Sensitive data
DB exports redact passwords, PIN hashes, JWT secrets (security audit verified).

## TARGET STATE
- Structured JSON logs with correlation IDs (partial — cloud v2 plan)
- Log rotation policy
- Never log tokens, PINs, or customer PII

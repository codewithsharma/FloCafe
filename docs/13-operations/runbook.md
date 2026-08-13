# Runbook (short troubleshooting)

**Full pilot guide:** [`pilot-runbook.md`](./pilot-runbook.md)  
**Incidents:** [`incident-response.md`](./incident-response.md)

## Unexpected setup or DATABASE RECOVERY REQUIRED

1. **STOP** taking orders/payments.
2. **DO NOT** complete setup / create a new owner.
3. Follow REC-01 recovery in `pilot-runbook.md` / `disaster-recovery.md`.
4. Restore correct backup with Master PIN.
5. Open an incident.

## App won't start

1. Check logs: Help → Open Logs Folder
2. Note app version and OS
3. Do NOT delete `flo.db`
4. If recovery UI: restore latest known-good backup (Master PIN)
5. If schema mismatch: install matching or newer app version
6. Escalate if no backup

## Migration failed

1. App creates pre-migration backup automatically
2. Find backup in `{userData}/backups/`
3. Restore via Database Tools (Master PIN)
4. Report issue with version + logs

## Printers not working

See README.md Troubleshooting → Printers not printing

## KDS not connecting

1. Verify KDS enabled in Settings
2. Confirm `network_mode` is `kds_lan` or `lan` if tablets are remote
3. Confirm **staff-only** LAN — **never guest Wi‑Fi** (OPS-01)
4. Try `http://<pos-ip>:3002/kds-standalone` on staff network
5. Check firewall on ports 3001–3003

## Database locked (503)

Maintenance operation in progress — wait or restart app.

## WhatsApp disconnected

Settings → WhatsApp → reconnect; check paired phone online.

## Suspected JWT / credential compromise

1. Stop affected sessions where practical
2. Owner rotates/recovers JWT secret with Master PIN (product APIs)
3. Force staff re-login
4. Escalate — see `incident-response.md`

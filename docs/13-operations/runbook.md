# Runbook

## App won't start

1. Check logs: Help → Open Logs Folder
2. Note app version and OS
3. Do NOT delete flo.db
4. Restore latest backup: Settings → Database Tools
5. If schema mismatch: install matching or newer app version

## Migration failed

1. App creates pre-migration backup automatically
2. Find backup in userData/backups/
3. Restore via Database Tools
4. Report issue with version + logs

## Printers not working

See README.md Troubleshooting → Printers not printing

## KDS not connecting

1. Verify KDS enabled in Settings
2. Check same LAN as POS machine
3. Try http://\<pos-ip\>:3002/kds-standalone
4. Check firewall on ports 3001-3003

## Database locked (503)

Maintenance operation in progress — wait or restart app.

## WhatsApp disconnected

Settings → WhatsApp → reconnect; check paired phone online.

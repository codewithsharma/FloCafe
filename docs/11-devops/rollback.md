# Rollback

## CURRENT STATE

### Application rollback
- Install previous version from GitHub Releases
- Database forward-only migrations — **downgrade not supported**
- If new version fails: restore pre-migration backup

### Database rollback
1. Settings → Database Tools → Restore backup
2. Or IPC `restoreBackup`
3. Pre-migration auto-backups in userData

### Release rollback
Publish previous tag artifacts from GitHub Releases.

### Cloud
Tax pack rollback via `POST /api/tax-packs/:packId/rollback`

## TARGET STATE
- Document rollback runbook for failed migration (see 13-operations/runbook.md)
- electron-updater downgrade policy

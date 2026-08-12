# Maintenance

## CURRENT STATE

### Updates
- electron-updater for direct-download builds
- App Store / Microsoft Store for store builds
- Database migrates on first launch of new version

### Database maintenance
- GET /api/db-tools/health-check
- POST /api/db-tools/apply-safe-fixes
- npm run audit:db (diagnostic)

### Maintenance lock
API returns 503 during backup/restore/initialize.

### Scheduled tasks
None built-in — operator responsibility.

## TARGET STATE
- Optional auto-backup before update
- Maintenance window notification

# Backup and Restore

## CURRENT STATE

### Methods
1. **Manual backup:** Settings → Database Tools → Backup
2. **API:** POST /api/db/backup, GET /api/db/download
3. **IPC:** electronAPI.backupDatabase (desktop)
4. **Google Drive:** Optional scheduled backup (`google-drive.ts`)
5. **Pre-migration:** Automatic before schema changes

### Restore
- Settings → Database Tools → Restore
- IPC restoreBackup
- API POST /api/db/import (owner + master PIN)

### Location
OS userData directory (separate from app install).

### Tests
`tests/backup-restore.test.ts`, `backup-restore-production.test.ts`

## TARGET STATE
- Document backup schedule recommendation (daily minimum)
- Verify backup integrity on create

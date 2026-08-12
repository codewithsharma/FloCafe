# Disaster Recovery

## CURRENT STATE

### RPO (Recovery Point Objective)
Last backup — manual or Google Drive scheduled.

Pre-migration auto-backups reduce migration RPO.

### RTO (Recovery Time Objective)
Time to restore backup + restart app (~minutes).

### Disaster scenarios
| Scenario | Recovery |
|----------|----------|
| Hardware failure | Restore backup on new machine |
| DB corruption | Restore backup; audit:db diagnostic |
| Bad migration | Pre-migration auto-backup |
| Accidental initialize | Only if backup exists (master PIN gated) |
| Cloud deletion | Local data retained; cloud re-register |

### Untested (UNKNOWN)
- Full machine loss with no backup

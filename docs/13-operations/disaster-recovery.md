# Disaster Recovery

## CRITICAL — REC-01

**IF AN EXISTING POS SUDDENLY SHOWS FIRST-TIME SETUP:**

1. **STOP.**
2. **DO NOT COMPLETE SETUP.**
3. **DO NOT TAKE PAYMENTS.**
4. **ENTER RECOVERY** (this build shows **DATABASE RECOVERY REQUIRED** when the install marker is present and `flo.db` is missing/empty).
5. **RESTORE THE CORRECT BACKUP** (Master PIN + Database Tools / recovery screen).

Never treat an unexpected setup wizard as a successful reset.

See: `docs/15-project-management/p1.2-rec-01-recovery-audit.md`.

---

## CURRENT STATE

### RPO (Recovery Point Objective)
Last backup — manual or Google Drive scheduled.

Pre-migration auto-backups reduce migration RPO.

### RTO (Recovery Time Objective)
Time to restore backup + restart app (~minutes).

### Disaster scenarios
| Scenario | Recovery |
|----------|----------|
| Hardware failure | Restore backup on new machine; expect JWT `recovery_required` without `jwt-secret.enc` |
| DB missing (REC-01) | Recovery UI / restore — **do not** run first-time setup |
| DB corruption | Restore backup; audit:db diagnostic |
| Bad migration | Pre-migration auto-backup |
| Accidental initialize | Only if backup exists (master PIN gated); marker cleared → intentional FIRST_INSTALL |
| Cloud deletion | Local data retained; cloud re-register |

### Same-machine restore
Keep `jwt-secret.enc` + Master PIN; restore `.db`; login should work.

### New-machine restore
Restore `.db`; Master PIN must be set/known; JWT recover API (owner + PIN) — no silent secret mint.

### Untested / residual
- Full machine loss with no backup and no Master PIN knowledge
- Corrupt-but-openable live DB still allows app start with health warnings (pre-existing)

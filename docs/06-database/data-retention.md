# Data Retention

## CURRENT STATE

**No automated data retention/purge policy implemented.**

### Deletion patterns
- Soft delete: categories, products, customers (`deleted_at`)
- Staff deactivation: `users.deactivated_at`
- Table deactivation: `tables.deactivated_at`
- Token cleanup: expired entries in `revoked_tokens` (v55 index on expires_at)

### Backup retention
Manual — operator manages backup files via Database Tools.

### Cloud deletion
`POST /api/settings/cloud/delete-data` — cloud-side deletion flow with status polling.

### WhatsApp messages
Stored in `whatsapp_messages` — no auto-purge found.

## TARGET STATE (PROPOSED)
- Configurable retention for print_logs, diagnostics outbox
- GDPR-style customer data export/delete workflow
- Archive orders older than N years to separate file

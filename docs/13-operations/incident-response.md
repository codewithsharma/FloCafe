# Incident Response

## CURRENT STATE

### Severity levels (PROPOSED for RestaurantOS)

| Level | Example | Response |
|-------|---------|----------|
| S1 | Cannot process payments | Restore backup; use manual receipts |
| S2 | KDS down | Use printed KOT; refresh KDS |
| S3 | Reports wrong | Continue service; fix post-service |
| S4 | WhatsApp down | Continue service; print receipts |

### Communication
- GitHub Issues for software defects
- Support tickets via in-app outbox (cloud v2)

## TARGET STATE
- Defined on-call for multi-location cloud hub only
- Local POS incidents handled by venue staff via runbook

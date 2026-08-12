# Webhooks

## CURRENT STATE

**NOT IMPLEMENTED.** FloCafe does not expose inbound webhooks.

Outbound event delivery uses:
- `cloud_sync_outbox` → FloAdmin (`main/services/cloud-sync.ts`)
- `support_ticket_outbox` → support system
- `store_diagnostics_outbox` → diagnostics

## TARGET STATE (PLANNED)

| Webhook | Priority | Use case |
|---------|----------|----------|
| order.completed | P2 | Online ordering integration |
| inventory.low_stock | P2 | External alerting |
| shift.closed | P2 | Accounting sync |

Design should use durable outbox pattern (same as cloud sync).

# System Design

## CURRENT STATE

### Process model
Single OS process (Electron main) hosts:
- 3 HTTP servers (Express 5)
- 1 WebSocket handler (shared KDS service)
- SQLite connection (single writer)
- Background timers (cloud sync, telemetry, Google Drive)

### Request flow (POS checkout)
```
Renderer → axios POST /api/bills/generate
         → POST /api/bills/:id/payments
         → main/routes/bills.ts
         → better-sqlite3 transaction
         → optional notifyKdsUpdate()
         → optional printReceipt()
```

### Failure modes
| Failure | Behavior |
|---------|----------|
| DB maintenance | 503 on API; KDS WS disconnected |
| Port in use | Fallback +10 ports (`server.ts`) |
| Cloud unreachable | Outbox queues; billing continues |
| Printer offline | Error with stage classification (`thermal.ts`) |

## TARGET STATE
- Extract `OrderService`, `BillService`, `InventoryService` from routes
- Event hooks for integrations (webhook outbox — PLANNED)

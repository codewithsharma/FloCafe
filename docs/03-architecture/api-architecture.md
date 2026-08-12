# API Architecture

## CURRENT STATE

- **Style:** REST JSON over HTTP
- **Base:** `http://<host>:3001/api`
- **Auth:** Bearer JWT (global except `/api/auth/*`, `/api/health`, product image GET)
- **Realtime:** WebSocket `ws://<host>:3001/kds` (also :3002 on KDS server)

### Route registry
`main/routes/index.ts` mounts 30 routers under `/api/*`.

### Error format
JSON `{ error: string }` — consistent pattern in route handlers.

### Idempotency
- Orders: `Idempotency-Key` header → `order_idempotency`
- Payments: `Idempotency-Key` header → `payment_idempotency`

### Companion servers
- KDS (:3002): subset of auth + KDS endpoints
- Server App (:3003): proxies to :3001 with waiter auth

## TARGET STATE
- OpenAPI spec generated from route registry (PROPOSED)
- Webhook delivery outbox (PLANNED)
- Versioned API prefix `/api/v2` only if breaking changes required

# Task Breakdown

## Phase 0 — Documentation (CURRENT)
- [x] Repository safety check
- [x] Codebase discovery
- [x] Generate docs/ structure
- [ ] Team review of gap analysis

## Phase 1 — P0 Foundation
- [ ] Extract migrations from db.ts to main/migrations/
- [ ] Add .env.example
- [ ] Generate OpenAPI spec from routes (script)
- [ ] Add c8 coverage for bills/orders/auth

## Phase 2 — P1 Operations
- [ ] Design shifts schema + API
- [ ] Implement shift open/close UI
- [ ] Design audit_logs schema
- [ ] Implement refund workflow
- [ ] Stock movement ledger (append-only)

## Phase 3 — P2 Scale
- [ ] Multi-location schema RFC
- [ ] Payment terminal adapter interface
- [ ] Accounting CSV export
- [ ] TLS LAN spike

## Phase 4 — P3 Future
- [ ] Online ordering webhook outbox
- [ ] AI module RFC (optional)

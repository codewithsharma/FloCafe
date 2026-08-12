# Implementation Plan — RestaurantOS Gap Closure

> **Authoritative roadmap:** [`master-implementation-plan.md`](master-implementation-plan.md)  
> This file is a **summary view**. If anything conflicts, the master plan wins.

## Gap analysis summary

Full feature inventory: [`00-product/feature-list.md`](../00-product/feature-list.md).

| Current capability | Limitation | RestaurantOS target | Required change | Priority | Dependencies |
|--------------------|------------|---------------------|-----------------|---------|--------------|
| Single-location POS | One DB per machine | Multi-location ops | Location entity, sync design (RFC only) | P2 | Phase 1 ops stable |
| Product stock count | No ledger/recipes | Inventory ledger | `stock_movements` table | **P2** | Engineering baseline |
| Payment recording | Manual methods only | Terminal integration | Payment adapter interface | P2 | Vendor SDK eval |
| Partial payments | Works per bill | Shift-level reconciliation | Shift + audit integration | P1 | Shift management |
| Void/cancel | No refund entity | Refund workflow | Refund table + API + UI | **P1** | Audit log |
| Print/tax audit | Partial logs | Full audit trail | `audit_logs` table | **P1** | Engineering baseline |
| Privacy defaults | Telemetry/diagnostics default-on | Explicit consent model | Settings + legal review | **P1** | Product/legal |
| JWT auth | LAN cleartext | Secure LAN | TLS or VPN guide | P1 | — |
| db.ts monolith | Hard to maintain | Modular migrations | Extract migrations | **Eng P1 / Product P3** | Tests pass |
| Reports API | Basic aggregates | Export/accounting | CSV/API export | P2 | Shifts + refunds |
| Cloud sync | Coordination only | Config management | Extend cloud-sync | P2 | FloAdmin |
| No shift tracking | Cash blind spot | Shift management | `shifts` table + UI | **P1** | Audit log |
| Service charge | Tax infra only | Configurable POS charge | Order charge UI + API | P2 | Tax engine |
| Bluetooth print | Not implemented | Optional transport | Printer driver work | P3 | Hardware eval |
| AI | None | Optional analytics | Separate module | P3 | Report data |

## Execution order (from master plan)

1. **Phase 0 (P0):** Engineering baseline — coverage, CI gates, backup verification
2. **Phase 1 (P1):** Privacy consent → audit log → shifts → day close → refunds → void audit → cash drawer
3. **Eng P1 (parallel):** Migration extraction, OpenAPI script — **not blocking** Phase 1
4. **Phase 2–4 (P2):** Stock ledger, procurement, payment terminals, service charge
5. **Phase 5 (P2):** Multi-location RFC — **design only**
6. **Phase 6–8 (P3):** Online ordering, analytics, optional AI

See [`master-implementation-plan.md`](master-implementation-plan.md) §5 for phase details and §17 for the first 10 milestones.

## Upstream sync strategy

- Track `upstream` (FreeOpenSourcePOS/FloCafe) for bug fixes
- RestaurantOS-specific features on `develop` branch
- Cherry-pick or merge upstream releases regularly

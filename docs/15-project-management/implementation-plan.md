# Implementation Plan — RestaurantOS Gap Closure

## Gap analysis summary

See table below. Full feature inventory: `00-product/feature-list.md`.

| Current capability | Limitation | RestaurantOS target | Required change | Priority | Dependencies |
|--------------------|------------|---------------------|-----------------|---------|--------------|
| Single-location POS | One DB per machine | Multi-location ops | Location entity, sync design | P2 | Cloud hub design |
| Product stock count | No ledger/recipes | Inventory management | stock_movements, ingredients | P1 | — |
| Payment recording | Manual methods only | Terminal integration | Payment adapter interface | P2 | Vendor SDK eval |
| Void/cancel | No refund entity | Refund workflow | Refund table + API + UI | P1 | Audit log |
| Print/tax audit | Partial logs | Full audit trail | audit_logs table | P1 | — |
| JWT auth | LAN cleartext | Secure LAN | TLS or VPN guide | P1 | — |
| db.ts monolith | Hard to maintain | Modular migrations | Extract migrations | P0 | Tests pass |
| Reports API | Basic aggregates | Export/accounting | CSV/API export | P2 | — |
| Cloud sync | Coordination only | Config management | Extend cloud-sync | P2 | FloAdmin |
| No shift tracking | Cash blind spot | Shift management | shifts table + UI | P1 | — |
| AI | None | Optional analytics | Separate module | P3 | Report data |

## Phase 1 execution order (recommended)

1. **P0:** Extract migrations; document API; baseline metrics
2. **P1:** Shift management → audit log → refunds → stock ledger
3. **P2:** Multi-location schema design; payment terminal adapter; reporting exports
4. **P3:** Online ordering; AI module; delivery integrations

## Upstream sync strategy
- Track `upstream` (FreeOpenSourcePOS/FloCafe) for bug fixes
- RestaurantOS-specific features on `develop` branch
- Cherry-pick or merge upstream releases regularly

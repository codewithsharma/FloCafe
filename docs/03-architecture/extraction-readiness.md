# Extraction Readiness

**Status:** DOCUMENTATION (Phase 2.7)
**Date:** 2026-08-13

This is an architecture map — **not** a mandate to extract packages.

Coupling: **LOW** | **MEDIUM** | **HIGH**

## Summary

| Module | Coupling | Recommended future action |
|--------|----------|---------------------------|
| Customer | MEDIUM | Extract after phone util boundary + loyalty read API |
| Product | HIGH | Stabilize remaining tax/inventory column ownership |
| Inventory | **MEDIUM** | Service boundary exists; ledger before package |
| Tax | **MEDIUM** | Facade + discount scale centralized; freeze snapshots / finish HTTP consolidation |
| POS | HIGH | Orchestrator — extract last among commerce |
| Tables | MEDIUM | Clear order FK contract; restaurant package candidate |
| KDS | HIGH | WS + order stream contract required |

## Detail

### Customer — MEDIUM

- **Deps:** core; reads loyalty ledger
- **DB:** `customers` (clean)
- **Frontend:** customers page + POS search/modals
- **Route coupling:** customers router + search/CRM in `index.ts`
- **Blockers:** shared `lib/phone.ts`; CRM helpers inlined in `index.ts`
- **Action:** Extract search/CRM into customer routes; document loyalty read port

### Product — HIGH

- **Deps:** core, category
- **DB:** `products` also holds inventory + tax fields
- **Frontend:** products workspace + POS grid
- **Blockers:** inventory columns; tax category FKs; menu CSV writes
- **Action:** Split stock/tax concerns before package cut

### Inventory — MEDIUM (was HIGH in Phase 2.6)

- **Deps:** product
- **DB:** columns on `products` only (no ledger)
- **Service:** `main/services/inventory.ts` (Phase 2.7)
- **Routes:** none dedicated (stock adjust still on products; orders call Inventory)
- **Blockers:** no ledger; columns colocated with product
- **Action:** Optional stock ledger before package extraction

### Tax — MEDIUM (was HIGH in Phase 2.6)

- **Deps:** core
- **DB:** pack tables + denormalized tax on products/orders/bills
- **Services:** `tax.ts` (facade + adapters + discount scale), `tax-engine.ts`
- **Blockers:** preview/categories still partially in `index.ts`; deep money-path use
- **Action:** Finish consolidating tax HTTP; freeze snapshot contract

### POS — HIGH

- **Deps:** product, order, payment
- **Routes:** thin `pos-info`; real sell path is orders/bills UI
- **Frontend:** large `components/pos/*`
- **Blockers:** orchestration across domains; not a single backend package
- **Action:** Treat as composition shell; extract domains underneath first

### Tables — MEDIUM

- **Deps:** order
- **DB:** `tables`; `orders.table_id`
- **Frontend:** tables page + POS picker + server-standalone
- **Blockers:** order FK; dine-in workflow flags (`tables_required`)
- **Action:** Define table↔order port; good restaurant vertical package later

### KDS — HIGH

- **Deps:** order, kitchen, product
- **Services:** WebSocket notify in `kds.ts`
- **Frontend:** kds + kds-standalone
- **Blockers:** live order stream; kitchen station assignment in `db.ts`
- **Action:** Explicit KDS event/port interface before extraction

## Explicitly deferred

Package extraction, npm workspaces, multi-repo modules, marketplace, lifecycle, fail-closed deps, inventory ledger schema.

## Related

- [phase-2.7-domain-boundaries.md](phase-2.7-domain-boundaries.md)
- [module-contract.md](module-contract.md)
- [module-ownership.md](module-ownership.md)

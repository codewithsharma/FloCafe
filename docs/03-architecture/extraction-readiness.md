# Extraction Readiness

**Status:** DOCUMENTATION (Phase 2.13)
**Date:** 2026-08-13

This is an architecture map — **not** a mandate to extract packages.

Coupling: **LOW** | **MEDIUM** | **HIGH**

## Summary

| Module | Coupling | Recommended future action |
|--------|----------|---------------------------|
| Customer | MEDIUM | Extract after phone util boundary + loyalty read API |
| Inventory | **MEDIUM** | Writes + ledger + history read API; stock columns still on products |
| Product | HIGH | Tax **config refs** owned as persistence only (2.13); stock writes via Inventory; columns still colocated |
| Tax | **MEDIUM** | Snapshot + facade + clearer Product config boundary (2.13); denormalized snapshots + money-path orchestration remain |
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

### Inventory — MEDIUM (Phase 2.12 history read complete)

- **Deps:** product
- **DB:** `products` stock columns + append-only `inventory_movements` (schema v75+)
- **Service:** `main/services/inventory.ts` (all app stock writes + `listInventoryMovements`)
- **Routes:** `main/routes/inventory.ts` (`GET /api/inventory/movements`); stock adjust/create/PUT still on products
- **Blockers:** columns colocated with product; no backfill; no Inventory UI; current-stock reads still product SQL; order txn orchestration
- **Action:** Optional UI / column split before package cut

Phase 2.12 added Inventory-owned history HTTP. Rating stays **MEDIUM** — not HIGH.

### Product — HIGH (Phase 2.13 ownership map clearer)

- **Deps:** core, category
- **DB:** `products` also holds inventory + tax **config** fields (stock **writes** via Inventory; tax calc not on Product)
- **Frontend:** products workspace + POS grid
- **Blockers:** tax config columns colocated; menu CSV; physical stock column colocation; legacy `tax_type`/`tax_rate`
- **Action:** Optional legacy column removal / stock column port later — extraction still HIGH

Phase 2.13 clarified Product owns persistence of tax config refs only (no calculate / no tax-engine). Rating stays **HIGH**.

### Tax — MEDIUM (Phase 2.13 ownership map clearer)

- **Deps:** core
- **DB:** pack tables + denormalized tax on products/orders/bills
- **Services:** `tax.ts` (facade + adapters + discount scale + frozen snapshot types), `tax-engine.ts`
- **Routes:** `main/routes/tax.ts` (`/api/tax/*`); pack lifecycle remains `tax-packs.ts`
- **Blockers:** denormalized snapshots still co-owned with Order/Bill rows; product hosts config columns; deep money-path orchestration
- **Action:** Prefer Tax facade (done); optional digest-in-snapshot later; historical bill immutability characterized in 2.13

Phase 2.11 froze `EngineTaxSnapshot`; Phase 2.13 clarified Product config vs Tax calc vs historical snapshot. Rating stays **MEDIUM** — clearer map, not package-ready.

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

Package extraction, npm workspaces, multi-repo modules, marketplace, lifecycle, fail-closed deps, inventory movement UI, ledger backfill.

## Related

- [phase-2.8-inventory-ledger.md](phase-2.8-inventory-ledger.md)
- [phase-2.9-product-inventory-boundary.md](phase-2.9-product-inventory-boundary.md)
- [phase-2.13-product-tax-ownership.md](phase-2.13-product-tax-ownership.md)
- [module-contract.md](module-contract.md)
- [module-ownership.md](module-ownership.md)

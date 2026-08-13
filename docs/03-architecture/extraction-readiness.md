# Extraction Readiness

**Status:** DOCUMENTATION (Phase 2 **COMPLETE** / [final exit gate](phase-2-final-exit-gate.md))
**Date:** 2026-08-13

This is an architecture map — **not** a mandate to extract packages.

Coupling: **LOW** | **MEDIUM** | **HIGH**

## Summary

| Module | Coupling | Recommended future action |
|--------|----------|---------------------------|
| Customer | MEDIUM | Extract after phone util boundary + loyalty read API |
| Inventory | **MEDIUM** | Writes + ledger + history read API; stock columns still on products |
| Product | HIGH | Tax config refs as persistence only; stock writes via Inventory |
| Tax | **MEDIUM** | Facade + snapshot; denormalized snapshots remain |
| Order | **LOW–MEDIUM** | Ownership facade + cancel/restore on orderRoutes (2.14); create/add-items still fat routes |
| Payment | **MEDIUM** (tender) / LOW (package) | `payment-tender` extracted (2.15); generate/print/split still in bills.ts |
| POS | HIGH | Orchestrator (2.16 coordinator); extract last among commerce |
| Tables | MEDIUM | Soft-gated from Order/Payment (2.17); order FK remains |
| KDS | HIGH | Soft-gated notify; WS + order stream still coupled |

## Phase 2 COMPLETE vs Phase 3 FUTURE

**Phase 2** established ownership, contracts, composition, Inventory/Tax/Order/Payment/POS seams, and synthetic Retail composition.

**Phase 3** should focus on: package ports, `db.ts` split, fail-closed remount, production Retail+, Inventory UI, void×cancel product fix, legacy tax columns.

## Related

- [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md)
- [phase-2-exit-gate.md](phase-2-exit-gate.md) (interim)
- [phase-2.14-order-domain-boundary.md](phase-2.14-order-domain-boundary.md)
- [phase-2.15-payment-domain-boundary.md](phase-2.15-payment-domain-boundary.md)
- [phase-2.16-pos-orchestration-boundary.md](phase-2.16-pos-orchestration-boundary.md)
- [phase-2.17-restaurant-isolation.md](phase-2.17-restaurant-isolation.md)
- [phase-2.18-synthetic-retail-validation.md](phase-2.18-synthetic-retail-validation.md)


## Detail

### Customer — MEDIUM

- **Deps:** core; reads loyalty ledger
- **DB:** `customers` (clean)
- **Frontend:** customers page + POS search/modals
- **Route coupling:** customers router + search/CRM helpers still partly in `index.ts`
- **Blockers:** shared `lib/phone.ts`; CRM helpers inlined in `index.ts`

### Inventory — MEDIUM

- **Service:** `main/services/inventory.ts` owns stock writes + history reads
- **Blockers:** columns on products; no backfill; void×cancel call-site pinned (2.14)

### Product — HIGH

- Tax config refs only; stock writes via Inventory; legacy `tax_type`/`tax_rate`

### Tax — MEDIUM

- Facade + `EngineTaxSnapshot`; denormalized snapshots co-owned with Order/Bill

### Order — LOW–MEDIUM (Phase 2.14)

- **Service:** `main/services/order.ts` ownership markers
- **Routes:** cancel/restore on `orderRoutes`; create/add-items still fat
- **Does not own:** Inventory stock, tax engine, payment tender, KDS/tables (soft-gated)

### Payment — MEDIUM tender (Phase 2.15)

- **Service:** `main/services/payment-tender.ts`
- **Does not own:** tax engine, inventory, KDS, tables (soft-gated), printing
- bills.ts still hosts generate/discount/print/split-check

### POS — HIGH (Phase 2.16)

- Coordinator extracts place/prepaid HTTP; page still owns retry/discount/print glue
- Does not own tax/stock/tender internals

### Tables — MEDIUM / KDS — HIGH

- Soft-gated from Order/Payment (2.17); still restaurant modules

## Explicitly deferred (Phase 3)

Package extraction, npm workspaces, fail-closed remount, production Retail+, inventory UI, ledger backfill, void×cancel product fix, `db.ts` split.

## Related (detail)

- [module-contract.md](module-contract.md)
- [module-ownership.md](module-ownership.md)

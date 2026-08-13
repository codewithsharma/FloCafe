# Phase 2.15 — Payment Domain Boundary

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.14 Order domain boundary

## Goal

Extract tender core from `bills.ts` into a Payment-owned service and soft-gate restaurant side effects (table free, KDS notify) behind module checks — **without** changing money / FIN-01 behavior.

## Ownership map

| Concern | Owner |
|---------|--------|
| Bill tender prepare / validate / apply | **Payment** (`main/services/payment-tender.ts`) |
| FIN-01 gross-outstanding, split allocation, idempotency | **Payment** |
| Wallet debit / loyalty cashback at settle | **Payment** (orchestration) |
| Cash classification helpers | **Payment** (`payment-cash.ts` — unchanged) |
| Refunds | **Refund** (`refund.ts` — unchanged) |
| Tax engine | **Tax** |
| Inventory / stock | **Inventory** |
| KDS push | **KDS** (soft-gated call site) |
| Tables / seating | **Tables** (soft-gated free-on-paid) |
| Printing | **Printing** |

Facade exports: `PAYMENT_OWNED_CONCERNS`, `PAYMENT_DOES_NOT_OWN`, `assertPaymentBoundaryInvariants()`, `preparePaymentBatch`, `applyPaymentBatch`.

## Soft-gates (vertical-neutral tender)

```ts
if (isModuleEnabled('kds')) notifyKdsUpdate();
if (isModuleEnabled('tables') && order.table_id) { /* free table */ }
```

| Vertical | `tables` | `kds` | Bill-paid side effects |
|----------|----------|-------|-------------------------|
| **restaurant** (ACTIVE production) | enabled | enabled | **Identical** to pre-2.15 |
| **retail-test** (synthetic only) | excluded | excluded | No table free / no KDS notify |

Production `ACTIVE_VERTICAL_ID` remains `restaurant`. `retail-test` is composition validation only — **not** production-enabled.

## What moved

| From | To |
|------|-----|
| `preparePaymentBatch` + helpers | `main/services/payment-tender.ts` |
| `applyPaymentBatch` + cashback | `main/services/payment-tender.ts` |

HTTP routes, Idempotency-Key hashing, and response mapping stay in `main/routes/bills.ts`.

## What did NOT change

- Money / FIN-01 / refund / tax math
- Schema (remains **v75**)
- API paths / contracts
- `payment-cash.ts`, `refund.ts`
- Package extraction (none)

## Tests

- `tests/payment-boundary.test.ts` — tender + FIN-01 + table free + ownership
- `tests/payment-without-restaurant.test.ts` — takeaway pay + composition soft-gate truth

```sh
npm run test:payment-boundary
```

## Extraction readiness

**MEDIUM** — tender core colocated; bills route still owns generate/discount/print/split; restaurant side effects soft-gated not extracted into event bus.

## Related

- [phase-2.14-order-domain-boundary.md](./phase-2.14-order-domain-boundary.md)
- [module-ownership.md](./module-ownership.md)
- [phase-2.5-vertical-composition-validation.md](./phase-2.5-vertical-composition-validation.md)

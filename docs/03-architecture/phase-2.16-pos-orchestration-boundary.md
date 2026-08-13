# Phase 2.16 — POS Orchestration Boundary

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.15 Payment domain boundary

## Goal

POS is an **orchestrator** composing Order / Payment / Tax / Inventory — not a domain owner. No POS backend god-service; keep `pos-info.ts` thin; do not reimplement tax/inventory/money on the client.

## Ownership map

| Concern | Owner |
|---------|--------|
| Checkout HTTP sequence (order → bill → pay) | **POS** (`frontend/src/lib/pos/checkout-coordinator.ts`) |
| Module capability gates (tables, addons, kds/kot) | **POS** (orchestration) |
| Cart / held-order / modal UX | **POS** (page) |
| Tax engine | **Tax** (server) |
| Inventory / stock | **Inventory** (server) |
| Payment tender internals (FIN-01, allocate, wallet) | **Payment** (`payment-tender.ts`) |
| Order create / items / discount HTTP | **Order** (server routes) |

Markers: `POS_OWNED` / `POS_DOES_NOT_OWN` in `frontend/src/lib/pos/orchestration.ts`.

## Soft-gates (restaurant UX identical when modules ON)

| Gate | Check | Restaurant (ACTIVE) |
|------|-------|---------------------|
| Tables | `isModuleEnabled('tables')` (existing) | enabled → identical |
| Addons / AddonModal | `isModuleEnabled('addons')` | enabled → identical |
| KOT print | `isFeatureAvailable('kds', kotPrintingEnabled)` | enabled ∧ flag → identical |

## What moved

| From | To |
|------|-----|
| Postpaid `api.post('/orders'…)` / items append | `placePostpaidOrder` |
| Prepaid order → discount → bill → payments sequence | `placePrepaidOrder` |

## What stayed in the page (CURRENT DEBT)

- UI state, toasts, held-order cleanup, print triggers
- Prepaid discount reconciliation (`GET /orders`, bill paid replay)
- Idempotency attempt localStorage
- Non-checkout flows (hold table, add-cart-to-order, payment-modal path)

Prefer a working thin seam over a 400-line page rewrite.

## What did NOT change

- Request payloads
- POS UI layout
- Backend Order / Payment / Tax / Inventory services
- Schema / money math
- Package extraction (none)

## Tests

```sh
npm run test:pos-orchestration-boundary
```

Source contract: `tests/pos-orchestration-boundary.test.ts` (flo-settings-module-gating style).

## Extraction readiness

**POS: HIGH → MEDIUM-HIGH** — checkout HTTP seam exists; page still owns retry/discount UX orchestration. Not package-ready.

## Related

- [phase-2.15-payment-domain-boundary.md](./phase-2.15-payment-domain-boundary.md)
- [module-ownership.md](./module-ownership.md)
- [docs/modules/README.md](../modules/README.md)

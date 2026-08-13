# Phase 2.18 — Synthetic Retail Validation

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Depends on:** [2.17 restaurant isolation](phase-2.17-restaurant-isolation.md), [2.15 payment](phase-2.15-payment-domain-boundary.md), [2.5 composition](phase-2.5-vertical-composition-validation.md)  
**Code:** `main/modules/fixtures/retail-test-vertical.ts`  
**Tests:** `tests/synthetic-retail-composition.test.ts`, `tests/shared-module-vertical-neutrality.test.ts`

## 1. Purpose

Strengthen `retail-test` as an **architecture validation fixture**, not a production vertical.

Prove: the same shared modules (Customer, Product, Inventory, Order, Payment, Tax, POS, …) can be composed **without** Restaurant modules — so future Opervia Retail does not copy Restaurant business logic.

## 2. CURRENT

| Fact | Value |
|------|-------|
| Id | `retail-test` |
| Name | Opervia Retail Test |
| Version | `0.0.0-test` |
| In `VERTICALS` | **No** |
| `ACTIVE_VERTICAL_ID` | Still `restaurant` |
| API `?verticalId=` | Ignored (always restaurant) |
| `business_type` mapping | `retail` / `retail-test` → restaurant |

Enabled modules (17): core, customer, product, category, inventory, pos, order, payment, refund, tax, shift, staff, loyalty, reporting, printing, notification, backup.

Explicitly excluded: tables, kitchen, kds, menu, addons.

## 3. What 2.18 added

- Catalog neutrality: no core/shared module lists a restaurant-kind dependency.
- Runtime ports: Order/Payment restaurant side effects are `isModuleEnabled` gated (2.15/2.17).
- Tests prove Order/Payment/POS/Inventory/Tax are enabled in retail-test and restaurant-only modules are not.
- Takeaway sell→pay without a table already characterized (`payment-without-restaurant.test.ts`).

## 4. TARGET vs DEFERRED

| CURRENT | TARGET (Phase 3) | DEFERRED |
|---------|------------------|----------|
| Synthetic composition + soft gates | Production Opervia Retail vertical | Fail-closed route unmount |
| Static Express mounts (all routes still registered) | Optional HTTP gating by vertical | Tenant / runtime vertical switch |
| dine-in remains an order type | Retail order types as needed | Custom builder / marketplace |

## 5. Architectural success criterion

> Can the same shared modules be composed into a non-Restaurant vertical without copying Restaurant business logic?

**Catalog + soft-gated side effects: YES.**  
**Production Retail product: NO (not this phase).**

## 6. Related

- [phase-2.5-vertical-composition-validation.md](phase-2.5-vertical-composition-validation.md)
- [phase-2.17-restaurant-isolation.md](phase-2.17-restaurant-isolation.md)
- [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md) (after 2.18 lands)

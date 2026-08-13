# Phase 2.11 — Tax Snapshot Contract Freeze

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.10 (`acf41f0`)

## 1. Current Tax domain contract

```
Product / Order / POS / tax-packs
        ↓
  main/services/tax.ts  (facade + adapters)
        ↓
  TaxEngine.calculate
        ↓
  EngineTaxSnapshot  (+ adapter wrappers)
        ↓
  persisted tax_snapshot / tax_breakdown / tax_amount
```

## 2. Tax facade

Preferred public boundary: `main/services/tax.ts`.

- `calculateTax(input)` → `TaxCalculation` (includes `snapshot`)
- `applyPayableRounding` re-exported
- Adapters: `calculateItemTax`, charge helpers, scale/invert/aggregate
- Types: `EngineTaxSnapshot`, `ItemTaxSnapshot`, `ChargeTaxSnapshot`, `DocumentTaxSnapshot`, `FrozenEngineTaxSnapshot`

Consumers must not import `tax-engine` directly (except Tax service + engine unit tests).

## 3. Snapshot fields

**`EngineTaxSnapshot`** (frozen):

| Field | Type |
| --- | --- |
| `packId` | string |
| `packVersion` | string |
| `effectiveFrom` | string |
| `taxRounding` | pack policy |
| `payableRounding` | pack policy |
| `appliedRuleIds` | string[] |
| `lines` | `TaxLineResult[]` |

**Line:** `lineId`, `categoryId`, `categorySource`, `taxBehavior`, `grossAmount`, `taxableBase`, `taxAmount`, `components[]`  
**Component:** `ruleId`, `label`, `type`, optional `rate`/`amountPer`, `baseRuleIds`, `amount`, `roundingRemainder`

**Wrappers:**

- Item: `+ merchantOverridesApplied[]`
- Charge: `+ chargeKind`, `configuredCategoryId`
- Document (orders/bills): JSON **array** of item/charge snapshots, or `null`

## 4. Field meanings

Engine money fields are **decimal strings**. Parallel `tax_breakdown` uses **numbers** for display. Snapshot is historical evidence of which pack/rules produced the tax; breakdown is the denormalized UI/report path.

## 5. Calculation semantics

Unchanged. Inclusive/exclusive/exempt resolution, compound rules, and category precedence remain in `TaxEngine`. Adapters now call `calculateTax` (behavior-identical).

## 6. Rounding semantics

- Engine tax rounding: pack `taxRounding` via Decimal HALF_UP family
- Payable: `applyPayableRounding`
- Money-path order discount item-tax scale: **Math.round** (sacred)
- Preview discount scale: Decimal HALF_UP (intentionally different)

## 7. Discount semantics

`scaleItemTaxForDiscountRatio` / `scaleItemTaxAfterOrderDiscount` unchanged. Goldens: 50@0.9→45; 22.50@20%→18.

## 8. Tax pack relationship

Snapshot stores `packId` / `packVersion` / rounding policies / applied rule IDs. Pack install/activate remains `tax-packs.ts`. Digests live on pack version rows, not on transaction snapshots (spec ideal deferred).

## 9. Persistence relationship

Columns unchanged: `orders` / `order_items` / `bills` `tax_snapshot` TEXT. No new tables/columns. Schema **v75**.

## 10. Historical-tax behavior

Paid/finalized bills are **not** rewritten when settings or packs change. Reports read stored bill JSON. Open-order charge tax may recompute from live pack using frozen charge category IDs — documented nuance, not fixed in 2.11.

## 11. Refund behavior

`RefundService` does not recalculate Tax or read `tax_snapshot`. Refunds operate on bill/payment money; tax columns on historical bills remain as stored. Unchanged.

## 12. Consumers

| Consumer | Uses |
| --- | --- |
| orders / bills / index cancel | Tax facade adapters + `applyPayableRounding` |
| tax-packs | `calculateTax` for validation/test-calc |
| tax routes | preview/categories via tax service |
| products / addons / menu-csv | category assign only |
| reports / printers | stored snapshots via tax-components |
| frontend POS | HTTP preview + display breakdown |

## 13. Direct engine imports

After 2.11: only `main/services/tax.ts` (+ `tests/tax-engine.test.ts`) import `tax-engine`. Routes use facade.

## 14. Vertical neutrality

Snapshot has no table/KOT/KDS/waiter/kitchen fields. Soft default `business_type \|\| 'restaurant'` remains a settings fallback, not a hard gate.

## 15. Future versioning strategy

**No `snapshotVersion` field now.** One live writer shape; dual-read via null snapshot + legacy breakdown. Add a contract version only on a breaking JSON change. Pack identity already versioned via `packId`/`packVersion`.

## 16. Known gaps

- Denormalized tax still on products/orders/bills
- Open-order charge recompute from live pack rates
- Spec digest/signature not in transaction snapshots
- Frontend `TaxSnapshot` type remains loose
- Preview vs money-path discount scale duality
- Extraction readiness stays **MEDIUM** (contract clearer, coupling remains)

## Schema

**No migration.** Still schema **v75**.

## Related

- [phase-2.10-tax-http-boundary.md](phase-2.10-tax-http-boundary.md)
- [phase-2.7-domain-boundaries.md](phase-2.7-domain-boundaries.md)
- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)

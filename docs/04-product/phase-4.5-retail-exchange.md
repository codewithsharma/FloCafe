# Phase 4.5 — Retail Exchange

**Date:** 2026-08-14  
**Status:** IMPLEMENTED  
**Policy:** [ADR-012](../14-decisions/ADR-012-retail-exchange-policy.md)  
**Discovery:** [phase-4.5-retail-exchange-discovery.md](phase-4.5-retail-exchange-discovery.md)  
**Baseline:** Phase 4.4 (`20b3b13`) · schema **v75** (unchanged)

---

## 1. Scope

Retail-only merchandise **exchange** composed from existing commerce operations. No exchange table, no exchange API, no net settlement.

**Leg order (mandatory):**

```text
1. Refund (original bill)
2. Replacement sale (new order → bill → payment)
3. Optional restock (ADR-011)
```

---

## 2. Architecture

| Layer               | Path                                                |
| ------------------- | --------------------------------------------------- |
| Return value math   | `main/lib/exchange-return-value.ts`                 |
| Idempotency keys    | `main/lib/exchange-idempotency.ts`                  |
| Coordinator         | `frontend/src/lib/exchange/coordinator.ts`          |
| Session persistence | `frontend/src/lib/exchange/session.ts`              |
| UI                  | `frontend/src/components/orders/ExchangeDialog.tsx` |
| Entry               | Orders page → Exchange (Retail only)                |
| Tests               | `tests/phase-4.5-retail-exchange.test.ts`           |

---

## 3. Return calculation

Per returned line:

```text
return_value = round((order_items.total / order_items.quantity) × return_qty, 2)
total_refund = sum(return_value)
```

- Requires explicit `order_item_id` + `quantity`
- Never infer quantity from refund amount
- Bill-level `POST /api/bills/:id/refund` unchanged

---

## 4. Replacement sale

- Current catalog prices via normal `POST /orders`
- Tax from server bill generate (not catalog estimate)
- No automatic discount carry-over
- Payment uses exact `bill.total` from generate response

---

## 5. Idempotency

`exchange_attempt_id` (UUID) per workflow. Per-leg keys:

| Leg     | Key                                          |
| ------- | -------------------------------------------- |
| Refund  | `exchange-{attemptId}-refund`                |
| Order   | `exchange-{attemptId}-order`                 |
| Payment | `exchange-{attemptId}-payment`               |
| Restock | `exchange-{attemptId}-restock-{orderItemId}` |

State persisted in `sessionStorage` (`operavia-exchange-attempt`) for recovery.

**Not atomic** — operational recovery model per ADR-012.

---

## 6. Coordinator states

| State                                                      | Meaning       |
| ---------------------------------------------------------- | ------------- |
| `refund_pending` / `refund_complete`                       | Money leg     |
| `replacement_pending` / `replacement_complete`             | New sale leg  |
| `restock_pending` / `restock_complete` / `restock_skipped` | Inventory leg |

Partial failure: retry uses same attempt id and leg keys; no automatic compensation.

---

## 7. Vertical behavior

| Vertical                | Exchange                      |
| ----------------------- | ----------------------------- |
| `retail`, `retail-test` | Exchange button + coordinator |
| `restaurant`            | No Exchange UI; restock 403   |

---

## 8. Schema / money / reporting

- Schema **v75** unchanged
- FIN-01, tax, day-close, accounting CSV unchanged
- Refund and replacement appear as independent financial records

---

## 9. Tests

```sh
npm run test:phase-4.5
```

Regression: phase-4.2 restock, financial reporting, day-close, inventory boundary, restaurant/retail isolation.

---

## 10. Known limitations

- Catalog estimate in UI may differ from billed replacement total (tax)
- No store credit
- No server-side exchange query / analytics
- Bill-level refund cannot enforce item-level money on server
- Partial exchange state requires operator retry

---

## Verdict

**PHASE 4.5 COMPLETE** — Retail exchange v1 implemented per ADR-012 composition model.

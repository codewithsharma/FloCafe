<!-- Last updated: 2026-08-15, schema v80 -->

# H1 — POS Transaction Integrity Hardening

**Slice:** Void → Discounts → Receipts  
**Branch:** `restaurant-vertical`  
**Status:** COMPLETE (2026-08-15)  
**Canonical plan:** [`docs/00-product/capability-matrix.md`](../00-product/capability-matrix.md)

## Delivered

1. **Void order** — `PATCH /api/orders/:id/status` cancelled writes `audit_logs` action `order.cancelled` inside the same transaction.
2. **Void item** — item cancel returns `409 ORDER_HAS_SUCCESSFUL_TENDER` when the order already has successful tender (parity with order cancel).
3. **Discounts** — order discount writes `order.discount_applied` audit; order/item discount blocked after successful tender (`409`).
4. **Receipts** — successful `POST /api/printers/print-bill` writes `print_logs` + sets `bills.printed_at` and returns `print_logged: true`; failed print does not log. Orders UI skips duplicate `/bills/:id/print` when the server already logged.

## Tests

```sh
npm run test:h1
```

Plus regression: cancel-override, discount-system, integration-discount, receipt-printing, bills-print-api, orders-authz, order-boundary, issue-24, refunds, integration-payments.

## Not in H1

- Phase 4.16 / new surfaces
- Frozen: terminals, gateways, online payment, multi-location, payroll
- Digital receipt product, void reports, item-discount UI, cancel Idempotency-Key
- Schema / money architecture changes
- Service charge wiring (ADR-014 still Proposed)

## Matrix impact

Void order / Discounts / Receipt generation remain **🟡 Hardening** with H1 depth documented. Void item remains **🔵 Planned** (paid guard only). Receipt reprint / digital receipt remain Planned.

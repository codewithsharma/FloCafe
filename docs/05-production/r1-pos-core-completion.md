<!-- Last updated: 2026-08-15, schema v75 -->

# R1 — POS Core Completion

**Slice:** Restaurant POS transaction engine deepening  
**Branch:** `restaurant-vertical`  
**Status:** COMPLETE (2026-08-15)  
**Baseline:** R0 `eba64f1` · H1–H4 preserved  
**Canonical plan:** [`docs/00-product/capability-matrix.md`](../00-product/capability-matrix.md) · [`restaurant-os-roadmap.md`](../00-product/restaurant-os-roadmap.md)

## Scope

Hardened existing POS foundation only. No floor/inventory/BOM/purchasing/CRM/QR/marketing/BI. No payment gateways/terminals. No FIN-01 redesign. No ADR-014 service charge wiring. No schema migration. No R2.

## Implemented

| Area      | Change                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle | Terminal states `cancelled`/`completed` cannot transition to other statuses (`409 ILLEGAL_STATUS_TRANSITION`)                                                                |
| Cancel    | Optional `Idempotency-Key` on cancel — replay returns prior result without second audit                                                                                      |
| Discounts | Optional `Idempotency-Key` on order discount; frontend PaymentModal / checkout-coordinator / Orders send keys; item discount writes `order.item_discount_applied`            |
| Modifiers | Required / min_selection groups enforced server-side even when `addons=[]`                                                                                                   |
| Audit     | `order.created` on new create; item discount audit                                                                                                                           |
| Receipts  | Preview returns `bill_id` + text/escpos (digital foundation, no delivery); second print coerced to `reprint`; WebUSB/local/browser print best-effort `POST /bills/:id/print` |
| RBAC      | H3 preserved (discount owner/manager; no FIN-01/role redesign)                                                                                                               |
| Offline   | Local SQLite billing unchanged; no new cloud billing dependency                                                                                                              |

## Financial guarantees

- Cent/Decimal money paths unchanged; FIN-01 intact
- Successful-tender guards (H1) intact
- Cancel/discount idempotent replay does not double-audit
- Refunds untouched

## Authorization

Server `requireRole` unchanged from H3 for discount/cancel/restore/status. UI discount gates still owner/manager.

## Offline / concurrency

- Offline SAFE POS paths unchanged
- Duplicate cancel/discount with same Idempotency-Key → safe replay
- Illegal terminal transitions fail closed
- Print failure still does not block payment (H1)

## Tests

```sh
npm run test:r1   # 34/34
npm run test:h1 && npm run test:h2 && npm run test:h3 && npm run test:h4
npm run test:issue-214 && npm run test:refunds && npm run test:orders-authz
```

## Remaining POS gaps (not falsely Existing)

- Full forward status adjacency CAS / order-status `expected_status`
- Item-discount POS UI
- Digital receipt delivery (email/WhatsApp) — deferred; preview only
- Service charge (ADR-014 Proposed)
- Coupons / promotions / reopen / courses / priority
- Cancel/discount **mandatory** Idempotency-Key (currently optional like create)
- `order.updated` audit on every add-items path (create covered)
- Void reports / deeper void-item productization (matrix Planned)

## Out of scope (later R-waves)

Tables/floor · Kitchen OS depth · Inventory · BOM · Purchasing · CRM/Loyalty · QR · Marketing · BI · Multi-location · Gateways · Aggregators · Phase 4.16 · Retail

## Matrix impact

Void order / Discounts / Receipt generation remain **🟡 Hardening** with R1 depth documented. Receipt reprint depth closed toward Existing where coerced. Digital receipt stays **🔵 Planned** (foundation only). Modifier groups remain Planned with required-group enforcement shipped.

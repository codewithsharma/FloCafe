<!-- Last updated: 2026-08-15, schema v79 -->

# Operavia Restaurant OS — Financial Contract

**Status:** Immutable product rules for all future Restaurant features (docs only)  
**Baseline:** FIN-01 closed · H1 tender guards · M5/M6 shifts/refunds · ADR-007/008/009  
**Blueprint:** [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md)

All R-waves that touch money **must** cite this contract in their acceptance criteria.

---

## Immutable principles

1. **Cent precision** — All money math in integer cents (or Decimal with scale 2). **No IEEE float** for money calculations. Storage migration REAL→cents requires explicit human approval (P0.3 deferred).
2. **Deterministic tax** — Tax engine + bill snapshots; rounding rules tested; no ad-hoc UI tax.
3. **Tender integrity** — Successful tenders are durable; outstanding = total − **gross** successful tender (FIN-01). Refunds never reopen collectible capacity.
4. **Refund integrity** — Mandatory Idempotency-Key; PIN where required; cash refunds affect shift expected cash; Restaurant default money-only restock policy (ADR-009/011 as applicable).
5. **Idempotency** — Anywhere a duplicate client retry can create money or stock side effects (pay, refund, and future PO receive, etc.).
6. **Successful-tender mutation protection** — After successful tender: block cancel/void/discount paths that would corrupt paid state (H1 `ORDER_HAS_SUCCESSFUL_TENDER`). Use refund for money undo.
7. **Shift attribution** — Cash payments respect open-shift gate when enabled; `bill.shift_id` wins for recon (ADR-007/008).
8. **Cash reconciliation** — `expected = float + cash_in − cash_refunds`; `variance = counted − expected` when counted provided.
9. **Audit trail** — Financial mutations write auditable events without secrets/PII dumps.
10. **No duplicate financial mutation** — Same logical pay/refund cannot double-apply; conflict returns explicit error.

---

## Z-report / day close

- Day close freezes summary; Z print must **not** recompute alternate truth.
- Cash In / Cash Refunds / Net Cash semantics preserved.

---

## Service charge / tips / expenses

- **Service charge:** ADR-014 Proposed — no wiring until Accepted.
- **Tips:** Later unless matrix updated.
- **Expenses:** Planned — must use cents + audit + RBAC when built.

---

## Forbidden

- Silent over-collection
- Re-opening paid capacity via refund tricks
- Float-based total loops
- Client-only authorization for discounts/refunds/voids
- Cloud confirmation required before recording a local cash tender

---

## Test bar

Financial features require: happy path, over/under tender, idempotent replay, authz denial, shift gate, and recon impact tests where applicable.

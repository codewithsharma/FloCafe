<!-- Last updated: 2026-08-15, schema v75 -->

# H3 — Permissions / RBAC Hardening

**Slice:** Permissions → Authorization → Role-based access  
**Branch:** `restaurant-vertical`  
**Status:** COMPLETE (2026-08-15)  
**Canonical plan:** [`docs/00-product/capability-matrix.md`](../00-product/capability-matrix.md)

## Delivered

1. **Item cancel roles** — `PATCH .../items/:itemId/cancel` uses `requireRole('owner','manager','cashier','waiter')` (chef excluded; pending cancel still owner/manager via inline policy; in-progress void still needs manager PIN for cashier/waiter).
2. **Item restore roles** — `PATCH .../items/:itemId/restore` uses `requireRole('owner','manager')`.
3. **Order-item status roles** — `PATCH /api/order-items/:id/status` uses `requireRole('chef','manager','owner')`.
4. **POS discount UI** — Apply Discount gated to owner/manager via `canApplyOrderDiscount` (`PaymentModal` + `PrepaidCheckoutModal`).
5. **Settings deep-link** — non owner/manager redirected via `canAccessSettings`.
6. **Test auth parity** — `tests/helpers` `createApp` resolves role from DB over JWT claim (matches production `requireAuth`).

## Authorization matrix (operations covered by H3)

| Operation                     | Owner | Manager | Cashier | Waiter     | Chef |
| ----------------------------- | ----- | ------- | ------- | ---------- | ---- |
| Apply order discount          | yes   | yes     | no      | no         | no   |
| Item cancel (pending)         | yes   | yes     | no*     | no*        | no   |
| Item void in-progress (+ PIN) | yes   | yes     | yes     | own orders | no   |
| Item restore                  | yes   | yes     | no      | no         | no   |
| KDS item status               | yes   | yes     | no      | no         | yes  |
| Settings page                 | yes   | yes     | no      | no         | no   |

\* Inline policy after `requireRole` (unchanged business semantics).

## Tests

```sh
npm run test:h3
```

Plus regression: `test:staff-authz`, `test:orders-authz`, `test:authz-phase3`, `test:h1`, `test:h2`.

## Not in H3

- Auth rewrite or new authorization framework
- Schema / money architecture changes (schema v75 unchanged)
- Sensitive-action controls (Planned)
- Authz-denial audit flood
- Cashier in-progress void UI (API already allows with PIN)
- Manager settings save UX quirks
- Phase 4.16 / Frozen capabilities
- Offline conflict/restore hardening

## Matrix impact

Permissions / Authorization / Role-based access remain **🟡 Hardening** with H3 depth documented. Sensitive-action controls remain **🔵 Planned**. Audit trail Hardening depth unchanged by this slice.

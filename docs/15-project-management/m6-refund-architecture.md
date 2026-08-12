# M6 Refund Architecture (Nexora POS)

**Status:** APPROVED  
**Date:** 2026-08-12  
**Scope:** Smallest viable money-critical refund workflow  
**Non-goals:** Returns/restock, payment terminals, UI polish beyond API contract, tax recompute redesign, architecture rewrite

Related: `STRATEGY.md`, ADR-008, ADR-009, FR-T-02, master plan §1.7 / M6.

---

## 1. Problem

Paid bills cannot reverse money. Item void/order cancel change **totals only**; they never reverse `paid_amount` / `payment_details`. Cash recon hardcodes refund outflow to **0** (ADR-008). Pilots cannot trust the POS without a real refund path.

## 2. Design principles

1. **Refund ≠ void** — voids stay kitchen/comp accounting; refunds reverse **collected payment**.
2. **First-class `refunds` rows** — do not encode refunds as negative `payment_details` lines (cash parser rejects ≤0; recon/audit need entities).
3. **Reuse payment money math** — apply/reduce with integer cents (`Math.round(x * 100)`), store REAL like bills today (P0.3 full cents migration is separate).
4. **Refactor-on-touch** — new `main/services/refund.ts` + thin routes; only touch `shift.ts` recon formula and bill status fields as required.
5. **Closed shift immutability** — never rewrite closed `expected_cash_cents`; attribute cash refunds to the **active open shift** at refund time (mirror bill first-payment attribution).

---

## 3. Behavior

### Full refund

- Bill must have **refundable_cents > 0**.
- `refundable_cents = SUM(payment_details applied amounts in cents) - SUM(refunds.amount_cents WHERE completed)`.
- Cap is computed inside `withTxn` (sync SQLite); do **not** trust mutable `paid_amount` alone.
- `amount` omitted or equal to refundable → refund **all** remaining net paid.
- After: `paid_amount` reduced; status per rules below.

### Partial refund

- Explicit `amount` with `0 < amount ≤ refundable`.

### Already-refunded / over-refund

- If refundable = 0 → **409** `REFUND_NOTHING_TO_REFUND`.
- Amount > refundable → **409** `REFUND_EXCEEDS_PAID`.
- Method remaining tender exceeded → **409** `REFUND_EXCEEDS_METHOD`.

### Method rules

- Refund method **must** match an existing `payment_details` line method (case-sensitive as stored).
- If method omitted → default to largest tender by summed applied amount.
- Record `method` and `original_method` (= chosen matching line method).
- Different method than any original tender → **400** `REFUND_METHOD_INVALID`.

### Duplicate request

- Header `Idempotency-Key` **required**.
- Table `refund_idempotency (user_id, idempotency_key)` → replay identical response; body hash mismatch → **409** `REFUND_IDEMPOTENCY_CONFLICT`.

### Unauthorized

- Roles: `owner | manager | cashier` on route.
- **PIN always required** (owner/manager/cashier) — copy item-void PIN + rate limit.
- Waiter/chef → **403**. Invalid PIN → **403** `REFUND_PIN_INVALID`.

### Refund after shift close

- Allowed.
- `refunds.shift_id` = **current open shift** for the terminal (if shifts enabled), else `NULL`.
- Cash refunds with cash gate on: require open shift → **409 OPEN_SHIFT_REQUIRED**.
- Closed shift’s persisted expected cash is **not** rewritten.

### Cash reconciliation impact

```
expected_cash_cents =
  opening_float_cents
  + SUM(qualifying cash payment applied amounts on bills WHERE shift_id = shift)
  - SUM(completed cash refunds WHERE refunds.shift_id = shift AND method = 'cash')
```

Card/wallet/custom refunds do **not** change expected cash.

### Wallet / loyalty (MVP)

- If refund `method === 'wallet'`: credit wallet points for refunded amount (mirror debit).
- Cap wallet refund by remaining wallet tender on bill.
- Do **not** claw back earned cashback loyalty in MVP.

### Order state

- Do **not** reopen completed orders or restock inventory on refund.
- Order remains prior status; bill `payment_status` reflects refund.

---

## 4. State model

### `refunds` (migration **v72**)

See schema in implementation / ADR-009. Indexes: `(bill_id)`, `(shift_id)`, `(created_at)`.

### Bill `payment_status`

`unpaid | partial | paid | partially_refunded | refunded`

| After refund | Rule |
|--------------|------|
| net paid cents = 0 | `refunded` |
| net paid > 0 and was ever fully paid | `partially_refunded` |
| never fully paid and balance > 0 | `partial` |
| else | `partially_refunded` |

Open-bill edit sync queries use `payment_status IN ('unpaid','partial')` so refunded bills are not treated as editable unpaid.

---

## 5. API

### `POST /api/bills/:id/refund`

Auth: `requireRole('owner','manager','cashier')` + `override_pin` always.

Body: `{ amount?, method?, reason, override_pin, manager_id? }`  
Headers: `Idempotency-Key` (required), `X-Flo-Terminal-Id` (shift attribution).

Response 200: `{ refund, bill }`  
Errors: `{ error, code: 'REFUND_...' }` (or `OPEN_SHIFT_REQUIRED`).

### `GET /api/refunds?bill_id=`

Auth: `owner|manager|cashier`.

---

## 6. Authorization & audit

- Audit inside `withTxn`: `action: 'payment.refunded'`, entityType `refund`.

---

## 7. Known limitations (MVP)

1. **Card refund = financial record only** — no payment gateway chargeback/reversal.
2. No cashback clawback on refund.
3. Refund print / receipt UI deferred.
4. No frontend refund dialog (API-first).
5. No inventory restock / returns / order reopen.
6. Hybrid REAL + cents until P0.3.

---

## 8. Definition of Done

A completed paid bill can be refunded (full/partial); `paid_amount` / `payment_status` correct; cash expected formula subtracts cash refunds only; authorized + audited; idempotent; covered by automated tests; existing suite still green.

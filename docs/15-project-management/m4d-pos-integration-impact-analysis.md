**Status:** ANALYSIS COMPLETE. **M4-D1 = IMPLEMENTED.** **M4-D2 = IMPLEMENTED.** **M4-D3 = IMPLEMENTED.** **M4-D4 = IMPLEMENTED.** **M4-D5 = IMPLEMENTED.** M4-E / M5 = NOT IMPLEMENTED.  
**Date:** 2026-08-12  
**Depends on:** M4-A APPROVED, M4-B GREEN (schema v69), M4-C GREEN (service/API), M4-D1 GREEN (terminal identity), M4-D2 GREEN (order shift), M4-D3 GREEN (bill shift)  
**Does not implement (still):** M4-E UI, M5 reconciliation


> **Source code is authoritative.** Where this document disagrees with the RFC, the code is current reality and the discrepancy is called out.

---

## 1. Executive Summary

M4-B added nullable `orders.shift_id` and `bills.shift_id`. M4-C added a shift service and HTTP API. **No production order or payment path writes those columns today.** `INSERT` statements omit `shift_id`, so SQLite stores `NULL`. `shifts_enabled` defaults to `'false'` and does not touch POS routes.

There is **no separate order or payment service**. Creation and settlement live in Express route modules:

| Concern | Actual module | Function / route |
|---------|---------------|------------------|
| Order create | `main/routes/orders.ts` | `POST /` → `withTxn()` → `INSERT INTO orders` |
| Bill create | `main/routes/bills.ts` | `POST /generate` |
| Split checks | `main/routes/bills.ts` | `POST /:id/split-check` |
| All payments | `main/routes/bills.ts` | `applyPaymentBatch()` via `POST /:id/payment` and `POST /:id/payments` |
| Active shift | `main/services/shift.ts` | `getActiveShift(terminalId)`, `isShiftsEnabled()` |

**Safest assignment points (recommended):**

- `orders.shift_id` — inside the existing `withTxn()` of `POST /api/orders`, on the `INSERT INTO orders` column list, using `isShiftsEnabled()` + `getActiveShift(requestTerminalId)`. Do **not** update `shift_id` on later item/status/discount/cancel paths.
- `bills.shift_id` — inside `applyPaymentBatch()`, on the existing `UPDATE bills SET paid_amount… payment_details…` statement, **only if currently NULL**, from the request terminal’s **currently open** shift. Do **not** set `shift_id` at bill generate or split-check.

**Do not** call `getOrCreateHostTerminalId()` from order or payment paths. That M4-C helper is the host-register fallback for `openShift` without a client id. Using it on POS writes would silently attach every LAN client to the Electron host shift.

**M4-D can capture enough data for M5** if `bills.shift_id` is set on first payment and cash lines remain `method === 'cash'` in `payment_details`. Refunds do not exist yet (M6); expected-cash formula’s refund term stays zero until then.

---

## 2. Current Order Architecture

### 2.1 Every way an order is created

| Path | Route | Roles | Creates `orders` row? |
|------|-------|-------|------------------------|
| POS / Server App / API | `POST /api/orders` (`main/routes/orders.ts` ~L306) | owner, manager, cashier, waiter | **Yes — only INSERT** |
| Add items to existing | `POST /api/orders/:id/items` (~L554) | same | No (updates existing) |
| Held cart | `POST /api/held-orders` (`main/routes/held-orders.ts`) | owner, manager, cashier, waiter | **No** — `held_orders` blob only |
| KDS item status | `PATCH /api/order-items/:id/status` | chef, manager, owner | No |
| Item cancel/void | `PATCH /api/orders/:orderId/items/:itemId/cancel` (`main/routes/index.ts`) | existing void path | No |

There is **no second INSERT into `orders`**. Kitchen, printing, and reports consume existing rows.

### 2.2 Actual create flow

```
Client (POS page / Server App / tests)
  → axios JWT (`frontend/src/lib/api.ts` or server-standalone `createApi()`)
  → POST /api/orders
  → requireAuth (`main/server.ts`) + requireRole('owner','manager','cashier','waiter')
  → user_id = req.user.userId  (never from body)  ~L321
  → withTxn()  ~L351
       → order_idempotency replay (optional)
       → generateOrderNumber()
       → INSERT INTO orders (…, status='pending')  ~L399–407
            **shift_id is not in the column list → NULL**
       → INSERT order_items, addons, tax, stock, table occupied
       → store idempotency response
  → JSON { order }
```

**Transaction boundary:** the entire create (order, items, tax, stock, table) is one `withTxn()` (`main/db.ts` `withTxn` = `db.transaction(fn)()`).

**Auth context:** JWT; role from DB via `getUserAuthStatus()`. Waiters may create orders.

**Terminal information:** **none**. No `X-Flo-Terminal-Id` on the axios instance (`frontend/src/lib/api.ts` only sets `Authorization`).

**Initial status:** `'pending'` (hard-coded in INSERT).

**Unpaid behavior:** creating an order does **not** create a bill. Bill appears later via `POST /api/bills/generate`. Order can remain unpaid indefinitely.

**Draft / held:** `held_orders` is a per-table JSON cart (`main/routes/held-orders.ts`). It is not an order and has no `shift_id`. Conversion is a later `POST /api/orders` from POS (`frontend/src/app/(dashboard)/pos/page.tsx` `handlePlaceOrder` / `handlePrepaidCheckout`).

### 2.3 Modification paths (do not create orders)

| Route | Effect on `orders.shift_id` today |
|-------|-----------------------------------|
| `POST /:id/items` | Recalc totals; no `shift_id` write |
| `PATCH /:id/status` | Status / timestamps / table free; no `shift_id` |
| `PATCH /:id/customer` | Customer + unpaid bills’ `customer_id` |
| `PATCH /:id/convert-to-takeaway` | `type='takeaway'`, `table_id=NULL` — **no table-to-table transfer API exists** |
| `PATCH /:id/discount` | Discount + bill resync if unpaid |
| `PATCH /:id/items/:itemId/discount` | Item discount |
| Item cancel/void (`index.ts`) | Soft-cancel or void_adjustment line; bill totals updated |

Waiter scope: waiters may only modify their own orders (`user_id` check, e.g. `orders.ts` ~L573, ~L827).

### 2.4 RFC discrepancy (orders)

RFC §2.2 still says “Orders have no `shift_id` column today.” **False after M4-B.** The column exists; writes do not.

RFC §17 proposed `GET /api/shifts/current`. **M4-C implemented `GET /api/shifts/active`.**

### 2.5 Safest location for `orders.shift_id`

**Inside the `withTxn()` of `POST /api/orders`, on the INSERT**, after resolving terminal + active shift, before/with the existing INSERT.

Why this location:

- Single create path.
- Same transaction as the order row (no orphan association).
- Idempotent replay returns the stored response (already includes whatever `shift_id` was written the first time).
- Later mutations should **not** change operational shift (see §7).

Do **not** assign in `POST /:id/items` (order already exists). Do **not** assign in held-order save.

---

## 3. Current Payment Architecture

### 3.1 Every payment write path

| Path | Route | Roles | Mutates money? |
|------|-------|-------|----------------|
| Single-line (legacy) | `POST /api/bills/:id/payment` ~L712 | owner, manager, cashier | Yes → `applyPaymentBatch(..., allowOmittedAmount=true)` |
| Atomic batch (POS) | `POST /api/bills/:id/payments` ~L741 | owner, manager, cashier | Yes → `applyPaymentBatch(..., allowOmittedAmount=false)` |
| Method merge | `POST /api/payment-methods/:id/merge` | owner/manager | Rewrites `payment_details.method` names only; **no amounts, no `shift_id`** |
| Auto-repair | `main/db.ts` payment_details JSON repair | startup | JSON shape only |

**There is no refund, void-payment, or reverse-payment API.** Item void/cancel adjusts **order/bill totals**, not `payment_details` (`main/routes/index.ts` ~L335–343 comment: “refund/comp” is a **line-item void**, not a cash refund).

Waiters **cannot** record payments (`requireRole` on payment routes).

### 3.2 Actual payment flow (both HTTP endpoints)

```
Client PaymentModal / prepaid checkout
  → POST /api/bills/:id/payments  { payments: [...], customer_id }
     or POST /api/bills/:id/payment  { method, amount, ... }
  → Idempotency-Key (optional)
  → withTxn()
       → applyPaymentBatch()
            → payment_idempotency replay
            → preparePaymentBatch()  (validate, resolve custom methods, cash allocation)
            → loyalty_ledger debit (wallet)
            → payment_transaction_refs
            → UPDATE bills SET paid_amount, balance, payment_status, payment_details, paid_at
                 **shift_id is not in this UPDATE → remains NULL**
            → if fully paid and no unpaid sibling bills: orders.status='completed', table available
            → loyalty credit
  → { bill, walletDebited, loyaltyPointsEarned }
```

Frontend POS uses **only** the batch endpoint:

- `frontend/src/components/pos/PaymentModal.tsx` ~L255 `POST /bills/${id}/payments`
- `frontend/src/app/(dashboard)/pos/page.tsx` ~L577 prepaid `POST /bills/${id}/payments`

Tests still use `/payment` (singular) heavily (`tests/integration-payments.test.ts`, `tests/integration-happy-path.test.ts`).

### 3.3 Method resolution (cash vs not)

`PAYMENT_METHODS = {'cash','card','wallet'}` (`bills.ts` ~L358).

`preparePaymentBatch()` ~L477–484:

1. If `method` is cash/card/wallet → keep it.
2. Else if `method === 'custom'` → lookup `payment_methods` by `payment_method_id`.
3. Else lookup `payment_methods` by case-insensitive **name**.
4. Stored line `method` becomes the **catalog name** (or built-in token).

Cash **allocation** (~L570–584) uses `line.method !== 'cash'` (exact, case-sensitive) **after** resolution. A custom method whose **name** is `cash` is therefore treated as cash (tender/change math). Card/wallet/custom-other are non-cash; non-cash cannot exceed remaining balance.

**Partial payments:** supported. Cash tender may be less than remaining; status becomes `'partial'`. Subsequent batches append to `payment_details`.

**Split payments:** one `POST /payments` array, one transaction. Mix of cash + card + wallet + custom is allowed.

**Split checks:** different feature (see §4). Each resulting bill is paid independently through the same `applyPaymentBatch`.

### 3.4 Safest location for `bills.shift_id`

**Inside `applyPaymentBatch()`, on the existing bill UPDATE (~L683), only when `bill.shift_id` is NULL**, after `preparePaymentBatch` succeeds and a real (non-replay) write will occur.

Why:

- RFC §15.1: payment is the primary payment→shift link.
- Both HTTP payment routes share this function — **one write site**.
- Idempotent replay returns stored JSON (must include `shift_id` once set).
- First partial payment stamps the shift; later partials keep it (RFC §9.2) if the UPDATE uses `COALESCE` / `WHERE shift_id IS NULL`.
- Bill generate and split-check create **unpaid** bills; stamping there would attribute cash to generate-time, not pay-time.

Do **not** add a second lookup in the HTTP handlers.

---

## 4. Current Bill Architecture

### 4.1 Bill creation

| Path | When | `payment_status` | `shift_id` |
|------|------|------------------|------------|
| `POST /api/bills/generate` | First checkout; `withTxn` INSERT ~L237–246 | `'unpaid'` | omitted → **NULL** |
| Same route, bill exists | Re-sync totals if not `'paid'` | unchanged | not written |
| `POST /api/bills/:id/split-check` | Dine-in, unpaid, no prior payment | source updated; extra INSERTs `'unpaid'` ~L330 | omitted → **NULL** |

Generate does **not** run on order create. POS calls generate then payment (`pos/page.tsx` prepaid; `TableCheckoutModal.tsx` ~L82 then `onPayment` → `PaymentModal`).

### 4.2 Bill settlement

Settlement is **only** `applyPaymentBatch`. Status: `unpaid` → `partial` → `paid` from cents math (~L658). `paid_at` set when status becomes `'paid'`.

When the last sibling bill for an order is `'paid'`, the **order** is marked `completed` (~L685–691). That is payment-driven, not shift-driven.

### 4.3 `payment_details` structure (do not modify)

Stored as JSON **array** of line objects. Written in `applyPaymentBatch` ~L659–666:

```json
{
  "method": "cash" | "card" | "wallet" | "<custom name>",
  "payment_method_id": 12,
  "amount": 12.50,
  "requested_amount": 20.00,
  "amount_omitted": false,
  "tendered_amount": 20.00,
  "change_amount": 7.50,
  "transaction_id": "optional",
  "notes": "optional",
  "timestamp": "YYYY-MM-DD HH:MM:SS"
}
```

| Kind | How it appears |
|------|----------------|
| **Cash** | `method: "cash"`; `tendered_amount` / `change_amount` present; `amount` is **applied** (may be less than tendered) |
| **Card** | `method: "card"`; no tender/change |
| **Wallet** | `method: "wallet"`; also `loyalty_ledger` debit |
| **Custom** | `method` = catalog **name**; `payment_method_id` set |
| **Split (multi-method)** | Multiple objects in one array from one batch |
| **Partial** | Array grows across batches; `payment_status: "partial"` until balance 0 |

Frontend type (`frontend/src/lib/types.ts` ~L201) only documents `method`, `payment_method_id`, `amount`, `timestamp` — narrower than the server write. M4-D should not need to change that type unless the UI shows shift.

**M5 cash sum:** `SUM(amount)` where `method === 'cash'` on bills with `shift_id = :shift`. Use **applied** `amount`, not `tendered_amount` (tendered includes change).

Legacy: `preparePaymentBatch` accepts a single object (not array) when parsing old JSON (~L469). Startup repair in `main/db.ts` wraps malformed `{A},{A}` into arrays.

### 4.4 Existing `shift_id` columns (verified)

Migration v69 (`main/db.ts` ~L3660–3667):

```sql
ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
ALTER TABLE bills  ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_bills_shift_id ON bills(shift_id);
```

| Property | Reality |
|----------|---------|
| Nullable | Yes — no `NOT NULL`; tests in `tests/shift-schema.test.ts` assert NULL on new and upgraded rows |
| FK | `REFERENCES shifts(id)` — assigning a non-existent id would fail FK |
| Indexes | `idx_orders_shift_id`, `idx_bills_shift_id` |
| `createSchema()` | **Does not** include `shift_id`; column appears only via v69. Fresh install still runs v69. |
| Current writes | **None** in orders/bills routes |
| Existing records | NULL (upgrade test + omitted INSERT columns) |

`require_open_shift_for_cash` and `shifts_enabled` are settings only; no payment/order reader except M4-C shift routes (`assertShiftsEnabled`).

---

## 5. Terminal Identity

### 5.1 What M4-C actually implemented

| Mechanism | Behavior | File |
|-----------|----------|------|
| Host setting | `settings.terminal_id`, default `''` | v69 seed |
| Generate-once | `getOrCreateHostTerminalId()` writes UUID into settings | `main/services/shift.ts` ~L89–95 |
| HTTP fetch | `GET /api/shifts/terminal-id` — **does not** require `shifts_enabled` | `main/routes/shifts.ts` ~L57–63 |
| Request id | body `terminal_id` > header `X-Flo-Terminal-Id` > query | `requestTerminalId()` ~L29–37 |
| `openShift` without id | **falls back to host UUID** (`generateHostIfMissing: true`) | `openShift` ~L118 |
| `GET /active` | **requires** explicit `terminal_id` (400 if missing) | ~L68–71 |
| `localStorage` | **not implemented** | frontend has no `flo_terminal_id` |
| `PUT /api/settings/terminal_id` | **403** — key not in `ALLOWED_WILDCARD_KEYS` | `main/routes/settings.ts` ~L679–695 |
| IPC | `terminal_id` not in `ALLOWED_IPC_KEYS` | `main/ipc.ts` ~L16–26 |

**RFC discrepancies:** RFC §6.3 / OD-5 said persist via `PUT /api/settings` and `localStorage`. Code uses `GET /api/shifts/terminal-id` + internal `upsertSettings`. RFC `GET /current` vs code `GET /active`. RFC “validated UUID format” vs code `TERMINAL_ID_PATTERN` allowing `term-…` style ids (`shift.ts` ~L53).

`cloud_pos_id` remains a **different** identity (`audit-log.ts` `defaultTerminalId()` still uses it when context has no `terminalId`).

### 5.2 Behavior by scenario

| Scenario | Current reality | M4-D need (not implemented) |
|----------|-----------------|-----------------------------|
| **A. Electron POS** | Same Next static app as browser, origin typically `http://localhost:3001`. No client UUID. `openShift` without header uses **host** setting. | Persist a client UUID; send `X-Flo-Terminal-Id` on orders **and** payments. May seed from `GET /api/shifts/terminal-id` if localStorage empty so Electron matches host setting. |
| **B. Browser LAN POS** | Loaded via `GET /api/pos-info` QR (`main/routes/pos-info.ts`) at `http://<lan-ip>:3001`. **Different origin** → different `localStorage` from Electron. No UUID today. If it called `openShift` without id, it would share the **host** terminal. | **Must generate and persist its own UUID.** Must **never** omit the header on open/order/pay. |
| **C. Multiple tabs** | Same origin shares `localStorage` (once implemented) → same terminal → same shift. Correct for one register. | Keep one key per origin. |
| **D. Browser restart** | `localStorage` survives. | Reuse stored UUID. |
| **E. Browser storage reset** | New UUID. Old open shift orphaned on previous id. | Manager force-close (already M4-C). |
| **F. Electron restart** | Chromium `localStorage` + SQLite `settings.terminal_id` both survive. | Prefer localStorage; host setting is backup for Electron-only. |
| **G. Database reinstall** | `settings.terminal_id` empty; **localStorage may still hold old UUID**. | Client id should win (stable register). Host setting regenerates on next `GET /terminal-id` if empty — **do not overwrite client id**. |
| **H. Multiple physical devices** | Each LAN origin/device needs its own UUID. | Header required; no host fallback on POS writes. |

### 5.3 Recommended M4-D client algorithm (design only)

```
read localStorage['flo_terminal_id']
if missing:
  generate UUID
  save localStorage
send X-Flo-Terminal-Id on: POST /orders, POST /bills/:id/payment(s), shift APIs
```

**Do not** use `getOrCreateHostTerminalId()` when attaching `shift_id` to orders/bills.

Optional Electron convenience: if localStorage empty, `GET /api/shifts/terminal-id` then store that value — only so the Electron window matches the host setting used by `openShift` without a body. Browser LAN clients must **not** call that endpoint to obtain identity (it returns the **host** id).

**OPEN PRODUCT DECISION:** Electron window and a browser tab on **the same origin** (`localhost:3001`) will share `localStorage` and therefore one terminal. That is one physical register. A tab on the LAN IP is a second register. Document for operators.

Server App (`frontend/src/app/server-standalone/page.tsx`) uses a **different** axios (`baseURL: origin`, token key `flocafe:server-app-token`) and creates dine-in orders. It is waiter-facing, not a cash drawer. It should **not** be forced onto the host terminal. Missing header → `orders.shift_id` NULL (see §19).

---

## 6. Shift Resolution

### 6.1 Authoritative resolver (must be one function)

Add (in M4-D, not now) a single helper on `main/services/shift.ts`, e.g. conceptually:

```
resolveActiveShiftForRequest(terminalId: string | undefined): ShiftRecord | null
  if !isShiftsEnabled() → null
  if !terminalId → null          // do not host-fallback
  return getActiveShift(terminalId)  // already SELECT … WHERE status='open'
```

Callers: `POST /api/orders` INSERT; `applyPaymentBatch` UPDATE. Cash gate uses the same result.

`getActiveShift` today does **not** check `shifts_enabled` (only HTTP `assertShiftsEnabled` on shift routes). POS integration **must** check the flag in the helper so flag-off stays NULL.

### 6.2 Scenario matrix

| # | Condition | Order `shift_id` | Bill `shift_id` | Cash payment |
|---|-----------|------------------|-----------------|--------------|
| 1 | `shifts_enabled=false` | NULL | NULL | Allowed (today) |
| 2 | enabled + active shift + header | that shift | that shift on **first** payment if NULL | Allowed |
| 3 | enabled + no active shift + header | NULL | NULL | Allowed unless cash gate |
| 4 | `require_open_shift_for_cash=false` | as 2–3 | as 2–3 | Allowed with NULL shift |
| 5 | cash gate `true` + enabled + cash line + no active shift | n/a | reject batch | **Reject server-side** |
| 6 | order create, no active shift | NULL | n/a | n/a |
| 7 | payment, no active shift | unchanged | NULL (if still NULL) | see 4–5 |
| 8 | unpaid order created before any shift | stays NULL | set at **payment** to then-active shift | — |
| 9 | order in shift A, paid after A closed and B open | **A** (creation) | **B** (payment) | — |
| 10 | two terminals, two open shifts | each header’s shift | each payment header’s shift | independent |

RFC §20: “Payment without terminal header → `shift_id` NULL; payment succeeds (unless cash gate enabled).” **Follow this.** Do not invent a 400 for missing header on non-cash when the flag is on.

RFC §21.6 “cannot pay new bills against closed shift” means: **do not attribute a payment to a closed shift**. Resolve **current open** shift only. Paying is still allowed; association is the new open shift or NULL. This is **not** a payment block (except cash gate).

---

## 7. Order Shift Semantics

Approved design (ADR-007, RFC §9.1 / §15.4): `orders.shift_id` is an **optional operational** association (who took the work), **not** M5 cash math.

| Question | Recommendation (from RFC + code) | Open? |
|----------|----------------------------------|-------|
| When assigned | Only `POST /api/orders` INSERT, if flag on and active shift for **request** terminal | No |
| Ever change? | **No.** Add-items, discount, status, cancel, convert-to-takeaway, customer patch must not rewrite it | No |
| Remain NULL? | Yes: flag off, no header, no open shift, held carts, legacy rows | No |
| Unpaid orders | Keep creation shift (or NULL) until/after payment; payment uses **bill** shift | No |
| Editing items | No change | No |
| Table transfer | **No such API** (`convert-to-takeaway` only clears `table_id`). No shift impact | No |
| Cancel order | Status/reason only; keep `shift_id` for history | No |
| Waiter create | Same INSERT path; waiter cannot open shifts (`requireRole` on shift APIs). Header optional → often NULL | See §19 |

Held orders: no `shift_id` until `POST /api/orders` (RFC §9.2). Confirmed: `held_orders` table has no shift column.

---

## 8. Payment Shift Semantics

Approved design: `bills.shift_id` is the **primary payment→shift** link (ADR-007 point 3).

| Question | Recommendation |
|----------|----------------|
| When assigned | First **successful** `applyPaymentBatch` write if flag on, header present, active open shift, and `bills.shift_id` IS NULL |
| Can it change? | **No** after first stamp (RFC §9.2 partials). Later batches on another terminal still keep the original bill shift — **M5 implication** (see §19) |
| Split payments (one batch) | One `shift_id` on the bill; cash vs card distinguished in JSON lines |
| Partial payments | Same bill row; array append; one `shift_id` |
| Split **checks** | New unpaid bills; each gets `shift_id` when **that** bill is paid (possibly different shifts/terminals) |
| Payment after order’s shift closed | Order keeps old `shift_id`; bill gets **current** open shift (or NULL) |
| Shift closed | Closed shift is not selected by `getActiveShift`. In-flight txn: see §13 |
| Unpaid bill paid in a later shift | Allowed; bill shift = payment-time shift |

Bill generate / split-check must leave `shift_id` NULL so unpaid bills are not attributed to a register session that never took cash.

---

## 9. Cash Enforcement

Setting: `require_open_shift_for_cash`, default `'false'` (v69). **Unread** by payment code today.

**Enforce in `preparePaymentBatch` or at the start of `applyPaymentBatch`**, after method resolution, **before** any ledger write. Both HTTP verbs then inherit it. UI hiding is insufficient (direct `POST /api/bills/:id/payment` with `method: 'cash'`).

Identification (must match allocation):

- After `preparePaymentBatch` resolution, any prepared line with `method === 'cash'`.
- Split batch containing cash + card: if **any** cash line, the **whole batch** must be rejected when the gate is on and no active shift (atomic function; cannot apply card-only half).
- Custom methods: cash iff resolved name is exactly `'cash'`.
- Partial cash: still cash → gate applies.
- Wallet/card-only: gate does **not** apply (RFC §9.3 is cash-only).

Gate should also require `shifts_enabled === 'true'` (otherwise the setting is meaningless and would surprise default installs).

Error: 409 or 400 `{ error: '…' }` — **OPEN PRODUCT DECISION** on status code (RFC does not specify). Recommend **409** (business conflict: need an open shift), not 503 (503 is already “feature disabled” on shift APIs).

Missing terminal header + cash + gate on: treat as no active shift → reject (do not host-fallback).

---

## 10. Feature Flag Behavior

| `shifts_enabled` | Shift APIs (M4-C) | Orders | Payments | Cash gate |
|------------------|-------------------|--------|----------|-----------|
| `'false'` (default) | 503 | unchanged, `shift_id` NULL | unchanged, `shift_id` NULL | must **not** run |
| `'true'` | lifecycle works | stamp if active shift | stamp if active shift | only if `require_open_shift_for_cash==='true'` |

Do **not** make an open shift mandatory for all orders or all payments. RFC §5 / §9.3 / §20.

`GET /api/shifts/terminal-id` already works with the flag off — useful for M4-D identity seeding without enabling shifts.

---

## 11. Edge Cases

### 11.1 Closed shift then new shift then pay old order

```
Shift A OPEN → POST /orders (orders.shift_id = A)
             → POST /bills/generate (bills.shift_id = NULL)
Shift A CLOSED
Shift B OPEN → POST /bills/:id/payments (bills.shift_id = B)
```

- **ORDER SHIFT** = A (work taken on register A’s session)  
- **PAYMENT SHIFT** = B (cash landed in register B’s drawer)

M5 **must** use **bill** shift + cash lines, not order shift. Using order shift would put B’s cash in A’s reconciliation.

This is intentional dual-column design (ADR-007). Do not “fix” by copying `orders.shift_id` onto the bill.

### 11.2 Other edges

| Case | Handling |
|------|----------|
| Idempotent order/payment replay | Return first response; do not re-resolve shift |
| Payment replay after shift closed | Stored `shift_id` in idempotency JSON / bill row unchanged |
| Two cashiers, one terminal | Share one open shift; `orders.user_id` still the creator |
| Close with unpaid orders | Allowed (RFC OD-2). M4-D must not block close |
| Custom method merge | May rename `payment_details.method`; M5 should keep using `method === 'cash'` at report time |
| No refunds | Void/cancel changes totals; does not add negative cash lines. M5 refund term = 0 until M6 |

---

## 12. Security Analysis

| Threat | Reality | M4-D control |
|--------|---------|--------------|
| **Client-supplied `shift_id`** | Not in request bodies today | **Never accept `shift_id` from the client.** Server resolves via `getActiveShift`. |
| **Terminal spoofing** | `terminal_id` is a **string identifier**, not hardware auth. Any authenticated cashier/waiter who can guess/copy another device’s UUID can attach to that terminal’s shift. | Document as **IDENTIFICATION ≠ AUTHORIZATION**. Same as M4-C close matching. No terminal registry in M4. |
| **Cross-terminal payment** | No terminal on payment requests today | Header selects which open shift to stamp. Cashier role already required to pay. Spoofing another register’s id is possible. |
| **IDOR on bills/orders** | Existing: waiters scoped on orders; bills readable by cashier+ | Do not leak other terminals’ shifts via order GET beyond the integer `shift_id` (not secret). List history remains owner/manager. |
| **Stale / closed shift usage** | Client cannot pass a closed id if server only SELECTs `status='open'` | Keep that query. |
| **UI bypass** | Payment APIs are public to cashier JWT | Cash gate **must** be in `applyPaymentBatch`, not only POS UI. |
| **Flag bypass** | Direct SQL could set `shift_id`; API cannot if helper checks flag | Keep writes only in the two sites above. |
| **Host fallback** | `openShift` without id uses host UUID | **Do not** reuse on order/payment (LAN merge). |

---

## 13. Concurrency Analysis

SQLite: single writer, WAL, `busy_timeout = 5000` (`main/db.ts` ~L453). `withTxn` is a **deferred** `better-sqlite3` transaction.

| Race | What happens | Extra lock needed? |
|------|----------------|--------------------|
| Two opens same terminal | Unique partial index → 409 (M4-C) | No |
| Order INSERT vs shift CLOSE | Serialized writers. Order may commit with `shift_id` of a shift that closes in the next txn — still the session that was open when the order txn started. Semantically OK. | No |
| Payment UPDATE vs shift CLOSE | Same. Payment may stamp a shift that closes immediately after. That cash belongs in that shift’s count. | No |
| Payment vs close **after count** | Operator counted, then an in-flight payment lands. M5 variance. Operational, not a DB bug. | No — warn in M4-E UI |
| Two payments same bill | Existing idempotency + `payment_status='paid'` check inside `applyPaymentBatch` | No |

**Do not** introduce advisory locks. Keep shift resolve + bill/order write in the **same** `withTxn` already used by those routes so the SELECT and INSERT/UPDATE see one snapshot.

Nested `withTxn`: `getActiveShift` is a SELECT (no nested write). Do **not** call `openShift`/`closeShift` from payment/order (those start their own `withTxn`).

---

## 14. Existing Test Coverage

| Flow | Existing test | Location | M4-D test needed |
|------|----------------|----------|------------------|
| Order create | Yes | `tests/integration-happy-path.test.ts`, `tests/order-item-addons.test.ts`, `tests/orders-authz.test.ts` | Flag off: `shift_id` NULL; flag on + header + open shift: stamped; no header: NULL |
| Add items | Yes | `order-item-addons.test.ts`, POS add-items in several suites | `shift_id` unchanged |
| Order authz | Yes | `tests/orders-authz.test.ts`, `tests/authz-matrix-phase3.test.ts` | Waiter still creates; still cannot pay |
| Bill generate | Yes | happy-path, payments, tax, loyalty | `shift_id` NULL at generate |
| Single payment | Yes | `tests/integration-payments.test.ts`, happy-path | Stamp on first pay; cash/card/wallet |
| Partial payment | Yes | `integration-payments.test.ts`, `issue-214-payment-integrity.test.ts` | First batch stamps; second keeps |
| Split payment batch | Yes | `issue-214-payment-integrity.test.ts` | One `shift_id`; mixed cash+card |
| Split checks | Yes | `tests/payment-methods-split-checks.test.ts` | Each bill stamped at **its** payment |
| Cash tender/change | Yes | issue-214 cash lines | Gate on/off |
| Custom methods | Yes | payment-methods-split-checks, issue-214 | Non-cash unless name `cash` |
| Idempotency | Yes | issue-214 | Replay does not change `shift_id` |
| Held orders | Yes | `tests/held-orders.test.ts` | Still no shift column |
| Discount / void | Yes | discount-*, `cancel-override.test.ts`, `audit-log.test.ts` | `shift_id` unchanged |
| Prepaid E2E | Yes | `frontend/e2e/prepaid-payment-reconciliation.spec.ts` | Must stay green with flag **off**; no header today |
| Shift schema / API | Yes | `tests/shift-schema.test.ts`, `tests/shift-service.test.ts` | Keep; add POS integration suite |
| LAN / pos-info | Partial | `main/routes/pos-info.ts` (no shift tests) | Document identity; optional test that missing header ≠ host fallback |
| Server App orders | No dedicated shift test | `server-standalone/page.tsx` | NULL `shift_id` without header |
| Terminal localStorage | **None** | — | Client unit/E2E once M4-D5 exists |
| Cash gate | **None** | setting unused | New: reject cash, allow card |
| Order then close then pay | **None** | — | Order A / bill B (the closed-shift case) |
| Two terminals | Shift service only | `shift-service.test.ts` | Orders/payments isolated by header |

---

## 15. Test Gaps

Must-add for M4-D (no M5 math tests):

1. Flag default off: existing payment/order suites still NULL `shift_id` (regression).
2. Flag on, header, open shift: `POST /orders` writes `orders.shift_id`.
3. Flag on, no header: order and payment succeed; both `shift_id` NULL.
4. `applyPaymentBatch`: first payment stamps `bills.shift_id`; second partial does not change it.
5. Generate bill does not stamp; payment does.
6. Closed shift A, open B, pay old bill → `orders.shift_id=A`, `bills.shift_id=B`.
7. Cash gate off: cash without shift succeeds.
8. Cash gate on + enabled: cash without shift 409; card succeeds; split with cash rejected entirely.
9. Custom method not named `cash`: not gated.
10. Host `getOrCreateHostTerminalId` is **not** used when header missing on payment.
11. Playwright prepaid still works with flag off (no new header required for default installs).

---

## 16. Proposed M4-D Implementation Plan

Smallest safe slice. Reuse M4-C `getActiveShift` / `isShiftsEnabled`; M3 audit only if a new event is explicitly required (RFC does **not** require `shift.payment_blocked` in M4). **No new audit event required** for successful stamp (association is on the row). Optional failure audit for cash gate is M4+ and should stay out unless product asks.

### M4-D1 — Terminal identity

- **Files:** `frontend/src/lib/api.ts` (interceptor); small `frontend/src/lib/terminal-id.ts`; Server App `createApi()` **only if** product wants waiter association (default: skip).
- **Functions:** `getClientTerminalId()`; axios request interceptor sets `X-Flo-Terminal-Id`.
- **Behavior:** UUID in `localStorage` key `flo_terminal_id`; generated once per origin. Do not call host `GET /terminal-id` from LAN browser.
- **Risk:** Low. Flag off + unused header is ignored by current orders/payments until D2/D3.
- **Tests:** persist/reuse in a unit test; interceptor present.

### M4-D2 — Order integration

- **Files:** `main/services/shift.ts` (new `resolveActiveShiftForRequest`); `main/routes/orders.ts` `POST /` INSERT.
- **Functions:** `POST /` `withTxn` INSERT column list.
- **Behavior:** If helper returns a shift, set `orders.shift_id`. Else NULL. No other order routes.
- **Risk:** Medium (money-adjacent operational data). Idempotency must serialize `shift_id` in stored JSON (`SELECT *` after insert already would).
- **Tests:** §15 items 1–3, waiter create.

### M4-D3 — Payment/bill integration

- **Files:** `main/routes/bills.ts` `applyPaymentBatch` UPDATE only (not generate, not split-check).
- **Functions:** `applyPaymentBatch`.
- **Behavior:** Stamp `bills.shift_id` iff NULL and helper returns a shift. Read `X-Flo-Terminal-Id` / body the same way as `requestTerminalId` in `shifts.ts` — **extract shared helper** to avoid duplicate parsing (e.g. `main/services/shift.ts` `readTerminalIdFromRequest(req)` used by shifts + bills + orders).
- **Risk:** High (money path). Keep UPDATE in existing `withTxn`.
- **Tests:** §15 items 4–6, 10.

### M4-D4 — Cash enforcement

- **Files:** `main/routes/bills.ts` `preparePaymentBatch` or `applyPaymentBatch`; read `require_open_shift_for_cash` via `getSettingValue`.
- **Behavior:** If `shifts_enabled` and cash gate and any resolved cash line and no active shift → 409, no writes.
- **Risk:** High if accidentally on by default (default is `'false'`).
- **Tests:** §15 items 7–9.

### M4-D5 — Frontend/client integration

- **Files:** `api.ts` interceptor (D1); **not** StatusBar/modals (those are M4-E). Prepaid/PaymentModal need **no** payload change if interceptor sends the header.
- **Behavior:** Existing POS checkout automatically sends terminal id. Server App: no interceptor unless decided.
- **Risk:** Low if D1 is origin-scoped UUID.
- **Tests:** E2E prepaid still green; optional assert header on `/api/orders`.

### M4-D6 — Tests

- **Files:** new `tests/shift-pos-integration.test.ts` (or extend payments/happy-path with flag-on cases). Do **not** weaken existing suites.
- **Risk:** Coverage gaps if only unit-mocked.

### M4-D7 — Documentation

- **Files:** RFC M4-D section, `progress.md`, `api-specification.md`, `permissions.md`, `data-model.md`. Correct RFC `/current` vs `/active` and “no shift_id column” stale text.
- **Not:** M5 formula implementation.

---

## 17. Files Expected to Change

| File | Why |
|------|-----|
| `main/services/shift.ts` | Shared `resolveActiveShiftForRequest` + request terminal parser |
| `main/routes/shifts.ts` | Use shared parser (no behavior change) |
| `main/routes/orders.ts` | INSERT `shift_id` |
| `main/routes/bills.ts` | `applyPaymentBatch` stamp + cash gate |
| `frontend/src/lib/api.ts` | `X-Flo-Terminal-Id` interceptor |
| `frontend/src/lib/terminal-id.ts` | **new** persist helper |
| `tests/shift-pos-integration.test.ts` | **new** |
| docs listed in D7 | Status + API |

**Unchanged (M4-D):** `main/db.ts` (no migration), payment_details shape, held-orders, KDS, discounts, voids, `package.json` scripts except adding the new test to `test:security` or `npm test` if required by repo convention.

**Out of scope:** StatusBar, open/close modals, i18n (M4-E); expected cash (M5); refunds (M6); drawer (M8).

---

## 18. M5 Compatibility

Target formula:

```
expected_cash = opening_float_cents
              + SUM(cash payment amounts on bills where shift_id = this shift)
              - SUM(cash refunds)
              ± approved adjustments
```

| Input | After proposed M4-D? |
|-------|----------------------|
| `opening_float_cents` | Yes (M4-C) |
| Cash payments per shift | Yes, **if** `bills.shift_id` stamped at payment and cash lines stay `method==='cash'` with applied `amount` |
| Cash refunds | **No rows exist.** M6. Formula term = 0 |
| Adjustments | None |
| `counted_cash_cents` | Yes (M4-C close) |

**Would block M5 if M4-D:**

- stamped `bills.shift_id` at **generate** time (wrong session if paid later);
- copied `orders.shift_id` onto bills (closed-shift-then-pay case);
- used host terminal fallback (LAN cash mixed into one shift);
- stored only tendered cash without applied `amount` (already have applied `amount`).

**Not blocking:** NULL `shift_id` on card-only or flag-off bills (M5 queries `WHERE shift_id = ?`).

**Watch:** first-payment-wins if a partial is taken on terminal A and completed on terminal B — B’s cash still sits on A’s shift (RFC §9.2). Call out in M5 UX, do not change in M4-D unless product reopens it.

Custom method named `cash` would enter the cash sum — same as today’s drawer allocation.

---

## 19. Open Product Decisions

Marking only what RFC + code do **not** fully pin down for M4-D:

| ID | Decision | RFC / code | Recommendation |
|----|----------|------------|----------------|
| **PD-1** | Missing `X-Flo-Terminal-Id` on order/payment when shifts enabled | RFC §20: NULL, payment succeeds (unless cash gate) | **Follow RFC.** No host fallback. |
| **PD-2** | Browser identity source | RFC localStorage `flo_terminal_id` (unimplemented) | Per-origin UUID in localStorage. LAN browser must **not** use `GET /api/shifts/terminal-id` (host id). |
| **PD-3** | Electron seed from host setting | OD-5 said settings API; code has GET `/terminal-id` | Optional: Electron only, if localStorage empty. |
| **PD-4** | Server App / waiter orders and shift_id | RFC: set at create if terminal has open shift | Same helper; they likely send **no** header → NULL. Do not invent store-wide shift. |
| **PD-5** | Partial pay on terminal A, finish on B | RFC §9.2 keep first `bills.shift_id` | Keep RFC. Document M5 mixing. |
| **PD-6** | Cash-gate HTTP status | Unspecified | **409** |
| **PD-7** | Custom method named `cash` | RFC §15.3 “unless name resolves to cash”; code uses `=== 'cash'` | Keep code behavior; gate and M5 use the same predicate. |
| **PD-8** | Stamp bill at generate vs payment | RFC §15.1 payment | **Payment only.** |
| **PD-9** | RFC §21.6 “cannot pay against closed shift” | Conflicts with §20 and dual-column design if read as a payment **block** | Interpret as **do not attribute to a closed shift**; allow pay into current open shift or NULL. |
| **PD-10** | Audit event when cash gate rejects | RFC: `shift.payment_blocked` **not required in M4** | Skip in M4-D. |
| **PD-11** | Same-origin Electron + localhost browser tab | Not specified | Shared `localStorage` = one terminal. Document. |

RFC OD-1…OD-5: OD-1 done in M4-C; OD-2 not M4-D; OD-3 is D4; OD-4 header (plus body already on shift APIs); OD-5 implemented as GET `/terminal-id`, not settings PUT.

---

## 20. Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R-D1 | Host-terminal fallback on POS writes merges all LAN cash | Never call `getOrCreateHostTerminalId` from orders/bills |
| R-D2 | Browser omits header → NULL shift / ungated cash | Interceptor (D1) + cash gate (D4) |
| R-D3 | Stamping at bill generate mis-attributes late payments | Stamp only in `applyPaymentBatch` |
| R-D4 | Copying `orders.shift_id` onto bills breaks M5 for closed-then-pay | Dual semantics; tests for §11.1 |
| R-D5 | Cash gate default accidentally true | Keep setting `'false'`; test flag-off |
| R-D6 | Duplicate shift lookup diverges | One helper in `shift.ts` |
| R-D7 | In-flight payment after physical count | UI warn (M4-E); no new locks |
| R-D8 | `terminal_id` spoofing | Accept as identification; no registry in M4 |
| R-D9 | Playwright/E2E assume no extra headers | Interceptor is additive; flag off → NULL |
| R-D10 | RFC text still describes pre-M4-B world | Fix in D7 docs, not by changing POS to match stale RFC |

---

## 21. Recommendation

**Proceed with M4-D as a thin integration**, not a workflow redesign.

1. **M4-D1** client `flo_terminal_id` + `X-Flo-Terminal-Id` interceptor.  
2. **M4-D2** `POST /api/orders` INSERT `shift_id` via one resolver.  
3. **M4-D3** `applyPaymentBatch` stamps `bills.shift_id` if NULL.  
4. **M4-D4** cash gate inside that same payment function, default off.  
5. **M4-D6/D7** tests and docs.

Do **not** start M4-E UI or M5 math until D2–D4 are green and the dual order-vs-payment shift case is tested.

**Do not** add migrations, new tables, new RBAC, or a second shift lookup.

Default installs (`shifts_enabled=false`) must keep current POS behavior: orders without a shift, payments without a shift.

---

## 22. M4-D1 implementation status

**M4-D1 = IMPLEMENTED** (2026-08-12). **M4-D2, M4-D3, M4-D4, M4-D5 UI, M4-D6 POS integration suite, M5 = NOT IMPLEMENTED.**

This section records what shipped. It does not change the D2+ recommendations above.

### What shipped

| Piece | Behavior |
|-------|----------|
| Browser / Electron renderer identity | `frontend/src/lib/terminal-id.ts` `getClientTerminalId()` |
| Storage key | `localStorage['flo_terminal_id']` (not `cloud_pos_id`, user id, JWT, hostname, or IP) |
| Generation | `crypto.randomUUID()` once per origin; reused on refresh/restart |
| Header | `X-Flo-Terminal-Id` on **POS order create**, **bill payment(s)**, and **shift active/open/close** only |
| Host terminal | Unchanged. `GET /api/shifts/terminal-id` still returns `settings.terminal_id` and **ignores** a client header |
| Server App / KDS | No terminal header (separate axios / non-matching routes) |
| Schema | No migration. `orders.shift_id` / `bills.shift_id` still unused |

### Same-origin Electron + localhost browser

Electron loads `http://localhost:3001`. A browser tab on that **same origin** shares `localStorage`, so it **intentionally** shares `flo_terminal_id` (one physical register).

A LAN POS tab on `http://<lan-ip>:3001` is a **different origin** and generates its **own** UUID. Browser POS **never** calls `GET /api/shifts/terminal-id` to obtain identity.

### Security

`terminal_id` is **identification**, not authentication. JWT + `requireRole()` remain authoritative. A valid terminal header does not grant waiter/chef/unauthenticated access. There is still **no** terminal registry.

### Tests

- `tests/terminal-identity.test.ts` — generate, persist, refresh, header policy, missing storage, invalid stored id, no host fetch
- `tests/shift-service.test.ts` — host id unchanged, invalid/missing header, header does not grant authorization

---

## 23. M4-D2 implementation status

**M4-D2 = IMPLEMENTED** (2026-08-12). **M4-D3, M4-D4, M4-E UI, M5 = NOT IMPLEMENTED.**

### What shipped

| Piece | Behavior |
|-------|----------|
| Shift resolution helper | `main/services/shift.ts` `resolveActiveShiftForOrder(terminalIdHeader)` |
| Order creation integration | `main/routes/orders.ts` `POST /` resolves shift and inserts `orders.shift_id` inside existing `withTxn()` |
| Feature flag OFF | `orders.shift_id = NULL` |
| Feature flag ON + active shift | `orders.shift_id = active_shift.id` |
| Feature flag ON + no active shift | `orders.shift_id = NULL` (order creation not blocked) |
| Missing terminal header | `orders.shift_id = NULL` (no host terminal fallback used) |
| Malformed terminal header | HTTP 400 (`terminal_id is invalid`); transaction rolls back cleanly; no order created |
| Server App / Waiters | Order creation without terminal header succeeds with `orders.shift_id = NULL` |
| Order shift immutability | `orders.shift_id` is set ONLY on creation. Adding items, discounts, voids, item cancellations, takeaway conversion, and table transfers retain original `shift_id` |
| Security & Auth | Authentication and role permissions (`requireRole`) remain unchanged |

### Tests

- `tests/shift-order-integration.test.ts` — test suite covering all 10 edge case scenarios.

---

## 24. M4-D3 implementation status

**M4-D3 = IMPLEMENTED** (2026-08-12). **M4-D4, M4-E UI, M5 = NOT IMPLEMENTED.**

### What shipped

| Piece | Behavior |
|-------|----------|
| Generic shift resolution helper | `main/services/shift.ts` `resolveActiveShiftForTerminal(terminalIdHeader)` |
| Payment integration | `main/routes/bills.ts` `applyPaymentBatch` resolves active shift for terminal at FIRST payment time inside existing `withTxn()` |
| Attribution rule | `bills.shift_id` is assigned at FIRST PAYMENT time (not bill generation or order creation) |
| Order vs Bill shift independence | `orders.shift_id` and `bills.shift_id` are strictly independent (`orders.shift_id` is NEVER copied to `bills.shift_id`) |
| Partial payment immutability | Once `bills.shift_id` is assigned on first payment, subsequent payments never overwrite it |
| Feature flag OFF | `bills.shift_id = NULL` |
| Feature flag ON + active shift | `bills.shift_id = active_shift.id` |
| Feature flag ON + no active shift | `bills.shift_id = NULL` (payment still succeeds) |
| Missing terminal header | `bills.shift_id = NULL` (no host terminal fallback used) |
| Malformed terminal header | HTTP 400 (`terminal_id is invalid`); transaction rolls back cleanly; no payment recorded |
| Multi-terminal isolation | Terminal T1 payment gets T1 shift, Terminal T2 payment gets T2 shift |

### Tests

- `tests/shift-bill-payment-integration.test.ts` — test suite covering all 16 edge case scenarios.

### Explicitly not in M4-D3

- Cash payment enforcement (implemented in M4-D4)
- Shift UI (M4-E)
- M5 reconciliation

---

## 25. M4-D4 implementation status

**M4-D4 = IMPLEMENTED** (2026-08-12). **M4-D5+, M4-E UI, M5 = NOT IMPLEMENTED.**

### What shipped

| Piece | Behavior |
|-------|----------|
| Gate helper | `main/services/shift.ts` `isCashPaymentGateEnabled()`, `assertOpenShiftForCashPayment(terminalIdHeader)` |
| Enforcement point | `main/routes/bills.ts` `applyPaymentBatch()` — after `preparePaymentBatch`, before any payment writes |
| Activation | **Both** `shifts_enabled=true` **and** `require_open_shift_for_cash=true` (defaults remain `false`) |
| Cash identification | Resolved payment line `method === 'cash'` with `amountCents > 0` (same predicate as cash allocation in `preparePaymentBatch`) |
| Custom methods | Custom catalog name exactly `cash` is treated as cash; other custom names are non-cash |
| Block condition | Gate on + cash line + (`X-Flo-Terminal-Id` missing **or** no open shift for that terminal) |
| Non-cash | Card, wallet, and non-cash custom methods are **never** blocked by this gate |
| Error | HTTP **409** `{ "error": "An open shift is required for cash payments" }` (`ShiftServiceError` code `OPEN_SHIFT_REQUIRED`) |
| Invalid terminal | HTTP **400** via existing `parseTerminalId` (unchanged M4-D1/D3 behavior) |
| Atomicity | Blocked payment rolls back entire `withTxn()` — no `payment_details`, `paid_amount`, `bills.shift_id`, or order completion writes |
| Mixed batches | Cash + card in one `POST /payments` batch is rejected atomically when gate blocks |
| Host fallback | **Not used** — missing header blocks cash when gate is on |
| M4-D3 compatibility | `bills.shift_id` first-payment attribution unchanged; gate checks **current** terminal open shift only |
| Audit | No new audit event (RFC did not require `shift.payment_blocked` in M4) |
| Schema | No migration (uses existing `require_open_shift_for_cash` setting from v69) |

### Configuration matrix (verified)

| shifts_enabled | require_open_shift_for_cash | Payment | Active shift | Result |
|---|---|---|---|---|
| false | false | cash | no | ALLOW |
| false | true | cash | no | ALLOW |
| true | false | cash | no | ALLOW |
| true | true | cash | yes | ALLOW |
| true | true | cash | no | **BLOCK 409** |
| true | true | card/wallet/custom | no | ALLOW |

### Tests

- `tests/cash-payment-gate.test.ts` — configuration matrix, terminal isolation, partial/cross-terminal payments, mixed batches, atomicity, auth regression

### Explicitly not in M4-D4

- Expected/counted cash, variance, day close (M5)
- Shift UI (M4-E)
- Frontend payment workflow changes beyond displaying existing API errors

---

## 26. M4-D5 implementation status

**M4-D5 = IMPLEMENTED** (2026-08-12). **M4-E UI, M5 = NOT IMPLEMENTED.**

### What shipped

| Piece | Behavior |
|-------|----------|
| Header parser | `readTerminalIdHeaderFromRequest(req)` — reads `X-Flo-Terminal-Id` only; no host fallback |
| Strict helper | `assertOpenShiftForPosTerminal(terminalIdHeader)` — no-op when `shifts_enabled=false`; when enabled: missing header or no open shift → **409** `{ "error": "An open shift is required for this terminal" }`; malformed → **400** via `parseTerminalId` |
| Middleware | `requireOpenShiftForTerminal()` in `main/middleware/shift-enforcement.ts` — attaches `req.floActiveShift` on success |
| Route consolidation | `orders.ts`, `bills.ts`, `shifts.ts` use shared header parser (behavior unchanged) |
| Production wiring | **None** — RFC §9/§20 does not authorize mandatory shift on order/payment routes; soft attribution via `resolveActiveShiftForTerminal` unchanged |
| M4-D4 compatibility | `assertOpenShiftForCashPayment()` unchanged; separate message and activation (`require_open_shift_for_cash`) |
| Schema | No migration (stays v69) |

### Routes affected

| Route | M4-D5 change |
|-------|----------------|
| `POST /api/orders` | Header parsing only (soft `shift_id` attribution unchanged) |
| `POST /api/bills/:id/payment(s)` | Header parsing only (M4-D3/D4 logic unchanged) |
| Shift routes | Header parsing only |
| All other routes | Unchanged |

Strict middleware is available for future opt-in routes (e.g. M4-E protected workflows) but is **not** applied globally.

### Tests

- `tests/shift-enforcement.test.ts` — helper/middleware matrix, terminal isolation, RBAC, regression against M4-D2/D3/D4, Server App compatibility

### Explicitly not in M4-D5

- Shift UI (M4-E)
- Global mandatory shift before orders/payments
- Expected/counted cash, variance, day close (M5)
- New settings beyond existing `shifts_enabled` / `require_open_shift_for_cash`
- New audit events


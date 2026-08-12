# API Specification

## CURRENT STATE

FloCafe exposes a REST JSON API on port **3001** (default).

**Legacy reference:** `docs/API.md` — contains known stale endpoints; verify against source before use.

**Route registry:** `main/routes/index.ts`

### Authentication endpoints
| Method | Path | Auth |
|--------|------|------|
| POST | /api/auth/login | Public |
| POST | /api/auth/logout | Bearer |
| POST | /api/auth/refresh | Bearer |
| GET | /api/auth/me | Bearer |
| POST | /api/auth/setup/initialize | Public (first-run) |
| GET | /api/auth/setup/status | Public (first-run) |
| GET | /api/health | Public |

Staff creation: **`POST /api/staff`** or **`POST /api/users`** (same router). There is **no** `POST /api/auth/register`.

### Core resource groups
| Prefix | Module |
|--------|--------|
| /api/categories | Menu categories |
| /api/products | Products + images + stock |
| /api/addon-groups | Modifiers |
| /api/orders | Order lifecycle |
| /api/bills | Billing and payments (incl. partial via `payment_status`) |
| /api/tables | Table management |
| /api/customers | CRM |
| /api/staff, /api/users | Staff management |
| /api/kitchen-stations | KDS stations |
| /api/kds | Kitchen display |
| /api/printers | Printing (network, usb, webusb) |
| /api/reports | Analytics + day close (M5-G) |
| /api/settings | Configuration |
| /api/tax-packs | Tax configuration |
| /api/db, /api/db-tools | Database management |
| /api/held-orders | Held carts |
| /api/whatsapp | WhatsApp integration |
| /api/audit-logs | Business audit trail (owner/manager read) |
| /api/shifts | Shift lifecycle (M4-C; 503 when `shifts_enabled=false`) |

### Day close (M5-G)

**Auth:** Bearer, `owner` or `manager`. Independent of `shifts_enabled` (does not block POS after close).

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/reports/day-close` | Body `{ business_date?: YYYY-MM-DD }`; defaults to today in `settings.timezone`. **201** `{ day_close, summary }`; **409** if already closed (`DAY_CLOSE_EXISTS`) |
| GET | `/api/reports/day-close/:date` | `:date` = `YYYY-MM-DD`. **200** `{ day_close, summary }` or **404** |

`day_close`: `{ id, business_date, closed_by_user_id, summary_json, created_at }`

`summary` (also stored as `summary_json`): `business_date`, `timezone`, `shift_count`, `open_shift_count`, `open_shifts_warning`, `opening_float_cents_total`, `expected_cash_cents_total`, `counted_cash_cents_total`, `variance_cents_total`, `cash_payment_total_cents`, `cash_payment_count`, `shifts[]` (per closed shift: ids, terminals, float/expected/counted/variance, opened/closed timestamps).

Business date = local calendar day in `settings.timezone` (OD-M5-5), not UTC. Aggregates **CLOSED** shifts whose `closed_at` falls in the local `[start, end)` window. Open shifts set `open_shifts_warning` but do not block (OD-M5-6). Empty day allowed. Audit: `day.closed` / `entity_type=day_close` on successful POST only.

### GET /api/audit-logs

**Auth:** Bearer, `owner` or `manager`

**Query:** `limit` (1–500, default 100), `offset`, `action`, `entity_type`, `entity_id`, `actor_user_id`, `since`

**Response:** `{ audit: AuditLogEntry[] }` — newest first

### Shift endpoints (M4-C + M5-E)

All require Bearer auth. When `shifts_enabled` is not `'true'`, lifecycle endpoints (including reconciliation preview) return **503** `{ error: "Shift management is disabled" }`. This does **not** affect `/api/orders`, `/api/bills`, or day-close routes.

Monetary fields are **integer cents**. Notes/reasons max 500 characters.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/shifts/terminal-id` | owner, manager, cashier | Return (and create if empty) host `settings.terminal_id` |
| GET | `/api/shifts/active` | owner, manager, cashier | Query/header `terminal_id` — `{ shift }` or `{ shift: null }` |
| GET | `/api/shifts` | owner, manager | Paginated history. Query: `limit` (1–100, default 50), `offset`, `terminal_id`, `status`, `opened_by_user_id`, `since`, `until` |
| GET | `/api/shifts/:id/reconciliation-preview` | owner, manager, cashier | Read-only expected cash + payment summary (**does not** close). Cashier: own terminal only (`terminal_id` / `X-Flo-Terminal-Id`). See response below. |
| GET | `/api/shifts/:id` | owner, manager | `{ shift, summary }` |
| POST | `/api/shifts/open` | owner, manager, cashier | Body: `terminal_id?`, `opening_float_cents`, `opening_note?`. Header `X-Flo-Terminal-Id` accepted. **201** `{ shift }` |
| POST | `/api/shifts/:id/close` | owner, manager, cashier | Body: `counted_cash_cents?`, `closing_note?`, `terminal_id?` (required for cashier; must match shift terminal). Persists `expected_cash_cents` + `variance_cents`. Response `{ shift, summary }` |
| POST | `/api/shifts/:id/force-close` | owner, manager | Body: `reason` (required), `counted_cash_cents?`, `closing_note?`. Same reconciliation persistence. Response `{ shift, summary }` |

**Payment summary** (`summary` on GET `/:id`, close, force-close):

```json
{
  "cash_payment_count": 42,
  "cash_payment_total_cents": 99500,
  "non_cash_payment_total_cents": 350000
}
```

**Reconciliation preview** (`GET /:id/reconciliation-preview`):

```json
{
  "shift": { "...": "..." },
  "opening_float_cents": 25000,
  "expected_cash_cents": 124500,
  "counted_cash_cents": null,
  "variance_cents": null,
  "summary": {
    "cash_payment_count": 42,
    "cash_payment_total_cents": 99500,
    "non_cash_payment_total_cents": 350000
  }
}
```

Open shifts: live `expected_cash_cents` (= opening float + cash payments on bills with that `shift_id`); `counted_cash_cents` / `variance_cents` always `null`. Closed shifts: persisted expected/variance/count when present; `summary` recomputed from bills (no writes). Formula: `expected = opening_float_cents + cash_payment_total_cents`; `variance = counted - expected` or `null` if counted omitted. Refunds contribute zero until M6.

**Errors:** `{ error: string }` — 400 validation, 401 unauthenticated, 403 forbidden, 404 missing shift, 409 already open/closed, 503 feature disabled. SQL/stack traces are not returned.

**Implemented:** order creation shift assignment (M4-D2), first bill payment shift assignment (M4-D3), optional cash payment gate (M4-D4), close reconciliation persistence (M5-D), preview + summary responses (M5-E).

When `shifts_enabled=true` and `require_open_shift_for_cash=true`, cash payment endpoints return **409** `{ "error": "An open shift is required for cash payments" }` if `X-Flo-Terminal-Id` is missing or that terminal has no open shift. Card, wallet, and non-cash custom methods are unaffected.

**M4-D5 enforcement foundation:** `assertOpenShiftForPosTerminal()` and `requireOpenShiftForTerminal()` middleware provide strict opt-in shift checks when `shifts_enabled=true`. Missing header or no open shift → **409** `{ "error": "An open shift is required for this terminal" }`. Not applied to order/payment routes (soft attribution unchanged). No host fallback.

POS clients (M4-D1) send `X-Flo-Terminal-Id` from `localStorage['flo_terminal_id']` on order create, bill payments, and shift active/open/close/reconciliation-preview. The header is identification, not authorization. `GET /api/shifts/terminal-id` remains the **host** id and is not used as browser identity.


Full endpoint list: see `03-architecture/backend-architecture.md` and source files in `main/routes/`.

## TARGET STATE
- Auto-generated OpenAPI 3.1 spec (PROPOSED)
- Webhook documentation in `webhooks.md` (NOT IMPLEMENTED)

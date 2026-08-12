# FloCafe context

Electron desktop POS. `main/` is Express + SQLite (better-sqlite3, WAL, `PRAGMA user_version`). `frontend/` is statically exported Next.js.

## Active work

**M5 Cash Reconciliation — GREEN through M5-H.** Schema v71. Preview API, close persistence, reconciliation UI, and day close are shipped and verified. **M6 not started.**

## Architecture

- Shift business logic: `main/services/shift.ts`
- Cash payment classification (M4-D4 / M5-C): `main/services/payment-cash.ts`
- Day close (M5-G): `main/services/day-close.ts`, routes on `main/routes/reports.ts`
- Shift enforcement middleware: `main/middleware/shift-enforcement.ts`
- Shift frontend client: `frontend/src/lib/shifts.ts`, `frontend/src/hooks/useShift.ts`
- Day close client/UI: `frontend/src/lib/day-close.ts`, `frontend/src/components/dashboard/DayCloseCard.tsx`
- Shift UI: `frontend/src/components/shifts/*`, integrated in `StatusBar.tsx` and Settings shift history
- HTTP: `main/routes/shifts.ts`
- Client terminal identity: `frontend/src/lib/terminal-id.ts` (`localStorage['flo_terminal_id']`)
- Auth: JWT + `requireRole()` — terminal id is identification only

## Formulas (M5)

- `expected_cash_cents = opening_float_cents + SUM(qualifying cash on bills WHERE shift_id = shift)`
- `variance_cents = counted_cash_cents - expected_cash_cents` when counted provided; else `NULL`
- Refunds contribute zero until M6

## Day close (M5-G)

- Business date = calendar day in `settings.timezone` (OD-M5-5)
- Aggregates CLOSED shifts whose `closed_at` falls in local `[start, end)` window
- Uses persisted expected/variance/counted on shifts; recomputes cash payment totals from bills
- Open shifts → warning, still allow (OD-M5-6); UNIQUE(business_date) → 409
- Does not block POS after day close

## Next step

M6 — Refund workflow (do not start until approved).

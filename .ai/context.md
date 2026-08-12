# FloCafe context

Electron desktop POS. `main/` is Express + SQLite (better-sqlite3, WAL, `PRAGMA user_version`). `frontend/` is statically exported Next.js.

## Active work

**M5 Cash Reconciliation — GREEN through M5-H.** Schema v71.

**UI/UX Redesign — complete app migration (Phases 1–12 + completion pass + dark mode + POS modals + KDS/shifts components).** All 23 page routes Flo-migrated; Settings visual complete; Phase 3 modals complete for workspaces; dark mode shipped (`flo_theme`); POS modals use shadcn Dialog + Flo tokens (`test:flo-pos-modals`); KDS/shifts/layout/ImageUploader Flo-migrated. Guards: `test:flo-routes-complete`, `test:flo-settings-complete`, `test:flo-theme`, `test:flo-pos-modals`, `test:flo-components-complete`. **M6 not started.** Settings nested-route split remains optional.

## Architecture

- Shift business logic: `main/services/shift.ts`
- Cash payment classification (M4-D4 / M5-C): `main/services/payment-cash.ts`
- Day close (M5-G): `main/services/day-close.ts`, routes on `main/routes/reports.ts`
- Shift enforcement middleware: `main/middleware/shift-enforcement.ts`
- Shift frontend client: `frontend/src/lib/shifts.ts`, `frontend/src/hooks/useShift.ts`
- Day close client/UI: `frontend/src/lib/day-close.ts`, `frontend/src/components/dashboard/DayCloseCard.tsx` (surfaced on `/operations`)
- Shift UI: `frontend/src/components/shifts/*`, history on `/operations` via `ShiftHistoryPanel`
- Flo shell: `frontend/src/components/flo/*`, nav config `frontend/src/config/navigation.ts`
- Reports hub: `frontend/src/app/(dashboard)/reports/page.tsx` (analytics APIs)
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

Optional Settings nested-route / IA trim refactor, or M6 only if explicitly approved. Dark mode shipped.

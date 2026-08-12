# FloCafe context

Electron desktop POS. `main/` is Express + SQLite (better-sqlite3, WAL, `PRAGMA user_version`). `frontend/` is statically exported Next.js.

## Active work

**M4-E3 Shift UI polish — implemented.** Stale warnings + shift history. Schema remains v69 from M4-B.

## Architecture

- Shift business logic: `main/services/shift.ts`
- Shift enforcement middleware: `main/middleware/shift-enforcement.ts`
- Shift frontend client: `frontend/src/lib/shifts.ts`, `frontend/src/hooks/useShift.ts`
- Shift UI: `frontend/src/components/shifts/*`, integrated in `StatusBar.tsx` and Settings shift history
- HTTP: `main/routes/shifts.ts`
- Client terminal identity: `frontend/src/lib/terminal-id.ts` (`localStorage['flo_terminal_id']`)
- Auth: JWT + `requireRole()` — terminal id is identification only

## Next step

M5 only when explicitly approved.

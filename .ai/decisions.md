# Decisions

See `docs/14-decisions/ADR-007-shift-model.md` (per-terminal shift).

M4-C choices:

- HTTP path for the current shift is `GET /api/shifts/active` (RFC also mentioned `/current`).
- Monetary API fields are integer cents.
- `shifts_enabled=false` → shift APIs return 503; orders/payments unchanged.
- Host `terminal_id` is generated once into `settings.terminal_id`. Browser clients must send their own id.

M4-D1 choices:

- Browser/Electron renderer persist `localStorage['flo_terminal_id']` via `crypto.randomUUID()`.
- Do **not** seed browser identity from `GET /api/shifts/terminal-id` (that is the host id).
- Same-origin Electron renderer + localhost tab share the key (one register). LAN IP origin gets its own UUID.
- `X-Flo-Terminal-Id` is attached only to POST `/orders`, POST `/bills/:id/payment(s)`, GET `/shifts/active`, POST `/shifts/open`, POST `/shifts/:id/close`.
- Server App does not send a terminal header.

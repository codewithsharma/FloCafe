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

M5-G choices (locked):

- OD-M5-5: business date = calendar day in `settings.timezone` (default Asia/Kolkata), not UTC.
- OD-M5-6: day close with open shifts = WARN in summary, still allow.
- Schema version **v71** for `day_closes` (v70 shipped without day_closes).
- UNIQUE(business_date) → 409; GET returns existing; POST creates once.
- Owner/manager only; do not block POS after day close.
- Aggregate CLOSED shifts by `closed_at` in local business-date window; use persisted expected/variance/counted.

UI Phase 11 (Settings):

- Flo-restyle shell + tab bodies on Flo tokens; nested `/settings/*` route split remains optional IA (dirty save bar + Electron deep links).
- Keep shifts tab + `ShiftHistoryPanel`; add link note to `/operations`.

UI dark mode:

- Persist preference in `localStorage['flo_theme']` as `light` | `dark` | `system`.
- Apply via `document.documentElement.classList.toggle('dark', …)`; FOUC bootstrap in root layout.
- Sidebar `ThemeToggle` cycles modes; AppShell listens for system preference changes when `system`.

POS modals Flo migration:

- Replace custom `fixed inset-0 bg-black/*` overlays with shadcn `Dialog`.
- Flo tokens (`bg-flo-surface`, `border-flo-border`, `text-flo-brand-600`, `min-h-11`) on Payment/Prepaid/Addon/Table/Split/Customer/Printer chrome.
- Guard: `test:flo-pos-modals` wired into `test:security`.

KDS/shifts/misc Flo components:

- KDS login uses `AuthShell`; `KdsItemModal` and product `ImageUploader` crop UI use shadcn `Dialog`.
- Shift history/preview/status/modals + UpdateBadge/AuthGuard spinner on Flo tokens; preserve STATUS_CONFIG kitchen colors.
- Guard: `test:flo-components-complete` greps `pos|kds|shifts|settings|layout|products` for legacy overlays/card shells; wired into `test:security`.

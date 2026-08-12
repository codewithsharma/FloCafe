# Risks

- ⚠️ RISK: Electron renderer `flo_terminal_id` and host `settings.terminal_id` may differ. POS requests send the client id; header-less `openShift` still uses the host id.
- ⚠️ RISK: Lost `terminal_id` (cleared localStorage) orphans an open shift; managers must force-close.
- 🔴 DEBT: `orders.shift_id` / `bills.shift_id` exist but are not written (M4-D2/D3).
- 🔒 SEC: `terminal_id` is identification, not authentication. Cashier close is authorized by matching `terminal_id` string plus JWT role — knowing the id is sufficient. No terminal registry in M4.

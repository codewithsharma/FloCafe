# Phase 3.6F — Cash Drawer Kick

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**

---

## Objective

Authorized POS users can deliberately kick the cash drawer via the existing ESC/POS printer stack (`dispatchPrint` + default printer). Hardware-only — no money-path / schema / accounting effects.

---

## Existing infrastructure reused

| Piece                              | Role                                                |
| ---------------------------------- | --------------------------------------------------- |
| `dispatchPrint`                    | Network/USB transport for raw ESC/POS buffers       |
| Default printer (`is_default = 1`) | Same selection as print-bill / refund / day-close Z |
| `printing` module                  | Shared commerce — Restaurant + Retail               |
| Auth `requireRole`                 | Same pattern as print-bill                          |

**Gap filled:** ESC/POS cash-drawer pulse `ESC p m t1 t2` (`0x1B 0x70 …`) was missing from formatters; transport already existed.

---

## Selected scope

1. `buildDrawerKick({ pin })` → kick `Buffer`
2. `kickCashDrawer(pin?)` → resolve default printer → `dispatchPrint`
3. `POST /api/printers/kick-drawer` — owner|manager|cashier
4. POS `PrinterStatus` dropdown: **Open cash drawer** (deliberate click; toast success/fail; retryable)

**Not in scope:** auto-kick on cash payment, schema flag, WebUSB browser kick parity, drawer accounting, payment coupling.

---

## Endpoint

```text
POST /api/printers/kick-drawer
Auth: owner | manager | cashier
Body (optional): { pin?: 2 | 5 }   // default pin 2 (ESC p m=0)
Success: 200 { success: true }
No printer: 400
Hardware fail: 502 { error, detail }
WebUSB default: 200 { success: true, webusb: true, bytes: number[] } (browser sends; no Electron WebUSB)
```

No DB writes. No `print_logs` (no bill_id).

---

## Authorization

Matches cashier-capable print actions (`print-bill` / `print-refund`). Does **not** widen beyond those roles.

---

## Hardware behavior

- Best-effort pulse only.
- Failure does not mutate POS/business state.
- Success does not imply cash movement.

---

## Vertical

Shared `printing` module → Restaurant PASS, Retail PASS. No tables/KDS.

---

## Tests

- `npm run test:cash-drawer-kick`
- Existing `test:printer` remains green
- Isolation + payment/refund/day-close regressions

---

## Explicit non-goals

Auto-open on pay · schema · FIN-01 · day-close · shifts · WebUSB rewrite · P1.6 · 3.5B/3.5C · money path

---

## Money path / schema / ownership

| Axis                  | Status            |
| --------------------- | ----------------- |
| Money path            | **UNCHANGED**     |
| Schema                | **v75 unchanged** |
| Transaction ownership | **UNCHANGED**     |

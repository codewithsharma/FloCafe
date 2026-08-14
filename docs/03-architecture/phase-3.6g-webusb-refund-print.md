# Phase 3.6G — WebUSB Refund Print Parity

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**

---

## Objective

Refund proof slips printable through the existing WebUSB/browser ESC/POS path, reusing the server `formatRefundReceipt` formatter and client `printerService.print`, without changing refund money semantics or the network/USB server print path.

---

## Existing WebUSB architecture

| Piece                                                   | Role                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `frontend/src/lib/printer/PrinterService.ts`            | WebUSB connect + `transferOut`                                    |
| `frontend/src/hooks/usePrinter.ts`                      | Bill/KOT: server if non-webusb default; else client WebUSB encode |
| `POST /printers/:id/test`, `POST /printers/kick-drawer` | Already return `{ webusb: true, bytes }` for webusb printers      |
| `main/printers/thermal.ts` `dispatchPrint`              | Refuses webusb (Electron cannot claim device)                     |

Phase 3.6A refund print used only `dispatchPrint` → **502 when default printer is webusb**.

---

## Implementation

1. **Server:** `POST /printers/print-refund` — if default printer `connection_type === 'webusb'`, format via existing `formatRefundReceipt`, return `{ success, webusb: true, bytes, refundId, billId }` (no `dispatchPrint`).
2. **Client:** `refund-receipt-print.ts` — if response `webusb` + `bytes`, send via `printerService.print(Uint8Array)`; require connected WebUSB; then existing audit `print_type: refund`.
3. Network/USB path unchanged.

---

## UX / failure

- Explicit modes: server hardware vs WebUSB bytes handoff (same as test/kick-drawer).
- Print failure → refund money unchanged; retry via OrderCard.
- No optimistic printed state; audit only after successful send (server path) or successful WebUSB transfer.

---

## Vertical

Shared `printing` + `refund` modules. No tables/KDS.

---

## Schema / money / ownership

| Axis                  | Status        |
| --------------------- | ------------- |
| Schema                | v75 unchanged |
| Money path            | UNCHANGED     |
| Transaction ownership | UNCHANGED     |

---

## Explicit non-goals

New printer framework · frontend refund encoder port · auto-print redesign · browser HTML refund template · kick-drawer client byte send fix · schema · P1.6 · 3.5B/3.5C

---

## Known limitations

- WebUSB requires Chrome/Edge + user gesture connect (POS toolbar).
- Default printer must be a saved `webusb` row for this handoff; network/USB defaults still use server dispatch.
- Electron main process cannot drive WebUSB devices (by design).

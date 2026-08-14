# Phase 3.6D — Day-Close Z Snapshot Print / Download

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**

---

## Objective

Owner/manager can print or download a human-readable **cash day-close Z snapshot** from the frozen `day_closes.summary_json` after close — without opening raw JSON or changing accounting.

---

## Existing API contract (authoritative)

```text
POST /api/reports/day-close  → { day_close, summary }
GET  /api/reports/day-close/:date → { day_close, summary }
Auth: owner | manager
```

`DayCloseSummary` (frozen at close) includes:

- `business_date`, `timezone`
- `shift_count`, `open_shift_count`, `open_shifts_warning`
- `opening_float_cents_total`
- `expected_cash_cents_total`, `counted_cash_cents_total`, `variance_cents_total`
- `cash_payment_total_cents`, `cash_payment_count` (Cash In)
- `cash_refund_total_cents`, `cash_refund_count` (Cash Refunds)
- `net_cash_movement_cents` (Cash In − Cash Refunds)
- `shifts[]` per-terminal cash rows

---

## Explicit omissions (not in day-close API)

Do **not** invent or live-fetch into the Z snapshot:

- Gross sales / refunds / net sales (live report fields only — not frozen in day-close)
- Full tender mix (card/wallet/etc.)
- Tax totals

Those remain on Reports / daily-stats (Phase 3.6B). This Z is a **cash reconciliation snapshot**.

---

## Selected output formats

| Path     | Mechanism                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Download | Plain-text `.txt` blob from in-memory `summary` (client formatter; no new money math)                                              |
| Print    | Thermal ESC/POS via existing `dispatchPrint`; `POST /api/printers/print-day-close` `{ business_date }` loads frozen `summary_json` |

Banner: `** DAY CLOSE Z **`

---

## UI entry point

`DayCloseCard` (Operations) when a close exists (`summary` loaded / after close):

- Print Z Report
- Download Z Report

Print is best-effort; failure does not reopen or mutate day-close.

---

## Print / download paths

```
Closed day (summary present)
  → Download: formatDayCloseZPlainText(summary) → Blob download
  → Print: POST /printers/print-day-close → getDayClose → formatDayCloseZ → dispatchPrint
```

No `print_logs` for Z (bill_id FK; same as printer test). No WebUSB.

---

## Explicit non-goals

Accounting redesign · FIN-01 · tax · refunds · schema · Gross/Net in Z · full tender Z · PDF deps · WebUSB · service extraction · P1.6 · 3.5B

---

## Tests

- Focused `test:day-close-z` — formatter fields, UI actions, print route exists, no day-close formula edits
- Existing day-close / day-close-ui / financial-reporting / refunds remain green
- Restaurant / Retail isolation

---

## Vertical

`reporting` + `shift` are shared commerce → Restaurant and Retail both have day-close. No tables/KDS imports.

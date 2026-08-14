# Phase 4.8 — Reports Multi-Day Export Range

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**  
**Baseline:** Phase 4.4 accounting CSV (`20b3b13`)

---

## Summary

Reports owners/managers pick a **UTC start and end date** for accounting CSV export (and top-products). Default is today→today (previous single-day behavior). Client and server both cap inclusive range at **93 days**. `daily-stats` stays today-only; `/summary` stays single `?date=` (start date). No CSV column or money-formula changes.

---

## UI

Two native `<Input type="date">` fields. No calendar component.

| Control | Binding                                           |
| ------- | ------------------------------------------------- |
| Start   | `selectedDate` — dashboard day + CSV `start_date` |
| End     | `endDate` — CSV `end_date` + `topProducts` window |

Client validation: `frontend/src/lib/reports-date-range.ts` (`MAX_REPORTS_CSV_RANGE_DAYS = 93`).

---

## API

Unchanged: `GET /api/reports/export/bills.csv?start_date&end_date`

---

## Tests

`npm run test:phase-4.8` · `npm run test:phase-4.4` · `npm run test:flo-reports`

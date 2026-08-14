# Phase 4.4 — Accounting CSV Export Discovery

**Date:** 2026-08-14  
**Status:** DISCOVERY COMPLETE — **IMPLEMENTATION NOT STARTED**  
**Baseline:** Phase 4.3 (`9960e15`) · schema **v75**  
**Canonical money semantics:** [reporting-financial-semantics.md](../15-project-management/reporting-financial-semantics.md)

**Related:** [phase-4-product-completion-discovery.md](phase-4-product-completion-discovery.md) · [phase-3.6b-reports-gross-refunds-net-ui.md](../03-architecture/phase-3.6b-reports-gross-refunds-net-ui.md) · [phase-3.6d-day-close-z-snapshot.md](../03-architecture/phase-3.6d-day-close-z-snapshot.md)

---

## 1. Executive summary

Opervia already has **authoritative financial reporting** on the backend (`/api/reports/*`, `bills`, `refunds`, day-close, shifts) with **documented Gross / Refunds / Net / Payments Received semantics**. There is **no accounting CSV export today**.

**Verdict:** Phase 4.4 is **SAFE TO IMPLEMENT** as a **read-only, server-generated CSV** from existing bill + refund columns, without schema changes, money-path changes, or FIN-01 redesign.

**Smallest safe contract:** add `GET /api/reports/export/bills.csv` (name TBD) returning **bill-level rows** for a UTC calendar date range, reusing the same boundary helpers and column semantics as `/summary` and `daySalesSemantics()`.

**No ADR required** unless product chooses tenant-local day boundaries instead of the existing report UTC model (see §6).

---

## 2. Existing financial / reporting sources (authoritative map)

| Domain                      | Authoritative API / service                             | File(s)                                    | Roles                   |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| Daily tiles                 | `GET /api/reports/daily-stats`                          | `main/routes/reports.ts`                   | owner, manager          |
| Day summary                 | `GET /api/reports/summary?date=`                        | same                                       | owner, manager          |
| Gross / Refunds / Net       | `daySalesSemantics()`                                   | `main/routes/reports.ts`                   | (helper)                |
| Payments Received by method | `paymentMethodBreakdown()`                              | same                                       | (helper)                |
| Sales range                 | `GET /api/reports/sales?start_date=&end_date=`          | same                                       | owner, manager          |
| Tax components              | `GET /api/reports/tax-components?start_date=&end_date=` | same + `main/services/tax-components.ts`   | owner, manager          |
| Bill rows                   | `GET /api/bills/` (limited)                             | `main/routes/bills.ts`                     | owner, manager, cashier |
| Refund rows                 | `GET /api/refunds/`                                     | `main/routes/refunds.ts` + `listRefunds()` | owner, manager, cashier |
| Day close snapshot          | `GET /api/reports/day-close/:date`                      | `main/services/day-close.ts`               | owner, manager          |
| Shift cash truth            | `GET /api/shifts/:id` + `getShiftPaymentSummary()`      | `main/services/shift.ts`                   | owner, manager          |
| Full DB dump                | `GET /api/db/export` (JSON, owner only)                 | `main/routes/database.ts`                  | owner                   |

**Module gate:** `/api/reports` mounted only when `reporting` module enabled (`main/routes/index.ts`). `reporting` is in **shared commerce modules** — available to Restaurant and Retail.

---

## 3. Existing CSV / export mechanisms

| Mechanism                    | Scope                                  | Pattern                                                                                      |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `main/routes/menu-csv.ts`    | Menu only (categories/products/addons) | `toCsvRow()`, RFC-style quoting, `Content-Type: text/csv`, `Content-Disposition: attachment` |
| `GET /api/menu-csv/export/*` | Menu data                              | Server-generated CSV blob                                                                    |
| Frontend Products page       | Menu CSV                               | `api.get(path, { responseType: 'blob' })` → download anchor                                  |
| Day-close Z                  | Cash reconciliation                    | Client `.txt` from frozen `summary_json` (`day-close-z.ts`) — **not sales CSV**              |
| `GET /api/db/export`         | All tables JSON                        | Owner-only; not report-shaped                                                                |

**No financial CSV exists.** Reuse `toCsvRow()` pattern from menu-csv (extract shared helper or duplicate minimally in reports route — discovery defers implementation choice).

**No CSV npm dependency** in root or frontend `package.json`.

---

## 4. Reports UI (current)

| Item              | Detail                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| **Page**          | `/reports` → `frontend/src/app/(dashboard)/reports/page.tsx`                  |
| **Auth**          | owner/manager only; others → `/pos`                                           |
| **Module gate**   | Nav only (`requiresModule: 'reporting'`); page does not fail-closed on module |
| **Date UX**       | Single-day picker; tenant timezone for “today”; passes `YYYY-MM-DD` to APIs   |
| **APIs used**     | `daily-stats`, `summary`, `topProducts`, `recentOrders`, `insights`           |
| **Export button** | **None**                                                                      |

Phase 4.4 should add **Download CSV** on this page, wired to the new export endpoint with the **same date/range params** as the visible report day.

---

## 5. Selected export scope (recommended)

### Level: **Bill-level detail CSV** (primary)

One row per bill in the selected window. This matches accountant handoff needs and maps cleanly to existing `bills` + aggregated `refunds` data.

**Do not** ship a separate accounting engine, double-entry ledger, or frontend money recalculation.

### Optional future slice (out of 4.4 initial scope)

- Daily summary-only CSV (one row per day) — derivable from `daySalesSemantics()` but less useful alone
- Tender-level CSV (one row per payment line) — requires `payment_details` expansion; defer unless requested

---

## 6. Selected exported fields (traceable only)

All fields below exist on authoritative tables or are defined in reporting-financial-semantics.md.

| CSV column (proposed)     | Source                                                              | Notes                                                          |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `business_date`           | Query param `start_date` / per-row UTC date from `bills.created_at` | See §7 timezone                                                |
| `bill_id`                 | `bills.id`                                                          |                                                                |
| `bill_number`             | `bills.bill_number`                                                 |                                                                |
| `order_id`                | `bills.order_id`                                                    |                                                                |
| `payment_status`          | `bills.payment_status`                                              | e.g. paid, partially_refunded, refunded                        |
| `created_at`              | `bills.created_at`                                                  | ISO-like DB timestamp                                          |
| `paid_at`                 | `bills.paid_at`                                                     | nullable                                                       |
| `subtotal`                | `bills.subtotal`                                                    | decimal dollars (REAL)                                         |
| `discount_amount`         | `bills.discount_amount`                                             |                                                                |
| `tax_amount`              | `bills.tax_amount`                                                  |                                                                |
| `total`                   | `bills.total`                                                       | **Gross sale value** for settled bills                         |
| `paid_amount`             | `bills.paid_amount`                                                 | **Net collected** after refunds                                |
| `refund_amount`           | `SUM(refunds.amount)` per bill, `status='completed'`                | Or `total - paid_amount` when settled; prefer refunds table    |
| `balance`                 | `bills.balance`                                                     |                                                                |
| `payment_methods_summary` | Derived from `bills.payment_details`                                | e.g. `cash:100.00;card:50.00` — **Payments Received**, not net |
| `shift_id`                | `bills.shift_id`                                                    | nullable                                                       |

**Omit unless proven safe in implementation:**

- Item-level tax component breakdown (use `/tax-components` separately)
- Order type / table name (requires join; not required for accounting CSV v1)
- Customer PII (omit by default)

**Fields explicitly NOT invented:**

- No “net sales” column recalculated in frontend
- No new “gross tender” column beyond summarizing existing `payment_details`
- No REAL→cents conversion in v1 (store uses decimal REAL; refunds also store `amount_cents` internally)

---

## 7. Date / range semantics

### Existing report convention (reuse)

| Helper                              | Semantics                                                        |
| ----------------------------------- | ---------------------------------------------------------------- |
| `reportDate(value, fallback)`       | Validates `YYYY-MM-DD`                                           |
| `utcDayBounds(date)`                | Half-open UTC `[start, end)` on `created_at` / refund timestamps |
| `daySalesSemantics(db, start, end)` | Bills + refunds filtered by UTC window                           |

**Recommendation:** Export uses **`start_date` + `end_date`** (inclusive calendar dates) with **`utcDayBounds()`** — **same as** `/summary`, `/sales`, `/tax-components`.

### Timezone caveat (document, do not hide)

- Reports UI date picker uses **tenant timezone** for “today” label (`en-CA` formatting).
- Backend report APIs interpret the date string as a **UTC calendar day** via `utcDayBounds()`.
- Day-close uses **tenant IANA timezone** (`localDayBoundsUtc`) — **different model**.

**Export must NOT mix models in one file.** Bill export aligns with **Reports page totals** (UTC day), not day-close Z.

If product later wants tenant-local business days for CSV, that is an **ADR-level change** (would affect reconciliation with current Reports UI).

### Range limits (recommended)

| Rule                              | Rationale                    |
| --------------------------------- | ---------------------------- |
| Max **93 days** (or 90) inclusive | Prevent unbounded bill scans |
| Reject `start_date > end_date`    | Same as tax-components       |
| Empty range → header-only CSV     | Valid export                 |

---

## 8. Restaurant vs Retail behavior

| Vertical       | Behavior                                        |
| -------------- | ----------------------------------------------- |
| **Restaurant** | Full access via shared `reporting` module       |
| **Retail**     | Same — no restaurant-only fields in bill export |
| **Tables/KDS** | Not included in CSV                             |

No vertical-specific export fork required.

---

## 9. Authorization

| Layer           | Rule                                                           |
| --------------- | -------------------------------------------------------------- |
| Export endpoint | **`requireRole('owner', 'manager')`** — match `/api/reports/*` |
| Cashier         | **No export** (even though `GET /api/bills` allows cashier)    |
| Module          | Mount under `/api/reports` → inherits reporting module gate    |

Do not widen beyond existing financial report authority.

---

## 10. Rounding / formatting / money units

| Topic              | Decision                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Money units**    | Decimal **dollars** (REAL), matching UI `useFormatCurrency` and report APIs                      |
| **Numeric format** | Fixed decimal string with `.` separator, e.g. `1234.50` — **no locale commas**                   |
| **Refund amounts** | Use `refunds.amount` (decimal) or `amount_cents/100` — must match `daySalesSemantics` refund sum |
| **Rounding**       | No re-rounding in export; emit stored values                                                     |
| **FIN-01**         | Export is read-only; no collectible/outstanding columns unless sourced from existing bill fields |

---

## 11. Refund representation

Per canonical semantics ([reporting-financial-semantics.md](../15-project-management/reporting-financial-semantics.md)):

- **`bills.total`** = gross sale value (unchanged by refund)
- **`bills.paid_amount`** = net after refunds
- **`bills.payment_details`** = original tender lines (**not** reduced by refunds)
- **`refunds` table** = completed refund outflow (`amount`, `amount_cents`, `method`, `bill_id`)

**Bill-level export:**

- `refund_amount` = `SUM(refunds.amount)` for `bill_id` where `status='completed'`
- Cross-check: for settled bills, `total - refund_amount ≈ paid_amount` (within float tolerance)

Export must **not** rewrite or infer tender lines from net paid.

---

## 12. Tax representation

- **Bill-level:** `bills.tax_amount` only in v1
- **Component breakdown:** available via `GET /tax-components` — **separate concern**, not required in first CSV
- Item snapshots (`tax_snapshot`, `tax_breakdown`) stay on order items — omit from bill CSV v1

---

## 13. CSV contract (proposed)

| Rule         | Value                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| Encoding     | UTF-8                                                                  |
| Header row   | Required; stable column order (fixed list)                             |
| Quoting      | RFC 4180-style: quote fields containing `,` `"` or newline; `"` → `""` |
| Line endings | `\n`                                                                   |
| Content-Type | `text/csv; charset=utf-8`                                              |
| Disposition  | `attachment; filename="bills-export-{start_date}-to-{end_date}.csv"`   |
| Generation   | **Server-side only**                                                   |
| Client       | Blob download (same pattern as menu-csv)                               |

Reuse `toCsvRow()` logic from `main/routes/menu-csv.ts`.

---

## 14. Schema impact

**None.** Read-only SELECT on existing `bills`, `refunds`, optional join to `orders` if needed later.

---

## 15. Transaction / money-path impact

| Area                                | Impact               |
| ----------------------------------- | -------------------- |
| Orders / bills / payments / refunds | **None** — read-only |
| Tax calculation                     | **None**             |
| Day-close / shifts                  | **None**             |
| Inventory / refund restock (4.2)    | **None**             |
| FIN-01                              | **None**             |
| Transaction ownership               | **None** — no writes |

---

## 16. Idempotency

**Not required.** GET export is safe to repeat; identical input → identical CSV (deterministic ordering: `ORDER BY bills.created_at ASC, bills.id ASC`).

---

## 17. Performance considerations

| Risk                         | Mitigation                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Large date ranges            | Cap max days (90–93); consider row cap with 413/400 if exceeded                    |
| `payment_details` JSON parse | Per-row in application layer or SQL json_each — acceptable for capped ranges       |
| Index use                    | Filter on `bills.created_at` half-open range (uses `idx_bills_created_at`)         |
| Memory                       | Stream response or build in memory for pilot-scale single-location (acceptable v1) |

**Gap today:** `GET /api/bills` has no `start_date`/`end_date` — export needs **new query params on reports export route**, not unbounded bills list.

---

## 18. Proposed API (implementation gate — not built yet)

```http
GET /api/reports/export/bills.csv?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Authorization: Bearer …
Roles: owner, manager
```

**Response:** CSV body (not JSON wrapper).

**Frontend:** Reports page button → blob download using `selectedDate` for single-day (`start=end=selectedDate`) or future range picker.

---

## 19. Test plan (for implementation phase)

### Characterization (before code)

- Document that `daySalesSemantics` totals for a day match sum of exported bill `total` / `paid_amount` / refund columns for settled bills

### After implementation

1. CSV header contract (stable columns)
2. Single-day export with known bills
3. Multi-day export
4. Empty range (header only)
5. Refund-aware row (`partially_refunded`, `refunded`)
6. Tax column present (`tax_amount`)
7. Multiple tenders in `payment_methods_summary`
8. Authorization (cashier 403, manager 200)
9. Restaurant + Retail composition (reporting module mounted)
10. `financial-reporting-semantics.test.ts` regression
11. `day-close.test.ts` regression
12. `phase-4.2-refund-restock.test.ts` regression

---

## 20. Stop conditions — assessment

| Condition                                   | Status                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| No authoritative source for required fields | **CLEAR** — bills + refunds                                                       |
| Conflicting money definitions               | **CLEAR** — documented in reporting-financial-semantics.md; export must follow it |
| Schema change required                      | **NO**                                                                            |
| Tax semantics change                        | **NO**                                                                            |
| Transaction ownership change                | **NO**                                                                            |
| Unclear refund representation               | **CLEAR** — refunds table + paid_amount                                           |
| Unclear business-day boundaries             | **DOCUMENTED** — UTC for export; day-close is separate                            |
| Unacceptable performance                    | **MITIGATED** — range cap                                                         |

**No STOP.** Proceed to implementation under TDD.

---

## 21. Explicit non-goals (confirmed out of scope)

QuickBooks/Xero integration · invoices · new accounting tables · ledger redesign · double-entry · REAL→cents · FIN-01 rewrite · refund redesign · inventory changes · suppliers/PO · exchanges · multi-location · microservices · Nest/Prisma/Redis/Kafka · P1.6 pilot gates

---

## 22. Recommended implementation sequence (next phase)

1. Extract or share `toCsvRow()` helper (minimal)
2. RED: `tests/phase-4.4-accounting-csv-export.test.ts` — header, single-day, refund, auth
3. GREEN: `GET /api/reports/export/bills.csv` in `main/routes/reports.ts` (or thin `reports-export.ts` mounted under reports)
4. Frontend: Reports page download button + blob helper
5. Regression: financial-reporting, day-close, phase-4.2
6. Docs: `phase-4.4-accounting-csv.md` (implementation record)

---

## 23. Final discovery verdict

**PHASE 4.4 DISCOVERY COMPLETE — READY FOR IMPLEMENTATION**

No ADR required if export follows UTC report day boundaries and bill-level field map above. Revisit ADR only if product mandates tenant-local business-day CSV aligned with day-close instead of Reports.

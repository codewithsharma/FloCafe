# Database & Data-Integrity Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · **Schema:** `user_version = 86`
**Storage:** better-sqlite3, WAL mode, `PRAGMA user_version` versioning. Read-only; no files modified.

> Verdict: **migration, backup, restore, and corrupt-DB handling are genuinely strong — among the best-engineered parts of the system.** The weaker areas are the _older core POS tables_: money is still REAL-primary (mid-migration to integer cents, no cutover), several hot foreign keys and all money/status CHECK constraints are absent on core tables, payments exist only as JSON (no relational rows), and the audit trail has coverage gaps and no tamper-evidence. Importantly, the previously-suspected destructive `DELETE FROM` import/restore path was inspected and found **well-mitigated** (backup-first, transactional, FK-gated, injection-guarded) — it is not a data-loss defect.

---

## 1. Verified strengths

| #   | Strength                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                      | Confidence |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| S1  | **Atomic migration runner** — each migration runs inside `db.transaction(() => { up(); pragma('user_version=N') })()` so the version bump commits with the schema change; a crash mid-migration rolls back and re-runs. No `VACUUM`/nested `BEGIN` inside any migration.                                                                                                                 | `db.ts:2950-2996` (`:2990-2993`)                                                              | High       |
| S2  | **Unconditional auto-backup before migrating** — including `user_version=0` installs.                                                                                                                                                                                                                                                                                                    | `db.ts:2983-2984, 2857+`                                                                      | High       |
| S3  | **Schema-newer-than-app fails loud** — `SchemaVersionMismatchError` when `current > target`.                                                                                                                                                                                                                                                                                             | `db.ts:2955-2961`                                                                             | High       |
| S4  | **WAL-consistent, verified backups** — SQLite online backup API (`db.backup`), fold WAL via `journal_mode=DELETE`, `PRAGMA integrity_check` on the artifact, fsync + atomic rename. Cloud/Drive reuse this unmodified.                                                                                                                                                                   | `db.ts:1087-1141`; `google-drive.ts:305`                                                      | High       |
| S5  | **Restore & import are transactional and FK-gated** (resolves the flagged `DELETE FROM` concern) — backup-first, `BEGIN IMMEDIATE`, per-table `DELETE`+`INSERT…SELECT`, **recompute FK violations vs baseline and throw on any new ones**, commit only then; rollback on error. Interpolated table names pass `isSafeIdentifier` (`^[A-Za-z_][A-Za-z0-9_]*$`) — not an injection vector. | `db.ts:2634-2698`; `routes/database.ts:237,250,271,297,348-356`                               | High       |
| S6  | **R14 fail-closed on corrupt-but-openable DB** — `integrity_check` every startup latches `setRecoveryRequired('corrupt_database')`; middleware returns **503 `recovery_required`** on money/health routes before auth. End-to-end tested.                                                                                                                                                | `db.ts:819-849`; `server.ts:265-291`; `tests/r14-corrupt-db-fail-closed.test.ts`              | High       |
| S7  | **Self-deriving schema-drift detection** — live schema diffed against an ideal DB built by replaying `createSchema`+migrations in memory, so the reference can't drift; safe-fixes are additive-only and server-re-derived.                                                                                                                                                              | `schema-health.ts:367-431`; `db.ts:2823-2837`                                                 | High       |
| S8  | **Atomic multi-step money ops** — order create, bill settle/payment batch, refund, void/cancel, order-discount, shift open/close/force-close all wrapped in a single `withTxn`.                                                                                                                                                                                                          | `create.ts:133`, `bills.ts:711/763`, `refund.ts:335`, `cancel.ts:205`, `shift.ts:156/271/339` | High       |
| S9  | **Soft-delete/terminal-status for all financial data** — no hard `DELETE` of orders/order_items/bills/refunds/loyalty_ledger/shifts/audit_logs; hard deletes confined to config/ephemeral/join tables.                                                                                                                                                                                   | grep-verified                                                                                 | High       |
| S10 | **Fresh == upgraded** — fresh install replays all 86 migrations (v1 `createSchema` + guarded ALTER no-ops), guaranteed equal by schema-health + `upgrade-path` test.                                                                                                                                                                                                                     | `migrations.ts:105-108`; `tests/upgrade-path.test.ts`                                         | High       |

This backup/restore/migration/recovery subsystem is the strongest data-safety story in the codebase and aligns with the project's data-safety mandate in `AGENTS.md`.

## 2. Findings

### F1 — Money is REAL-primary; core order/bill totals computed in floating point (High)

- **Category:** Money representation / correctness.
- **Location:** `db.ts:3201-3219` (orders), `:3238-3251` (order_items), `:3270-3289` (bills); `routes/orders/create.ts:266-381`; `main/lib/money.ts:4-6`; `migrations.ts:2463-2552` (v81 `p0_3_money_dual_write_cents_phase1`).
- **Evidence:** core money columns are `REAL` with **nullable** parallel `_cents INTEGER` columns dual-written but **derived from the float** (`CAST(ROUND(COALESCE(real,0)*100) AS INTEGER)`). Order totals accumulate natively (`itemSubtotal = unitPrice*quantity`; `subtotal += itemSubtotal`; `total = Number(preRoundTotal.toFixed(2))`) then `cents = Math.round(major*100)`. `money.ts:6` comments "REAL columns remain until a future cutover." API order reads return REAL directly.
- **Why it matters:** IEEE-754 can't represent all decimal cents exactly; multi-line float accumulation before rounding can diverge by a cent from a pure-integer computation. `_cents` is authoritative only where `preferCents` is called (settlement/refund/shift/cash aggregation) — order/item/bill _display_ still flows from REAL.
- **Impact:** rare per-cent discrepancies on order/bill totals and REAL-vs-cents divergence on legacy rows; reconciliation ambiguity during the incomplete migration.
- **Recommendation:** complete the P0.3 cutover — compute order/item/bill totals in integer cents (as payment-tender/refund/shift already do), make `_cents` the read source-of-truth everywhere, then retire REAL. The `decimal.js` tax engine is the model to extend. **Do not drop REAL columns without a migration + upgrade-path test.**
- **Refactoring effort:** High (touches money path + migration + tests). **Confidence:** High.

### F2 — Payments have no relational table (JSON-only) (Medium-High)

- **Category:** Constraints / integrity.
- **Location:** `db.ts:3291` (`bills.payment_details TEXT`); write path `payment-tender.ts:612-618`; `payment_methods` is only a lookup (`migrations.ts:1763`).
- **Evidence:** no `payments`/`bill_payments`/`order_payments` table. Payment lines (method, tendered, change) are JSON in `bills.payment_details`. No per-payment row, FK, index, or CHECK.
- **Why it matters:** payment amounts have zero schema-level integrity; you cannot relationally enforce `sum(payments) == bill.total`, index by method/date, or FK-validate the method. Split-payment analytics must parse JSON.
- **Impact:** payment/settlement discrepancies undetectable at the DB layer; reporting/audit rely entirely on application correctness.
- **Recommendation:** introduce a `bill_payments` table (bill_id FK, method, `amount_cents CHECK(>0)`, tendered/change cents, created_at, actor) written inside the existing settlement `withTxn`; keep JSON as a denormalized cache during transition.
- **Refactoring effort:** Medium-High. **Confidence:** High.

### F3 — Missing FOREIGN KEYs on hot columns (Medium)

- **Category:** Constraints / orphaned data.
- **Location:** `db.ts:3229` (orders FK on `user_id` only), `:3235` (`order_items.product_id` none), `:3269` (`bills.customer_id` none), `:3299-3308` (`loyalty_ledger` none), `:3129-3130` (`kitchen_station_id`/`assigned_waiter_id` none).
- **Evidence:** `orders.table_id/customer_id`, `order_items.product_id`, `bills.customer_id`, `loyalty_ledger.customer_id/bill_id` are plain TEXT/INTEGER with no `REFERENCES`, though `foreign_keys=ON` at runtime (`db.ts:649`).
- **Why it matters:** deleting/mis-keying a product, customer, or table leaves orphaned line items/orders/bills the engine won't catch.
- **Recommendation:** add these FKs via table-rebuild migrations (SQLite can't add constraints in place — rebuild-and-copy with `foreign_keys` off) + an upgrade-path test; at minimum add them to the ideal schema so schema-health flags drift.
- **Refactoring effort:** Medium (table rebuilds). **Confidence:** High.

### F4 — No money-non-negativity or core status-enum CHECK constraints (Medium)

- **Category:** Constraints / integrity.
- **Location:** orders/order_items/bills money columns (`db.ts:3201-3289`, no CHECK); status columns `:3200/:3256/:3290/:3195/:3124`.
- **Evidence:** the only money CHECKs are `refunds.amount_cents>0` (`migrations.ts:2101`) and `shifts.*_cents>=0`. Core revenue tables have none; newer tables have status enums (`users.role`, `shifts.status`, `refunds.status`) but the core order/bill lifecycle states don't.
- **Why it matters:** a bug or bad import can persist negative/inconsistent totals or invalid statuses; integrity depends solely on app-layer validation.
- **Recommendation:** add CHECKs (`total_cents >= 0`, `status IN (...)`) on the cents columns during the F1 cutover rebuild.
- **Refactoring effort:** Medium (folds into F1). **Confidence:** High.

### F5 — Audit-trail coverage gaps on financial mutations (Medium)

- **Category:** Audit trail.
- **Location:** bill-level discount (`routes/bills.ts:800-1032`, no `logAuditEvent`); no-sale/drawer (`routes/printers.ts:753` `/kick-drawer`, no audit); order-create audit fires **after** commit (`create.ts:435`, outside the `:133` txn); item-level discount audit outside txn (`routes/orders/discount.ts:780`).
- **Evidence:** most financial mutations _are_ audited in-transaction (payment.received, payment.refunded, order.discount_applied, order.item_voided, shift.*), but bill-level discount writes **no** audit row, no-sale drawer opens are **never** recorded, and order-create + item-discount audits are emitted **outside** their write transaction.
- **Why it matters:** a money-reducing, PIN-gated bill discount leaves no accountability record; no-sale drawer opens are a standard cash-control event; an out-of-txn audit means a crash after COMMIT but before the audit INSERT persists the mutation with no audit row.
- **Recommendation:** add `logAuditEvent` for bill-level discount and drawer-open; move order-create and item-discount audit INSERTs inside their `withTxn`.
- **Refactoring effort:** Low-Medium. **Confidence:** High.

### F6 — Audit log has no tamper-evidence or DB-level write protection (Low-Medium)

- **Category:** Audit trail.
- **Location:** `audit-log.ts:126` (INSERT only); `migrations.ts:1990-2003`.
- **Evidence:** append-only by convention (no UPDATE/DELETE/DROP/ALTER on `audit_logs`; route is read-only + CSV export) but **no** `prev_hash`/hash-chain/signature and **no** `CREATE TRIGGER` blocking edits.
- **Why it matters:** direct SQL or a compromised process could silently rewrite/delete audit history undetected.
- **Recommendation:** add a hash-chain (`prev_hash`, row hash) and/or a `BEFORE UPDATE/DELETE` trigger that raises, so mutation is detectable.
- **Refactoring effort:** Medium. **Confidence:** High.

### F7 — Startup `foreign_key_check` violations are logged, not fail-closed (Low)

- **Location:** `db.ts:835-843` — runs at startup but only `console.error`s the count/sample; unlike `integrity_check`, it doesn't latch recovery.
- **Why it matters:** a DB with real referential violations continues serving money operations (low likelihood given FK-gated import/restore).
- **Recommendation:** surface FK violations in the health report/telemetry; consider fail-closed if violations touch financial tables. **Confidence:** High.

### F8 — Minor index gaps (Low)

- **Location:** `customers.phone` raw column unindexed (only derived `phone_digits` partial unique, `migrations.ts:510-513`); `refunds.order_id` unindexed (`migrations.ts:2114-2116`).
- **Note:** hot FK/filter coverage is otherwise very good (see PERFORMANCE-AUDIT §3). **Recommendation:** confirm phone lookups route through `phone_digits`; add an index only if raw `phone` is queried. **Confidence:** Medium (depends on query paths).

### F9 — Mixed primary-key types (Low/Info)

- **Location:** TEXT prefixed ids (`tbl-`, `cat-`) for master data vs INTEGER AUTOINCREMENT for orders/order_items/bills/refunds/shifts.
- **Why it matters:** consistent per family but split across the schema; combined with F3's missing FKs, the string-keyed references are the ones most exposed to orphaning.
- **Recommendation:** document the convention (master = string prefix, transactional = int); prioritize F3 FKs on the string-keyed columns. **Confidence:** High.

### F10 — WAL durability tradeoff (Informational)

- **Location:** `db.ts:643` (`synchronous = NORMAL`).
- **Evidence:** WAL + `synchronous=NORMAL` can lose the last committed transaction(s) not yet checkpointed on power loss, but **does not corrupt** the DB.
- **Recommendation:** acceptable default; if hardware power-loss is a concern, consider `synchronous=FULL` on the settlement path or a UPS. No change required. **Confidence:** High.

## 3. Answers to the audit questions

1. **Migrations:** 86 sequential versioned migrations; atomic in-txn `user_version` bump; fresh replays all via guarded v1 (S1/S10). **Strong.**
2. **Constraints:** `foreign_keys=ON` at runtime; FKs partial (F3); NOT NULL on essentials; CHECK/enums rich on newer tables, absent on core (F4).
3. **Indexes:** good hot-FK coverage; minor gaps (F8).
4. **Money:** REAL-primary + derived `_cents`; float accumulation on core totals; cents-native + decimal.js on newer paths (F1).
5. **Data-safety:** SQLite-backup-API + integrity-check + atomic rename; transactional FK-gated restore/import; R14 fail-closed (S4/S5/S6). **Strong.**
6. **Destructive import/restore:** backup-first, transactional, FK-gated, injection-guarded — **the flagged `DELETE FROM` is safe** (S5).
7. **Soft delete / audit:** soft-delete everywhere for financial data (S9); audit append-only-by-convention with coverage gaps + no tamper-evidence (F5/F6).
8. **Transaction boundaries:** all money multi-step ops in a single `withTxn` (S8). **Strong.**
9. **Orphaned data / naming:** mixed PK types + missing FKs on string-keyed refs (F3/F9).

## 4. Verdict

**Data safety (backup/restore/migration/recovery): excellent.** **Core-table integrity constraints: incomplete** — the schema leans on application-layer correctness where DB-level guarantees (FKs, CHECKs, a relational payments table, integer-cents cutover) would make bad financial rows structurally impossible. The single highest-value data-integrity investment is **finishing the REAL→cents cutover (F1) and folding FKs + CHECKs + a `bill_payments` table (F2/F3/F4) into that rebuild** — with the upgrade-path test battery the project already has.

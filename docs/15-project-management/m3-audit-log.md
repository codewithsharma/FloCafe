# M3 Audit Log Foundation Report

**Milestone:** M3 — Audit log foundation  
**Date:** 2026-08-12  
**Schema version:** 68 (additive migration)  
**Depends on:** M1 engineering baseline (GREEN), M2 privacy & consent (GREEN)

---

## 1. Existing audit capability (before M3)

| Mechanism | Scope | Limitation |
|-----------|-------|------------|
| `print_logs` | Bill receipt/reprint | Print actions only |
| `tax_config_audit` | Tax pack lifecycle | Tax domain only |
| `settings` keys | Password recovery timestamps | Ad-hoc, not queryable |
| `console.warn` | Auth recovery | Not durable/structured |

No general business audit trail existed for auth, staff, or void operations.

---

## 2. Requirements

- Durable application-level audit (not debug logging)
- WHO / WHAT / WHEN / entity / result / context
- Sensitive data protection
- Append-only behavior
- Owner/manager read access
- Safe migration from v67
- Minimal initial integrations (auth, staff, order void)
- No M4+ features (shifts, refunds, etc.)

---

## 3. Data model

Table: `audit_logs` (INTEGER AUTOINCREMENT id, TEXT entity ids)

See [`audit-logging.md`](../07-security/audit-logging.md) for column reference.

---

## 4. Migration

**v68 — `m3_audit_logs_table`**

- `CREATE TABLE IF NOT EXISTS audit_logs`
- Four indexes for query patterns
- Idempotent (`IF NOT EXISTS`)
- Tested: fresh install (v0→v68), upgrade v67→v68

---

## 5. Audit service

**Module:** `main/services/audit-log.ts`

- `logAuditEvent(input)` — single write path
- `sanitizeAuditMetadata()` — strips sensitive keys, enforces size cap
- `queryAuditLogs()` — paginated read helper

---

## 6. Integrated events

| Action | Location |
|--------|----------|
| `auth.login.success` | `main/routes/auth.ts` |
| `auth.login.failure` | `main/routes/auth.ts` |
| `staff.created` | `main/routes/staff.ts` |
| `staff.updated` | `main/routes/staff.ts` |
| `staff.deactivated` | `main/routes/staff.ts` |
| `staff.reactivated` | `main/routes/staff.ts` |
| `order.item_voided` / `order.item_cancelled` / `order.cancelled` | `main/routes/index.ts` (item cancel) |

Existing void behavior unchanged; audit is additive inside the existing transaction.

---

## 7. Security model

- Read: `owner`, `manager` only (`GET /api/audit-logs`)
- Write: service layer only (no public write API)
- No update/delete API
- Metadata sanitized (no passwords, PINs, tokens, card data)
- Audit rows are security-sensitive — restrict read to privileged roles

---

## 8. Transaction semantics

Business mutations (order item cancel/void) log **inside** `withTxn()`. Rollback of the business operation rolls back the audit row. Auth events log after credential validation in a standalone insert.

---

## 9. Testing

**Suite:** `tests/audit-log.test.ts` (included in `npm run test:security`)

Covers:

- Fresh install schema + indexes
- Upgrade v67 → v68
- Record creation, actor/entity/timestamp
- Metadata sanitization and size rejection
- Transaction rollback
- API authorization (owner/manager yes, cashier no)
- Order item void integration
- Ideal schema parity

---

## 10. Performance considerations

- Append-only inserts — O(1) per event
- Indexes on `created_at`, entity, actor, action for paginated queries
- Metadata capped at 4 KB to bound row growth
- No async queue (single SQLite writer; sync insert is appropriate)
- Monitor table size on long-running installs; retention policy deferred

---

## 11. Files changed

| File | Change |
|------|--------|
| `main/db.ts` | Migration v68 |
| `main/services/audit-log.ts` | **NEW** — audit service |
| `main/routes/audit-logs.ts` | **NEW** — read API |
| `main/routes/index.ts` | Register route; void audit |
| `main/routes/auth.ts` | Login audit |
| `main/routes/staff.ts` | Staff mutation audit |
| `tests/audit-log.test.ts` | **NEW** |
| `tests/m1-engineering-gate.test.ts` | Expect v68 |
| `package.json` | `test:security` includes audit tests |
| `docs/**` | Schema, security, API, progress updates |

---

## 12. Known limitations

- No Settings UI viewer (API only)
- Partial void/cancel coverage (item cancel path only; M7 for full coverage)
- No payment/refund/shift events (M4–M6)
- `terminal_id` populated from `cloud_pos_id` when registered; otherwise null
- No automatic retention/export

---

## 13. Future integration points

| Milestone | Events |
|-----------|--------|
| M4 Shifts | `shift.opened`, `shift.closed` |
| M5 Refunds | `payment.refunded` |
| M6 Day close | `day.close` |
| M7 | All remaining void/cancel/order paths |
| UI | Settings → Audit viewer |

---

## 14. Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Audit schema exists | ✅ |
| Migration safe (fresh + v67 upgrade) | ✅ |
| Central audit service | ✅ |
| Sensitive data protected | ✅ |
| Append-only enforced | ✅ |
| Authorization defined | ✅ |
| Initial integrations work | ✅ |
| Tests pass | ✅ |
| Upgrade path passes | ✅ |
| Existing POS behavior intact | ✅ |
| Documentation updated | ✅ |
| No unrelated refactoring | ✅ |
| M4 NOT started | ✅ |

---

## 15. Final validation

| Check | Result |
|-------|--------|
| `npm run test:security` (incl. audit-log) | ✅ |
| `npm run test:m1-gate` | ✅ |
| `npm run build` | ✅ |
| `npm run lint:backend` | ✅ (warnings only, pre-existing) |

---

## Final verdict: **GREEN**

M3 audit log foundation is complete. Stop here — do not start M4.

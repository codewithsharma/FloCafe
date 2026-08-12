# Business Audit Logging

## CURRENT STATE (M3 — implemented)

FloCafe maintains a centralized **append-only** business audit log in SQLite (`audit_logs`, schema v68).

### Distinction from other logs

| Mechanism | Purpose |
|-----------|---------|
| `console.log` / app logs | Debug and operational diagnostics |
| `print_logs` | Receipt/reprint actions per bill |
| `tax_config_audit` | Tax pack install/override history |
| **`audit_logs`** | General business accountability (auth, staff, voids, future money ops) |

### Schema (`audit_logs`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | Monotonic row id |
| `actor_user_id` | TEXT FK → users | Who performed the action (nullable for anonymous failures) |
| `action` | TEXT | Namespaced action key (e.g. `auth.login.success`) |
| `entity_type` | TEXT | Affected entity class (`user`, `order_item`, `auth`, …) |
| `entity_id` | TEXT | Affected entity id (stringified) |
| `result` | TEXT | `success` or `failure` |
| `reason` | TEXT | Optional short reason |
| `metadata_json` | TEXT | Bounded JSON context (sanitized) |
| `terminal_id` | TEXT | POS/terminal when known (shift `terminal_id` when provided; otherwise `cloud_pos_id`) |
| `request_id` | TEXT | Correlation id for cross-log lookup |
| `created_at` | TEXT | UTC timestamp |

Indexes: `created_at`, `(entity_type, entity_id)`, `actor_user_id`, `action`.

### Service

`main/services/audit-log.ts` — `logAuditEvent()`, `queryAuditLogs()`, `sanitizeAuditMetadata()`.

Application code must **not** insert into `audit_logs` directly.

### Sensitive data

Metadata is sanitized before insert:

- Keys matching password/PIN/token/secret/card patterns are **dropped**
- String values truncated (512 chars)
- Total JSON capped at **4 KB**
- Request bodies are never serialized wholesale

### Authorization

| Operation | Who |
|-----------|-----|
| **Create** | Internal service only (any authenticated route may call `logAuditEvent`) |
| **Read** | `owner`, `manager` via `GET /api/audit-logs` |
| **Update** | Not exposed — append-only |
| **Delete** | Not exposed — append-only |

### Transaction semantics

For business mutations wrapped in `withTxn()`:

- Call `logAuditEvent()` **inside** the same transaction
- If the business operation rolls back, the audit row rolls back with it
- Auth login events are logged outside order/payment transactions (standalone insert after credential check)

### Initial integrations (M3)

| Action | Trigger |
|--------|---------|
| `auth.login.success` | Successful login |
| `auth.login.failure` | Failed login (no password stored) |
| `staff.created` / `staff.updated` / `staff.deactivated` / `staff.reactivated` | Staff mutations |
| `order.item_voided` / `order.item_cancelled` / `order.cancelled` | Item cancel endpoint |
| `shift.opened` / `shift.closed` / `shift.force_closed` | M4-C shift service (inside the same `withTxn()` as the mutation) |

### Retention

No automatic purge in M3. Operational guidance: monitor `audit_logs` row count; future milestone may add configurable retention (export then archive).

## TARGET STATE

- UI audit viewer in Settings (owner)
- Full void/cancel/order-level coverage (M7)
- Payment/refund audit entries (M5–M6)
- Shift POS enforcement and UI (M4-D/E)
- Optional export for accountants
- Configurable retention policy

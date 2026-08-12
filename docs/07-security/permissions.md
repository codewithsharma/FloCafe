# Permissions Model

## CURRENT STATE

### Role hierarchy
```
owner > manager > cashier | waiter | chef
```

### Implementation
Role string on `users.role` checked via `requireRole()` middleware.

No separate permissions table — authorization is **role-based**, not attribute-based.

### Scoping dimensions
- **Category scope:** `users.category_ids` limits product/KDS visibility
- **Station scope:** `station_users` limits KDS kitchen stations
- **Master PIN:** orthogonal to role — owner-only destructive gate

### IPC allowlist
`ALLOWED_IPC_KEYS` in preload/ipc restricts renderer settings writes.

### Audit log access (M3)
- **Read:** `owner`, `manager` — `GET /api/audit-logs`
- **Write:** internal service only (`logAuditEvent`) — no user-facing create/update/delete

See `05-api/authorization.md` for route-level matrix and [`audit-logging.md`](audit-logging.md).

### Shifts (M4-C)

Uses existing `requireRole()` — no new permissions table.

| Action | Roles |
|--------|-------|
| Open / get active / host terminal id | `owner`, `manager`, `cashier` |
| Close terminal shift | `owner`, `manager`, `cashier` (cashier: `terminal_id` must match the shift) |
| Force-close (reason required) | `owner`, `manager` |
| List history / get by id | `owner`, `manager` |

Waiters and chefs have no shift API access. POS order/payment routes are **not** shift-gated in M4-C.

## TARGET STATE (PROPOSED)
- Optional fine-grained permissions table if enterprise customers require it
- Keep role-based as default for simplicity

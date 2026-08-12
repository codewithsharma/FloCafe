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

See `05-api/authorization.md` for route-level matrix.

## TARGET STATE (PROPOSED)
- Optional fine-grained permissions table if enterprise customers require it
- Keep role-based as default for simplicity

# Patterns

- Feature modules: `main/services/<name>.ts` + `main/routes/<name>.ts` + `requireRole()`.
- Mutations that need audit: `withTxn(() => { write; logAuditEvent(); })`.
- Typed `*ServiceError` with `statusCode`; routes map to `{ error }` without SQL/stack leakage.
- Feature flags live in `settings` (`'true'` / `'false'` strings).
- POS client identity: origin-scoped `localStorage` UUID (`flo_terminal_id`) sent as `X-Flo-Terminal-Id` on selected POS routes only. Not an auth credential.

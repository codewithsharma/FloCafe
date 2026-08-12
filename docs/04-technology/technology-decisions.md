# Technology Decisions

See `14-decisions/` for ADRs. Summary:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ADR-001 | Electron desktop | Offline, hardware access, cross-platform |
| ADR-002 | SQLite + better-sqlite3 | Local-first, no server dependency |
| ADR-003 | Next.js static export | React UI in Electron without runtime Node |
| ADR-004 | Express monolith | Simple LAN API; adequate scale |
| ADR-005 | Inline migrations | Works today; split planned (TD-01) |

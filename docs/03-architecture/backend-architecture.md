# Backend Architecture

## CURRENT STATE

```
main/
├── index.ts       Electron entry
├── server.ts      :3001 API
├── kds-server.ts  :3002
├── server-app.ts  :3003
├── db.ts          Schema + migrations + utilities
├── routes/        30 route modules
├── services/      11 service modules
├── middleware/    security, master-pin, async-handler
├── printers/      thermal.ts, profiles.ts
├── ipc.ts         Electron IPC handlers
└── preload.ts     Context bridge
```

### Auth pipeline
`requireAuth` (global) → `requireRole` (per-route) → handler

### Database access
Synchronous `better-sqlite3`; `withTxn()` for transactions; maintenance lock for destructive ops.

## TARGET STATE
- Split `db.ts` into schema/, migrations/, repositories/
- Keep Express — no framework migration

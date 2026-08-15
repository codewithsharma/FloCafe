<!-- Last updated: 2026-08-15, schema v82 (H2 slice originally v80) -->

# H2 — KDS Offline / Recovery Hardening

**Slice:** KDS Offline → Reconnect → Recovery  
**Branch:** `restaurant-vertical`  
**Status:** COMPLETE (2026-08-15)  
**Canonical plan:** [`docs/00-product/capability-matrix.md`](../00-product/capability-matrix.md)

## Delivered

1. **Advertise only live companion** — `GET /api/kds-info` returns `503 KDS_SERVER_NOT_RUNNING` when the KDS companion is stopped; success payloads include `kds_server_running: true`.
2. **mDNS honesty** — in `kds_lan`, Bonjour is skipped when the companion is down; mDNS txt omits `kds` / `kds_port` when stopped (`main/services/kds-recovery.ts` + `main/index.ts`).
3. **Stale board UX** — KDS header shows `kds.connectionStale` when disconnected but still displaying last-known orders (`dataStale`).
4. **Status retry queue (H2 + post-R8 deepen)** — chef item status PATCHes that fail for network/5xx are queued **per item** in `pendingRetriesRef`, flushed after reconnect, clear only on success/409/auth; silent failures re-queue up to an attempt cap. Same-status bumps are idempotent in `kitchen-status.ts` (no duplicate audit).
5. **Preserved** — SQLite remains system of record; coalesced `notifyKdsUpdate` snapshot; cancelled orders excluded from active board; CAS `expected_status` / 409; WS→REST 5s poll; 3s reconnect; bind-degrade.

## Tests

```sh
npm run test:h2
```

Plus regression: `test:kds-contract`, `test:kds-bind-degrade`, `test:kds-frontend-conflict`, `issue-133-kds-kot-toggles`, `network-mode`.

## Not in H2

- Phase 4.16 / KDS architecture rewrite / second source of truth
- Durable offline ticket outbox or event cursor (still deferred; SQLite remains SoR)
- Persist pending bump queue across full tab reload (session still in-memory)
- Kitchen routing, multi-station, timers, analytics (Planned)
- Frozen: terminals, gateways, online payment, multi-location, payroll
- H3 permissions/RBAC or restore/conflict hardening

## Matrix impact

Offline KDS / KDS recovery / KDS offline behavior remain **🟡 Hardening** with H2 depth documented. Core KDS integration rows stay **🟢 Existing**. Planned KDS depth (routing, stations, timers) unchanged.

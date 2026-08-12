# Metrics

## CURRENT STATE

### Business metrics (via API)
`GET /api/reports/*` — daily stats, sales, top products, insights

### Application metrics
**NOT IMPLEMENTED** — no Prometheus/statsd integration.

### Telemetry (anonymous; default-on for new installs)
`main/services/telemetry.ts` — sends when `telemetry_enabled='true'` (default in `seedInstallDefaults()`). Owner disables in Settings → Privacy. Separate from store-attributed diagnostics (`diagnostics_consent`).

## TARGET STATE (PROPOSED)
- Local counters: orders/hour, print failures, WS reconnects
- Optional export to cloud for multi-location dashboard

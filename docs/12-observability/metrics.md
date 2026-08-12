# Metrics

## CURRENT STATE

### Business metrics (via API)
`GET /api/reports/*` — daily stats, sales, top products, insights

### Application metrics
**NOT IMPLEMENTED** — no Prometheus/statsd integration.

### Telemetry (anonymous, opt-in)
`main/services/telemetry.ts` — app version, OS, feature flags

## TARGET STATE (PROPOSED)
- Local counters: orders/hour, print failures, WS reconnects
- Optional export to cloud for multi-location dashboard

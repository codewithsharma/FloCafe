# Monitoring

## CURRENT STATE

**No centralized monitoring platform.** Desktop app on operator hardware.

### Available signals
| Signal | Source |
|--------|--------|
| App logs | electron-log → userData logs folder |
| Health endpoint | GET /api/health |
| DB health | GET /api/db-tools/health-check |
| Update status | electron-updater events |
| Telemetry (opt-in) | telemetry.flopos.com |
| Store diagnostics | store_diagnostics_outbox |

### User-facing monitoring
- Settings health check dialog
- Printer status in POS toolbar
- Status bar in dashboard layout

## TARGET STATE (PROPOSED)
- Optional cloud heartbeat for multi-location ops
- Local metrics dashboard (orders/hour, error rate)
- No mandatory cloud monitoring dependency

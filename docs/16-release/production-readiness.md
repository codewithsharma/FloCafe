# Production Readiness

> Canonical direction: [`STRATEGY.md`](../../STRATEGY.md). Current product: **Nexora POS**. KPI: 3 cafés × 30 days × zero critical failures.

## CURRENT STATE assessment (Nexora POS / FloCafe v3.0.5)

| Area | Status | Notes |
|------|--------|-------|
| Core POS | ✅ Ready | Integration tests pass |
| Payments | ✅ Ready | Idempotency, decimal integrity |
| KDS | ✅ Ready | WS + REST tested |
| Printing | ⚠️ Partial | OS/driver dependent |
| Security | ⚠️ Partial | LAN cleartext, sandbox off |
| Backup | ✅ Ready | Tested restore |
| Migrations | ✅ Ready | Upgrade path tested |
| Monitoring | ❌ Gap | No centralized ops |
| Shifts / cash / day close | ✅ Ready | M4–M5 (schema v71); opt-in settings |
| Refunds | ❌ Gap | M6 not built — P0 blocker |
| Multi-location | ❌ Gap | PLANNED; ADR-006 first; frozen until pilots |

## RestaurantOS production criteria (TARGET)

- [ ] P0 technical debt resolved
- [ ] Shift + refund workflows
- [ ] Audit log for financial ops
- [ ] Security audit repeated
- [ ] 12-hour soak test passed
- [ ] Documentation complete
- [ ] Rollback tested

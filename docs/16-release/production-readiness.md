# Production Readiness

> Canonical direction: [`STRATEGY.md`](../../STRATEGY.md). Current product: **Opervia Restaurant**. KPI: 3 cafés × 30 days × zero critical failures.  
> Pilot ops pack: [`docs/13-operations/pilot-runbook.md`](../13-operations/pilot-runbook.md).

## CURRENT STATE assessment (Opervia / flo-desktop v3.0.5)

| Area                      | Status     | Notes                                                                                                               |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Core POS                  | ✅ Ready   | Integration tests pass                                                                                              |
| Payments                  | ✅ Ready   | Idempotency, decimal integrity; **FIN-01 CLOSED** (gross-tender outstanding)                                        |
| KDS                       | ✅ Ready   | WS + REST tested                                                                                                    |
| Printing                  | ⚠️ Partial | OS/driver dependent                                                                                                 |
| Security                  | ⚠️ Partial | Staff-LAN cleartext accepted with **OPS-01**; Phase A sandbox **on**; Phase C CSP deferred; guest Wi‑Fi unsupported |
| Backup / continuity       | ✅ Ready   | Continuity E2E + corrupt fail-closed                                                                                |
| REC-01 recovery           | ✅ Ready   | Fail-closed missing/empty DB + recovery UI                                                                          |
| Migrations                | ✅ Ready   | Upgrade path tested                                                                                                 |
| Monitoring                | ❌ Gap     | No centralized ops                                                                                                  |
| Shifts / cash / day close | ✅ Ready   | M4–M5 (schema v71+); opt-in settings                                                                                |
| Refunds                   | ✅ Ready   | M6 API + UI; print deferred                                                                                         |
| IPC / updater             | ✅ Ready   | B1 orphan surface reduced; B2 restart owner/manager JWT-gated                                                       |
| Pilot ops / DR pack       | ✅ Docs    | P1.5 runbook + DR drill; numeric backup policy still PENDING APPROVAL                                               |
| Multi-location            | ❌ Gap     | PLANNED; ADR-006 first; frozen until pilots                                                                         |

## RestaurantOS production criteria (TARGET)

- [ ] P0 technical debt resolved
- [x] Shift + refund workflows (Opervia Restaurant)
- [x] Audit log for financial ops (M3; expand coverage ongoing)
- [x] Security audits through P0.6 + REC-01 (Phase C deferred)
- [ ] 12-hour soak test passed
- [x] Pilot operations documentation (P1.5) — execute DR drill before go-live
- [x] Rollback tested (engineering)
- [ ] Approved numeric backup frequency/retention (**POLICY VALUE PENDING APPROVAL**)

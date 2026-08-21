# P8 — KDS Sound & Visual Alerts (KDS-ALERTS) Implementation Report

**Date:** 2026-08-21  
**Feature ID:** KDS-ALERTS  
**Schema tip:** **v88** (unchanged — no migration)  
**Baseline:** P4 `cd2304f` · P5 `a323b19` · P6 `4541dcb` · P7 `e41d32d`  
**Status:** **Implemented / Hardening verified** (automated). Live pilot remains **NO-GO** (R16).

---

## 1. Feature Summary

Kitchen Display now shows a short-lived visual highlight and an optional sound when a **genuinely new** actionable ticket appears after the board has hydrated. Alerts are presentation-only; SQLite + P4 outbox remain the kitchen SoR/delivery path.

---

## 2. Architecture Decision

```
KDS transport (WS/REST snapshots)
        ↓
useKdsConnection orders[]
        ↓
KdsAlertTracker (seen order_item.id)
        ↓
Visual highlight (4s) + optional Web Audio beep
```

No second event pipeline. No schema change. No outbox coupling.

---

## 3. Alert Identity

| Field                      | Role                                           |
| -------------------------- | ---------------------------------------------- |
| `order_items.id`           | Stable alert identity                          |
| First non-empty snapshot   | Seeds `seen`, enters alert-ready, **no** alert |
| Later snapshots            | Set-difference → new-ticket alert once         |
| Empty `auth_success` board | Does **not** arm alerts (stays hydrating)      |

---

## 4. Hydration → Alert-Ready

1. Tracker starts hydrating.
2. Empty snapshots leave it unarmed (avoids storm after empty auth then `initial_data`).
3. First non-empty board seeds all item ids → alert-ready.
4. Subsequent new actionable item ids alert once.

---

## 5. Reconnect / Resync

Session-scoped `seen` set survives reconnect while the KDS page stays mounted. Snapshot replay of known ids does not alert. Tickets that appeared while disconnected appear as new ids on the next snapshot → one alert. Logout resets the tracker.

No unbounded localStorage of ticket ids. Sound preference only: `localStorage kds_sound_alerts` (`0`/`1`, default off).

---

## 6. Status Updates

Status-only changes keep the same item id → no new-ticket sound/highlight. Priority/rush badges unchanged.

---

## 7. Station Safety

Server already scopes snapshots. The tracker only sees this station’s board.

---

## 8. Sound

- Optional header toggle (Bell / BellOff)
- Web Audio short sine beep; failures return false and never break KDS
- One beep per new-item batch (not per item)
- Visual alerts work with sound off

---

## 9. Visual

- Bounded `ring-2` highlight on order cards (~4s)
- `animate-pulse` skipped when `prefers-reduced-motion: reduce`
- Distinct from aging tints / rush badge

---

## 10. Files

| Path                                           | Role                          |
| ---------------------------------------------- | ----------------------------- |
| `frontend/src/lib/kds-alerts.ts`               | Pure tracker + beep + classes |
| `frontend/src/hooks/useKdsAlerts.ts`           | Snapshot → highlight/sound    |
| `frontend/src/components/kds/KdsWorkspace.tsx` | Wiring                        |
| `frontend/src/components/kds/KdsHeader.tsx`    | Sound toggle                  |
| `KdsKanbanBoard` / `KdsTabsView`               | Highlight class               |
| `tests/kds-alerts.test.ts`                     | Source contracts              |
| `frontend/src/lib/kds-alerts.test.ts`          | Unit suite                    |

---

## 11. Tests

`npm run test:kds-alerts` — unit (hydration, reconnect, status, station, audio fail) + source contracts.

---

## 12. Known Limitations

- Sound default off (device-local); no admin Settings default
- First ticket on a previously empty kitchen after arming empty-board path: first non-empty snapshot is seed (no alert) by design
- No sound while tab backgrounded is not specially gated (browser may block)

---

## 13. Final Status

**Implemented / Hardening verified.** Not Production-ready / live GO.

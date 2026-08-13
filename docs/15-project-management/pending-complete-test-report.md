# Pending-complete test report

**Date:** 2026-08-13  
**Artifact:** TRAINING/QA `release/mac-arm64/Nexora.app` (unsigned)  
**Userdata:** `$HOME/nexora-full-app-test` only  
**Developer profile:** untouched (`mtime 2026-08-12T13:12:21Z` before and after)  
**Evidence:** `$HOME/nexora-full-app-test/evidence/pending-complete/`

## Verdict

Pending matrix executed: **20 PASS · 0 FAIL · 6 NOT VERIFIED** (GUI/API suite)  
Plus **REC-01 destructive re-drill: PASS** (separate evidence under `rec01/`).

Overall product gate remains **READY WITH CONDITIONS** (not READY FOR PILOT) because signed/notarized build, OAuth credentials, printer hardware, native file-picker automation, new-machine JWT, and formal soak are still out of lab scope.

## Correction: prior FIN-01 “overpay FAIL”

Cash `remaining+1` → HTTP **200** is **by design** (change-on-cash): applied amount capped to remaining; `change_amount` recorded. Verified:

| Check | Result |
| --- | --- |
| Cash remaining+1 | PASS — applied=396, tendered=397, change=1 |
| Non-cash remaining+1 | PASS — 400 “exceeds the bill balance” |
| Non-cash exact remaining | PASS — 200 |

**QA-FIN01-OVERPAY-01 closed as false positive** (docs/ADR-008 / issue-214).

## Closed this pending pass

| Area | Status |
| --- | --- |
| Tax settings + Official Tax Pack advanced | PASS |
| Printers settings UI | PASS |
| Backup & Data / Drive UI surface | PASS |
| WhatsApp settings + module + QR UI | PASS |
| Restore controls on Backup & Data | PASS |
| Light concurrent API load (120 calls, 0×5xx) | PASS |
| JWT secret file in isolated userdata | PASS |
| REC-01 destroy DB → recovery → Master PIN restore → ACTIVE + data | PASS |
| Developer profile safety | PASS |

## Still NOT VERIFIED (honest)

| Item | Why |
| --- | --- |
| Google Drive OAuth completion | No OAuth credentials in QA lab (UI only) |
| Native OS file-picker restore E2E | CDP cannot drive system file dialog; IPC restore path verified in REC-01 |
| Physical printer success | No hardware |
| Formal load/soak | Only light concurrency |
| New-machine JWT re-key | Needs separate machine/safeStorage wipe |
| Production signed/notarized build | TRAINING adhoc only |

## Next engineering steps

1. Keep FIN-01 docs aligned with cash-change vs non-cash reject (no code change for cash over-tender).  
2. Optional: CDP note that Restore list UI is verified; file-picker remains manual DR checklist item.  
3. Produce notarized production Mac build before claiming READY FOR PILOT.

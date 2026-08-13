# Full-test completion report — rebuilt TRAINING package

**Date:** 2026-08-13  
**Artifact:** `release/mac-arm64/Nexora.app` (unsigned TRAINING/QA rebuild after INV-TAGS fix)  
**Userdata:** `$HOME/nexora-full-app-test` only  
**Developer profile:** `~/Library/Application Support/flo-desktop` **untouched** (mtime `2026-08-12T13:12:21Z`)  
**Evidence:** `$HOME/nexora-full-app-test/evidence/full-test/` (`FULL-TEST-FINAL.md`, `results-final.json`, GUI screenshots)

## Verdict

**READY WITH CONDITIONS** (unchanged). Full remaining-gap pass on rebuilt package was **21 PASS · 1 FAIL · 5 NOT VERIFIED**, then **pending-complete** reclassified the FIN-01 cash finding and closed remaining lab-testable gaps (**20 PASS · 0 FAIL · 6 NV** + REC-01 PASS). See `pending-complete-test-report.md`.

Not **READY FOR PILOT**: unsigned/notarized production artifact, Master PIN escrow, OPS-01 site config, backup policy approval, and human sign-off remain.

## Correction (follow-on)

Cash `remaining+1` → 200 is **change-on-cash by design** (applied capped; `change_amount` set). Non-cash overpay still rejects. Prior FAIL withdrawn.

## What this pass closed

| Area | Result |
| --- | --- |
| Rebuild + tags regression (`tests/product-tags-parse.test.ts`) | PASS |
| Inventory GUI with double-encoded `"[]"` tags | PASS (no error boundary) |
| API tags always `string[]` | PASS |
| Master PIN **Create Backup** GUI (PIN dialog → Confirm) | PASS (backup count 6→7) |
| Refund icon → dialog → Confirm Refund (manager PIN) | PASS (`partially_refunded`) |
| Settings tabs (General/Tax/Payments/Printers/Shift history/Backup) | PASS |
| POS shell + open shift + cash path | PASS |
| REC-01 posture (ACTIVE + backup inventory) | PASS (destructive re-drill not repeated this pass; prior REC-01 green) |

## Historical note (withdrawn FAIL)

An earlier pass marked cash `remaining+1` → 200 as a product FAIL. **Withdrawn:** that path is **change-on-cash by design** (applied capped; `change_amount` recorded). Non-cash over remaining remains rejected (400). See `pending-complete-test-report.md`.

## NOT VERIFIED (honest)

| Item | Why |
| --- | --- |
| Physical printer success | No hardware |
| Google Drive OAuth | Not exercised |
| WhatsApp QR | Not configured on QSR fixture |
| Formal load test | Out of scope |
| Production signed/notarized build | TRAINING adhoc only |

## Safety

- Isolated userdata only  
- Developer `flo-desktop` profile fingerprint unchanged  
- Artifact labeled TRAINING / QA — not production

## Next engineering steps

1. Commit INV-TAGS source + `product-tags-parse` regression into a clean release-candidate commit.  
2. Produce **notarized** production Mac build (Developer ID + staple) — do not ship TRAINING/adhoc as pilot.  
3. Re-run smoke + REC-01 on the **exact signed** artifact in isolated userdata.

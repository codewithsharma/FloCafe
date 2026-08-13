# Full Application QA Report — Nexora POS (FloCafe)

**Date:** 2026-08-13  
**Role:** Lead QA Engineer + CTO acceptance  
**Product:** Nexora POS (`flo-desktop`) **v3.0.5**  
**Git:** `develop` @ `e236542f7d023558e7eb25576a2413fa96ecf25a` (dirty working tree with uncommitted P1.5/P1.6 docs + shift settings)  
**Artifact class:** **TRAINING / QA BUILD** (adhoc/linker-signed `Nexora.app` — **not** notarized production)  
**Isolated userdata:** `$HOME/nexora-full-app-test`  
**Developer profile:** `$HOME/Library/Application Support/flo-desktop` — **UNTOUCHED** (SHA-256 of backup DBs unchanged)  

**Verdict:** **READY WITH CONDITIONS**  
**Score:** **82 / 100**

---

## 1. Environment

| Item | Value | Status |
|------|-------|--------|
| OS | macOS 26.5.1 (Build 25F80) | PASS |
| Arch | arm64 | PASS |
| Node | v24.18.0 | PASS |
| npm | 11.16.0 | PASS |
| App version | 3.0.5 (API health still reports service label `2.4.7`) | PASS |
| Test start (UTC) | 2026-08-13T03:28:17Z | PASS |
| Test end (UTC) | 2026-08-13T03:43:29Z | PASS |
| Isolated UD | `$HOME/nexora-full-app-test` | PASS |
| Dev profile safety | fingerprints identical before/after | PASS |

Evidence: `$HOME/nexora-full-app-test/evidence/phase0-environment.md`, `dev-profile-sha256-*.txt`

---

## 2. Build

| Check | Result |
|-------|--------|
| `npm test` | **PASS** (~158s, exit 0) |
| `npm run build` + `npm run build:frontend` | **PASS** (packaged) |

Evidence: `evidence/npm-test-results.txt`

---

## 3. Packaging

| Check | Result |
|-------|--------|
| Command | `electron-builder --mac dir --arm64` with `identity=null`, notarize=false, hardenedRuntime=false |
| Artifact | `release/mac-arm64/Nexora.app` |
| Codesign | **adhoc** — TeamIdentifier not set |
| Class | **TRAINING / QA BUILD** (not PRODUCTION-SIGNED) |

Evidence: `evidence/phase1-build-package.txt`

---

## 4. Installation

| Check | Result |
|-------|--------|
| Launch with `--user-data-dir=$HOME/nexora-full-app-test` | PASS |
| Health on `127.0.0.1:3001` | PASS |
| Bind localhost:3001/3002/3003 | PASS (ACTIVE mode) |
| Frontend from packaged `frontend-out` | PASS |
| Startup fatals | None observed |

---

## 5. Authentication

| Check | Result |
|-------|--------|
| FIRST_INSTALL → setup → owner → ACTIVE | **PASS** |
| Reject missing terms / invalid Master PIN | **PASS** |
| Duplicate setup blocked (403) | **PASS** |
| Invalid login rejected | **PASS** |
| Valid login (`access_token`) | **PASS** |
| Logout/login cycle | **PASS** (relogin after restart) |

---

## 6. Authorization

Roles exercised: **owner, manager, cashier, waiter, chef**

| Check | Result |
|-------|--------|
| Operational roles created **without** PIN | **PASS** |
| Waiter day-close / backup | **403 PASS** |
| Cashier `shifts_enabled` | **403 PASS** |
| Chef payment | **403 PASS** |
| Waiter refund | **403 PASS** |
| Manager PIN required for refunds (`override_pin`) | **PASS** |

Note: PINs are allowed only for owner/manager (product rule). Harness initially failed by sending PIN on cashier/waiter/chef — not a product defect.

---

## 7. Settings

| Setting | Change → save → reload | Status |
|---------|------------------------|--------|
| Business name / address fields | Persisted | **PASS** |
| `shifts_enabled=true` | Persisted | **PASS** |
| `require_open_shift_for_cash=true` | Persisted | **PASS** |
| `kds_enabled=true` | Persisted | **PASS** |
| `network_mode` | `localhost` | **PASS** |
| Unauthorized settings write | 403 | **PASS** |

---

## 8. Catalog

| Check | Result |
|-------|--------|
| Categories Coffee/Tea/Snacks/Food | **PASS** |
| Products Coffee/Tea/Sandwich/Samosa/FIN-01 Meal | **PASS** |
| Edit Coffee price 40→45 persisted | **PASS** |

---

## 9. POS

| Check | Result |
|-------|--------|
| Open shift | **PASS** |
| Multi-item takeaway order | **PASS** |
| Discount (manager) | **PASS** |
| Bill generate | **PASS** |
| Partial cash + remaining card | **PASS** |
| Reject pay on fully paid bill | **PASS** |
| Add-item API body shape | Harness miss (`At least one item is required`) — not scored as product P0 |

---

## 10. Payments

| Check | Result |
|-------|--------|
| Cash + card paths | **PASS** |
| Idempotency-Key used | **PASS** |
| Over-collection after FIN-01 | Rejected | **PASS** |

---

## 11. Refunds

| Check | Result |
|-------|--------|
| Partial cash refund with `override_pin` + open shift | **PASS** |
| Exceed refundable | **PASS** (`REFUND_EXCEEDS_PAID`) |
| Invalid PIN | **PASS** (`REFUND_PIN_INVALID`) |
| Unauthorized waiter | **PASS** (403) |
| Cash refund requires open shift when gate enabled | **PASS** (expected `OPEN_SHIFT_REQUIRED`) |

---

## 12. Shifts

| Check | Result |
|-------|--------|
| Enable via Settings API | **PASS** |
| Open / reconciliation preview | **PASS** |
| Close with wrong count (variance recorded) | **PASS** (`variance_cents` set) |
| Force-close / reopen | **PASS** |

---

## 13. Day close

| Check | Result |
|-------|--------|
| `POST /api/reports/day-close` | **PASS** |
| `GET /api/reports/day-close/:date` | **PASS** |
| Reports summary | **PASS** |

---

## 14. Reporting

Cross-check vs transaction counts after restore: orders/bills/refunds counts matched pre-DR snapshot. **PASS**

---

## 15. KDS

| Check | Result |
|-------|--------|
| `GET /api/kds/orders` (chef/manager) | **PASS** |
| New order visible on KDS API | **PASS** |
| Packaged static `/kds` and `/kds/` | **FAIL (P3)** — Express 404; `/kds/index.html` **200** (directory index gap) |
| KDS skipped during `RECOVERY_REQUIRED` | **PASS** (no :3002 listener) |

---

## 16. Printer

| Check | Result |
|-------|--------|
| Hardware print | **NOT VERIFIED — NO HARDWARE AVAILABLE** |
| Startup log | `No default printer configured` |

---

## 17. Network

| Check | Result |
|-------|--------|
| Mode | `localhost` | **PASS** |
| Listeners | `127.0.0.1:3001/3002/3003` only | **PASS** |
| mDNS | Skipped in localhost | **PASS** |
| OPS-01 guest Wi‑Fi LAN test | **NOT APPLICABLE** (not connected; localhost mode) |

---

## 18. Backup

| Check | Result |
|-------|--------|
| Owner + Master PIN `POST /api/db/backup` | **PASS** |
| File under `$HOME/nexora-full-app-test/backups/` | **PASS** |
| Bad Master PIN | **403 PASS** |
| Non-owner | **403 PASS** |
| Pre-DR backup copied to evidence | `pre-dr-backup.db` | **PASS** |

---

## 19. REC-01

Destructive test **only** in `$HOME/nexora-full-app-test`:

| Step | Result |
|------|--------|
| Stop app; move `flo.db` (+wal/shm) aside | **PASS** |
| Keep `install-state.json`, `jwt-secret.enc`, `master-pin.enc`, backups | **PASS** |
| Restart → `installState=RECOVERY_REQUIRED` (`missing_database`) | **PASS** |
| Process alive; recovery UI at `/recovery/` | **PASS** |
| Setup initialize blocked (503) | **PASS** |
| Payment APIs blocked (503) | **PASS** |
| KDS / Server App not listening | **PASS** |
| Invalid Master PIN restore | **PASS** (`Invalid Master PIN`) |
| Valid Master PIN + managed backup restore via Electron IPC | **PASS** (`tablesRestored:45`, relaunch) |

Evidence: `phase14-recovery-ui.png`, `phase14-restore-result.json`, `phase14-recovery-pre-restore.json`

Restore method note: recovery screen uses Electron IPC Master PIN restore (file dialog path). QA invoked the same IPC (`electronAPI.restoreBackup(pin, fileName)`) against the recovery renderer with CDP after confirming `/recovery/` was loaded — **not** a bypass of Master PIN or a second restore implementation.

---

## 20. Restore

| Check | Result |
|-------|--------|
| → ACTIVE, userCount=5 | **PASS** |
| Café name `Nexora QA Cafe` | **PASS** |
| Orders/bills/refunds counts | **PASS** (7/6/2) |
| Same-machine JWT login | **PASS** |
| New controlled sale post-restore | **PASS** |

---

## 21. FIN-01

Canonical fixture: total **1000**, gross tender **600**, refund **200**, net **400**, collectible outstanding **400**.

| Check | Pre-DR | Post-restore |
|-------|--------|--------------|
| Reject ₹401 | **PASS** | **PASS** |
| Accept ₹400 (collectible) | **PASS** | **PASS** |
| Further ₹1 / ₹200 | — | **PASS** (`BILL_NO_OUTSTANDING_BALANCE`) |
| `payment_status` / `balance` after gross settled | — | **FAIL (P2)** — remains `partial` / `balance=200` while collectible closed |

Financial money-path invariant (no over-collection): **PASS**  
Status/balance semantics vs collectible model: **FAIL (P2)** — see bugs

---

## 22. JWT

| Check | Result |
|-------|--------|
| Same-machine login after restore | **PASS** |
| New-machine recovery | **NOT VERIFIED** |

---

## 23. Security

| Check | Result |
|-------|--------|
| Role gates (settings, backup, refund, day-close, payment) | **PASS** |
| Master PIN boundaries | **PASS** |
| Recovery money/setup block | **PASS** |
| Corrupt managed restore name rejected | **PASS** (`Invalid backup file name` for planted non-allowlisted name) |
| Localhost bind / no `0.0.0.0` | **PASS** |
| Updater `restart-and-install` IPC | **NOT VERIFIED** (not exercised this run) |
| Phase C CSP / localStorage JWT XSS | Residual known risk (prior P0.6) — not re-audited as greenfield |

---

## 24. Stability

| Check | Result |
|-------|--------|
| Continuous run across setup → POS → DR → restore → sale | **PASS** |
| Formal load/perf benchmark | **NOT VERIFIED** |
| Unexpected crash loops | Not observed |

---

## 25. Bugs

### P0

*None confirmed.*

### P1

*None confirmed.*

### P2

#### QA-FIN01-STATUS-01 — payment_status / balance lag FIN-01 collectible model

- **Severity:** P2  
- **Module:** Bills payment status / balance derivation  
- **Repro:** total 1000 → tender 600 → refund 200 → pay 400 → further pay rejected with `BILL_NO_OUTSTANDING_BALANCE`, but GET bill shows `payment_status=partial`, `balance=200`, `paid_amount=800`  
- **Expected:** Status/balance either reflect collectible closed, or API documents net vs collectible explicitly for UI  
- **Actual:** Money APIs correctly refuse further collection; display fields still imply ₹200 due  
- **Evidence:** bill id 3 post-restore; `evidence/acceptance-final-checks.json`  
- **Suspected root cause:** `balance`/`payment_status` still derived from net `paid_amount` vs total, while eligibility uses gross tender  
- **Recommendation:** Align status/balance with collectible outstanding; keep `paid_amount` as net. Do **not** reopen collectible.

### P3

- API health `version` string still `2.4.7` while package is `3.0.5` — cosmetic/metadata drift.
- **QA-KDS-ROUTE-01:** `GET /kds` and `GET /kds/` return 404 on packaged static server; `GET /kds/index.html` returns 200. Electron in-app navigation may still work via hashed/client routes — verify in UI. Recommendation: ensure Express `index: true` / trailing-slash handling for dashboard static folders.

---

## 26. Evidence

Primary tree: `$HOME/nexora-full-app-test/evidence/`

Notable files:

- `phase0-environment.md`, `phase1-build-package.txt`, `npm-test-results.txt`
- `acceptance-results.json`, `acceptance-run-a.log`, `scorecard.json`
- `pre-dr-state.json`, `pre-dr-backup.db`, `pre-dr-backup-name.txt`
- `phase14-recovery-ui.png`, `phase14-restore-result.json`, `phase14-listeners.txt`
- `flo-db-aside-before-restore/` (moved DB for DR)
- `dev-profile-sha256-before.txt` / final

Isolated userdata preserved (do not delete without CTO approval).

---

## 26b. GUI operator pass (Electron window — follow-up)

Executed **after** the API acceptance run, by controlling the packaged `Nexora.app` UI via Chromium DevTools Protocol on the live Electron renderer (`--remote-debugging-port=9222`), with the Nexora window activated on macOS. Isolated UD unchanged; developer profile still untouched.

| GUI workflow | Result | Evidence |
|--------------|--------|----------|
| Login screen → type email/password → **Sign In** | **PASS** | `evidence/gui/pass2-01-login.png` … `pass2-03-after-signin.png` |
| Sidebar nav Home / POS / Orders / Customers / Reports / Settings | **PASS** | `pass2-04`…`pass2-17`, `pass4-nav-*` |
| Open Shift modal → float ₹500 → Shift Open | **PASS** | `pass3-02`…`pass3-04` |
| Product card → **Add to Cart** modal → Coffee + Sandwich | **PASS** | `pass4-01`…`pass4-03` (cart Items 2 / ₹165) |
| Place Order → **Confirm Payment · ₹165.00** | **PASS** | toast `Order #ORD-20260813-0009 paid!` in `pass4-07-paid.png` |
| Printer failure UI after pay (no hardware) | **PASS** (safe fail) / print itself **NOT VERIFIED** | `pass4-07-paid.png` — “Receipt print failed”, “Printer is not connected” |
| Settings → Backup & Data → Create Backup visible | **PASS** | `pass4-08-backup-section.png` |
| Kitchen / Team / Operations / Inventory routes via sidebar | **PASS** | `pass4` nav shots |
| Master PIN backup click-through + recovery file picker | **NOT VERIFIED** in this GUI pass | (API/IPC covered earlier) |
| Full Settings toggle persistence via UI switches | **NOT VERIFIED** | switches not found / not clicked to save in GUI pass |

Screenshots: **77** under `$HOME/nexora-full-app-test/evidence/gui/`. Results: `gui-all-results.json`.

## 27. Untested / NOT VERIFIED

| Area | Status |
|------|--------|
| Printer / kitchen hardware print | NOT VERIFIED (GUI showed failure path with no printer) |
| New-machine JWT restore | NOT VERIFIED |
| Formal performance/load test | NOT VERIFIED |
| Production-signed/notarized macOS artifact | NOT VERIFIED (this run is TRAINING/QA) |
| Updater restart IPC with owner JWT | NOT VERIFIED |
| Guest Wi‑Fi / `kds_lan`/`lan` live OPS-01 drill | NOT APPLICABLE / not run (forbidden on guest Wi‑Fi) |
| Every Settings control via GUI toggles | NOT VERIFIED (Backup section verified visually) |
| Recovery UI OS file-picker click path | NOT VERIFIED (managed IPC restore verified earlier) |

---

## 28. Final verdict

### READY WITH CONDITIONS

**Not READY FOR PILOT** until human/release gates close:

1. Production **signed + notarized** macOS artifact (TRAINING/QA ≠ PILOT)  
2. Master PIN escrow / café ownership of PIN  
3. On-site OPS-01 confirmation  
4. Numeric backup retention policy approval  
5. Printer hardware verification on pilot hardware  
6. CEO/CTO/pilot-owner sign-off  

**Engineering acceptance on this TRAINING/QA packaged run:** critical workflows **PASS**; **no unresolved P0/P1**; one **P2** status/balance semantics issue after FIN-01 gross settlement; REC-01 + FIN-01 money invariants **PASS**.

### Fixes applied during QA

**None.** No blocking P0/P1 requiring a localized code fix was confirmed. P2 status semantics left for tracked follow-up (must not weaken FIN-01).

---

## Recommended next engineering steps

1. Fix **QA-FIN01-STATUS-01** (status/balance vs collectible) with tests — without changing FIN-01 rejection semantics.  
2. Produce and verify a **production-signed** macOS build; re-run REC-01 smoke on that artifact.  
3. Execute printer hardware checklist + new-machine JWT drill on a second isolated UD when a spare machine/profile is available.

---

*STOP — awaiting CTO approval before commit/push/pilot promotion.*

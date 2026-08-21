# OPS-02 — Production Gap Matrix

**Phase:** R16 / OPS-02 — Production Release Readiness & Operational Gate  
**Date:** 2026-08-21  
**HEAD (audit baseline):** `faf3b70` · branch `restaurant-vertical`  
**Schema tip:** **v88**  
**Method:** Phase 1 baseline audit (code + tests + prior QA/OPS docs). No speculative PASS.  
**QR-ORD-IDEM:** Out of scope for OPS-02 (optional parallel; does not block OPS-02 eng gates).

---

## Severity legend

| Level  | Meaning                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| **P0** | Data loss / corruption / financial integrity failure — or live release gate that must be closed before Go-Live |
| **P1** | Production-blocking reliability / observability / release-integrity failure                                    |
| **P2** | Significant operational issue — document; do not silently expand OPS-02 scope                                  |
| **P3** | Non-blocking improvement                                                                                       |

**OPS-02 completion rule:** All mandatory **P0** and **P1** rows must be **Resolved** (with evidence) or **Accepted** by a release owner with explicit residual. Human/site P0s cannot be closed by engineering alone.

---

## Gap matrix

| ID                 | Area          | Scenario                                                                        | Current Behavior                                                                                                  | Risk                                                      | Severity | Existing Coverage                                            | Required Action                                                                                                                             |
| ------------------ | ------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| OPS-02-RC-001      | Release       | Signed + notarized macOS RC for pilot                                           | Unsigned `--dir` / adhoc builds verified historically; Apple signing secrets / identities unavailable on eng host | Gatekeeper blocks / untrusted café install                | **P0**   | `FINAL-UNSIGNED-RC-REPORT.md`; `release.yml` mac fail-closed | **HUMAN:** populate secrets → signed `build:mac` / `release-mac` → record SHA + commit                                                      |
| OPS-02-SITE-001    | Ops           | Café OPS-02 site drills (printer, LAN/KDS, WAN-down, restart, day-close, roles) | Checklists exist; rows blank / PENDING HUMAN                                                                      | Live behavior unproven on café host                       | **P0**   | `docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`; eng suites ≠ site | **HUMAN/SITE:** execute drills on signed RC; attach evidence                                                                                |
| OPS-02-PIN-001     | Ops / Sec     | Master PIN escrow + packaged backup/restore DR                                  | Eng suites green; café `safeStorage` DR not claimed                                                               | Lost PIN / unrecoverable DB ops                           | **P0**   | `test:backup`, `test:rec-01`, `test:r14`; escrow template    | **HUMAN:** paper escrow + desktop Master-PIN restore drill                                                                                  |
| OPS-02-SIGNOFF-001 | Release       | Executive / pilot go-live sign-off                                              | Templates empty                                                                                                   | No accountable GO                                         | **P0**   | `r16-executive-signoff-packet.md`, `pilot-signoff.md`        | **HUMAN:** CTO/CEO/pilot signatures                                                                                                         |
| OPS-02-OBS-001     | Observability | `/api/health` reports wrong version when `npm_package_version` unset            | **RESOLVED (2026-08-21):** reads `package.json` version; smoke asserts `3.0.5`                                    | Ops/support mis-identify RC; RC identity drift            | **P1**   | `test:smoke` version assert                                  | **CLOSED**                                                                                                                                  |
| OPS-02-KDS-001     | KDS           | New order / cancel / pay notify when no WS client online                        | **RESOLVED (2026-08-21):** `notifyKdsUpdate` enqueues coalesced snapshot outbox                                   | Missed new-ticket push until reconnect/REST/next bump     | **P1**   | `test:kds-h-outbox` OPS-02-KDS-001                           | **CLOSED**                                                                                                                                  |
| OPS-02-LIF-001     | Lifecycle     | Main-process `uncaughtException` / `unhandledRejection`                         | Log only; process continues                                                                                       | Undefined main state while POS still serves               | **P1**   | None for hard-crash policy                                   | **DOC/ACCEPT** for pilot: hard-exit mid-service worse than continue; track Phase C health degrade — **not** silent hard-quit without design |
| OPS-02-LIF-002     | Lifecycle     | KDS/Server App bind exhaustion                                                  | After 10 ports: `resolve()` without throw; companion down; kds-info 503; mDNS gated                               | Café believes app “Ready” without LAN KDS                 | **P1**   | `test:kds-bind-degrade`; H2 advertise                        | **ACCEPT** (intentional billing-first degrade) + site drill must verify companion; no architecture rewrite                                  |
| OPS-02-LIF-003     | Lifecycle     | Full Electron cold-start → kill → relaunch money smoke                          | Component/API suites exist; no CI Electron shell lifecycle E2E                                                    | Host restart unproven in CI                               | **P1**   | `process-kill`, recovery, smoke (API)                        | **HUMAN:** OPS-02 restart drills; eng does not invent full Electron E2E in this phase                                                       |
| OPS-02-SEC-001     | Security      | JWT in `localStorage` + CSP `'unsafe-inline'`                                   | Phase C deferred                                                                                                  | XSS → API                                                 | **P1**   | P0.6 / P2 hardening docs                                     | **HUMAN acceptance** or authorized Phase C — **not** silent CSP rewrite in OPS-02                                                           |
| OPS-02-QR-001      | Orders        | Public QR create without Idempotency-Key                                        | Soft table occupancy guard; staff path P18 keyed                                                                  | Duplicate guest order/stock after table free / tables off | **P1**   | P18 staff; P19 audit                                         | **OUT OF SCOPE** for OPS-02 (QR-ORD-IDEM optional parallel only if authorized)                                                              |
| OPS-02-TEST-001    | CI / Recovery | `npm run test:recovery` group membership                                        | **RESOLVED:** includes r14, p1-06, process-kill, **rec-01**                                                       | Named recovery gate incomplete                            | **P2**   | `test:recovery` pass=4                                       | **CLOSED**                                                                                                                                  |
| OPS-02-DB-001      | Database      | Dual OS-process writers on one WAL DB                                           | Single Electron instance lock; in-process shared handle; no dual-process contention suite                         | Theoretical `SQLITE_BUSY` under mis-ops                   | **P2**   | Single-instance lock; `busy_timeout=5000`; process-kill      | **ACCEPT** for single-host Electron; optional later contention harness                                                                      |
| OPS-02-DB-002      | Database      | `synchronous=NORMAL` power-loss                                                 | Last committed txn(s) may be lost without corruption                                                              | Rare power-cut money loss                                 | **P2**   | WAL + process-kill atomicity                                 | **ACCEPT** with site power-loss drill; do not flip to FULL without soak                                                                     |
| OPS-02-DB-003      | Database      | Startup `foreign_key_check`                                                     | Logs only; does not latch recovery                                                                                | Orphan rows after bad import                              | **P2**   | Integrity latch (R14) separate                               | Document; do not expand fail-closed without fixture plan                                                                                    |
| OPS-02-DB-004      | Database      | Data-only restore post-commit integrity                                         | FK delta gate; no post-commit `integrity_check`                                                                   | Rare silent bad restore                                   | **P2**   | H4 / backup-restore suites                                   | Backlog harden                                                                                                                              |
| OPS-02-KDS-002     | KDS           | Per-client delivery ACK                                                         | Outbox success if ≥1 client accepts snapshot                                                                      | Secondary display lag until reconnect/poll                | **P2**   | P4 design                                                    | **ACCEPT** for single-display pilot; multi-display soak on site                                                                             |
| OPS-02-PAY-001     | POS           | PaymentModal postpaid payment key not sticky across restart                     | In-memory modal key; server paid/outstanding rejects                                                              | Lost-response postpaid pay relies on server guards        | **P2**   | Payment idempotency suites; prepaid sticky LS                | **ACCEPT**; optional sticky deepen later                                                                                                    |
| OPS-02-OFF-001     | Offline       | No durable POS mutation queue when local API down                               | Sticky keys + SQLite SoR; cart in-memory; RQ retry 0                                                              | True browser-offline unsupported                          | **P2**   | P14/P18; offline contract                                    | **ACCEPT** — product offline = WAN-down, not API-down                                                                                       |
| OPS-02-CI-001      | CI            | Extended / R/P suites not on PR CI                                              | Path-filtered merge on PR; extended on main push                                                                  | Regressions can merge if only merge green                 | **P2**   | `test:merge`, nightly `--dir`                                | Document; do not redesign CI in OPS-02                                                                                                      |
| OPS-02-WIN-001     | Packaging     | Windows Authenticode unsigned                                                   | Release workflow soft-warn; ships unsigned                                                                        | SmartScreen friction                                      | **P2**   | `release.yml`                                                | **HUMAN/DevOps** SignPath or accept residual                                                                                                |
| OPS-02-DOC-001     | Docs          | R16 / OPS-02 docs still cite schema v82–v86                                     | Code tip **v88**                                                                                                  | Checklist identity drift                                  | **P2**   | This matrix + gates                                          | Refresh tip references in OPS-02 deliverables                                                                                               |
| OPS-02-DOC-002     | Memory        | `.ai/risks` / tasks still say “durable KDS outbox deferred”                     | P4 outbox shipped                                                                                                 | Mis-scopes eng work                                       | **P3**   | P4 report                                                    | Update `.ai` during OPS-02 close                                                                                                            |
| OPS-02-COLD-001    | Lifecycle     | Full `integrity_check` every cold start                                         | Correct fail-closed; latency grows with DB size                                                                   | Slow open on large DBs                                    | **P3**   | R14                                                          | Monitor; no rewrite                                                                                                                         |
| OPS-02-UI-001      | UX            | Close-to-tray (non-obvious quit)                                                | Intentional hide                                                                                                  | Operator confusion                                        | **P3**   | Tray Quit                                                    | Training / runbook                                                                                                                          |
| OPS-02-VER-001     | Packaging     | `frontend/package.json` version `0.1.0` ≠ ship `3.0.5`                          | Cosmetic                                                                                                          | Confusion only                                            | **P3**   | —                                                            | Optional align                                                                                                                              |

---

## Mandatory blocker summary (OPS-02)

### P0 — must clear for Live GO

| ID                 | Owner           | Status (2026-08-21) |
| ------------------ | --------------- | ------------------- |
| OPS-02-RC-001      | Human / release | **OPEN**            |
| OPS-02-SITE-001    | Human / site    | **OPEN**            |
| OPS-02-PIN-001     | Human / ops     | **OPEN**            |
| OPS-02-SIGNOFF-001 | Human / exec    | **OPEN**            |

### P1 — engineering / governance

| ID              | Owner                      | Status                                                                         |
| --------------- | -------------------------- | ------------------------------------------------------------------------------ |
| OPS-02-OBS-001  | Engineering                | **RESOLVED** — `/api/health` uses `package.json` version; smoke asserts        |
| OPS-02-KDS-001  | Engineering                | **RESOLVED** — `notifyKdsUpdate` enqueues snapshot outbox; `test:kds-h-outbox` |
| OPS-02-TEST-001 | Engineering                | **RESOLVED** — REC-01 added to `test:recovery` group                           |
| OPS-02-LIF-001  | Release owner accept       | **ACCEPTED residual** (continue-after-log)                                     |
| OPS-02-LIF-002  | Release owner accept       | **ACCEPTED residual** (billing-first bind degrade)                             |
| OPS-02-LIF-003  | Human site drills          | **OPEN** (evidence via SITE-001)                                               |
| OPS-02-SEC-001  | Human acceptance / Phase C | **OPEN** (governance)                                                          |
| OPS-02-QR-001   | Optional QR-ORD-IDEM       | **DEFERRED** (out of OPS-02 scope)                                             |

### P2 / P3

Documented above. Do not expand OPS-02 implementation scope to close them unless a release owner elevates.

---

## Explicit non-blockers for OPS-02 engineering bar

- Staff order create/add-items idempotency (P18) — closed
- Payment Idempotency-Key + FIN-01 — closed
- Process-kill mid-txn atomicity — closed
- REC-01 / R14 / P1-06 fail-closed — closed
- H2 KDS advertise + P4 snapshot outbox (status path) — closed; deepen via OPS-02-KDS-001
- Unsigned packaging path exists (`npm run pack`) — TRAINING/QA only

---

## Related documents

- Release gates: `docs/qa/OPS-02-RELEASE-GATES.md`
- Prior: `docs/qa/P19-POST-P18-DEEP-AUDIT.md`, `docs/05-production/r16-production-release-blocker.md`, `docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`

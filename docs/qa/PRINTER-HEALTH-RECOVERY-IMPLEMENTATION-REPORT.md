# Printer Health & Recovery UX — Implementation Report

## Summary

| Field      | Value                                           |
| ---------- | ----------------------------------------------- |
| Feature    | Printer Health & Recovery UX                    |
| Feature ID | `PRINT-HEALTH`                                  |
| Phase      | P10                                             |
| Status     | **COMPLETE** (Implemented / Hardening verified) |
| Commit     | _(see git after commit)_                        |
| Schema     | **v88** (no bump)                               |

Live pilot remains **NO-GO** (R16).

## Implementation summary

Deepens R13 `print_jobs` (no parallel queue):

- `GET /api/printers/health` — derived overall health + open job list (Owner/Manager)
- Concurrent retry claim: `failed → pending` lease; second concurrent claim → `PRINT_JOB_BUSY`
- Stale `pending` (>60s) reclaimable after crash mid-retry
- Audit: `print_job.retry_requested|succeeded|failed|rejected`
- Settings → Receipts & Printers: health summary + recovery table with double-click-safe Retry

## Existing architecture reused

| Piece        | Reuse                                                 |
| ------------ | ----------------------------------------------------- |
| Queue        | `print_jobs` v86 / `print-queue.ts`                   |
| List         | `GET /api/printers/jobs` unchanged                    |
| Retry        | `POST /api/printers/jobs/:id/retry` + `retryPrintJob` |
| Success path | `print_logs` via `receipt.ts` on successful retry     |
| Config       | `printers` default row                                |
| OS detect    | Unchanged separate endpoint (not required for health) |

Job statuses remain: `pending \| failed \| done \| cancelled`.

## Health semantics

| Overall      | Rule                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| **healthy**  | `open_count = 0` **and** default printer present                                             |
| **degraded** | Open retryable jobs (`attempts < max_attempts`) **or** no default printer with empty queue   |
| **error**    | Any exhausted open job (`attempts >= max_attempts`) **or** open jobs with no default printer |
| **unknown**  | Reserved; not returned when queue/config readable                                            |

**Not claimed:** live ESC/POS ACK, paper-out sensors, or OS `lpstat` as SoR (detect remains optional adjacent API).

## Recovery semantics

| Concern     | Behavior                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| Who         | Owner / Manager only (server RBAC)                                                      |
| Eligible    | `failed` (or stale `pending`) bill jobs with `attempts < max_attempts`                  |
| Concurrency | Atomic claim to `pending`; concurrent → 409 `PRINT_JOB_BUSY`                            |
| Idempotency | `done` / `cancelled` / exhausted → 409; success writes one `print_logs` row then `done` |
| Restart     | Durable `print_jobs`; stale pending reclaim after 60s                                   |
| Audit       | Retry request / success / hardware fail / rejection — not on GET health                 |

**Limitation:** Multiple open jobs for the same `bill_id` can still each print if retried separately (pre-existing R13 gap; not inventing bill-level unique constraint in this slice).

## Test matrix

| Command                     | Result       |
| --------------------------- | ------------ |
| `npm run test:print-health` | PASS         |
| `npm run test:r13`          | PASS (51/51) |
| `npm run test:critical`     | PASS (24/24) |
| `npm run test:phase2`       | PASS         |
| `npm run test:kds-h-outbox` | PASS         |
| `npm run test:inv-auto-86`  | PASS         |
| `npm run test:rpt-pay`      | PASS         |
| `npm run test:rpt-disc`     | PASS         |
| `npm run test:kds-alerts`   | PASS         |
| `npm run test:rpt-staff`    | PASS         |
| `npm run build`             | PASS         |
| `npm run build:frontend`    | PASS         |

Targeted eslint on changed print-health files: report at commit time.

## Known limitations

- No direct hardware heartbeat in health overall
- KOT / day-close not in `print_jobs` (R13 scope)
- No background auto-flush worker
- Bill-level duplicate-job prevention not added
- Exhausted jobs need a new print-bill enqueue (or future reset) — not silently reopened

## Inventory

- Capability matrix: Printer health → 🟢 Existing; Printer recovery → 🟢 Existing (both Printing rows; Offline/Reliability recovery row updated if present)
- Feature list: Printer health / recovery `[BUILT]`
- FEATURE-INVENTORY: PRT-07 or deepen PRT-03 with health UI evidence

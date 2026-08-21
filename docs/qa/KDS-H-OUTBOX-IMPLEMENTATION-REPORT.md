# KDS-H-OUTBOX Implementation Report

**Date:** 2026-08-21  
**Feature ID:** `KDS-H-OUTBOX`  
**Schema tip:** **v87** (`kds_h_delivery_outbox`)  
**Baseline:** P1.1 `8111878` · P2 `b16f579` · P3 analysis complete

---

## Feature

Durable KDS **snapshot delivery intent** outbox + bounded exponential reconnect backoff on the KDS client.

SQLite `order_items` / `orders` remain the **only** kitchen Source of Record. The outbox never stores authoritative status transitions to apply; drain always re-reads live SQLite and broadcasts board snapshots.

---

## Architecture

```text
Chef/API status bump
  → withTxn { applyKitchenItemStatus (SoR) + enqueueKdsSnapshotDelivery }
  → notifyKdsUpdate (best-effort live push)
  → on successful push: completeOpenKdsSnapshotJobs
  → background worker: claim → broadcastOrderUpdate → done | backoff

FE reconnect
  → exponential delay (3s × 2^n, cap 30s + jitter)
  → reset attempt counter on auth_success
  → pending status PATCHes persisted in sessionStorage across tab reload
```

**Ordering:** coalesced single open `snapshot` job — no global event log. Per-ticket ordering is enforced by SoR CAS on mutate; snapshots are full-board and naturally idempotent.

---

## Data Model

Migration **v87** table `kds_delivery_outbox`:

| Column                      | Role                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `id`                        | Row PK                                                        |
| `event_id`                  | Unique stable identity                                        |
| `job_type`                  | `snapshot` only                                               |
| `status`                    | `pending` \| `in_flight` \| `done` \| `failed` \| `cancelled` |
| `attempts` / `max_attempts` | Default max **12**                                            |
| `order_id` / `item_id`      | Debug metadata only                                           |
| `payload_json`              | Reason metadata (not status SoR)                              |
| `next_attempt_at`           | Backoff schedule                                              |
| `leased_at`                 | in_flight lease for crash recovery                            |
| timestamps                  | created/updated/completed                                     |

Indexes: `(status, next_attempt_at)`, `(event_id)`.

---

## Delivery Flow

1. Status mutation enqueues/coalesces one open snapshot intent (same DB connection/txn).
2. Immediate `broadcastOrderUpdate` tries live WS clients.
3. Any successful send completes open snapshot jobs.
4. Worker claims eligible rows, broadcasts again from SQLite, marks done or reschedules.

Owner/Manager APIs:

- `GET /api/kds/outbox`
- `POST /api/kds/outbox/drain`

---

## Retry Strategy

| Setting                  | Value                             |
| ------------------------ | --------------------------------- |
| Outbox base              | 1000ms × 2^attempts               |
| Outbox cap               | 60s + ≤500ms jitter               |
| Max attempts             | 12                                |
| Worker interval          | 1s                                |
| Stale in_flight recovery | lease > 60s → pending             |
| Done retention prune     | 24h                               |
| FE reconnect             | 3s × 2^n, cap 30s + ≤400ms jitter |

---

## Idempotency Strategy

- Snapshot delivery is idempotent (full board replace).
- Kitchen mutations remain CAS/idempotent in `kitchen-status`.
- Coalesce prevents duplicate open snapshot rows.
- Claim uses status CAS (`pending|failed` → `in_flight`).
- ACK protocol not required: success = ≥1 authenticated client accepted a live snapshot.

---

## Failure Recovery

| Scenario                | Behavior                                                      |
| ----------------------- | ------------------------------------------------------------- |
| No KDS clients          | Fail → pending with backoff                                   |
| Process crash in_flight | Lease recovery → pending                                      |
| Tab reload (chef)       | sessionStorage restores pending PATCH retries                 |
| Auth failure            | No infinite reconnect for unauthorized (existing H2 behavior) |
| KDS disabled            | Worker skips; module gate preserved                           |

---

## Security

- P2 Origin allowlist / maxPayload unchanged.
- Outbox admin routes require Owner/Manager.
- JWT verify paths unchanged.
- No tokens in logs/payloads.

---

## Tests

| Suite                                    | Result     |
| ---------------------------------------- | ---------- |
| `tests/unit/kds-delivery-outbox.test.ts` | PASS (3)   |
| `tests/kds-h-outbox.test.ts`             | PASS       |
| `npm run test:h2`                        | PASS 34/34 |
| `npm run test:r3`                        | PASS 70/70 |
| KDS websocket revalidation               | PASS       |
| KDS integration                          | PASS       |

(P1 merge / critical / lint / tsc / FE build recorded in final commit validation.)

---

## Known Limitations

- No per-client delivery ACK (snapshot success = ≥1 client).
- Mutate-intent server outbox not added (FE sessionStorage + SoR CAS cover chef bumps).
- Expediter / sound alerts still Planned.
- Matrix Offline-KDS rows remain Hardening until pilot soak — feature status: **Implemented / Hardening verified**.

---

## Acceptance Criteria

| Criterion                              | Status |
| -------------------------------------- | ------ |
| Durable delivery intent                | PASS   |
| SQLite SoR                             | PASS   |
| Transactional enqueue with status      | PASS   |
| Stable event identity                  | PASS   |
| Idempotent delivery                    | PASS   |
| No duplicate business effects on retry | PASS   |
| Bounded exponential backoff            | PASS   |
| Single reconnect timer                 | PASS   |
| Reset backoff on success               | PASS   |
| Survive process restart (DB outbox)    | PASS   |
| Recover stale in_flight                | PASS   |
| P2 WS security intact                  | PASS   |
| Safe cleanup                           | PASS   |
| Tests                                  | PASS   |
| Docs                                   | PASS   |

---

## Final Status

**COMPLETE** for scoped KDS-H-OUTBOX hardening slice.

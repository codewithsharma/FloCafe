# R13 — Print queue / retry (Integrations / Hardware thin slice)

**Status:** COMPLETE (2026-08-15)  
**Schema tip:** **v86** (`print_jobs`)  
**Suite:** `npm run test:r13`  
**Author:** Dev Raj Sharma

## Delivered

- `print_jobs` durable outbox (cloud_sync_outbox style): `id`, `status` (`pending|failed|done|cancelled`), `attempts`, `max_attempts` (default **2**), `job_type` (bill), `bill_id` / `order_id`, `payload_json`, `last_error`, `created_at`, `updated_at`, `completed_at`
- Failed `POST /api/printers/print-bill` enqueues a **failed** job (attempts=1) — no silent drop; response includes `print_job_id`
- `GET /api/printers/jobs` — Owner/Manager list of pending/failed jobs
- `POST /api/printers/jobs/:id/retry` — one bounded reattempt; success writes `print_logs` + marks `done`; failure increments `attempts` / stays `failed`; exhausted / done → **409**
- Service: `main/services/print-queue.ts`

## Explicitly out

Payment terminals · aggregators · multi-printer routing depth · automatic background flush · KOT queue · Bluetooth

## Release truth

Live café validation: DEFERRED · Controlled Pilot: READY WITH CONDITIONS · Live Go-Live: **NO-GO**

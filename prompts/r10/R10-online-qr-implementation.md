# R10 — Online / QR Ordering — Implementation

## Authorization

Authorized as the roadmap R10 program (Online / QR). Workforce OS is **not** R10.

## Acceptance

1. Fresh + upgrade DB tip **v84**; `tables.qr_token` opaque unique.
2. `GET /api/public/qr/session` + `menu` without staff JWT when token valid.
3. `POST /api/public/qr/orders` creates dine_in + occupies table; pay-at-counter only.
4. Invalid/rotated token → 404/401; no cost/stock internals on public menu.
5. Owner/Manager can rotate token; old token fails.
6. Guest UI at `/qr/?t=` (AuthGuard public); i18n keys.
7. `npm run test:r10` PASS; `npm run build` PASS for touched main.
8. Docs + matrix/feature-list + `.ai/*` updated.

## Forbidden

Gateway/online pay, Frozen rows, financial formula drift, unrelated WIP commits.

# R10 — Online / QR Ordering — Completion

**Status:** COMPLETE (2026-08-15)
**Schema tip:** **v84** (`tables.qr_token` + system user `usr-system-qr-guest`)
**Suite:** `npm run test:r10` (33/33)

## Delivered

- Opaque per-table guest QR tokens; Owner/Manager fetch + rotate
- Public LAN API `/api/public/qr/*` (session, menu, create dine_in, status) — no staff JWT; pay-at-counter only
- Guest UI `/qr/?t=` (AuthGuard public)
- Tables UI QR dialog (copy link / rotate)
- Audits: `order.created` (`source: qr_guest`) + `table.qr_token_rotated`

## Explicitly out

Online payment / gateways · aggregators · remote internet SaaS · Workforce OS (relocated to `prompts/later/`)

## Release truth

Live café validation: DEFERRED · Controlled Pilot: READY WITH CONDITIONS · Live Go-Live: **NO-GO**

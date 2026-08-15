# R11 — Coupon codes (Marketing thin slice)

**Status:** COMPLETE (2026-08-15)  
**Schema tip:** **v85** (`coupons`)  
**Suite:** `npm run test:r11`

## Delivered

- `coupons` table: unique code; exactly one of `percent_off` (1–100) or `amount_cents` (>0); `active`; optional `max_uses`; `uses_count`; `created_at`
- Owner/Manager API: `POST/GET /api/coupons`, `POST /api/coupons/:id/deactivate`
- Apply on unpaid order: `POST /api/orders/:id/apply-coupon` — reuses shared order discount apply (`main/services/order-discount.ts`); post-tender **409** `ORDER_HAS_SUCCESSFUL_TENDER`; Idempotency-Key replay; cashier may apply (cannot CRUD)
- Audit `order.discount_applied` metadata includes `coupon_code` (and `coupon_id`)

## Explicitly out

WhatsApp marketing campaigns · campaign blasts · promotions engine · happy-hour · gift cards · Frozen online payment / aggregators

## Release truth

Live café validation: DEFERRED · Controlled Pilot: READY WITH CONDITIONS · Live Go-Live: **NO-GO**

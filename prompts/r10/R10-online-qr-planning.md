# R10 — Online / QR Ordering — Planning

**Type:** Phase planning
**Canonical ID:** R10 = Online / QR Ordering (`docs/00-product/restaurant-os-roadmap.md`)
**Misnamed prior artifact:** Workforce OS planning relocated to `prompts/later/workforce-os-planning.md` (not R10).

## Release truth (start)

```text
R1–R9: COMPLETE
R10: AUTHORIZED (this program)
Schema tip: v83 → v84 (table qr_token)
Online payment: FROZEN (pay-at-counter only)
Live café: DEFERRED | Controlled Pilot: READY WITH CONDITIONS | Live Go-Live: NO-GO
```

## Objective

Guest table QR → public LAN menu → create `dine_in` order bound to table → kitchen/POS flow unchanged → **pay at counter**. No payment gateway, no remote internet SaaS, no aggregators.

## Slices

| Slice | Scope                                                                            |
| ----- | -------------------------------------------------------------------------------- |
| S1    | Schema `qr_token`; public menu + create; guest UI `/qr/?t=`; staff rotate; tests |
| S2    | Staff table QR surface (URL + rotate) + order status poll for guest              |

## Out of scope

Online payment, delivery marketplace, takeaway-without-table remote order, WhatsApp marketing blasts, Workforce OS.

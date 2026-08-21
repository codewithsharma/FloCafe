# P15 — Sensitive-Action Controls Hardening Plan

**Feature ID:** `SEC-SENSITIVE-ACTIONS`  
**Date:** 2026-08-21  
**Schema decision:** **Remain v88** (no bump)  
**Status:** PLAN COMPLETE — ready for minimal implementation  
**Live pilot:** NO-GO (R16 / OPS-02 unchanged)

---

## Audit summary (pre-implementation)

Money paths (refund, pay, order/item discount, coupon, shift, day-close) are largely closed post-P13/H1/H3: `requireRole`, JWT actors, in-txn success audits. Stock/count/receive/print-retry/staff role closed by R4/R6/R8/P10.

Matrix: **Sensitive-action controls = 🔵 Planned**. Authorization / RBAC remain 🟡 Hardening after H3.

### Concrete gaps authorized for P15 (thin)

| #   | Gap                                                                                                           | Risk                       | Fix                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Bill `applyDiscount` only blocks `payment_status===paid`, not successful tender (unlike order discounts / H1) | Money after partial tender | `orderHasSuccessfulTender` → 409 before mutation                                                 |
| 2   | Order cancel PIN success omits `pin_approved_by` (item void/refund have it)                                   | Accountability             | Capture approver; include in success audit metadata                                              |
| 3   | Failed manager PIN on order cancel / item void → no failure audit                                             | Accountability             | `logAuditEvent` result=`failure` (no PIN material)                                               |
| 4   | Drive `backup-now` has Master PIN but no audit                                                                | Ops accountability         | Success `backup.created` (or `drive.backup_created`) with JWT actor                              |
| 5   | `network_mode` → `kds_lan`/`lan` by manager JWT, no PIN, no audit                                             | LAN exposure               | Owner-only + `requireMasterPin` for non-localhost; always audit                                  |
| 6   | Master PIN reset: owner JWT, no audit                                                                         | DR gate silent change      | Success audit `master_pin.reset` (preserve “session is credential” — do **not** require old PIN) |
| 7   | JSON export/import: no audit; import Master PIN only when `overwrite`, but schema mismatch can also wipe      | Data protection            | Audit export/import; require Master PIN whenever destructive replace path runs                   |

### Explicitly out of scope / document only

- Served-item soft-cancel vs void+PIN (would force PIN on O/M for served — product UX change)
- Cashier/waiter void UI deepen (H3 leftover UX)
- IPC backup/restore null-actor redesign
- Authz-denial audit flood on every 403
- DB deny-triggers, new RBAC framework, Master PIN length, CSP Phase C
- Money/report semantic redesign; P16; Frozen features

---

## Authorization model (reuse)

- `requireAuth` (DB role) + `requireRole` + existing `requireMasterPin`
- Actor = JWT/`req.user.userId` only
- No new roles/permissions framework

## Audit / txn rules

- Success audits for money/cancel remain inside `withTxn` where mutation is transactional
- Failure PIN audits are non-mutating (outside txn OK)
- Drive/export/network/master-pin audits after successful op (best-effort where file I/O, like HTTP backup)
- No success audit on 403/409/400
- No PIN plaintext in metadata

## Schema

**v88 unchanged.**

## Tests

`tests/p15-sensitive-action-controls.test.ts` + `npm run test:p15`

Cover: RBAC matrix for hardened actions, tender guard on bill discount, pin_approved_by, failed PIN audit, Drive/network/master-pin/export-import audits, actor spoof rejection, schema tip v88, P14 conflict spot-check.

## Matrix promotion policy

Promote **Sensitive-action controls** → 🟢 Existing **only if** the thin controls above land with green tests. Keep Authorization / RBAC / Audit logging as Hardening where residual depth remains.

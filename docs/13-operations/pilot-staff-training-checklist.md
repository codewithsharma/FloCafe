# Operavia Pilot — Staff Training Checklist

**Audience:** Café owner / manager training cashiers, waiters, chefs, and managers.  
**Vertical:** Operavia Restaurant (café). Leave `ACTIVE_VERTICAL_ID` unset or `restaurant`.  
**Related:** [`pilot-runbook.md`](./pilot-runbook.md) · [`pilot-signoff.md`](./pilot-signoff.md) · [`incident-response.md`](./incident-response.md)

Mark each row only after the trainee **demonstrates** the step on a non-live or supervised register. Initials = trainer.

**Product policy note:** Engineering gates **H1** (paid cancel → 409) and **H3** (chef cancel PIN) are product behaviors, not the checklist H1/H2/H3 rows in older release checklists.

---

## Per-person sign-off

| Name | Role (cashier / waiter / chef / manager / owner) | Date | Trainer initials |
| ---- | ------------------------------------------------ | ---- | ---------------- |
|      |                                                  |      |                  |
|      |                                                  |      |                  |
|      |                                                  |      |                  |

---

## SALE

| #   | Step                                                                                                            | Role    | Done | Initials |
| --- | --------------------------------------------------------------------------------------------------------------- | ------- | ---- | -------- |
| S1  | Normal sale: add items → charge → complete payment                                                              | Cashier | [ ]  |          |
| S2  | Held order: hold, resume, then pay (if used)                                                                    | Cashier | [ ]  |          |
| S3  | Payment: cash (with change) and at least one non-cash/manual tender                                             | Cashier | [ ]  |          |
| S4  | Receipt: confirm print or reprint path; if print fails after pay, **money stands** — escalate S2, do not cancel | Cashier | [ ]  |          |
| S5  | Do not double-tap pay when UI retries                                                                           | Cashier | [ ]  |          |

---

## REFUND

| #   | Step                                                                                                                                     | Role    | Done | Initials |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | -------- |
| R1  | Complete a refund with manager PIN                                                                                                       | Manager | [ ]  |          |
| R2  | **Restaurant:** refund is **money-only** — no restock checkbox; stock does not return via refund                                         | Manager | [ ]  |          |
| R3  | **Retail only (if training Retail):** after money refund, optional restock with explicit item + qty; restock failure does not undo money | Manager | [ ]  |          |
| R4  | Never cancel a paid order to “undo” a sale — use refund                                                                                  | All     | [ ]  |          |

---

## CANCEL

| #   | Step                                                                                                   | Role              | Done | Initials |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------- | ---- | -------- |
| C1  | Unpaid order cancel succeeds; tracked stock restores                                                   | Cashier / Waiter  | [ ]  |          |
| C2  | Paid / tendered order: Cancel hidden or returns **409** `ORDER_HAS_SUCCESSFUL_TENDER` — use **refund** | Cashier / Manager | [ ]  |          |
| C3  | Fully refunded order still cannot be cancelled via cancel path (gross tender remains)                  | Manager           | [ ]  |          |

---

## SHIFT

| #   | Step                                                               | Role              | Done | Initials |
| --- | ------------------------------------------------------------------ | ----------------- | ---- | -------- |
| SH1 | Opening float: open shift with counted float (when shifts enabled) | Manager / Cashier | [ ]  |          |
| SH2 | Cash reconciliation during/after service                           | Manager           | [ ]  |          |
| SH3 | Close shift with counted cash; variance recorded                   | Manager           | [ ]  |          |

---

## DAY CLOSE

| #   | Step                                                                                    | Role    | Done | Initials |
| --- | --------------------------------------------------------------------------------------- | ------- | ---- | -------- |
| D1  | Run day close / Z-report path                                                           | Manager | [ ]  |          |
| D2  | Understand expected cash = opening float + cash in − cash refunds (not Gross/Net sales) | Manager | [ ]  |          |
| D3  | Record / review variance; open shifts may warn but do not invent numbers                | Manager | [ ]  |          |

---

## KDS (Restaurant; skip if KDS not used)

| #   | Step                                                                         | Role           | Done | Initials |
| --- | ---------------------------------------------------------------------------- | -------------- | ---- | -------- |
| K1  | Order reaches KDS after send                                                 | Chef           | [ ]  |          |
| K2  | Prepare / status transitions work                                            | Chef           | [ ]  |          |
| K3  | Bump / mark ready–served                                                     | Chef           | [ ]  |          |
| K4  | If KDS down: keep taking orders; use printed KOT / manual notes; escalate S2 | Chef / Manager | [ ]  |          |

---

## 86 (Restaurant owner/manager only)

| #   | Step                                                           | Role            | Done | Initials |
| --- | -------------------------------------------------------------- | --------------- | ---- | -------- |
| E1  | Owner/manager 86 an item from POS                              | Owner / Manager | [ ]  |          |
| E2  | Restore from 86 strip                                          | Owner / Manager | [ ]  |          |
| E3  | Confirm cashiers cannot 86 (403); 86 does **not** change stock | Manager         | [ ]  |          |
| E4  | Retail has **no** 86 workflow — N/A on café Restaurant install | Owner           | [ ]  |          |

---

## LOW STOCK

| #   | Step                                                            | Role            | Done | Initials |
| --- | --------------------------------------------------------------- | --------------- | ---- | -------- |
| L1  | View attention hub / `/products/low-stock` (owner/manager)      | Owner / Manager | [ ]  |          |
| L2  | Authorized stock adjustment (or wastage) when needed            | Owner / Manager | [ ]  |          |
| L3  | Cashiers do not use low-stock hub as a cancel/refund workaround | Manager         | [ ]  |          |

---

## RECOVERY

| #   | Step                                                                                              | Role            | Done | Initials |
| --- | ------------------------------------------------------------------------------------------------- | --------------- | ---- | -------- |
| V1  | Create local backup with Master PIN; know `{userData}/backups/`                                   | Owner           | [ ]  |          |
| V2  | Know restore requires Master PIN + correct café backup file                                       | Owner           | [ ]  |          |
| V3  | REC-01 STOP RULE: unexpected setup after prior config → **stop trading**, do not create new owner | Owner / Manager | [ ]  |          |
| V4  | Escalation path known (`incident-response.md` + `pilot-incident-log.md`)                          | Owner / Manager | [ ]  |          |

---

## CHEF (H3)

| #   | Step                                                                      | Role           | Done | Initials |
| --- | ------------------------------------------------------------------------- | -------------- | ---- | -------- |
| F1  | Chef cancel of pending/in-progress requires **manager PIN**               | Chef + Manager | [ ]  |          |
| F2  | Chef can still advance to preparing / bump KDS **without** cancel PIN     | Chef           | [ ]  |          |
| F3  | Chef cannot item-cancel (403) — get manager for voids/cancels as designed | Chef           | [ ]  |          |

---

## Training completion

| Check                                                                        | Status |
| ---------------------------------------------------------------------------- | ------ |
| All role-applicable rows demonstrated                                        | [ ]    |
| Owner/manager walked through `pilot-runbook.md`                              | [ ]    |
| Incident severity S1–S4 understood                                           | [ ]    |
| Recorded on [`pilot-signoff.md`](./pilot-signoff.md) “Owner/manager trained” | [ ]    |

**Live service:** Do not mark OPS-05 / training PASS on sign-off until this sheet is complete for staff who will work the pilot.

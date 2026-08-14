# First Café Dry Run — Result Sheet

**Date opened:** 2026-08-14  
**Engineering baseline:** `0200cae` (H1/H2/H3; schema v75)  
**Vertical for this dry run:** Operavia Restaurant (café)  
**Session operator (agent):** Release/ops prep only — **no café access; signing unavailable**

**Related:** [`pilot-runbook.md`](../13-operations/pilot-runbook.md) · [`pilot-signoff.md`](../13-operations/pilot-signoff.md) · [`pilot-staff-training-checklist.md`](../13-operations/pilot-staff-training-checklist.md) · [`dr-drill-worksheet.md`](../13-operations/dr-drill-worksheet.md) · [`pilot-operations-readiness-report.md`](./pilot-operations-readiness-report.md)

Fill PASS only with evidence. Do not invent café results.

---

## Phase 1 — Release Candidate

### Dirty tree review (2026-08-14)

| Bucket                                   | Files (summary)                                                                                                                                                                                                                                                              | Assessment                                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intentional ops docs**                 | `pilot-runbook.md`, `pilot-signoff.md`, `pilot-handoff-*`, new training/success/report under `docs/13-operations/` + `docs/05-production/`                                                                                                                                   | Safe for ops pack; commit separately when asked                                                                                                                                         |
| **`.ai/` memory**                        | context/tasks/risks/decisions                                                                                                                                                                                                                                                | Ops audit notes; not runtime                                                                                                                                                            |
| **Unrelated branding (Nexora→Operavia)** | `main/index.ts`, `main/db.ts`, `main/printers/thermal.ts`, `main/routes/auth.ts`, `main/routes/products.ts`, `main/tax-packs/catalog.ts`, `package.json` (author/AppX/desktop Name), `frontend` settings/recovery/tax panel strings, `assets/metainfo`, assorted docs/audits | **Display/branding only** — no money/inventory/schema change observed in sample diffs. **Not on clean `0200cae`.** Must be intentionally included or discarded **before** RC isolation. |
| **Other docs churn**                     | STRATEGY, audits, PM reports, ADR text renames                                                                                                                                                                                                                               | Branding/docs drift — not required for dry-run execution                                                                                                                                |

**Release isolation:** **FAIL** — working tree is **not** an isolated clean commit of `0200cae` (or a single intentional RC commit).

### Signing environment (this machine)

| Check                                                     | Result                  |
| --------------------------------------------------------- | ----------------------- |
| Codesign identities                                       | **0 valid**             |
| `CSC_LINK` / `CSC_KEY_PASSWORD`                           | **UNSET**               |
| `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` | **UNSET**               |
| `MAC_CERTS`                                               | **UNSET**               |
| Human confirmation                                        | **Signing unavailable** |

### RC record

| Field                                 | Value                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Intended baseline commit              | `0200cae`                                                                   |
| RC version                            | **NOT BUMPED** (still `3.0.5` in tree; tag `3.0.5` = `241d6ca` ≠ `0200cae`) |
| Artifact                              | **NONE** (no signed RC built this session)                                  |
| Signature status                      | **N/A — not signed**                                                        |
| Notarization status                   | **N/A — not notarized**                                                     |
| Local TRAINING pack (do not use live) | `release/mac-arm64/Nexora.app` — historically **Signature=adhoc**           |

### Phase 1 verdict

# RELEASE BLOCKED — HUMAN/RELEASE ACTION REQUIRED

**Owners:** CTO / Release Engineer

**Required before retry:**

1. Decide fate of branding dirty files (include in RC commit **or** discard).
2. Isolate intended RC commit from `0200cae` (+ optional branding).
3. Bump `package.json` version **past 3.0.5** (do not retag `3.0.5`).
4. Build + **sign + notarize** with Developer ID / CI secrets.
5. Record version, commit, artifact URL, `codesign` + `spctl` / stapler evidence on `pilot-signoff.md`.

**Not done this session (by policy):** version bump, unsigned “RC” build, fake signing, push.

---

## Phase 2 — Site Preparation

**Café access this session:** **NONE** (human confirmed). All items **PENDING**.

| Item                                    | Status      |
| --------------------------------------- | ----------- |
| Staff SSID exists                       | **PENDING** |
| POS on staff network                    | **PENDING** |
| Guest Wi‑Fi isolated                    | **PENDING** |
| :3001/:3002/:3003 not exposed to guests | **PENDING** |
| POS machine location known              | **PENDING** |
| Printer location known                  | **PENDING** |
| Cash drawer connected                   | **PENDING** |
| KDS device available                    | **PENDING** |
| Backup destination available            | **PENDING** |
| Master PIN escrow location prepared     | **PENDING** |

**Owner:** Café owner + on-site ops  
**Phase 2 verdict:** **BLOCKED** — HUMAN/SITE REQUIRED

---

## Phase 3 — Master PIN Escrow

| Check                                    | Status      |
| ---------------------------------------- | ----------- |
| Master PIN configured                    | **PENDING** |
| Sealed/paper escrow created              | **PENDING** |
| Authorized person identified             | **PENDING** |
| Emergency access understood              | **PENDING** |
| Escrow location documented (not the PIN) | **PENDING** |

**ESCROW = PENDING**

Never write the PIN in this file, git, chat, or screenshots.

**Owner:** Café owner  
**Phase 3 verdict:** **BLOCKED**

---

## Phase 4 — Backup

| Check                   | Status                                                        |
| ----------------------- | ------------------------------------------------------------- |
| Backup created          | **PENDING**                                                   |
| Filename recorded       | **PENDING**                                                   |
| Timestamp recorded      | **PENDING**                                                   |
| Destination verified    | **PENDING**                                                   |
| Independently locatable | **PENDING**                                                   |
| Backup policy approved  | **PENDING** (still POLICY VALUE PENDING APPROVAL in ops docs) |

**Owner:** Café owner (after signed RC install)  
**Phase 4 verdict:** **BLOCKED**

---

## Phase 5 — Printer Drill

| Step                        | Status      |
| --------------------------- | ----------- |
| Sale receipt                | **PENDING** |
| Refund receipt              | **PENDING** |
| Cash drawer kick            | **PENDING** |
| Formatting OK               | **PENDING** |
| Disconnect / retry behavior | **PENDING** |

**Printer = BLOCKED** — PHYSICAL TEST REQUIRED  
**Owner:** Pilot owner / café operator

---

## Phase 6 — KDS Drill

| Step                               | Status      |
| ---------------------------------- | ----------- |
| Order reaches KDS                  | **PENDING** |
| Station correct                    | **PENDING** |
| Kitchen workflow                   | **PENDING** |
| Bump                               | **PENDING** |
| POS state update                   | **PENDING** |
| LAN disconnect/reconnect (if safe) | **PENDING** |

**KDS = BLOCKED** — PHYSICAL / CAFÉ-LAN REQUIRED  
**Owner:** Pilot owner / kitchen lead

---

## Phase 7 — Financial Dry Run

TEST/DRY-RUN only — no real customer money. Requires signed RC on café (or spare) machine.

| Step                                     | Status                                   |
| ---------------------------------------- | ---------------------------------------- |
| Normal sale                              | **PENDING**                              |
| Partial payment                          | **PENDING**                              |
| Completed payment                        | **PENDING**                              |
| Unpaid cancellation                      | **PENDING**                              |
| Cancel after tender → expect **409** H1  | **PENDING**                              |
| Refund                                   | **PENDING**                              |
| Retail restock (N/A for Restaurant café) | **NOT APPLICABLE** (unless Retail pilot) |
| Shift open                               | **PENDING**                              |
| Cash reconciliation                      | **PENDING**                              |
| Day close                                | **PENDING**                              |
| Z-report                                 | **PENDING**                              |
| CSV export                               | **PENDING**                              |

**Financial Dry Run = BLOCKED** — HUMAN/MACHINE REQUIRED  
**Owner:** Manager + pilot owner

---

## Phase 8 — Recovery Drill

Requires **signed RC**. Use [`dr-drill-worksheet.md`](../13-operations/dr-drill-worksheet.md). Perform **identity check** before restore (no `installation_id` on backups).

**RESTORE DRILL = PENDING** (cannot run without signed RC + machine)

**Phase 8 verdict:** **BLOCKED**  
**Owner:** Café owner + ops

---

## Phase 9 — Staff Training

Use [`pilot-staff-training-checklist.md`](../13-operations/pilot-staff-training-checklist.md).

| Topic                                     | Status      |
| ----------------------------------------- | ----------- |
| SALE / HOLD / REFUND                      | **PENDING** |
| Paid order → refund, not cancel (H1)      | **PENDING** |
| SHIFT / DAY CLOSE                         | **PENDING** |
| Printer failure                           | **PENDING** |
| KDS                                       | **PENDING** |
| 86 / LOW STOCK                            | **PENDING** |
| RECOVERY                                  | **PENDING** |
| Chef cancel → manager PIN (H3)            | **PENDING** |
| Per-person demonstrated / passed / signed | **PENDING** |

**Staff Training = BLOCKED** — HUMAN/STAFF REQUIRED  
**Owner:** Owner / trainer

---

## Phase 10 — Incident Drill

Walk-through only (map to `incident-response.md` severities; labels below match the dry-run brief):

| Scenario (dry-run label)   | Map                                   | Status      |
| -------------------------- | ------------------------------------- | ----------- |
| S1 — Printer failure       | Ops S2-class workaround; money stands | **PENDING** |
| S2 — KDS failure           | Ops S2; KOT/manual                    | **PENDING** |
| S3 — Database/recovery     | Ops S1 STOP RULE / REC-01             | **PENDING** |
| S4 — Financial discrepancy | Ops S1; no improvised corrections     | **PENDING** |

Staff must know: **STOP → do not improvise money fixes → preserve evidence → contact owner → follow runbook**.

**Incident Drill = BLOCKED** — HUMAN/STAFF REQUIRED  
**Owner:** Owner / manager

---

# FIRST CAFÉ DRY RUN RESULT

## Release

**BLOCKED**

## Site

**BLOCKED**

## Master PIN

**BLOCKED**

## Backup

**BLOCKED**

## Printer

**BLOCKED**

## KDS

**BLOCKED**

## Financial Dry Run

**BLOCKED**

## Restore

**BLOCKED**

## Staff Training

**BLOCKED**

## Incident Drill

**BLOCKED**

---

# GO / NO-GO

## **NO-GO**

### Exact blockers and owners

| #   | Blocker                                                                               | Owner                                         |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | **RELEASE BLOCKED** — no signing credentials; no signed/notarized RC of `0200cae`     | CTO / Release Engineer                        |
| 2   | Working tree **not isolated** (branding + ops docs dirty); RC commit not prepared     | Release Engineer + human decision on branding |
| 3   | Version still **3.0.5** (tag collision with `241d6ca`) — bump required when RC is cut | Release Engineer                              |
| 4   | **No café/site access** this session — OPS-01 / hardware / escrow / drills unexecuted | Café owner + on-site ops                      |
| 5   | Master PIN **ESCROW = PENDING**                                                       | Café owner                                    |
| 6   | Backup / restore / printer / KDS / financial / training / incident — all **PENDING**  | Pilot owner + staff                           |

### What may proceed offline (human)

1. Obtain Apple Developer ID + notary (or populate CI secrets).
2. Isolate RC commit; bump version; sign+notarize; verify `codesign` / `spctl` / stapler.
3. Schedule on-site day; execute Phases 2–10 on this sheet.
4. Complete `pilot-signoff.md` only after PASS evidence.

### Explicitly not done

- No production feature code
- No Phase 4.16
- No ADR-014 / variants / table merge
- No push
- No fake signing or invented café PASS results

**STOP — wait for HUMAN GO/NO-GO after real Phase 1–10 execution.**

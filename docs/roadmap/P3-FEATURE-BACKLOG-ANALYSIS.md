# P3 — Feature Backlog Analysis & Prioritization

**Date:** 2026-08-21  
**Branch:** `restaurant-vertical`  
**Schema tip:** v86  
**Method:** Evidence-based analysis only — **no production feature code** in this phase.  
**Baseline commits:** P1.1 `8111878` · P2 `b16f579`

---

## 1. Executive Summary

There is **no 405-feature universe** in this repository. The authoritative product catalog is the capability matrix with **320** statused rows. Engineering waves **R0–R15 are COMPLETE**; **R16 is human-blocked** (signed RC / OPS-02). The executable product backlog is therefore:

| Bucket       | Count | Action                                                   |
| ------------ | ----: | -------------------------------------------------------- |
| 🟢 Existing  |   169 | Do not rebuild                                           |
| 🟡 Hardening |    16 | **Prefer next**                                          |
| 🔵 Planned   |    71 | Authorize slice; many are partially shipped (matrix lag) |
| ⚪ Later     |    53 | Do not start                                             |
| 🔴 Frozen    |    10 | Strategy freeze                                          |
| Out of scope |     1 | Payroll                                                  |

**Recommended next build:** ~~deepen the documented **KDS Hardening residual** — a durable kitchen ticket/status outbox + reconnect backoff~~ → **IMPLEMENTED 2026-08-21** (`KDS-H-OUTBOX`, schema v87). See `docs/qa/KDS-H-OUTBOX-IMPLEMENTATION-REPORT.md`.

**Why not greenfield Planned features first:** AGENTS.md / matrix law prefer Hardening; several high-value Planned rows (86, modifier groups, partial pay, cash drawer, item notes, table merge) are already partially or fully in code while still marked Planned.

---

## 2. Repository Baseline

| Program      | Commit    | Status                                           |
| ------------ | --------- | ------------------------------------------------ |
| P1.1 Test/CI | `8111878` | COMPLETE / GREEN (239 classified, merge 180/180) |
| P2 Security  | `b16f579` | COMPLETE scoped slice                            |
| R0–R15       | various   | Engineering COMPLETE                             |
| R16          | —         | **HUMAN BLOCKED** (credentials / site)           |
| Live go-live | —         | **NO-GO**                                        |

**Deferred security (must not be treated as done):** CSP `'unsafe-inline'` + JWT in `localStorage` (Phase C); Master PIN 4-digit + in-memory lockout; cleartext LAN JWT; pre-auth WS connect window.

**Active vertical:** Restaurant only.

---

## 3. Authoritative Feature Inventory

| Role                              | Path                                                          | Authority                                                  |
| --------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| **Product SoT (what to build)**   | `docs/00-product/capability-matrix.md`                        | Canonical; Existing / Hardening / Planned / Later / Frozen |
| **Code evidence**                 | `docs/00-product/feature-list.md`                             | What exists in the tree (stamp lag: claims v83)            |
| **Wave sequencing**               | `docs/00-product/restaurant-os-roadmap.md`                    | R0–R16 only (no R18)                                       |
| **Wave completion**               | `docs/05-production/roadmap-engineering-completion-r0-r16.md` | Eng snapshot                                               |
| **Operational queue**             | `.ai/tasks.md`                                                | Most recently edited execution backlog                     |
| **QA Existing+Hardening catalog** | `docs/qa/FEATURE-INVENTORY.md`                                | QA scope, not plan SoT                                     |
| **Strategy freezes**              | `STRATEGY.md`                                                 | KPI + Frozen list                                          |

**Not authoritative for product backlog:** `docs/15-project-management/master-implementation-plan.md` (superseded), `docs/audit/REFACTORING-ROADMAP.md` (engineering), historical `audit/` PM inventories.

**Universe correction:** Matrix feature tables = **320** rows. No document claims “405 features.” Closest related number is **239** automated test files (P1), not product features.

---

## 4. Feature Inventory Reconciliation

### Matrix lag (Planned / NOT BUILT in docs, present in code)

| Matrix / feature-list claim                             | Code evidence                                                               | Reconciled status                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Item availability / 86 — Planned                        | `POST /api/products/:id/availability`, `eighty-six.ts`, `phase-4.7-menu-86` | **PARTIAL / nearly Existing** — deepen (auto-86 still missing) |
| Sold-out / 86 control — Planned                         | Same as above                                                               | **PARTIAL**                                                    |
| Void item — Planned                                     | Item cancel/restore + H1/R1                                                 | **Existing depth** — matrix stale                              |
| Modifier groups — Planned                               | Addon groups + Zod                                                          | **PARTIAL / largely Existing**                                 |
| Partial payment — Planned                               | `payment_status=partial`, tender path                                       | **Existing depth** — matrix stale                              |
| Item notes — Planned                                    | `special_instructions` POS/KDS/print                                        | **Existing depth** — matrix stale                              |
| Item images — Planned                                   | Product image API + tests                                                   | **PARTIAL / largely Existing**                                 |
| Cash drawer — Planned                                   | `POST /api/printers/kick-drawer`                                            | **PARTIAL** — kick exists; auto-on-pay thin                    |
| Table merge — feature-list NOT BUILT                    | R2 `/:id/merge` + suite                                                     | **BUILT** (unpaid); feature-list wrong                         |
| Product stock / recipes — feature-list PARTIAL “no BOM” | R5 BOM v79 COMPLETE                                                         | **feature-list stale**                                         |
| Coupons — Existing                                      | R11 v85                                                                     | Aligns                                                         |

### Hardening residuals (true pending deepen)

| Matrix Hardening row                     | Shipped depth                           | Remaining gap (evidence)                                                                         |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Offline KDS / KDS recovery / KDS offline | H2 advertise, stale UX, in-memory retry | **Durable outbox**; persist bump queue across reload; exponential backoff (`h2-*.md`, `r3-*.md`) |
| Void / Discounts / Receipt               | H1 + R1                                 | Mandatory idempotency productization; digital delivery still Planned                             |
| Permissions / Authorization / RBAC       | H3 `requireRole`                        | Fine-grained RBAC table not present; sensitive-action Planned                                    |
| Restore / conflict / data integrity      | H4 + R14                                | Live DR drill not claimed; REAL→cents cutover STOPPED                                            |
| Audit logging                            | M3 + R9.2                               | Depth OK for v1; not the next gap                                                                |
| Error / restart recovery                 | Process-kill harness, recovery modes    | Device-failure Planned                                                                           |

### Explicitly Frozen / Later (do not schedule as next)

Card terminals, payment gateways, online payment, multi-location family, aggregators, AI, payroll, Advanced BI warehouse, marketing campaigns.

---

## 5. Pending Feature Backlog

Normalized candidates (viable for engineering authorization). Status = reconciled against code.

| Feature ID   | Name                                       | Phase                  | Current        | BE             | FE       | DB                | API      | RBAC                   | Offline  | Tests          | Deps                       | Complexity | Business | Tech risk    |
| ------------ | ------------------------------------------ | ---------------------- | -------------- | -------------- | -------- | ----------------- | -------- | ---------------------- | -------- | -------------- | -------------------------- | ---------- | -------- | ------------ |
| KDS-H-OUTBOX | Durable KDS ticket/status outbox + backoff | Hardening / post-H2/R3 | Partial        | Partial        | Partial  | Missing outbox    | Partial  | Existing kitchen roles | Required | Partial        | print_jobs pattern, kds WS | M          | High     | Med          |
| INV-AUTO-86  | Auto-86 from stock                         | Planned deepen         | Missing logic  | Partial        | Partial  | Existing stock/86 | Partial  | Owner/Mgr              | Local OK | Missing        | R4+R5+86                   | M          | High     | Med          |
| RPT-PAY      | Payment report deepen                      | Planned / post-R12     | Thin           | Partial        | Thin     | Existing bills    | Thin     | Owner/Mgr              | Local OK | Thin           | reports.ts                 | L          | High     | Low          |
| RPT-DISC     | Discount report                            | Planned                | Missing        | Missing        | Missing  | audit/bills       | Missing  | Owner/Mgr              | Local OK | Missing        | R12 pattern                | L          | Med-High | Low          |
| RPT-STAFF    | Staff performance report                   | Planned                | Missing        | Missing        | Missing  | shifts/orders     | Missing  | Owner/Mgr              | Local OK | Missing        | R8+R12                     | M          | Med      | Low          |
| FLOOR-PLAN   | Visual floor plan                          | Planned                | Missing canvas | Partial tables | Partial  | tables v76        | Existing | Roles                  | Local OK | Partial R2     | R2                         | H          | Med      | Med          |
| KDS-SOUND    | Sound / visual alerts                      | Planned                | Missing        | n/a            | Missing  | n/a               | n/a      | Chef+                  | Local    | Missing        | KDS board                  | L          | Med      | Low          |
| KDS-EXP      | Expediter / recall                         | Planned                | Missing        | Missing        | Missing  | Missing           | Missing  | Kitchen                | Local    | Missing        | R3                         | H          | Med      | Med          |
| INV-XFER     | Stock transfer                             | Planned                | Missing        | Missing        | Missing  | Missing           | Missing  | Owner/Mgr              | Local    | Missing        | R4                         | M          | Med      | Med          |
| INV-EXPIRY   | Expiry tracking                            | Planned                | Missing        | Missing        | Missing  | Missing           | Missing  | Owner/Mgr              | Local    | Missing        | R4                         | M          | Med      | Med          |
| RCPT-DIG     | Digital receipt delivery                   | Planned                | Preview only   | Partial        | Partial  | print path        | Partial  | Cashier+               | Optional | Thin R1        | WhatsApp?/email            | H          | Med-High | Med          |
| SEC-SENS     | Sensitive-action controls                  | Planned                | Partial PIN    | Partial        | Partial  | Master PIN        | Partial  | Owner                  | Local    | Partial        | H3                         | M          | Med      | Low          |
| SEC-CSP      | CSP Phase C + token storage                | Sec residual           | Deferred       | n/a            | Required | n/a               | n/a      | All                    | Local    | Partial        | P2 residuals               | H          | Med      | High         |
| FIN-CENTS    | REAL→cents cutover                         | Data integrity         | Dual-write     | Partial        | Partial  | REAL remain       | Dual     | All money              | Local    | Strong harness | Migration auth             | VH         | High     | **Critical** |
| SVC-CHG      | Service charge                             | Planned                | Stub           | Stub           | Missing  | Tax kind only     | Stub     | —                      | —        | —              | **ADR-014**                | H          | Med      | **Blocked**  |
| ATTEND       | Attendance / clock-in                      | Planned                | Missing        | Missing        | Missing  | Missing           | Missing  | Staff                  | Local    | Missing        | R8                         | M          | Med      | Med          |
| GIFT         | Gift cards                                 | Planned                | Missing        | Missing        | Missing  | Missing           | Missing  | —                      | Local    | Missing        | Loyalty                    | H          | High     | Med          |
| COMBO        | Combos / meal deals                        | Planned                | Missing        | Missing        | Missing  | Missing           | Missing  | —                      | Local    | Missing        | Menu                       | H          | Med      | Med          |
| PRT-HEALTH   | Printer health / recovery                  | Planned                | Thin           | Partial        | Thin     | print_jobs        | Partial  | Owner                  | Local    | R13            | R13                        | M          | Med      | Low          |
| OBS-LOG      | Structured logging adoption                | Planned                | Logger exists  | Partial        | n/a      | n/a               | n/a      | —                      | —        | Thin           | P2 defer                   | M          | Low-Med  | Low          |

---

## 6. Dependency Graph

```text
[Hardening] KDS-H-OUTBOX
    ← depends on: SQLite SoR, kitchen-status CAS, WS notify, H2 retry UX
    ← pattern: R13 print_jobs outbox
    → unlocks: reliable multi-device kitchen; safer Sound/Expediter; pilot confidence

[Planned] INV-AUTO-86
    ← depends on: stock ledger (R4), recipes optional (R5), manual 86 API (4.7)
    → unlocks: less manual 86; food-cost accuracy signals

[Planned] RPT-* reports
    ← depends on: bills/payments/audit (Existing), R12 void pattern
    → unlocks: owner trust / accountant workflows

[Blocked] FIN-CENTS
    ← depends on: dual-write complete (done), upgrade-path tests, product authorization
    → unlocks: FK/CHECK money integrity (P6-class)

[Blocked] SVC-CHG
    ← depends on: ADR-014 Accepted

[Human] R16
    ← depends on: Apple/Windows signing credentials, OPS-02 site drills
    → unlocks: live go-live (not a product feature slice)
```

**Blocking / high-leverage:** KDS-H-OUTBOX (ops reliability), FIN-CENTS (architecture — but migration-gated), INV-AUTO-86 (ops).

**Leaf features:** KDS-SOUND, RPT-DISC (thin deepen), SEC-SENS polish.

**Architectural:** FIN-CENTS, CSP Phase C, gift cards schema.

---

## 7. Scoring Methodology

Each candidate scored **1–10**:

**Value (+):** Business Value, Customer Frequency, Revenue Impact, Operational Impact, Competitive Importance, Strategic Leverage, Retention Impact

**Cost (−):** Implementation Complexity, Architectural Risk, Dependency Risk, QA Complexity, Migration Risk

```text
raw = Σ(value) − Σ(cost)
# theoretical range: [-43, 65]
normalized_0_100 = round(100 × (raw + 43) / 108)
```

**Governance override (documented, not silent score hacking):** when raw scores are within ~5 points, prefer 🟡 Hardening over 🔵 Planned; reject Frozen/Later/ADR-blocked/unsigned-RC work as “next feature to build.”

---

## 8. Top 20 Features

| Rank | Feature                                    | Phase          |  Score | Complexity | Dependencies              | Why Now?                                                |
| ---: | ------------------------------------------ | -------------- | -----: | ---------: | ------------------------- | ------------------------------------------------------- |
|    1 | Durable KDS ticket/status outbox + backoff | Hardening      | **74** |          M | H2/R3, print_jobs pattern | Closes documented kitchen Hardening residual; pilot KPI |
|    2 | Auto-86 from stock                         | Planned deepen | **70** |          M | R4, 86 API                | High ops value; matrix lag means deepen not rebuild     |
|    3 | Payment report deepen                      | Planned / R12  | **70** |          L | bills, reports            | Owner daily need; low risk                              |
|    4 | Discount report                            | Planned / R12  | **68** |          L | audit/discounts           | Complements R12 void report                             |
|    5 | Sound / visual KDS alerts                  | Planned        | **65** |          L | KDS board                 | Fast UX win after outbox                                |
|    6 | Sensitive-action controls deepen           | Planned        | **63** |          M | H3, Master PIN            | Security posture without Phase C                        |
|    7 | Staff performance report                   | Planned        | **62** |          M | R8, orders                | Manager retention                                       |
|    8 | Printer health / recovery UX               | Planned        | **61** |          M | R13 print_jobs            | Deepen shipped queue                                    |
|    9 | Digital receipt delivery                   | Planned        | **60** |          H | print preview, channel    | Competitive; channel choice needed                      |
|   10 | Stock transfer                             | Planned        | **56** |          M | R4                        | Multi-storage cafés                                     |
|   11 | Visual floor plan                          | Planned        | **56** |          H | R2 tables                 | UX polish; not blocking ops                             |
|   12 | Expiry tracking                            | Planned        | **55** |          M | R4                        | Food safety niche                                       |
|   13 | Gift cards                                 | Planned        | **57** |          H | loyalty                   | Revenue; larger schema                                  |
|   14 | Combos / meal deals                        | Planned        | **54** |          H | menu/pricing              | Competitive; complex pricing                            |
|   15 | Expediter / recall                         | Planned        | **54** |          H | R3, ideally outbox        | After KDS reliability                                   |
|   16 | Attendance                                 | Planned        | **53** |          M | R8                        | Workforce depth                                         |
|   17 | CSP Phase C + token storage                | Sec residual   | **49** |          H | frontend auth             | Real P2 residual; large FE change                       |
|   18 | Structured logging adoption                | Planned        | **48** |          M | logger exists             | Platform hygiene                                        |
|   19 | REAL→cents cutover                         | Hardening/eng  | **46** |         VH | migration auth            | **Needs product decision**                              |
|   20 | Service charge                             | Planned        | **40** |          H | ADR-014                   | **BLOCKED** until ADR Accepted                          |

---

## 9. Recommended Next Feature

# NEXT FEATURE TO BUILD

**Durable KDS ticket / status outbox + exponential reconnect backoff**  
**Feature ID:** `KDS-H-OUTBOX`  
**Matrix rows:** Offline KDS · KDS recovery · KDS offline behavior (🟡 Hardening)  
**Wave ancestry:** Post-H2 / post-R3 residual (not a new R-wave invention)  
**Priority Score:** **74 / 100**

---

## 10. Why This Feature

### Why this feature?

1. Explicitly listed as remaining Hardening gap in `docs/05-production/h2-kds-offline-recovery.md` and `r3-kitchen-os.md`.
2. Matches product law: **prefer Hardening over Planned**.
3. Directly supports north-star KPI (kitchen reliability during LAN blips).
4. Implementation pattern already proven in R13 `print_jobs`.
5. Does not require signing credentials, ADR acceptance, or destructive money migration.

### Why now?

P1 made tests trustworthy; P2 hardened HTTP/WS edges. Kitchen reliability is the next ops risk for multi-device café pilots before inventing new Planned surfaces.

### Why not #2 (Auto-86)?

Nearly equal score (**70**) and high value, but it is **Planned deepen**, while KDS outbox is **Hardening residual**. Auto-86 should be the immediate follow-on after outbox (or parallel only if staffing allows — default is sequential).

### What does it unlock?

More reliable multi-tablet/KDS fleets; safer addition of sound/expediter; clearer path to promote Offline-KDS Hardening → Existing.

### Dependencies

- Existing: `kitchen-status` CAS, `notifyKdsUpdate`, H2 in-memory retry, SQLite SoR
- Pattern reference: `print_jobs` / `print-queue.ts`
- Must **not** create a second SoR (R3 constraint)

### Expected implementation scope

- Schema: `kds_jobs` or `kds_status_outbox` (pending/failed/done, attempts, payload, item/order refs)
- Service: enqueue on failed companion delivery / offline; drain with backoff
- Frontend: persist pending bumps across reload (today in-memory only)
- Tests: unit + electron KDS suites; no weakening of H2/R3

### What could go wrong?

- Accidental second SoR / duplicate bumps
- Outbox growth without prune
- Interaction with WS auth/revoke from P2
- Over-scoping into expediter/analytics

### Estimated engineering complexity

**Medium** (≈ 3–6 focused engineering days with tests), not a platform rewrite.

---

## 11. Acceptance Criteria

### Functional

- Happy path: chef bump while companion briefly unreachable → action eventually applied once; no duplicate status transition.
- Empty state: outbox empty → no UI noise.
- Edit/retry: Owner/Manager can list failed jobs and retry (parity with print queue).
- Validation: reject malformed payloads; respect CAS `expected_status` / 409.
- Errors: auth failure clears queue entry with reason; network errors re-queue with backoff.
- Success: board and SoR agree after drain.

### Backend

- Migration adding outbox table + indexes (`status, next_attempt_at`).
- Service enqueue/drain; max attempts; idempotent apply via kitchen-status.
- API list/retry Owner/Manager; chef does not need admin UI for happy path.
- Zod validation on retry bodies.
- Audit: `kds.outbox_enqueued` / `kds.outbox_applied` / `kds.outbox_failed` (or equivalent).

### Frontend

- Persist pending status retries across tab reload (local durable store or server outbox as SoR of intent).
- Exponential reconnect backoff beyond fixed 3s (cap + jitter).
- Stale-board UX retained from H2.
- Loading/error toasts without blocking POS.

### Database

- Versioned migration only; FK to orders/items where safe; no destructive drops.
- Indexes for drain query.
- Upgrade-path test fresh + migrate.

### Security

- JWT + kitchen role for apply path; Owner/Manager for admin retry.
- No unauthenticated outbox mutation.
- Fail closed if KDS module disabled.
- Do not log tokens.

### Offline

- **Must work offline locally:** intent survives companion/WS drop while main SQLite is up.
- Sync: drain when companion/WS healthy.
- Conflict: CAS wins; 409 drops/supersedes stale intent.
- Recovery: process restart must not lose durable outbox rows (DB-backed).

### Testing

- Unit: enqueue, backoff, max attempts, idempotent apply.
- Integration/electron: kill companion mid-bump; assert eventual consistency.
- API: RBAC on list/retry.
- Regression: `test:h2`, `test:r3`, KDS websocket revalidation, P1 merge tier.
- No weakened assertions.

---

## 12. UX Requirements

- KDS board: silent recovery preferred; optional subtle “syncing N kitchen updates” indicator.
- Settings or Printers-adjacent Owner page: failed kitchen jobs list + Retry (mirror print queue).
- No redesign of floor/POS.
- Tablet-first KDS; large bump targets unchanged.
- Confirm dialog only on discard of failed job (if allowed).
- Keyboard: not primary for KDS bumps.

---

## 13. Technical Requirements

- Follow `print_jobs` outbox shape; reuse drain/retry idioms from `main/services/print-queue.ts`.
- Keep SQLite as SoR for order item status; outbox is **delivery/intent**, not a parallel kitchen DB.
- Wire drain from existing notify / reconnect paths in `main/services/kds.ts` + frontend reconnect.
- Observability: structured logs via existing logger (no new console spam).
- Schema tip bump required (v87 candidate) — document in migration + feature-list when implementing.

---

## 14. Security Requirements

- Reuse P2 JWT HS256 verify paths.
- RBAC: kitchen roles apply; Owner/Manager admin.
- Rate-limit admin retry endpoints.
- Do not expose stack traces / SQL in client errors.
- Module gate: `kds` disabled → no outbox processing.

---

## 15. Offline Requirements

| Scenario                 | Expected                                                 |
| ------------------------ | -------------------------------------------------------- |
| Companion down, main up  | Enqueue; drain on recovery                               |
| WS drop, REST poll alive | Prefer existing REST path; outbox for failed mutates     |
| Full app restart         | DB outbox survives; in-memory-only queue is insufficient |
| Conflicting bump         | CAS / 409; no silent overwrite                           |

---

## 16. Testing Requirements

| Layer               | Requirement                   |
| ------------------- | ----------------------------- |
| Unit                | Outbox state machine          |
| Electron            | Companion stop/start mid-bump |
| API                 | Authz matrix                  |
| GUI (optional thin) | Retry list smoke              |
| Regression          | H2, R3, KDS WS, merge tier    |

New suite suggestion: `tests/kds-durable-outbox.test.ts` gated in merge or critical.

---

## 17. Dependencies

| Dependency                | Status                          |
| ------------------------- | ------------------------------- |
| H2 offline UX             | COMPLETE                        |
| R3 kitchen-status CAS     | COMPLETE                        |
| R13 print_jobs pattern    | COMPLETE (reference)            |
| P2 WS Origin / maxPayload | COMPLETE                        |
| Signing credentials       | **Not required** for this slice |
| ADR-014                   | Not required                    |

---

## 18. Risks

| Risk                                           | Severity       | Mitigation                            |
| ---------------------------------------------- | -------------- | ------------------------------------- |
| Duplicate kitchen bumps                        | High           | Idempotent apply + CAS                |
| Outbox table growth                            | Med            | Retention / done prune                |
| Scope creep into expediter                     | Med            | Strict acceptance criteria            |
| Matrix still shows Planned for shipped 86/etc. | Med            | Doc reconciliation in P4 kickoff      |
| Live pilot still NO-GO without R16             | High (program) | Parallel human track — not this slice |

---

## 19. Deferred / Blocked Features

| Item                             | Why deferred / blocked                                  |
| -------------------------------- | ------------------------------------------------------- |
| R16 signed RC / OPS-02           | Human / credentials — not an engineering feature slice  |
| REAL→cents authoritative cutover | Migration risk; needs explicit authorization (P6-class) |
| Service charge                   | ADR-014 Proposed                                        |
| CSP Phase C                      | Large FE migration; P2 residual                         |
| Master PIN length/persist        | Install compatibility                                   |
| Gift cards / combos / attendance | Planned greenfield after Hardening                      |
| Expediter / floor plan           | After kitchen reliability                               |
| Frozen rows                      | STRATEGY freeze                                         |
| Later rows                       | Matrix closed                                           |
| Phase 4.16                       | Forbidden — use R-waves / matrix only                   |

---

## 20. Recommended Development Sequence

1. **P4 — Implement `KDS-H-OUTBOX`** (this report’s acceptance criteria).
2. Promote/reconcile matrix rows for shipped Planned lag (86, notes, partial pay, merge, modifier groups) in a docs slice.
3. **Auto-86 from stock** OR **Payment/Discount reports** (pick by café pilot feedback).
4. KDS sound alerts (leaf UX).
5. Sensitive-action deepen.
6. Only with explicit auth: REAL→cents cutover.
7. Parallel human track: R16 signing + OPS-02 (does not block P4 coding).

---

## Quality checks (self-audit)

- [x] Feature count = **320** matrix rows (not 405).
- [x] Waves = **R0–R16** only.
- [x] Selected feature exists as Hardening residual in H2/R3 docs.
- [x] Selected feature is genuinely pending (no `kds_outbox` table today; `print_jobs` is bill print only).
- [x] Dependencies verified against `print-queue`, `kitchen-status`, H2/R3 docs.
- [x] Scores computed with published formula.
- [x] Duplicates / matrix lag called out.
- [x] No production code changed in P3.

# Phase 3.5 — Scope Discovery (STOP BEFORE IMPLEMENTATION)

**Date:** 2026-08-14  
**Branch:** `modular-verticles`  
**HEAD:** `3c70376`  
**Decision required:** Which optional 3.5 workstream to implement (if any)

**Status:** Discovery only — **no Phase 3.5 code written.**

---

## Task 0 — Baseline

| Item        | Value                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Branch      | `modular-verticles`                                                                                               |
| HEAD        | `3c70376` (P1.6 handoff docs)                                                                                     |
| Phase 3.4   | `053421e` (ancestor of HEAD)                                                                                      |
| Uncommitted | Branding/docs drift, Phase 3.3 retail frontend/modules, `audit/`, POS UI — **must not be mixed into 3.5 commits** |

---

## Phase 3.5 authoritative scope (as documented)

```text
Phase: 3.5 — Platform depth (optional / later)
Owner: Architecture gate (not product launch)
Objective (closeout): Inventory ledger UI; legacy tax column cleanup;
  further service extracts; package extraction only if extraction
  readiness + product need demand it.
Acceptance criteria: NONE written as a single DoD (menu of options only)
Required deliverables: NONE selected / prioritized
Explicitly excluded (closeout §3.5): Microservices, Nest, Prisma, Redis,
  K8s, Kafka, Temporal, plugin frameworks without evidence
Dependencies: Stable 3.1–3.4 + pilot evidence
Blocking prerequisites: 3.1–3.4 COMPLETE; pilot evidence STILL PENDING
  (P1.6 human gates); leadership has waived “wait for pilots” for this
  kickoff, but has not selected which 3.5 item to ship
```

### Authoritative sources (ranked)

| Rank  | Source                                                                                                           | What it says about 3.5                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | [`docs/03-architecture/phase-2-closeout-and-phase-3-gate.md`](phase-2-closeout-and-phase-3-gate.md) §6 Phase 3.5 | **Canonical Phase 3 plan.** Objective = Inventory ledger UI; legacy tax cleanup; further extracts; conditional package extraction. Depends on 3.1–3.4 + **pilot evidence**. |
| **2** | [`.ai/tasks.md`](../../.ai/tasks.md)                                                                             | Backlog: “Inventory ledger UI, legacy tax columns, packages/extraction, **recipes/BOM, suppliers/PO** (after 3.1–3.4 + pilots)” — **expands** closeout.                     |
| **3** | Closeout §3 debt table                                                                                           | Recipes/BOM, suppliers/PO classified **Future** (after ledger + pilots) — **conflicts** with tasks.md lumping them into 3.5.                                                |
| **4** | `feature-list.md` / problem-statement                                                                            | Recipes/suppliers tagged “Phase 3.5” / FROZEN — informal product language, not a gate.                                                                                      |
| **5** | Audit (`audit/*`)                                                                                                | Recommends **freeze** Phase 3.5+ until café proof — process advice, not a 3.5 spec.                                                                                         |
| **6** | `STRATEGY.md`                                                                                                    | **No** Phase 3.5 definition.                                                                                                                                                |
| —     | `docs/03-architecture/phase-3.5-*.md`                                                                            | **Does not exist.**                                                                                                                                                         |

Same pattern as 3.1–3.4: closeout gate defines the phase; a dedicated `phase-3.X-*.md` is written when that phase is selected and designed. **3.5 has not been selected.**

---

## Scope confidence

```text
AMBIGUOUS — HUMAN DECISION REQUIRED
```

### Why ambiguous (not clear)

1. **No single deliverable** — closeout lists multiple optional workstreams without priority or acceptance tests.
2. **Doc conflict** — closeout puts recipes/BOM + suppliers/PO in **Future**; `.ai/tasks.md` and feature-list fold them into **Phase 3.5**.
3. **Prerequisite conflict** — closeout requires **pilot evidence**; P1.6 human gates are still PENDING (signed artifact, escrow, OPS-01, backup policy, signatures). Leadership may waive waiting, but must still pick **one** controlled increment.
4. **No design doc** — unlike 3.1–3.4, there is no `phase-3.5-*.md` with files, APIs, tests, or non-goals for a chosen slice.

Per agent rules: **do not invent Phase 3.5; STOP before coding.**

---

## Task 2 — Audit vs Phase 3.5 candidates

| Candidate                              | Audit status                      | Phase 3.5 status (closeout)                         | Action                            |
| -------------------------------------- | --------------------------------- | --------------------------------------------------- | --------------------------------- |
| Inventory ledger UI                    | Useful later / not pilot-critical | **IN PHASE 3.5** (primary optional product)         | Candidate A                       |
| Legacy tax column cleanup              | Debt                              | **IN PHASE 3.5**                                    | Candidate B                       |
| Further service extracts               | Arch depth                        | **IN PHASE 3.5** (conditional)                      | Candidate C                       |
| Package extraction                     | Explicitly later                  | **IN PHASE 3.5 only if readiness + product demand** | Candidate D — likely **NOT** now  |
| Recipes / BOM                          | Missing / Phase 3.5 in PM audit   | Closeout: **FUTURE** / tasks.md: 3.5                | **UNCLEAR** — need human pick     |
| Suppliers / PO                         | Missing / Phase 3.5 in PM audit   | Closeout: **FUTURE** / tasks.md: 3.5                | **UNCLEAR** — need human pick     |
| Additional verticals (Grocery/…)       | Freeze                            | Closeout dependency order: after 3.5 optional       | **NOT PHASE 3.5** (or later 3.5+) |
| Multi-location / SaaS / AI / terminals | Frozen                            | Frozen P3                                           | **NOT PHASE 3.5**                 |
| Retail UX depth                        | Partial composition exists        | Not in 3.5 objective                                | **FUTURE ROADMAP** / 3.3 residual |
| Cash drawer / accounting export        | Roadmap                           | Not in 3.5                                          | **FUTURE ROADMAP**                |
| P1.6 signed artifact / OPS-01 / escrow | Pilot blockers                    | Not engineering 3.5                                 | **PILOT-DRIVEN**                  |
| Phase 3.4 residuals                    | Done                              | Complete                                            | Do not reopen                     |

---

## Recommended controlled picks (for human approval)

If leadership insists on starting 3.5 **now** without pilot evidence, pick **exactly one**:

| Option                                                                  | Why                                                                              | Schema?                                                              | Vertical                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| **A. Inventory ledger UI** (consume `GET /api/inventory/movements`)     | Matches closeout objective #1; API already exists (2.12); smallest product depth | Likely **No schema change**                                          | Shared (Restaurant + Retail)                     |
| **B. Legacy tax column cleanup**                                        | Matches closeout objective #2; higher risk to money path                         | Likely **schema or careful dual-read** — needs ADR if touching money | Shared                                           |
| **C. Narrow service extract** (e.g. one documented Order/Payment slice) | Matches “further extracts”                                                       | No schema if pure move                                               | Shared                                           |
| **D. Package extraction**                                               | Closeout: only if readiness + demand                                             | Large                                                                | **Defer**                                        |
| **E. Recipes/BOM or Suppliers/PO**                                      | **Not** in closeout 3.5 objective (Future)                                       | Schema yes                                                           | Prefer **reject** until after ledger UI + pilots |

**Recommendation:** **A — Inventory ledger UI** as the only controlled 3.5 increment, with explicit non-goals (no recipes/PO, no packages, no schema unless proven necessary).

---

## Explicit stop

```text
PHASE 3.5 IMPLEMENTATION NOT STARTED
Reason: AMBIGUOUS — HUMAN DECISION REQUIRED
```

Awaiting leadership choice of Option A/B/C/D/E (or “do not start 3.5; resume pilot human gates”).

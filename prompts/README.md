# Operavia prompt pipeline

This folder is the durable **development execution pipeline** for Operavia (repo: FloCafe).

It does **not** implement product features. It plans, authorizes, verifies, and sequences sub-phases after **Phase 4.5** (Retail exchange, commit `a42493a`).

Production code lives in `main/` and `frontend/`. Phase history lives in `docs/04-product/` and `docs/03-architecture/`. This folder tells an agent **what to do next** and **when the next phase may start**.

---

## 1. What this folder is

| Path         | Role                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `README.md`  | How the pipeline works (this file)                                    |
| `ROADMAP.md` | The next **10** phases, why they were selected, and what was rejected |
| `STATE.md`   | Machine-readable current status, git safety, blockers                 |
| `ACTIVE.md`  | **Only** the currently authorized phase — do not start any other      |
| `phases/`    | Canonical prompt for each phase (4.6–4.15)                            |
| `pending/`   | Index of phases waiting behind ACTIVE                                 |
| `completed/` | Prompts moved here after genuine completion                           |
| `blocked/`   | Failure / ADR / defer records that **stop** auto-advance              |

---

## 2. How phases are selected

Selection is evidence-based, not a competitor wishlist.

Before proposing or reordering a phase, inspect:

1. Repository implementation (`main/`, `frontend/`, `tests/`)
2. Architecture docs (`docs/03-architecture/`)
3. ADRs (`docs/14-decisions/`)
4. `docs/00-product/capability-matrix.md` (product plan) and `docs/00-product/feature-list.md` (code evidence)
5. `.ai/context.md`, `.ai/tasks.md`, `.ai/decisions.md`, `.ai/patterns.md`, `.ai/risks.md`
6. Recent git history
7. Latest phase docs (`docs/04-product/phase-4.*`)
8. `STRATEGY.md` freeze list

**Priority:** high product value · low architectural risk · reuse existing APIs · vertical completeness · minimal schema · minimal money-path · testability · Lego composition.

**Prefer SAFE NOW slices over large rewrites.**

**Do not reopen frozen strategy** (aggregators, payment terminals, multi-location, AI, microservices, Nest/Prisma, package extraction, REAL→cents, Phase 3.5B tax cleanup, Phase 3.5C extraction, P1.6 human gates) unless the repository shows an explicit reopen.

---

## 3. How `ACTIVE.md` works

`ACTIVE.md` contains **only** the authorized phase.

Agents must:

- Read `ACTIVE.md` first.
- Execute **that** prompt only.
- Refuse to start 4.7 while 4.6 is ACTIVE (and so on).

When a phase is genuinely complete (see §5), replace `ACTIVE.md` with the next phase. Never list two phases as ACTIVE.

---

## 4. How `STATE.md` works

`STATE.md` is the orchestrator scoreboard:

- `CURRENT_PHASE` / `STATUS` / `CURRENT_PROMPT`
- `LAST_COMPLETED` / `LAST_COMMIT`
- `NEXT_PHASE`
- completed / blocked lists
- unrelated working-tree files that **must not** be committed
- ADR requirements and blockers

Update `STATE.md` on every status transition. Do not invent a passing verification.

---

## 5. How completion automatically activates the next phase

A phase is **not** complete because implementation “looks done.”

Verify **all** of:

1. Focused phase tests pass
2. Relevant regression tests pass
3. Restaurant isolation passes (when applicable)
4. Retail isolation passes (when applicable)
5. `npm run lint`
6. `npm run build`
7. `npm run build:frontend`
8. Documentation updated (phase doc, feature-list if behavior shipped, `.ai/*`)
9. `git status` — only phase files dirty
10. Phase-specific commit exists (`git log -1`)
11. No unresolved blocker

Then:

1. Set the phase prompt Status to `COMPLETE` (or move `phases/phase-X.md` → `completed/`).
2. Update `STATE.md`: `LAST_COMPLETED`, `LAST_COMMIT`, `CURRENT_PHASE` = next.
3. Replace `ACTIVE.md` with the next phase.
4. Set next phase Status to `ACTIVE`.

If the current phase is `ADR_REQUIRED`, `BLOCKED`, or `DEFERRED` — **STOP**. Do not auto-activate the next phase.

---

## 6. How blocked phases work

On failure:

1. Do **not** start the next phase.
2. Write `blocked/phase-X.md` with failure, failing tests, suspected cause, attempted fixes, remaining work.
3. Set `STATUS=BLOCKED` in `STATE.md` and the phase prompt.
4. Stop.

---

## 7. How ADR gates work

If the phase needs a product or architecture decision (schema, money path, inventory identity, FIN-01):

1. Set `STATUS=ADR_REQUIRED`.
2. Produce discovery/ADR **only** (no production implementation).
3. Stop auto-advance until a human Accepts the ADR **or** the phase’s completion criteria explicitly define an ADR-only deliverable.

Never implement schema or money-path changes to “get past” an ADR gate.

Allowed states:

```text
DISCOVERY → READY → ACTIVE → VERIFYING → COMPLETE → NEXT ACTIVE
```

Terminal stops: `ADR_REQUIRED` · `BLOCKED` · `DEFERRED`

---

## 8. How subagents are used

```text
                 ORCHESTRATOR
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   Backend         Frontend        Tests
    Agent           Agent          Agent
       │              │              │
       └──────────────┼──────────────┘
                      │
                 REVIEW AGENT
                      │
                 FINAL GATE
```

- Parallelize independent discovery/review.
- Do not parallelize edits to the same files.
- Do not let two agents modify schema at once.
- Subagents must not redefine architecture.
- Review inspects the **actual diff**.
- Orchestrator owns completion.

If subagents are unavailable, run sequentially. Never fabricate subagent results.

---

## 9. How to manually override the roadmap

1. Edit `ROADMAP.md` with evidence (paths, ADRs, why the swap is safer).
2. Update `STATE.md` `NEXT_PHASE` / completed list if needed.
3. Point `ACTIVE.md` at the authorized prompt.
4. Record the override in `.ai/decisions.md`.

Do not silently skip a `BLOCKED` or `ADR_REQUIRED` phase. Override in the open.

---

## 10. How to stop the automation

Any of:

- Set `STATUS=DEFERRED` or `BLOCKED` in `STATE.md`
- Write `blocked/STOP.md` with the reason
- Replace `ACTIVE.md` with a stop notice (no phase number)
- Human message: “do not activate the next phase”

The orchestrator must halt. Do not interpret silence as approval to continue.

---

## Git safety

Before each phase: `git status`. Record unrelated dirty files in `STATE.md`.

**Never commit** with a phase:

- Branding / Operavia rename leftovers
- Unrelated Retail working-tree changes
- `audit/`
- Generated files
- Unrelated refactors
- `.env` / credentials

Commit **only** the phase.

---

## Production code

Creating or updating this folder does **not** authorize Phase 4.6–4.15 implementation.

Schema remains **v75** until a later accepted ADR + migration phase (none of the 10 phases may silently bump it).

## Autonomous Phase Advancement

The prompt pipeline is designed to execute the entire active roadmap continuously.

After a phase completes successfully:

1. Verify all acceptance criteria.
2. Run required tests.
3. Run full regression suite.
4. Run lint and builds.
5. Run isolation checks for Restaurant and Retail.
6. Run subagent review.
7. Record the completion in STATE.md.
8. Move the completed prompt to completed/.
9. Activate the next eligible phase.
10. Execute the next phase automatically.

Do NOT stop merely because a phase completed.

Human intervention is required ONLY when a genuine blocker exists.

### Automatic continuation

A successful phase completion MUST automatically advance:

ACTIVE.md
↓
completed/<phase>.md
↓
pending/<next-phase>.md
↓
ACTIVE.md

The orchestrator MUST continue execution until:

- all roadmap phases are COMPLETE, OR
- a genuine BLOCKED/HUMAN_GATE condition is encountered.

### Human gates

The pipeline MUST stop when:

- an ADR requires explicit human acceptance;
- a required product decision cannot be safely inferred;
- implementation violates the phase contract;
- schema/money-path architecture unexpectedly changes;
- required tests/builds cannot be made to pass safely;
- a security, isolation, financial-integrity, or data-loss risk is discovered.

A normal successful phase completion is NOT a human gate.

### Never auto-authorize scope

Automatic advancement means:

"execute the next already-approved phase."

It does NOT mean:

"invent new scope."

The orchestrator must execute only phases already defined in ROADMAP.md.

### No skipping

Phases execute sequentially unless ROADMAP.md explicitly defines
dependencies allowing parallel execution.

4.8 → 4.9 → 4.10 → ... → 4.15

A later phase must never be started while its dependency is incomplete.

### Final completion

When every roadmap phase is complete:

ACTIVE.md:
status: COMPLETE

STATE.md:
pipeline_status: COMPLETE

The orchestrator must stop only after the entire roadmap is complete.

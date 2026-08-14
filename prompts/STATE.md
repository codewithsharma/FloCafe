# Prompt pipeline state

```text
CURRENT_PHASE=4.6
STATUS=ACTIVE
CURRENT_PROMPT=prompts/phases/phase-4.6.md
LAST_COMPLETED=4.5
LAST_COMMIT=a42493a
NEXT_PHASE=4.7
SCHEMA=v75
PRODUCTION_CODE=UNCHANGED
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=pipeline-create-only (no phase implementation)
```

## Completed phases (engineering, not this folder)

Historical implementation lives in `docs/`, not `prompts/completed/` yet.

| Phase   | Capability                                                         | Commit (abbrev)     |
| ------- | ------------------------------------------------------------------ | ------------------- |
| 3.1–3.4 | Fail-closed remount, vertical config, production Retail, residuals | see `.ai/tasks.md`  |
| 3.5A    | Inventory ledger UI                                                | `5d223e9`           |
| 3.5B    | Legacy tax cleanup                                                 | **DEFERRED**        |
| 3.5C    | Service extraction                                                 | no safe extraction  |
| 3.6A–G  | Print, reports UX, stock UI, Z, customers, drawer, WebUSB          | `c8471f2`…`1245b53` |
| 4.1     | Retail floor usability                                             | `d89d3da`           |
| 4.2     | Retail refund restock (ADR-011)                                    | `edf0f13`           |
| 4.3     | Low-stock attention hub                                            | `9960e15`           |
| 4.4     | Accounting CSV export                                              | `20b3b13`           |
| 4.5     | Retail exchange (ADR-012)                                          | `a42493a`           |

## Blocked phases

_None._ `prompts/blocked/` is empty.

## ADR requirements

| Phase | ADR                                                                      |
| ----- | ------------------------------------------------------------------------ |
| 4.6   | **ADR-013** (this phase) — variants / SKU identity                       |
| 4.10  | ADR only if bill **writes** are proposed (default: display-only, no ADR) |
| 4.13  | Discovery; ADR if merging billed checks                                  |
| 4.14  | **Service charge** ADR (money path)                                      |
| 4.15  | ADR only if `inventory_movements` CHECK must change                      |

## Unrelated working tree (do not commit with this pipeline or with any phase)

Recorded at pipeline creation. `git status` was dirty **ahead of** `prompts/` creation.

**Do not** include in a prompts-only commit or in Phase 4.6–4.15 commits:

- Branding / docs drift: `README.md`, `STRATEGY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/00-product/*`, `docs/README.md`, `docs/google-drive-setup.md`, `docs/01-requirements/acceptance-criteria.md`, `docs/16-release/production-readiness.md`
- Architecture/docs WIP: `docs/03-architecture/architecture.md`, `architecture-gap-report.md`, untracked `phase-3.3-production-retail.md`, `phase-3.5-scope-discovery.md`, `phase-3.5c-service-extraction-discovery.md`, `docs/00-product/DOC-TRUTH-AUDIT.md`
- Untracked discovery already used as evidence (commit separately if desired): `docs/04-product/phase-4.6-retail-product-variants-discovery.md`
- Retail/module working tree: `main/modules/*`, `main/routes/platform.ts`, `frontend/src/lib/modules.ts`, `frontend/src/store/cart.ts`, POS/shell files, related tests (`production-retail.test.ts`, composition tests, etc.)
- `audit/`
- Pre-existing `.ai/*` drift (update `.ai` **only** with pipeline/phase-relevant lines when executing a phase)

## Blockers

_None for pipeline creation._

## Auto-advance rule

Do not set `CURRENT_PHASE=4.7` until Phase 4.6 completion criteria in `prompts/phases/phase-4.6.md` are met **or** a human overrides `ACTIVE.md` after recording the reason here.

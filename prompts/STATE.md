# Prompt pipeline state

```text
CURRENT_PHASE=none
STATUS=STOP
CURRENT_PROMPT=prompts/phases/phase-4.7.md
LAST_COMPLETED=4.7
LAST_COMMIT=pending-4.7-feat
HEAD_AT_PIPELINE=pending-4.7-feat
NEXT_PHASE=4.8
SCHEMA=v75
PRODUCTION_CODE=PHASE_4.7_SHIPPED
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=2026-08-14 Phase 4.7 COMPLETE; npm test / lint / builds green; 4.8 NOT activated
ADR=docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md (Accepted)
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
| 4.6     | ADR-013 identity lock (Accepted; no matrix code)                   | `934f2fd` + Accept  |
| 4.7     | Restaurant 86 availability workflow                                | this commit         |

## Blocked phases

None. Phase 4.6 ADR gate is **CLOSED**. Phase 4.7 is **COMPLETE**.

## ADR requirements

| Phase | ADR                                                                      |
| ----- | ------------------------------------------------------------------------ |
| 4.6   | **ADR-013 Accepted** — Option A identity; matrix not authorized          |
| 4.10  | ADR only if bill **writes** are proposed (default: display-only, no ADR) |
| 4.13  | Discovery; ADR if merging billed checks                                  |
| 4.14  | **Service charge** ADR (money path)                                      |
| 4.15  | ADR only if `inventory_movements` CHECK must change                      |

## Unrelated working tree (do not commit with Phase 4.7)

Do **not** mix into the Phase 4.7 commit:

- `prompts/phases/phase-4.11.md` … `phase-4.15.md` (pipeline leftovers)
- Branding, audit, generated files, `.env`, credentials
- Unrelated `main/` / `frontend/` dirty files listed in git status at pipeline start

## Blockers

**STOP.** Human override: do **not** auto-activate 4.8.

## Auto-advance rule

`STATUS=STOP` → do not start Phase 4.8 until a human authorizes it.

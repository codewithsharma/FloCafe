# Prompt pipeline state

```text
CURRENT_PHASE=4.6
STATUS=ADR_REQUIRED
CURRENT_PROMPT=prompts/phases/phase-4.6.md
LAST_COMPLETED=4.5
LAST_COMMIT=a42493a
HEAD_AT_PIPELINE=4c91553
NEXT_PHASE=4.7
SCHEMA=v75
PRODUCTION_CODE=UNCHANGED
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=2026-08-14 ADR-013 drafted Proposed; docs-only git diff; human Accept pending
ADR=docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md
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

| Phase   | File                           | Reason                                            |
| ------- | ------------------------------ | ------------------------------------------------- |
| **4.6** | `prompts/blocked/phase-4.6.md` | **ADR_REQUIRED** — ADR-013 Proposed; human Accept |

## ADR requirements

| Phase | ADR                                                                                        |
| ----- | ------------------------------------------------------------------------------------------ |
| 4.6   | **ADR-013 Proposed** — `docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md` |
| 4.10  | ADR only if bill **writes** are proposed (default: display-only, no ADR)                   |
| 4.13  | Discovery; ADR if merging billed checks                                                    |
| 4.14  | **Service charge** ADR (money path)                                                        |
| 4.15  | ADR only if `inventory_movements` CHECK must change                                        |

## Unrelated working tree (do not commit with Phase 4.6)

Do **not** mix into the ADR-013 commit:

- `prompts/phases/phase-4.11.md` … `phase-4.15.md` (pipeline leftovers)
- `prompts/ROADMAP.md` if the only change is the 4.14 service-charge column note
- Branding, audit, generated files, `.env`, credentials
- Any `main/` or `frontend/` file (none expected)

## Blockers

**ADR-013 human Accept.** Do not auto-activate 4.7. Do not implement variants.

## Auto-advance rule

`STATUS=ADR_REQUIRED` → **STOP**. Human may later Accept ADR-013 and authorize 4.7, or override `ACTIVE.md` in the open.

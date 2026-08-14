# Prompt pipeline state

```text
CURRENT_PHASE=4.11
STATUS=ACTIVE
CURRENT_PROMPT=prompts/phases/phase-4.11.md
LAST_COMPLETED=4.10
LAST_COMMIT=pending-4.10-feat
HEAD_AT_PIPELINE=pending-4.10-feat
NEXT_PHASE=4.12
SCHEMA=v75
PRODUCTION_CODE=PHASE_4.10_SHIPPED
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=2026-08-14 Phase 4.10 COMPLETE; display-only; no bill writes
ADR=docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md (Accepted)
```

## Completed phases (engineering, not this folder)

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
| 4.7     | Restaurant 86 availability workflow                                | `6a2eaef`           |
| 4.8     | Reports multi-day range picker                                     | `9fc8a84`           |
| 4.9     | Customer deactivate lifecycle                                      | `705a097`           |
| 4.10    | FIN-01 collectible outstanding display                             | this commit         |

## Blocked phases

None.

## ADR requirements

| Phase | ADR                                                             |
| ----- | --------------------------------------------------------------- |
| 4.6   | **ADR-013 Accepted** — Option A identity; matrix not authorized |
| 4.10  | Display-only; no ADR (no bill writes)                           |
| 4.13  | Discovery; ADR if merging billed checks                         |
| 4.14  | **Service charge** ADR (money path)                             |
| 4.15  | ADR only if `inventory_movements` CHECK must change             |

## Unrelated working tree (do not commit with this phase)

Do **not** mix branding, audit, generated files, `.env`, or credentials into phase commits.

## Auto-advance rule

Pipeline mode: AUTONOMOUS
Roadmap: 4.6 → 4.15
Current phase: 4.11
Next phase: 4.12
Auto-advance: ENABLED
Stop-on-blocker: ENABLED
Human-gate-on-ADR: ENABLED
A successful phase completion does not require human authorization.
4.14 paper COMPLETE still requires human Accept before a future **wiring** phase; 4.15 may proceed after 4.14 paper is written.

# Prompt pipeline state

```text
CURRENT_PHASE=4.13
STATUS=ACTIVE
CURRENT_PROMPT=prompts/phases/phase-4.13.md
LAST_COMPLETED=4.12
LAST_COMMIT=pending-4.12-feat
HEAD_AT_PIPELINE=pending-4.12-feat
NEXT_PHASE=4.14
SCHEMA=v75
PRODUCTION_CODE=PHASE_4.12_SHIPPED
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=2026-08-14 Phase 4.12 COMPLETE; Retail takeaway-only POS
ADR=docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md (Accepted)
```

## Completed phases (engineering, not this folder)

| Phase | Capability                             | Commit (abbrev)    |
| ----- | -------------------------------------- | ------------------ |
| 4.6   | ADR-013 identity lock                  | `934f2fd` + Accept |
| 4.7   | Restaurant 86 availability workflow    | `6a2eaef`          |
| 4.8   | Reports multi-day range picker         | `9fc8a84`          |
| 4.9   | Customer deactivate lifecycle          | `705a097`          |
| 4.10  | FIN-01 collectible outstanding display | `7d42368`          |
| 4.11  | Inventory on-hand valuation report     | `41443b4`          |
| 4.12  | Retail POS fulfillment-type honesty    | this commit        |

## Auto-advance rule

Pipeline mode: AUTONOMOUS
Roadmap: 4.6 → 4.15
Current phase: 4.13
Next phase: 4.14
Auto-advance: ENABLED
Stop-on-blocker: ENABLED
Human-gate-on-ADR: ENABLED
4.13 is discovery only — do not implement merge. Then 4.14 ADR paper, then 4.15 (independent of 4.14 Accept).

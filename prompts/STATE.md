# Prompt pipeline state

```text
CURRENT_PHASE=4.15
STATUS=ACTIVE
CURRENT_PROMPT=prompts/phases/phase-4.15.md
LAST_COMPLETED=4.14
LAST_COMMIT=pending-4.14-docs
HEAD_AT_PIPELINE=pending-4.14-docs
NEXT_PHASE=
SCHEMA=v75
PRODUCTION_CODE=UNCHANGED_THIS_PHASE
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=2026-08-14 Phase 4.14 COMPLETE (ADR-014 Proposed; no wiring)
ADR=ADR-013 Accepted; ADR-014 Proposed (human Accept before future service-charge wiring)
```

## Auto-advance rule

Pipeline mode: AUTONOMOUS
Current phase: 4.15 (last in this 10)
After 4.15 COMPLETE: STATUS=COMPLETE, NEXT_PHASE empty. Do not invent 4.16.
Do not wire ADR-014.
If wastage requires CHECK/migration: STOP + ADR.

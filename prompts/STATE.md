# Prompt pipeline state

```text
CURRENT_PHASE=none
STATUS=COMPLETE
CURRENT_PROMPT=none
LAST_COMPLETED=4.15
LAST_COMMIT=pending-4.15-feat
HEAD_AT_PIPELINE=pending-4.15-feat
NEXT_PHASE=
SCHEMA=v75
PRODUCTION_CODE=PHASE_4.15_SHIPPED
PIPELINE_CREATED=2026-08-14
LAST_VERIFICATION=2026-08-14 Phase 4.6–4.15 COMPLETE
ADR=ADR-013 Accepted; ADR-014 Proposed (human Accept before service-charge wiring)
```

## Roadmap 4.6–4.15

COMPLETE. Do not invent 4.16.

## Remaining human gates (not this 10)

- ADR-014 Accept before any service-charge **wiring**
- Table merge implementation (discovery only; billed merge still ADR_REQUIRED)
- Variants matrix (ADR-013 forbids until a new authorized slice)

## Product plan (not this pipeline)

Canonical: `docs/00-product/capability-matrix.md` (adopted 2026-08-14).
Prefer 🟡 Hardening before 🔵 Planned. Do not auto-start from the matrix.

## Auto-advance rule

Pipeline mode: COMPLETE
Stop. Do not start unlisted phases.

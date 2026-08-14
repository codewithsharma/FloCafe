# Phase 4.6 — ADR_REQUIRED

**Date:** 2026-08-14  
**Phase:** 4.6 — ADR-013 Retail product variants / SKU identity  
**Status:** ADR_REQUIRED

## Failure / stop reason

Not an implementation failure. ADR-013 is **Proposed** and requires **human Accept**. Pipeline rules forbid auto-advance and forbid variant implementation until Accept.

## Evidence

- ADR: `docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md`
- Discovery still matches HEAD: schema v75; identity = `products.id`
- Production code: **unchanged** (`main/` / `frontend/` not in this phase diff)
- Schema: **v75 unchanged**

## Failing tests

None. Docs-only phase; no new behavioral tests (per prompt).

## Suspected cause

Human approval gate — by design.

## Attempted fixes

N/A. Do not “fix” by self-accepting the ADR or shipping a matrix.

## Remaining work

1. Human Accepts, Rejects, or requests ADR revisions.
2. After **Accept as written:** identity lock stands; matrix remains deferred; orchestrator may activate **4.7** (does not depend on matrix) **only after human says so or Accept path in phase-4.6.md**.
3. After **Accept + authorize software slice:** write a **new** implementation prompt — not automatic; child identity must remain `products.id`.
4. **Do not** start Phase 4.7 while this file exists unless a human overrides `ACTIVE.md` in the open.

## Next active prompt

**None.** `prompts/ACTIVE.md` remains Phase 4.6 with Status `ADR_REQUIRED`.

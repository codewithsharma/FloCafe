# R9 Slice 4 — Day-close / Z Polish

**Type:** Authorization / Definition Prompt
**Classification:** AUTHORIZATION_REQUIRED
**Status:** NOT AUTHORIZED — do **not** implement until explicit slice auth exists in repository/project instructions
**Schema tip (current):** v83
**Proposed suite:** `npm run test:r9.4` (name TBD after auth)

---

## 1. Current release truth

```text
R1–R8: COMPLETE
R9 Slice 1 Expenses: COMPLETE
R9 Slice 2 Audit-Trail: COMPLETE
R9 Slice 3 Tax Reporting + Accountant Export: COMPLETE
R9 Slice 4 Day-close/Z Polish: NOT AUTHORIZED (this prompt)
R9 Slice 5–6: NOT AUTHORIZED

Schema: v83
Live café validation: DEFERRED
Controlled Pilot: READY WITH CONDITIONS
Live Go-Live: NO-GO
```

Evidence that Slice 4 is withheld:

- `.ai/decisions.md` (R9 Slice 3): “Do not start R9 Slice 4+ / Z polish / food-cost without slice auth.”
- `docs/05-production/r9-tax-export-slice-3.md`: Day-close/Z polish explicitly out of Slice 3
- `.ai/tasks.md`: remaining R9 only with explicit slice auth

---

## 2. Why authorization is required

Roadmap presence is **not** authorization. Slice 4 touches day-close / Z-report surfaces that are financial SoR for pilot ops. Any polish that changes frozen cash summary, print/download truth, or day-boundary semantics needs an explicit authorized scope.

---

## 3. Proposed objective (for human auth)

Polish existing day-close / Z-report operator experience without inventing new financial formulas.

Likely deepen areas (to be confirmed at auth time):

- Clarity of cash Z print/download vs live Gross/Net
- Operator UX for close confirmation / reprint
- Audit coverage around day.close / Z snapshot actions
- Docs alignment with OPS pilot runbook

---

## 4. Inspection required before any auth decision

- `main/services/day-close.ts`
- `main/routes/reports.ts` day-close endpoints
- Phase 3.6D Z snapshot docs + UI
- `.ai/patterns.md` day-close Z rule (frozen cash summary only)
- Existing tests covering day-close / Z
- OPS-01/02 day-close expectations

---

## 5. Draft scope boundaries (proposal only)

### Likely in-scope if authorized

- UX/copy/i18n polish on existing day-close / Z flows
- Non-formula correctness (labels, empty states, reprint affordances)
- Additional audits for existing close/print actions if gaps proven
- Focused suite documenting accepted behavior

### Explicitly out until separately authorized

- Changing `expected_cash` / variance / FIN-01 formulas
- Folding live Gross/Net into frozen Z without new snapshot contract
- Ops finance reports v1 (Slice 5)
- Food-cost report v1 (Slice 6)
- Tax-engine / UTC→tenant TZ changes
- REAL cutover / ADR-014 / R10+
- Schema bump unless auth explicitly requires it

---

## 6. Authorization checklist (human / project owner)

Mark each required item before setting classification to IMPLEMENTABLE:

- [ ] Explicit written authorization in `.ai/decisions.md` (or equivalent project instruction)
- [ ] Exact acceptance criteria listed (formula-preserving)
- [ ] Migration decision recorded (expect **no** bump unless justified)
- [ ] Financial safety statement: no tender/tax/day-close formula change unless named
- [ ] Test suite name + scenarios agreed
- [ ] Out-of-scope list confirmed (Slice 5/6, filing, R10+)

---

## 7. What an implementing agent must do after auth

1. Replace this prompt with (or add) `R9-S4-day-close-z-polish-implementation.md`
2. Set ACTIVE/decision markers to authorized
3. RED→GREEN tests first
4. Implement minimum scope
5. Run focused + regression + `npm run build`
6. Scope-audit; commit only Slice 4; author **Dev Raj Sharma**; do not push
7. Generate Slice 5 authorization prompt (do not auto-implement)

---

## 8. Immediate instruction

**STOP.** Do not write production code for Slice 4 from this file.

Next human action: approve/reject with exact scope, then authorize via repository decision record.

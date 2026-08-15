# R10 — Workforce OS — Planning Prompt

**Type:** Phase planning
**Classification:** AUTHORIZATION_REQUIRED (new product program)
**Status:** PLANNING ONLY — do **not** implement until R10 is explicitly authorized as a development program

---

## 1. Current release truth

```text
R1–R8: COMPLETE
R9: COMPLETE (S1–S6)
R10: NOT AUTHORIZED

Schema: v83
Live café validation: DEFERRED
Controlled Pilot: READY WITH CONDITIONS
Live Go-Live: NO-GO
```

---

## 2. Objective

Define Operavia Restaurant **Workforce OS** as the next product program after R9 finance depth: deepen staff lifecycle, permissions clarity, attendance/scheduling foundations, and related workforce operations — without inventing payroll products that STRATEGY freezes.

---

## 3. Proposed modules (candidates — not authorized)

1. Staff lifecycle deepen (beyond R8 search/detail/roster)
2. Role/permission matrix clarity (H3 + product UX)
3. Attendance / clock events (local SQLite)
4. Scheduling / shift planning (distinct from POS cash shifts)
5. Leave requests (simple)
6. Tips tracking foundation (if in matrix Planned — verify before auth)
7. Employee self-service (limited)
8. Payroll **foundation only** if matrix allows; full payroll remains Frozen until strategy reopen

---

## 4. Dependencies

- R8 Staff Workforce COMPLETE (users SoR)
- H3 RBAC COMPLETE
- M4 POS shifts COMPLETE (do not conflate cash shifts with labor schedules)
- R9 COMPLETE (this planning gate)

---

## 5. Architecture notes

- Keep `users` as staff SoR unless ADR proves otherwise
- Prefer services + thin routes; do not grow Settings god-page
- Offline-first SQLite; no cloud payroll gateway
- Audits on role/lifecycle changes already partially present — deepen consistently

---

## 6. Scope boundaries

**In (if later authorized):** workforce ops for single-location restaurant

**Out until separate auth:** multi-location HR, full payroll processors, biometric hardware, AI scheduling, aggregators

---

## 7. Acceptance strategy (for future slices)

- Explicit R10 program ADR
- Slice decomposition with formula/RBAC safety
- Focused suites `test:r10.*`
- No live go-live claims from engineering alone

---

## 8. Candidate slices (draft)

1. R10-S1 — Staff lifecycle polish + permission matrix UX
2. R10-S2 — Attendance clock events
3. R10-S3 — Schedule drafts
4. R10-S4 — Leave requests
5. R10-S5 — Tips foundation (only if matrix/Planned confirms)

Exact slice set requires human/program authorization.

---

## 9. Risks

- Confusing POS cash `shifts` with labor schedules
- Accidental payroll product scope creep (Frozen)
- Over-growing `users` / Settings without extraction

---

## 10. Immediate instruction

**STOP.** Do not implement R10 from this file.

Next human action: authorize R10 as a development program with an Accepted ADR and first-slice scope.

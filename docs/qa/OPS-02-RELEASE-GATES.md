# OPS-02 — Release Gates

**Phase:** R16 / OPS-02  
**Date:** 2026-08-21  
**Schema tip:** **v88**  
**Package version:** **3.0.5**  
**Rule:** Objective **PASS / FAIL / BLOCKED / NOT TESTED** only. No “probably / looks correct.”

---

## Overall gate logic

| Decision           | Requires                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GO**             | Zero unresolved P0; zero unresolved production-integrity P1; all mandatory gates PASS; critical restart/recovery evidenced; production build + signed RC validated            |
| **CONDITIONAL GO** | No P0 data-corruption eng defects; no unresolved production-integrity eng P1; remaining P0s are **explicitly human/ops** and listed; release owner can accept known residuals |
| **NO-GO**          | Any eng P0; any unresolved production-integrity P1; critical transaction integrity unproven; restart/recovery unsafe; production package cannot be validated                  |

**Live café Go-Live** additionally requires OPS-02-RC-001, SITE-001, PIN-001, SIGNOFF-001 = PASS.

---

## Gate A — Build

### Commands

```bash
npm run build
npm run build:frontend
```

### Packaging (at least one platform path)

```bash
# Unpacked (unsigned smoke — TRAINING/QA identity)
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack

# Signed pilot path (when credentials available)
npm run build:mac   # or release.yml release-mac
```

### PASS criteria

| Check | PASS if                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------- |
| A1    | `npm run build` exits 0; `dist/` emitted                                                                              |
| A2    | `npm run build:frontend` exits 0; `frontend/out/` present                                                             |
| A3    | `npm run pack` (or CI nightly `--dir`) produces `Operavia.app` / platform unpacked app without crash                  |
| A4    | Signed+notarized installer exists for target café OS (**required for Live GO**; unsigned OK only for eng CONDITIONAL) |

### Status tracking

| Check | Status                                          | Evidence                            |
| ----- | ----------------------------------------------- | ----------------------------------- |
| A1    | _fill in Phase 5_                               |                                     |
| A2    | _fill in Phase 5_                               |                                     |
| A3    | _fill in Phase 5_                               |                                     |
| A4    | **BLOCKED** (no signing identities on eng host) | `r16-production-release-blocker.md` |

---

## Gate B — Database Integrity

### Scenarios

| ID  | Scenario                              | PASS if                                                   |
| --- | ------------------------------------- | --------------------------------------------------------- |
| B1  | Fresh database startup                | Migrations to **v88**; health ok; setup path works        |
| B2  | Existing database startup             | Opens WAL DB; integrity_check ok; no false recovery latch |
| B3  | Migration from prior supported schema | Upgrade path / ideal schema continuity                    |
| B4  | Restart after successful transaction  | Committed rows present                                    |
| B5  | Restart during non-critical operation | No corruption; app recovers                               |
| B6  | Restore flow                          | Good backup restores; latch clears when users present     |
| B7  | Backup integrity                      | `createBackup` integrity_check ok before success          |
| B8  | WAL / crash recovery                  | Mid-txn kill rolls back (process-kill harness)            |

### Automated evidence (minimum)

```bash
npm run test:upgrade-path
npm run test:schema-health   # if wired
npm run test:backup
npm run test:r14
npm run test:rec-01
npm run test:process-kill
npm run test:recovery
```

### FAIL if

- Integrity fails and money APIs still serve dirty DB
- Restore reports success without integrity
- Committed money disappears after clean restart (without power-loss NORMAL residual)

---

## Gate C — POS Transaction Safety

### Flow (must remain consistent after restart)

1. Create order
2. Add items
3. Apply modifiers
4. Apply discounts
5. Calculate tax
6. Take payment
7. Complete order
8. Print receipt if enabled
9. Restart application
10. Verify persisted state

### Also

- Duplicate submission / retry with same Idempotency-Key → replay, not double stock/money
- Staff create/add-items **require** Idempotency-Key (P18)

### Automated evidence

```bash
npm run test:h1
npm run test:r1
npm run test:p18
npm run test:p14
```

### Manual

See `OPS-02-MANUAL-TEST-MATRIX.md` POS section + OFF scenarios.

---

## Gate D — Payment Safety

| Check | PASS if                                                                  |
| ----- | ------------------------------------------------------------------------ |
| D1    | Retry same Idempotency-Key → same result; no duplicate `payment_details` |
| D2    | Different body same key → 409                                            |
| D3    | Restart after paid → re-tender rejected                                  |
| D4    | Partial then complete → consistent outstanding (FIN-01)                  |
| D5    | Order/payment consistency after restart                                  |

### Automated evidence

```bash
# payment integrity + FIN-01 paths via security / integration / r4.1
npm run test:h1
node tests/run-electron-node-test.cjs tests/issue-214-payment-integrity.test.ts
npm run test:process-kill
```

---

## Gate E — KDS Recovery

| Check | PASS if                                                                 |
| ----- | ----------------------------------------------------------------------- |
| E1    | KDS companion restart → advertise correct; dead companion not published |
| E2    | POS restart → outbox leases reclaim; board from SQLite                  |
| E3    | KDS client reconnect → full board; stale UX clears                      |
| E4    | Network/WS disconnect → REST poll + reconnect backoff                   |
| E5    | Pending outbox replay when no client online                             |
| E6    | Duplicate event protection (snapshot replace + CAS)                     |
| E7    | Ticket state consistent with SQLite SoR                                 |

### Automated evidence

```bash
npm run test:h2
npm run test:r3
npm run test:kds-h-outbox
npm run test:kds-bind-degrade
npm run test:kds-alerts
```

### Manual

OPS-02 site KDS drills (SITE-001). Eng PASS ≠ café PASS.

---

## Gate F — Authentication and RBAC

| Check | PASS if                                                        |
| ----- | -------------------------------------------------------------- |
| F1    | All defined roles exercise critical paths per matrix           |
| F2    | Protected routes 401/403 without auth / wrong role             |
| F3    | No privilege escalation via JWT role claim alone               |
| F4    | GUI critical-path access for Owner/Manager/Cashier/Waiter/Chef |

### Automated evidence

```bash
npm run test:h3
npm run test:staff-authz
npm run test:orders-authz
npm run test:authz-phase3
```

### Manual

Prior GUI RBAC evidence: `docs/qa/evidence/gui/full/FINAL-RBAC-AUDIT.md` (re-validate on RC).

---

## Gate G — Offline / Recovery (OFF-01…OFF-08)

| ID     | Scenario                               | Expected                                                        | Automated / manual                   | Status    |
| ------ | -------------------------------------- | --------------------------------------------------------------- | ------------------------------------ | --------- |
| OFF-01 | Application closes during active order | SQLite order persists if committed; in-memory cart lost         | Manual + held-orders API             | _Phase 6_ |
| OFF-02 | Closes immediately after add item      | Item persisted if HTTP committed; sticky key may resume         | `test:p18` + manual                  | _Phase 6_ |
| OFF-03 | Closes during checkout                 | Prepaid sticky keys may resume; paid server-side rejects double | `test:p14` sticky contracts + manual | _Phase 6_ |
| OFF-04 | Backend restart                        | API returns; DB intact; recovery latch if corrupt               | `test:recovery`, smoke               | _Phase 5_ |
| OFF-05 | KDS disconnect                         | Stale board UX; REST poll; reconnect                            | `test:h2`                            | _Phase 5_ |
| OFF-06 | Network/WebSocket reconnect            | Backoff; auth_success; board refresh                            | `test:h2`, unit backoff              | _Phase 5_ |
| OFF-07 | App restart with pending KDS event     | Outbox reclaim / drain                                          | `test:kds-h-outbox`                  | _Phase 5_ |
| OFF-08 | Restart during active shift            | Open shift remains; cash gate still applies                     | Shift suites + manual                | _Phase 6_ |

Each OFF row in the final report must include: **Expected · Actual · Evidence · PASS/FAIL/BLOCKED/NOT TESTED**.

---

## Gate H — Lint & automated suites (classification)

| Suite               | Command                                    | Role                                                                            |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Lint backend        | `npm run lint:backend`                     | Gate                                                                            |
| Lint full           | `npm run lint`                             | May be red on pre-existing FE React Compiler debt — **classify**, do not ignore |
| Unit                | `npm run test:unit` + `test:unit:frontend` | Gate                                                                            |
| Merge / integration | `npm test` (`test:merge`)                  | Primary eng gate                                                                |
| Recovery group      | `npm run test:recovery`                    | Gate B/G                                                                        |
| Extended            | `npm run test:extended`                    | Strongly recommended; required for CONDITIONAL GO confidence                    |
| Playwright          | `npm run test:e2e`                         | Gate if runnable                                                                |
| Packaging           | Gate A                                     |                                                                                 |

Failures must be classified as: **product · test infrastructure · stale · environment**.

---

## Mapping to gap IDs

| Gate | Blocks if FAIL                    | Related gaps         |
| ---- | --------------------------------- | -------------------- |
| A    | Packaging broken                  | RC-001, A4           |
| B    | DB unsafe                         | R14/REC-01 residuals |
| C    | POS integrity                     | H1/R1/P18            |
| D    | Payment integrity                 | issue-214 / FIN-01   |
| E    | KDS unsafe                        | KDS-001, LIF-002     |
| F    | Authz broken                      | H3                   |
| G    | Restart unsafe                    | LIF-003, SITE-001    |
| H    | Suites red without classification | CI-001               |

---

## Sign-off block (fill at Phase 8)

| Field                           | Value |
| ------------------------------- | ----- |
| Engineering gate recommendation |       |
| Live Go-Live recommendation     |       |
| Release owner                   |       |
| Date                            |       |
| Accepted residuals (IDs)        |       |

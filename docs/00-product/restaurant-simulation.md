<!-- Last updated: 2026-08-15, schema v80 -->

# Operavia Restaurant Simulation Environment

**Status:** Design for virtual café (docs only)  
**Why:** OPS-02 **NO-GO** — no physical café/signing host in engineering environment. Simulation is the standing substitute for site drills until real pilots exist.  
**Roadmap wave:** R15 (build incrementally from R1)  
**Blueprint:** [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md)

---

## Goals

1. Deterministic **virtual restaurant** for CI and local agents.
2. Cover opening → service → close → backup → failure without hardware.
3. Provide seed data and failure injection that mirror OPS-01/OPS-02 checklists.
4. Never claim simulation PASS equals live café PASS (OPS-02).

---

## Seed data (minimum)

| Entity     | Contents                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------- |
| Restaurant | Single café profile, tax pack India GST demo                                                  |
| Staff      | Owner, Manager, Cashier, Waiter, Chef (test PINs only in fixtures — never production secrets) |
| Menu       | Categories, items, modifiers/addon groups, one 86-able item                                   |
| Tables     | Small floor (e.g. 8 tables)                                                                   |
| Inventory  | SKUs with stock; later ingredients/BOM when R4/R5 exist                                       |
| Suppliers  | Stub supplier when R6 exists                                                                  |
| Customers  | 2–3 profiles with loyalty wallet                                                              |
| Printers   | Mock ESC/POS sink (no real device required)                                                   |
| KDS        | In-process companion or harness on ephemeral port                                             |

---

## Scenarios

| ID  | Scenario                                                               |
| --- | ---------------------------------------------------------------------- |
| S1  | Normal sale (shift → order → KDS → pay → receipt → close → Z → backup) |
| S2  | Discount + refund                                                      |
| S3  | Internet down (block outbound; billing continues)                      |
| S4  | KDS companion stop/start (stale + recover)                             |
| S5  | Printer failure then reprint                                           |
| S6  | App restart mid-shift                                                  |
| S7  | Backup → corrupt reject → good restore on spare userdata               |
| S8  | RBAC matrix denials                                                    |
| S9  | Partial pay + FIN-01 over-collect reject                               |
| S10 | Stock adjust / wastage (when inventory depth in scope)                 |

---

## Automation layers

| Layer             | Mechanism                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- |
| API integration   | Existing `tests/run-electron-node-test.cjs` suites; expand scenario packs                 |
| Unit/service      | Vitest/tsx patterns already in repo                                                       |
| UI E2E            | Playwright against static export + local API (existing `test:e2e` path)                   |
| Failure injection | Env flags / mock printers / stop KDS port / deny network to cloud hosts                   |
| Fixtures          | Versioned JSON/SQL seeds under `tests/fixtures/restaurant-sim/` (created when R15 starts) |

---

## Determinism rules

- Fixed clocks where needed for Z/business date
- Idempotency keys from scenario scripts
- No real Drive/WhatsApp calls in CI (allowlist / mock)
- Separate userdata path — never touch developer live café DB

---

## Acceptance for R15 slices

- S1–S9 runnable in CI on clean tree
- Documented how to run locally
- Explicit banner: **simulation ≠ signed café pilot**

---

## Out of scope for simulation v1

- Real notarized installers
- Real thermal hardware
- Real guest Wi‑Fi penetration tests
- Multi-location

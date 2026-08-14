# Operavia Phase 2 Final Exit Gate

**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**HEAD at gate:** `605bdec` (2.18) plus this documentation commit  
**Schema:** v75  
**Decision:** **PASS WITH DOCUMENTED DEFERMENTS**

Numbering: [phase-2-exit-gate.md](phase-2-exit-gate.md) is the **INTERIM** 2.14 catalog/docs exit. This file is the **FINAL** gate after CURRENT 2.14–2.18 domain seams. Interim history is preserved.

---

## Checklist

| Criterion                                              | Status                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Module registry valid                                  | PASS                                                                                            |
| Module contracts valid                                 | PASS                                                                                            |
| Composition snapshot valid                             | PASS                                                                                            |
| Platform composition API valid                         | PASS                                                                                            |
| Inventory write / ledger / read boundaries valid       | PASS (prior 2.7–2.12)                                                                           |
| Product ↔ Tax ownership valid                          | PASS (2.13)                                                                                     |
| Order domain boundary valid                            | PASS (CURRENT 2.14 — thin facade + cancel/restore ownership; create/addItems still route-heavy) |
| Payment domain boundary valid                          | PASS (2.15 — PaymentTenderService + soft-gated side effects)                                    |
| POS orchestration boundary valid                       | PASS (2.16 — coordinator + module gates; page still holds retry/discount debt)                  |
| Restaurant isolation valid                             | PASS (2.17 — Order table/KDS soft-gates; catalog shared ↛ restaurant)                           |
| Synthetic Retail composition valid                     | PASS (2.18 — retail-test; not production)                                                       |
| No shared module depends on Restaurant (catalog)       | PASS                                                                                            |
| No production Restaurant behavior changed (modules ON) | PASS                                                                                            |
| No hidden stock writers                                | PASS (inventory.ts monopoly)                                                                    |
| No production tax-engine bypass                        | PASS                                                                                            |
| API compatibility preserved                            | PASS                                                                                            |
| Auth/security preserved                                | PASS (`test:authz-phase3`)                                                                      |
| SQLite transaction safety preserved                    | PASS (callers keep `withTxn`)                                                                   |
| Schema remains v75                                     | PASS                                                                                            |
| Full regression (listed matrix)                        | PASS                                                                                            |
| Build                                                  | PASS                                                                                            |
| Documentation reflects reality                         | PASS (this gate)                                                                                |
| Git history not rewritten                              | PASS                                                                                            |
| New continuation commits without Cursor trailer        | PASS except **already-pushed** `0e4a41a` (POS) — not rewritten                                  |
| Working tree intended-only                             | PASS at gate time                                                                               |

---

## 1. What changed (CURRENT 2.14–2.18)

| Phase                | Change                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.14 Order**       | `main/services/order.ts` ownership facade; item cancel/restore relocated onto `orderRoutes`; characterization of partial-cancel / void×cancel stock |
| **2.15 Payment**     | `main/services/payment-tender.ts`; bills import tender; tables/kds bill-paid side effects `isModuleEnabled`-gated                                   |
| **2.16 POS**         | `checkout-coordinator.ts` + `POS_DOES_NOT_OWN`; addons/KOT module gates; `pos-info` remains thin                                                    |
| **2.17 Restaurant**  | Order occupy/free/KDS notify soft-gated; catalog comment: shared ↛ restaurant deps                                                                  |
| **2.18 Retail-test** | Stronger composition + neutrality tests; still synthetic                                                                                            |

## 2. What did not change

Restaurant money, tax math, inventory policy (void×cancel **pinned**, not “fixed”), refunds, schema (v75), API paths, Electron, `db.ts` rewrite, packages, production multi-vertical, fail-closed remount.

## 3. Current module map

22 modules: core, customer, product, category, inventory, pos, order, payment, refund, tax, shift, staff, loyalty, reporting, printing, notification, backup, tables, kitchen, kds, menu, addons.

## 4. Current vertical map

| Vertical            | Role                                                             |
| ------------------- | ---------------------------------------------------------------- |
| Operavia Restaurant | Sole production (`VERTICALS`, `ACTIVE_VERTICAL_ID`) — 22 modules |
| retail-test         | Synthetic only (`SYNTHETIC_VERTICALS`) — 17 shared modules       |

## 5. Dependency graph (soft)

Shared commerce does not declare restaurant-kind deps. Restaurant modules depend on shared (tables→order, kds→kitchen/order/product). Runtime restaurant **side effects** are gated; Express still mounts all routes.

## 6. Order ownership

**Owns:** lifecycle HTTP on `/api/orders` (including item cancel/restore), held-orders.  
**Does not own:** stock mutations (Inventory), tax engine (Tax), tender (Payment), KDS/tables (Restaurant, soft-gated).  
**Extraction:** LOW–MEDIUM.

## 7. Payment ownership

**Owns:** tender via `payment-tender` (`preparePaymentBatch` / `applyPaymentBatch`), payment-methods, cash helpers.  
**Does not own:** tax engine, inventory, KDS, tables, printing internals.  
**Extraction:** tender MEDIUM; full package LOW.

## 8. POS ownership

**Owns:** sell UX orchestration, thin `/api/pos-info`.  
**Does not own:** tax engine, stock, payment tender internals.  
**Extraction:** HIGH (orchestrator by design).

## 9. Restaurant-only ownership

tables, kitchen, kds, menu, addons. KOT is a printing flag + kds module gate. dine-in remains an order type (legacy/shared). waiter/chef are roles, not catalog modules.

## 10. Synthetic Retail composition

17 shared modules; excludes tables/kitchen/kds/menu/addons. Not in `VERTICALS`. API cannot select it.

## 11. Extraction readiness (honest)

| Module            | Coupling   |
| ----------------- | ---------- |
| Customer          | MEDIUM     |
| Inventory         | MEDIUM     |
| Product           | HIGH       |
| Tax               | MEDIUM     |
| Order             | LOW–MEDIUM |
| Payment (tender)  | MEDIUM     |
| Payment (package) | LOW        |
| POS               | HIGH       |
| Tables            | MEDIUM     |
| KDS               | HIGH       |

## 12. Remaining coupling

- Fat `orders.ts` create/add-items still in routes
- `bills.ts` still hosts generate/discount/print/split-check
- POS page retry/discount/print debt
- Static Express mounts
- `db.ts` monolith
- dine-in / waiter / chef not modeled as modules

## 13. Deferred to Phase 3

Package extraction · fail-closed deps/remount · production Retail/Grocery/Salon/Pharmacy/Hospitality/Custom · runtime vertical switch · Inventory UI · legacy tax columns · void×cancel product fix · `db.ts` split · marketplace

## 14. Test matrix

All PASS at final gate (commands recorded in implementation report): module-registry through synthetic-retail, flo-*, smoke, network-mode, release-config, authz-phase3, build.

## 15. Git commits (continuation)

| Hash      | Message                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `a6efd2a` | refactor(order): establish order domain boundary                                     |
| `ffb31bc` | refactor(payment): establish payment domain boundary                                 |
| `dd69f5c` | refactor(restaurant): strengthen vertical isolation                                  |
| `0e4a41a` | refactor(pos): isolate POS orchestration (**Cursor trailer present; not rewritten**) |
| `605bdec` | test(verticals): validate synthetic retail composition                               |

## 16. Final Phase 2 decision

### **PASS WITH DOCUMENTED DEFERMENTS**

Shared modules can be composed into a non-Restaurant vertical **without copying Restaurant business logic** at the catalog and soft-gated side-effect layer. Production Restaurant behavior is unchanged. Production Retail is **not** enabled. Phase 3 owns packages, fail-closed remount, and real additional verticals.

**Do not start Phase 3 implementation in this milestone.**

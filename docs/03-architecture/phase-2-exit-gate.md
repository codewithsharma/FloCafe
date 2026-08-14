# Operavia Phase 2 Exit Gate

**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Baseline HEAD at audit start:** `08fe25c` (Phase 2.13)  
**Phase 2.14:** exit hardening (catalog metadata truth + documentation)  
**Decision:** **PASS WITH DOCUMENTED DEFERMENTS**

---

## 1. Objective

Prove that Operavia has a reusable, composable, vertical-neutral module architecture with explicit ownership, contracts, composition, and domain boundaries — ready for Phase 3 extraction and additional verticals — **without** rewriting Restaurant behavior, extracting packages, or enabling multi-vertical runtime selection.

---

## 2. Phase 2 Scope

| In scope                                          | Out of scope                               |
| ------------------------------------------------- | ------------------------------------------ |
| Module registry, contracts, capabilities          | npm packages / workspaces / multi-repo     |
| Soft dependency diagnostics                       | Fail-closed boot / route unload            |
| Composition snapshot + read API                   | Module marketplace / install lifecycle     |
| Settings + nav module gates                       | Production Retail/Grocery/Salon/…          |
| Inventory write ownership + ledger + history read | Inventory movement UI                      |
| Tax facade, HTTP boundary, snapshot contract      | Tax engine rewrite / legacy column removal |
| Product↔Inventory / Product↔Tax ownership maps    | Runtime tenant vertical switching          |
| Synthetic `retail-test` composition               | Custom builder                             |
| Characterization tests + exit docs                | `db.ts` rewrite                            |

---

## 3. Completed Architecture

Phases **2.1 → 2.13** shipped on `modular-verticles`. Phase **2.14** closes the gate with catalog metadata alignment and exit documentation.

```
Operavia (platform brand)
  └── Operavia Restaurant (ACTIVE_VERTICAL_ID = restaurant)
        ├── Module registry (22 modules)
        ├── Composition snapshot + GET /api/platform/composition
        ├── Soft diagnostics (no fail-closed)
        ├── Inventory service + ledger (v75) + movements read API
        └── Tax facade + /api/tax/* + snapshot contract
```

---

## 4. Module Registry

| Fact         | Evidence                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Catalog      | `main/modules/catalog.ts` — **22** modules                                                       |
| Helpers      | `isModuleEnabled`, `getEnabledModules`, `isFeatureAvailable`                                     |
| Integrity    | `validateRegistryIntegrity()` — unique IDs, versions, kinds, deps, capabilities, cycle detection |
| Contract     | `main/modules/types.ts` + `tests/module-contract.test.ts`                                        |
| Capabilities | Domain `CapabilityId`s — discovery only, **not** authorization                                   |
| Route mounts | Still **static** `registerRoutes` (by design)                                                    |

---

## 5. Vertical Composition

| Vertical                | Role                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Operavia Restaurant** | Sole production vertical (`VERTICALS`, `ACTIVE_VERTICAL_ID`) — enables all 22 modules |
| **retail-test**         | Synthetic fixture in `SYNTHETIC_VERTICALS` only — never active, never API-selectable  |

Composition snapshot (`getCompositionSnapshot`) and platform API report the **active production** vertical only. `?verticalId=` is ignored.

---

## 6. Capability Model

- Modules declare `capabilities: CapabilityId[]`.
- Helpers: `getModuleCapabilities`, `moduleOwnsCapability`, `findCapabilityOwner`.
- **Never** used as authz — `requireRole` remains authoritative.

---

## 7. Dependency Model

- Declared soft deps in catalog; validated by soft diagnostics only.
- Phase 2.14 aligned declared edges with runtime coupling:
  - `product` → `tax`
  - `order` → `inventory`, `tax`
  - `payment` → `tax`
- Fail-closed enforcement: **deferred to Phase 3** (after pilot proof).

---

## 8. Inventory Boundary

- All production `stock_quantity` UPDATEs live in `main/services/inventory.ts`.
- Callers: orders (sale/cancel), products (create/PUT/adjust), index (last-item cancel collapse).
- Reads may use `products.stock_quantity` as current-state cache.
- Refunds intentionally **do not** restock.

---

## 9. Inventory Ledger

| Fact        | Value                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| Schema      | **v75** `inventory_movements`                                                   |
| Types       | `sale` \| `cancel_restore` \| `adjustment`                                      |
| Semantics   | Append-only; atomic with stock UPDATE; **no backfill**                          |
| History API | `GET /api/inventory/movements` — owner/manager; limit 1–500; keyset `before_id` |

---

## 10. Tax Boundary

- Production calculation via `main/services/tax.ts` facade only.
- `tax-engine` imported by Tax facade (+ characterization tests) — not by unrelated production routes.
- HTTP: `main/routes/tax.ts` owns `/api/tax/*`; tax-packs and settings tax keys remain separate by design.

---

## 11. Tax Snapshot Contract

- Named `EngineTaxSnapshot` + facade wrapper types.
- Characterization: `tests/tax-snapshot-contract.test.ts`.
- Historical bill/order tax snapshots remain immutable when product tax config later changes (Phase 2.13).

---

## 12. Product Ownership

| Concern                                        | Owner                                                  |
| ---------------------------------------------- | ------------------------------------------------------ |
| Product CRUD / catalog fields                  | Product                                                |
| `tax_category_id` / `tax_behavior` persistence | Product (Tax **config refs** only)                     |
| Tax calculation / snapshot                     | Tax                                                    |
| Stock writes                                   | Inventory (Product create/PUT route through Inventory) |
| Legacy `tax_type` / `tax_rate`                 | Compatibility (forced none/0; cleanup deferred)        |

---

## 13. API Boundaries

| Route                           | Ownership / notes                                     |
| ------------------------------- | ----------------------------------------------------- |
| `GET /api/platform/composition` | Owner/manager; minimal projection; no vertical switch |
| `GET /api/inventory/movements`  | Inventory; owner/manager; bounded pagination          |
| `/api/tax/*`                    | Tax router                                            |
| `/api/products/*`               | Product; stock mutations call Inventory               |
| Module enable/disable HTTP      | **Does not exist** (correct for Phase 2)              |

---

## 14. Frontend Capability Consumption

- Nav: `requiresModule` + flags via `isFeatureAvailable`.
- Settings tabs: tax / shifts / kds / loyalty / printing / notification / backup gated with `isModuleEnabled`.
- Rule: **module enabled ∧ feature flag = available**.
- No module-management UI; no runtime vertical picker.

---

## 15. Restaurant Compatibility

Operavia Restaurant enables: core, customer, product, category, inventory, pos, order, payment, refund, tax, shift, staff, loyalty, reporting, printing, notification, backup, tables, kitchen, kds, menu, addons.

Flags still gate runtime behavior: `tables_required`, `kds_enabled`, `kot_printing_enabled`, `taxes_enabled`, `shifts_enabled`, `loyalty_enabled`, etc. No Restaurant workflow removed; money math unchanged by Phase 2.

---

## 16. Synthetic Retail Validation

`retail-test` composes 17 shared modules without tables/kitchen/kds/menu/addons. Proves composition ≠ Restaurant-only. Not production-selectable; `verticalIdForBusinessType('retail'|'retail-test')` → `restaurant`.

---

## 17. Database State

| Item                | Value                                           |
| ------------------- | ----------------------------------------------- |
| Schema version      | **v75**                                         |
| Last migration      | `p2_8_inventory_movements_ledger`               |
| Post-2.8 migrations | **None** (2.9–2.14 intentionally schema-stable) |
| Ledger backfill     | **None**                                        |

---

## 18. Remaining Coupling

| Area      | Coupling      | Notes                                                        |
| --------- | ------------- | ------------------------------------------------------------ |
| Inventory | MEDIUM        | Stock columns on `products`; write HTTP still product-nested |
| Tax       | MEDIUM        | Denormalized snapshots; money-path orchestration             |
| Product   | HIGH          | Config columns colocated; legacy tax fields                  |
| POS / KDS | HIGH          | Orchestration / live stream                                  |
| `db.ts`   | HIGH monolith | See §18 inventory below                                      |

### `db.ts` responsibility inventory (highest risk)

| Class | Meaning                   | Examples                                                        |
| ----- | ------------------------- | --------------------------------------------------------------- |
| **A** | Infrastructure primitives | open/close, WAL, txn, paths, schema version, backup/restore     |
| **B** | Domain logic misplaced    | KDS station helpers, order/tax JSON merge, feature-flag getters |
| **C** | Compatibility / repair    | Startup auto-repairs                                            |
| **D** | Migration / seed          | `MIGRATIONS[]`, schema create                                   |

Highest Phase 3 risk: **B-in-A** (domain helpers inside DB facade) + migration monolith blast radius. **Do not rewrite in Phase 2.**

---

## 19. Extraction Readiness

See [extraction-readiness.md](extraction-readiness.md). Phase 2 improves maps and boundaries; **no package extraction required or performed**.

---

## 20. Test Matrix

Authoritative scripts (all exist in `package.json`). Recorded PASS at Phase 2 exit audit (pre- and post–2.14 catalog metadata where noted):

| Script                                    | Result                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run test:module-registry`            | PASS (nests diagnostics, composition, vertical, contract, platform API, settings gating) |
| `npm run test:module-contract`            | PASS                                                                                     |
| `npm run test:module-composition`         | PASS                                                                                     |
| `npm run test:platform-composition-api`   | PASS                                                                                     |
| `npm run test:flo-settings-module-gating` | PASS                                                                                     |
| `npm run test:inventory-boundary`         | PASS                                                                                     |
| `npm run test:inventory-ledger`           | PASS                                                                                     |
| `npm run test:product-inventory-boundary` | PASS                                                                                     |
| `npm run test:inventory-movement-read`    | PASS                                                                                     |
| `npm run test:inventory-movements-api`    | PASS                                                                                     |
| `npm run test:tax-boundary`               | PASS                                                                                     |
| `npm run test:tax-route-boundary`         | PASS                                                                                     |
| `npm run test:tax-snapshot-contract`      | PASS                                                                                     |
| `npm run test:product-tax-boundary`       | PASS                                                                                     |
| `npm run test:integration-tax`            | PASS                                                                                     |
| `npm run test:tax-engine`                 | PASS                                                                                     |
| `npm run test:flo-ui-shell`               | PASS                                                                                     |
| `npm run test:flo-products`               | PASS                                                                                     |
| `npm run test:flo-pos`                    | PASS                                                                                     |
| `npm run test:flo-home`                   | PASS                                                                                     |
| `npm run test:flo-orders`                 | PASS                                                                                     |
| `npm run test:smoke`                      | PASS                                                                                     |
| `npm run test:network-mode`               | PASS                                                                                     |
| `npm run test:release-config`             | PASS                                                                                     |
| `npm run build`                           | PASS                                                                                     |

---

## 21. Known Limitations

1. Soft registry — Express APIs remain statically mounted regardless of vertical composition.
2. Ledger history begins at v75 — incomplete pre-migration audit by design.
3. Void + full-order cancel may restore voided line stock (documented; behavior change deferred).
4. Tables/WhatsApp pages lack deep-link empty-states (nav already gated).
5. Some living docs outside this gate historically lagged (v66/v74 citations) — exit docs supersede for Phase 2 claims.
6. Test/seed fixtures may INSERT stock outside Inventory (non-production).

---

## 22. Explicitly Deferred to Phase 3

- Package extraction / workspaces / stronger module ports
- Fail-closed dependency enforcement + optional HTTP module gates
- Deeper `db.ts` decomposition
- Runtime multi-vertical support
- Production Retail / Grocery / Salon / Pharmacy / Hospitality / Custom
- Module lifecycle, marketplace, installability
- Inventory movement UI; advanced inventory (BOM, wastage, PO)
- Legacy product tax column cleanup
- Void×cancel restock semantic hardening (characterization + safe fix)
- Ledger CHECK constraints beyond movement_type (e.g. non-zero delta)
- Tables/WhatsApp page-level fail-safe empty-states

---

## 23. Phase 2 Exit Decision

### **PASS WITH DOCUMENTED DEFERMENTS**

All architectural exit criteria for Phase 2 are met in code and characterization tests. Deferments above are intentional, documented, and do not block declaring Phase 2 **COMPLETE**.

**Do not start Phase 3 implementation in this milestone.**

### Cross-review sign-off

| Role               | Verdict                         |
| ------------------ | ------------------------------- |
| Architecture Chair | PASS WITH DOCUMENTED DEFERMENTS |
| Senior Backend     | PASS WITH DOCUMENTED DEFERMENTS |
| Senior Frontend    | PASS WITH DOCUMENTED DEFERMENTS |
| Database           | PASS WITH DOCUMENTED DEFERMENTS |
| Security           | PASS WITH DOCUMENTED DEFERMENTS |
| Release Engineer   | PASS WITH DOCUMENTED DEFERMENTS |
| Skeptical Reviewer | PASS WITH DOCUMENTED DEFERMENTS |

---

## Related

- [modular-architecture.md](modular-architecture.md)
- [extraction-readiness.md](extraction-readiness.md)
- [module-ownership.md](module-ownership.md)
- [docs/modules/README.md](../modules/README.md)
- [ADR-010](../14-decisions/ADR-010-opervia-platform.md)

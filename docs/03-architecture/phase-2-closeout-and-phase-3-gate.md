# Phase 2 Closeout & Phase 3 Architecture Gate

**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Decision:** **PHASE 2 CLOSED** — PASS WITH DOCUMENTED DEFERMENTS  
**Schema:** v75  
**Production code changed in this milestone:** **None** (docs / `.ai` / planning only)

Related: [phase-2-final-exit-gate.md](phase-2-final-exit-gate.md) (FINAL gate after 2.14–2.18), [phase-2-exit-gate.md](phase-2-exit-gate.md) (INTERIM 2.14 preserved).

---

## 1. Phase 2 closeout verdict

| Question                                    | Answer                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Is Phase 2 complete?                        | **Yes**                                                                  |
| Does live code match ownership docs?        | **Yes** (spot-checked; residual soft-gate holes documented)              |
| Can Core compose Retail without Restaurant? | **Yes** (catalog + soft-gates + `synthetic-retail-sale` E2E)             |
| Is production Retail enabled?               | **No** (`ACTIVE_VERTICAL_ID = restaurant`; `retail-test` synthetic only) |
| Start Phase 3 implementation now?           | **No** — this document is the gate plan only                             |

### Hardening addendum (post–final-exit-gate)

After `phase-2-final-exit-gate.md`, the working tree may include **Phase 2 architecture hardening** that does not reopen Phase 2 scope:

- Zod body validation on order/payment/refund/stock (shape-preserving)
- OTel domain spans + `withSpanSync` (API-only, no exporter)
- Incremental i18next call-site migration (dual catalog retained)
- `tests/synthetic-retail-sale.test.ts` money-path E2E under `npm run test:synthetic-retail`

These narrow deferred polish; they do **not** change the PASS decision or enable production Retail / fail-closed remount.

---

## 2. Live ownership consistency (audit)

| Domain         | Owns                                                       | Does not own                            | Live evidence                                                    |
| -------------- | ---------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| **Product**    | Identity, catalog, price, `tax_category_id`/`tax_behavior` | Tax calc, stock writes, tender          | `products.ts` → Tax facade helpers only; stock via Inventory     |
| **Tax**        | Packs, rates, calc, rounding, `EngineTaxSnapshot`          | Product persistence, Order lifecycle    | `tax.ts` facade; no Product→`tax-engine`                         |
| **Order**      | Lifecycle HTTP, items, totals, snapshots                   | Inventory internals, tender, tax-engine | `order.ts` markers; Inventory/Tax facades; tables/kds soft-gated |
| **Payment**    | Tender prepare/apply, FIN-01, idempotency                  | Tax/inventory/product                   | `payment-tender.ts`; refunds separate                            |
| **Inventory**  | Stock assert/decrement/restore/adjust + ledger             | Catalog metadata                        | `inventory.ts` monopoly                                          |
| **POS**        | Checkout HTTP sequence, soft-gates, UI workflow            | Domain math                             | `checkout-coordinator` + `POS_DOES_NOT_OWN`                      |
| **Restaurant** | tables, kds, kitchen, menu, addons                         | Core commerce                           | Catalog `kind: restaurant`; soft-gated call sites                |

**Lego property:** Retail = Core composition without Restaurant modules. Restaurant = Core + Restaurant modules. Proven at catalog, soft-gate, and takeaway E2E layers. Runtime ACTIVE switch to Retail is **not** implemented (intentional).

---

## 3. Deferred debt classification

| Item                                                                  | Class                                             | Why                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| Fail-closed Express remount / unload restaurant HTTP when modules off | **Phase 3 blocker** (for true vertical isolation) | Soft-gates alone leave routes live                                |
| Production Retail+ vertical in `VERTICALS`                            | **Phase 3 work**                                  | After fail-closed + capability config                             |
| Runtime / deployment vertical selection                               | **Phase 3 work**                                  | Depends on fail-closed + config validation                        |
| Soft-gate residual: `notifyOrderUpdated` alias ungated                | **Phase 3 work** (early polish OK)                | Same as KDS notify; contracts miss alias                          |
| Held-orders table writes without `tables` gate                        | **Phase 3 work**                                  | Completes restaurant isolation                                    |
| Void×cancel over-restore                                              | **Phase 3 work**                                  | Pinned correctness bug; careful money/stock fix                   |
| Stock-reject HTTP may return 500                                      | **Polish**                                        | Characterized `>= 400`; map `statusCode: 400` when touching Order |
| POS page → coordinator further extract                                | **Polish**                                        | Documented CURRENT DEBT; not a gate blocker                       |
| Dual i18n catalog unification                                         | **Polish**                                        | Incremental; English fallback safe                                |
| OTel exporter/collector                                               | **Future**                                        | API foundation enough offline                                     |
| Legacy `tax_type`/`tax_rate` column cleanup                           | **Phase 3 work** (late)                           | Forced none/0; remove after consumer proof                        |
| Further `bills.ts` extract (generate/split/print)                     | **Polish**                                        | Tender already extracted                                          |
| Event bus for table/KDS side effects                                  | **Future**                                        | Soft-gates sufficient until remount                               |
| Package extraction / npm workspaces                                   | **Future**                                        | After contracts stabilize in production use                       |
| `db.ts` split                                                         | **Future**                                        | Monolith acceptable until extraction                              |
| Inventory ledger UI                                                   | **Phase 3 work** (optional product)               | Read API exists (2.12)                                            |
| Recipes/BOM, suppliers/PO                                             | **Future**                                        | Explicitly after ledger + pilots                                  |
| Microservices / K8s / Kafka / plugin frameworks                       | **Not worth**                                     | Violates platform mandate                                         |

**Pilot note:** North-star KPI (3 cafés × 30 days × zero critical failures) and P0/P1 reliability remain higher priority than platform Phase 3 until pilots prove reliability. Phase 3 is gated on explicit kickoff.

---

## 4. Phase 3 objective

Phase 2 proved **ownership, boundaries, orchestration, isolation, composability**.

Phase 3 turns that into a **practical platform**:

1. **Production safety** — disabled capabilities must not remain callable HTTP surfaces
2. **Composition control** — vertical/capability configuration is validated and enforceable
3. **Retail productionization** — first non-Restaurant product on the same Core
4. **Operational hardening** — residuals that threaten correctness (void×cancel, soft-gate holes, restart proofs)
5. **Extraction readiness** — only after the above, and only where coupling is actually blocking

Phase 3 is **not** another boundary-documentation exercise and **not** a rewrite.

---

## 5. Dependency order (evidence-based)

```
3.1 Fail-closed remount + startup composition validation
        ↓
3.2 Capability / vertical configuration contracts (still soft for UX gates)
        ↓
3.3 Production Retail vertical (VERTICALS + E2E + ops)
        ↓
3.4 Correctness residuals (void×cancel, notify aliases, held-orders gates, stock HTTP)
        ↓
3.5 Optional: Inventory UI, legacy tax cleanup, packages / additional verticals
```

Rationale: Production Retail without fail-closed remount would ship “Restaurant APIs still live.” Capability config without remount is metadata theatre. Correctness fixes can parallelize after 3.1 but must not block 3.1.

---

## 6. Phase 3 sub-phases

### Phase 3.1 — Fail-closed composition & route remount

|                  |                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**    | When a module is disabled for the active vertical, its HTTP surface is not mounted (or rejects closed). Startup validates registry integrity fail-closed. |
| **Why**          | Soft-gates alone leave tables/KDS/kitchen/addons routes live under retail composition.                                                                    |
| **Depends on**   | Existing `MODULE_CATALOG`, `getCompositionSnapshot`, soft-gates (2.17)                                                                                    |
| **Touch**        | `main/routes/index.ts`, `main/modules/*`, server bootstrap, focused remount tests                                                                         |
| **Tests**        | Mount matrix for restaurant vs retail-test composition; disabled module → 404/503; restaurant modules ON → identical UX                                   |
| **Acceptance**   | retail-test (or production Retail) cannot call restaurant APIs; restaurant unchanged when enabled                                                         |
| **Risks**        | Over-unmounting shared routes; breaking static export deep links                                                                                          |
| **NOT included** | Production Retail product; packages; event bus; frontend IA redesign                                                                                      |

### Phase 3.2 — Vertical / capability configuration

|                  |                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Objective**    | Documented, validated mechanism to select vertical/capabilities at deploy/start (env or settings), without tenant SaaS. |
| **Why**          | Today `ACTIVE_VERTICAL_ID` is compile-time constant; API ignores `?verticalId=`.                                        |
| **Depends on**   | 3.1 remount                                                                                                             |
| **Touch**        | `verticals.ts`, settings allowlist, composition API, ops docs                                                           |
| **Tests**        | Invalid config fail-closed; restaurant default preserved                                                                |
| **Acceptance**   | Explicit config chooses restaurant vs retail composition safely                                                         |
| **Risks**        | Accidental vertical flip in cafés                                                                                       |
| **NOT included** | Multi-tenant SaaS; marketplace; runtime hot-swap without restart                                                        |

### Phase 3.3 — Production Retail vertical

|                  |                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Objective**    | Promote a production Opervia Retail vertical (not `retail-test`) composing Core only; Retail smoke/E2E and operator docs. |
| **Why**          | Lego proof becomes a shippable second product.                                                                            |
| **Depends on**   | 3.1 + 3.2                                                                                                                 |
| **Touch**        | `VERTICALS`, Retail UX deltas (minimal), packaging/docs, E2E                                                              |
| **Tests**        | Extend `synthetic-retail-sale` patterns to production vertical; restaurant regression green                               |
| **Acceptance**   | Retail sale without Restaurant; Restaurant vertical still default for café pilots                                         |
| **Risks**        | Premature product split before café pilots                                                                                |
| **NOT included** | Grocery/Salon/Pharmacy; recipes/BOM; ERP inventory                                                                        |

### Phase 3.4 — Correctness & soft-gate residuals

|                  |                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Objective**    | Close known isolation/correctness holes without redesign.                                                                                                                      |
| **Why**          | Documented residuals from 2.14/2.17/2.18.                                                                                                                                      |
| **Depends on**   | Can parallel after 3.1; preferred before/alongside 3.3                                                                                                                         |
| **Items**        | Gate `notifyOrderUpdated`; held-orders `tables` gate; void×cancel restock fix (pinned tests updated carefully); stock-reject `statusCode` 400; optional restart/userdata proof |
| **NOT included** | POS page mega-extract; full i18n unification; OTel exporter                                                                                                                    |

### Phase 3.5 — Platform depth (optional / later)

|                  |                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objective**    | Inventory ledger UI; legacy tax column cleanup; further service extracts; package extraction only if extraction readiness + product need demand it. |
| **Depends on**   | Stable 3.1–3.4 + pilot evidence                                                                                                                     |
| **NOT included** | Microservices, Nest, Prisma, Redis, K8s, Kafka, Temporal, plugin frameworks without evidence                                                        |

---

## 7. Target platform model (unchanged mandate)

```
                 OPERVIA POS PLATFORM
                          │
                  Composition / Capabilities
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         RETAIL      RESTAURANT      FUTURE
            │             │             │
            └─────────────┴─────────────┘
                          │
                        CORE
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
        Product         Order          Payment
           │              │              │
           └──────── Tax / Inventory ────┘
```

Prefer: existing Core modules + small contracts + composition + configuration + vertical modules.  
Reject: microservices, unnecessary frameworks, giant rewrites.

---

## 8. Explicit non-goals for Phase 3 kickoff

- Implementing any Phase 3.x code in this closeout milestone
- Enabling production Retail without 3.1
- Package extraction as the first step
- Rewriting Order/Payment/Tax/Inventory for purity
- AI, aggregators, multi-tenant SaaS, multi-location (still frozen until pilots)

---

## 9. Recommended next engineering steps

1. **Commit** Phase 2 hardening + `synthetic-retail-sale` (if not already) under Phase 2 / docs commits — keep history linear; no force-push.
2. **Keep pilot P0/P1 focus** until KPI evidence allows platform Phase 3 kickoff.
3. When Phase 3 is explicitly kicked off: start **3.1 fail-closed remount** only.

---

## 10. Final statements

### **PHASE 2 CLOSED**

### **PHASE 3 GATE READY — DO NOT IMPLEMENT UNTIL EXPLICITLY TASKED**

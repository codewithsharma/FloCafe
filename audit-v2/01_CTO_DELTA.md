# CTO — Technical Delta Audit (v2)

**Re-audit date:** 2026-08-15
**Baseline:** `audit/01_CTO_AUDIT.md` (2026-08-14)
**Code evidence:** schema **v78**, package **3.0.5**, `main/db.ts` **6244** LOC

---

## 1. Previous Audit Summary (top 10 technical findings)

| #   | Finding                                                  | Previous severity             |
| --- | -------------------------------------------------------- | ----------------------------- |
| 1   | Monolithic `main/db.ts` (5169 LOC)                       | P1 / Critical maintainability |
| 2   | Fat `main/routes/orders.ts` (2520 LOC, 112 `any`s)       | P1 / Critical                 |
| 3   | Settings mega-component (6637 LOC)                       | P2 / High                     |
| 4   | High `any` density across `main/` (~700+)                | P2                            |
| 5   | Incomplete Zod on non-core routes                        | P2                            |
| 6   | CSP `'unsafe-inline'` + JWT in `localStorage`            | P1 security                   |
| 7   | Phase 3.4 residuals (void×cancel, soft-gate, stock HTTP) | P1                            |
| 8   | Drive `backup-now` without Master PIN                    | P1 (DRV-01)                   |
| 9   | `ACTIVE_VERTICAL_ID` missing from `.env.example`         | P1 ops                        |
| 10  | Brand/appId identity drift (Opervia / flo* / Nexora)     | P2                            |

---

## 2. Delta Assessment — Every Technical Finding

| Finding                                | Previous                 | Current                                                            | Status                       | Evidence                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main/db.ts` monolith                  | 5169 LOC, unsplit        | **6244 LOC**, still single file                                    | 🔴 REGRESSED                 | `wc -l main/db.ts` → 6244; no `main/db/` split; v76–v78 migrations appended                                                                                                                                  |
| `orders.ts` fat controller             | 2520 LOC                 | **2843 LOC**                                                       | 🔴 REGRESSED                 | `wc -l main/routes/orders.ts` → 2843                                                                                                                                                                         |
| Settings mega-page                     | 6637 LOC                 | **6654 LOC**                                                       | 🔴 REGRESSED                 | `frontend/src/app/(dashboard)/settings/page.tsx`                                                                                                                                                             |
| `any` density in `main/`               | ~700+                    | **~904** `\bany\b` hits; **349** `as any`; **489** `: any`         | 🔴 REGRESSED                 | `rg` counts over `main/**/*.ts`                                                                                                                                                                              |
| Zod coverage non-core                  | Partial (money OK)       | Same core set; inventory Zod deepened                              | 🔨 PARTIAL                   | `main/validation/`: auth, inventory, orders, payments, products, refunds, refund-restock — many routes still ad-hoc                                                                                          |
| CSP `unsafe-inline`                    | Present                  | **Still present**                                                  | ❌ STILL OPEN                | `main/middleware/http-observability.ts:36–37` `scriptSrc`/`styleSrc` `'unsafe-inline'`                                                                                                                       |
| JWT in `localStorage`                  | Pattern                  | **Still the pattern**                                              | ❌ STILL OPEN                | `frontend/src/store/auth.ts` `setItem('token',…)`; `frontend/src/lib/api.ts:24`                                                                                                                              |
| JWT secret storage                     | safeStorage              | **Still safeStorage** (good)                                       | ✅ FIXED (was already green) | `main/services/jwt-secret.ts` encrypt/decrypt via `safeStorage`                                                                                                                                              |
| Phase 3.4 residuals                    | Designed, open           | **COMPLETE**                                                       | ✅ FIXED                     | `docs/03-architecture/phase-3.4-correctness-residuals.md` Decision COMPLETE; `tests/order-void-cancel-stock.test.ts` expects stock **8**; `InventoryServiceError(400)` in `main/services/inventory.ts:87–91` |
| Drive backup-now w/o Master PIN        | Owner JWT only           | **Unchanged**                                                      | ❌ STILL OPEN                | `main/routes/settings.ts:837–839` `requireRole('owner')` only; no `requireMasterPin`                                                                                                                         |
| `ACTIVE_VERTICAL_ID` in `.env.example` | Missing                  | **Present** (commented)                                            | ✅ FIXED                     | `.env.example:22` `# ACTIVE_VERTICAL_ID=restaurant`                                                                                                                                                          |
| Schema version                         | v75                      | **v78**                                                            | ✅ FIXED (advanced)          | `main/db.ts` MIGRATIONS versions 76–78 (R2/R3/R4); 78 entries                                                                                                                                                |
| Test coverage                          | ~179 `*.test.ts`         | **~202–209** `*.test.ts`                                           | ✅ FIXED                     | New: `r1`–`r4`, `h1`–`h4`, inventory OS suites                                                                                                                                                               |
| Brand/appId drift                      | Opervia/flo*/Nexora AppX | ProductName **Operavia**; AppX still FloCafe; executable `flocafe` | 🔨 PARTIAL                   | `package.json` productName Operavia; appId `com.flo.desktop`; AppX `applicationId: FloCafe`; Nexora gone from package.json                                                                                   |
| Money REAL→cents                       | Docs-only P0.3           | Still docs-only                                                    | ❌ STILL OPEN                | `.ai/tasks.md` P0.3 unchecked                                                                                                                                                                                |
| P1.3 failure matrix                    | Open                     | Still open                                                         | ❌ STILL OPEN                | `.ai/tasks.md:74` unchecked                                                                                                                                                                                  |
| Soft module / retail accident          | Med risk                 | Mitigated by `.env.example` + ops docs; still possible             | 🔨 PARTIAL                   | `.env.example` + `ops-01-pilot-configuration.md`; runtime still honors `ACTIVE_VERTICAL_ID=retail`                                                                                                           |
| Electron sandbox Phase C               | Deferred                 | Deferred                                                           | ❌ STILL OPEN                | `.ai/tasks.md` P0.6 Phase C unchecked                                                                                                                                                                        |
| Cash drawer kick (tech gap)            | Missing                  | Implemented                                                        | ✅ FIXED                     | `POST /api/printers/kick-drawer`; `tests/cash-drawer-kick.test.ts`                                                                                                                                           |
| Service Worker offline illusion        | UI cache only            | Unchanged pattern                                                  | ❌ STILL OPEN                | `frontend/public/sw.js` 61 LOC; skips `/api`; network-first UI                                                                                                                                               |

---

## 3. New Technical Findings

| Finding                                                                                                      | Severity          | Evidence                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Schema advanced to v78 while living product docs still say **v75**                                           | P1 doc/tech drift | `feature-list.md` / `local-setup.md` headers v75; `main/db.ts` version 78                                                        |
| Fat-file **growth** concurrent with R-wave delivery                                                          | P1                | db +1075 LOC; orders +323 LOC in ~1 day of feature velocity                                                                      |
| R3 companion path residual: raw kitchen UPDATE vs `kitchen-status.ts`                                        | P2                | `.ai/risks.md` notes companion bump may diverge until fully wired                                                                |
| Uncommitted R4 inventory tree on working copy                                                                | P2 delivery risk  | git status: `?? main/services/inventory-count.ts`, `inventory-units.ts`, `tests/r4-inventory-os.test.ts`, dirty inventory routes |
| `any` count rose with new services rather than declining                                                     | P2                | ~904 vs prior ~700+                                                                                                              |
| New services are good extractions seams (`kitchen-status`, `tables`, `inventory-units`) but routes still fat | Mixed             | `main/services/kitchen-status.ts`, `tables.ts`, `inventory-count.ts` exist                                                       |

---

## 4. Technical Debt Register Delta

| Debt Item                       | Prev Severity | Current Status                                                | Change  |
| ------------------------------- | ------------- | ------------------------------------------------------------- | ------- |
| Monolithic `db.ts`              | P1            | Worse (6244 LOC)                                              | 🔴 Grew |
| Fat `orders.ts`                 | P1            | Worse (2843 LOC)                                              | 🔴 Grew |
| Settings mega-page              | P2            | Slightly worse (6654)                                         | 🔴 Grew |
| High `any` density              | P2            | Worse (~904)                                                  | 🔴 Grew |
| Money as REAL                   | P1            | Unchanged                                                     | ❌      |
| CSP + JWT localStorage          | P1            | Unchanged                                                     | ❌      |
| Phase 3.4 residuals             | P1            | **Closed**                                                    | ✅      |
| Incomplete Zod                  | P2            | Inventory Zod improved; rest same                             | 🔨      |
| Dual i18n catalogs              | P3            | Unchanged dual-catalog                                        | ❌      |
| Brand/appId drift               | P2            | Living brand Operavia; package IDs legacy                     | 🔨      |
| No cash drawer kick             | P2            | **Closed** (3.6F)                                             | ✅      |
| Doc truth drift                 | P1            | Major fix then **re-stale at v75 vs v78**                     | 🔨      |
| Void/refund restock policy gaps | P2            | Retail restock API exists (4.2); café void policy intentional | 🔨      |
| Extraction readiness Order LOW  | P3            | Still low; facade exists                                      | ❌      |
| Drive backup-now sans PIN       | P1            | Unchanged                                                     | ❌      |

---

## 5. CTO Score Update

| Dimension              | Previous Score | Current Score | Change | Reason                                                                                                     |
| ---------------------- | -------------- | ------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Technical Architecture | 8/10           | 8/10          | →      | Composition + new domain services (`kitchen-status`, `tables`, inventory units) offset by larger monoliths |
| Code Quality           | 6/10           | 5/10          | ↓      | Fat files and `any` density moved the wrong direction                                                      |
| Security               | 6/10           | 6/10          | →      | H3 RBAC / H1 tender guards help; CSP, JWT storage, Drive PIN, LAN cleartext unchanged                      |

---

## 6. CTO Delta Verdict

Technical **correctness** improved (Phase 3.4 closed; schema v78; R1–R4 / H1–H4 suites). Technical **maintainability** got worse: the three god-files the first audit named all grew, and `any` density rose. Security posture is essentially flat — the same XSS→JWT and Drive-exfil residuals remain. The most important thing **not** fixed is still the combination of **CSP `'unsafe-inline'` + JWT in `localStorage`**, with Drive `backup-now` still owner-JWT-only.

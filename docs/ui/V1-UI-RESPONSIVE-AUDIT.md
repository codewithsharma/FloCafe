# V1 UI/UX + Responsive Audit

**Track:** `V1-UI-RESPONSIVE`  
**Date:** 2026-08-21  
**Product:** Operavia Restaurant POS (repo legacy: FloCafe)  
**Scope:** `frontend/` only — audit & plan; **no redesign implementation in this phase**  
**Baseline:** package `3.0.5` · schema tip **v89** · ROPS-RWASTE v1 closed  
**Related:** [`docs/audit/FRONTEND-AUDIT.md`](../audit/FRONTEND-AUDIT.md) (architecture/maintainability, 2026-08-21)

> **Verdict:** The frontend already has a usable Flo + shadcn design layer and a deliberate POS shell. It is **not** starting from zero. Commercial V1 risk is **uneven responsive coverage**, **god-pages** (especially Settings), **inconsistent primitives** (raw tables/inputs vs shadcn), and **touch/a11y gaps** on secondary POS controls — not a missing brand palette. Prefer **incremental hardening** over a rewrite.

---

## 1. Executive Summary

Operavia’s renderer is Next.js 16 App Router (static export for Electron), React 19, Tailwind v4, shadcn New York, Flo CSS tokens in `globals.css`, and Zustand for client state. There are **36** `page.tsx` routes. Navigation SoT is `frontend/src/config/navigation.ts`. Full-bleed operational surfaces (`/pos`, `/kds`) already opt out of chrome padding via `AppShell`.

**What works**

- Flo brand/surface/semantic tokens mapped into shadcn CSS variables
- Flo chrome: `AppShell`, `Sidebar`, `PageHeader`, `Panel`, `EmptyState`, `LoadingState`
- POS layout contract: `PosWorkspace` + `ProductGrid` + `CartPanel` with intentional `min-h-11` / `min-h-12` touch targets on primary controls
- Playwright layout integrity exists for POS grid (`frontend/e2e/layout-integrity.spec.ts`)

**What blocks a polished Commercial V1 UI**

1. **Responsive strategy is incomplete** — breakpoint usage is moderate/uneven; cart is fixed `w-[320px]`; many admin tables rely on `overflow-x-auto`
2. **Settings is a maintainability and UI density bomb** (~6.6k lines) — R4.1 already forbids growing it without extraction
3. **Dual UI dialects** — POS hand-rolls inputs; admin uses raw `<table>`; shadcn `Table`/`Input`/`Card` underused
4. **Touch regressions on secondary POS controls** — e.g. `AddonModal` `w-6 h-6` steppers
5. **Customer-facing / kiosk** (`/qr`, future kiosk) are **not** production-grade responsive tracks yet — Phase 5 later
6. **Dual i18n catalogs** (legacy flat JSON + partial i18next) — drift risk during UI copy work

**Recommended posture:** Harden foundations → shell → POS → ops/admin → customer-facing → QA. Do **not** replace shadcn or rewrite App Router.

---

## 2. Current Frontend Architecture

### 2.1 Stack (verified)

| Concern          | Choice                                                 | Path / evidence                                                                     |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Framework        | Next.js **16.2** App Router, React **19**              | `frontend/package.json`                                                             |
| Desktop delivery | Static export when `NEXT_BUILD_MODE=desktop`           | `frontend/next.config.ts` (`output: "export"`, `trailingSlash`, unoptimized images) |
| Styling          | Tailwind **v4** (CSS-first; **no** `tailwind.config`)  | `frontend/src/app/globals.css`                                                      |
| Components       | shadcn **new-york** + Flo wrappers                     | `frontend/components.json`, `components/ui/*`, `components/flo/*`                   |
| Client state     | Zustand: `auth`, `cart`, `held-orders`, `pos-settings` | `frontend/src/store/`                                                               |
| Server state     | TanStack Query present but **almost unused** (≈1 hook) | `QueryProvider` + `usePlatformComposition`                                          |
| HTTP             | Central axios `api`                                    | `frontend/src/lib/api.ts`                                                           |
| Nav SoT          | `FLO_NAV_ITEMS`                                        | `frontend/src/config/navigation.ts`                                                 |
| i18n             | Dual: legacy `useI18n` + partial i18next               | `lib/i18n.ts`, `lib/i18n/i18next.ts`, `locales/`                                    |

### 2.2 Layout model

| Layout            | Path                               | Role                                              |
| ----------------- | ---------------------------------- | ------------------------------------------------- |
| Root              | `app/layout.tsx`                   | Geist fonts, `AppProviders`, `AuthGuard`, toaster |
| Dashboard         | `app/(dashboard)/layout.tsx`       | Second `AuthGuard` + `AppShell`                   |
| Auth pages        | no group layout                    | Pages use `AuthShell`                             |
| KDS standalone    | `app/kds-standalone/layout.tsx`    | Separate Inter shell (kitchen device)             |
| Server standalone | `app/server-standalone/layout.tsx` | Waiter/tableside device shell                     |

`AppShell` (`components/flo/AppShell.tsx`): sidebar + context header; **`isFullBleed`** for `/pos` and `/kds`.

### 2.3 Directory map (high level)

```
frontend/src/
  app/                 # routes (36 page.tsx)
  components/
    ui/                # shadcn primitives (~17)
    flo/               # product chrome + PosWorkspace
    pos/               # POS domain UI (14 files)
    products|tables|orders|settings|kds|…
  config/navigation.ts
  store/ hooks/ lib/
```

### 2.4 Architecture risks (UI-relevant)

| Risk                         | Evidence                             | Impact on V1-UI                                          |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------- |
| Settings god-page            | ~6656 LOC, 111 `useState`            | Any responsive pass here is high-cost without extraction |
| Orders page size + custom WS | ~1367 LOC; hand-rolled `/kds` socket | Hard to restyle safely; diverges from `useKdsConnection` |
| Reports page size            | ~1885 LOC                            | Dense report panels need consistent table/filter chrome  |
| POS page size                | ~1265 LOC                            | Layout OK; modal sprawl is the main UX debt              |
| TanStack underuse            | Nearly only composition hook         | Not a UI blocker; don’t force Query rewrite for V1-UI    |
| Double AuthGuard             | Root + dashboard                     | Complexity; not a visual bug                             |

---

## 3. Screen Inventory

**36 routes.** Payment and refunds are **modals** on `/pos` and `/orders` (no dedicated routes). Shifts live under `/operations` + Settings → Shifts.

| Priority | Screen                                           | Route                           | Current State              | Major Problems                             | Recommended Direction                             |
| -------- | ------------------------------------------------ | ------------------------------- | -------------------------- | ------------------------------------------ | ------------------------------------------------- |
| P0       | Login                                            | `/auth/login`                   | AuthShell; role landing    | Verify narrow + touch                      | Keep AuthShell; tighten spacing tokens            |
| P0       | First-run setup                                  | `/setup`                        | Wizard                     | Long forms on small heights                | Scroll sections; sticky primary CTA               |
| P0       | Recovery                                         | `/recovery`                     | Critical path              | Must stay usable on laptop                 | Clarity > chrome                                  |
| P0       | POS                                              | `/pos`                          | Full-bleed; `PosWorkspace` | Fixed 320px cart; Addon steppers; FAB a11y | Phase 3 focus                                     |
| P0       | Tables / floor                                   | `/tables`                       | Grid + actions             | Compact cards; dense on narrow             | Fluid grid; touch targets                         |
| P0       | Orders / bills                                   | `/orders`                       | Board + payment/refunds    | Large page; overflow risk; dual density    | Standardize panels/tables/modals                  |
| P0       | KDS (in-app)                                     | `/kds`                          | Full-bleed board           | Device-scale typography                    | Touch-first board density                         |
| P0       | KDS standalone                                   | `/kds-standalone`               | Separate layout            | Font/shell ≠ Flo app                       | Align tokens without breaking kitchen readability |
| P0       | Server standalone                                | `/server-standalone`            | Waiter tablet path         | Must feel POS-speed                        | Phase 3/5 sibling to POS                          |
| P0       | Products hub                                     | `/products`                     | Tables + stock adjust      | Raw tables + `overflow-x-auto`             | DataTable primitive                               |
| P0       | Operations / day close / shifts                  | `/operations`                   | Cards + history            | Density for managers                       | Panel spacing consistency                         |
| P0       | Reports                                          | `/reports`                      | Many panels                | Horizontal scroll; filter chrome           | Shared report shell                               |
| P0       | Owner dashboard                                  | `/dashboard`                    | Metrics + attention        | Fine on laptop; verify 1280                | MetricCard grid rules                             |
| P1       | Customers                                        | `/customers`                    | List                       | Table scroll                               | DataTable                                         |
| P1       | Customer detail                                  | `/customers/detail`             | Query `?id=`               | Long page                                  | Section stack                                     |
| P1       | Low stock / counts / movements / purchasing      | `/products/*`                   | Ops hubs                   | Mixed forms/tables                         | Shared inventory page chrome                      |
| P1       | Recipes (+ waste)                                | `/products/recipes`             | Forms + panels             | Admin density OK                           | Align with PageHeader/Panel                       |
| P1       | Expenses / audit / staff                         | `/expenses`, `/audit`, `/staff` | List UIs                   | Table consistency                          | DataTable + filters                               |
| P1       | Settings                                         | `/settings`                     | Mega tabs + sticky save    | God-component; bottom bar overlap risk     | **Extract before deep UI polish**                 |
| P1       | Support                                          | `/support`                      | Waiter/chef landing        | Must be clear & fast                       | Simple layout OK                                  |
| P1       | Register / recover                               | `/auth/*`                       | Auth                       | Occasional                                 | AuthShell parity                                  |
| P2       | Valuation / recipe consumptions / staff detail   | nested routes                   | Supporting                 | Secondary                                  | Token pass only                                   |
| P2       | WhatsApp                                         | `/whatsapp`                     | Optional module            | Mixed density                              | Don’t block V1 POS                                |
| P2       | QR guest order                                   | `/qr`                           | Public guest               | Sticky footer; mobile-first incomplete     | **Phase 5** (customer-facing)                     |
| P3       | Print test / order-history demo / addon redirect | diagnostic                      | Dev                        | Out of Commercial V1 polish                | Ignore or freeze                                  |

---

## 4. Responsive Assessment

### 4.1 Current behavior

- Tailwind default breakpoints only (`sm`/`md`/`lg`/`xl`/`2xl`); **no custom breakpoints**
- Prefix usage uneven (~`sm` heavy, `lg+` sparse)
- POS: **`md+` two-column** (products + cart); **`<md` drawer cart** + FAB
- Admin: often single column with occasional `md:` grids; tables scroll horizontally

### 4.2 Recommended viewport / layout strategy

Do **not** design by marketing device names. Use **content constraints**:

| Class                   | Approx. width                  | Primary surfaces                        | Layout rule                                                                                                      |
| ----------------------- | ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **A — Compact ops**     | ~1280px                        | POS, tables, orders, KDS                | Full-bleed ops; cart **fluid** `min/max` not fixed 320; no accidental page-level horizontal scroll               |
| **B — Standard laptop** | ~1440px                        | All                                     | Comfortable AppShell + content max for reading pages; POS still dense                                            |
| **C — Large / desktop** | ~1600px+                       | Admin + POS                             | Cap content width for reports/settings text; allow POS product grid to use space; avoid sparse “stretched” forms |
| **D — POS / touch**     | High density, often tablet-ish | `/pos`, `/tables`, `/server-standalone` | Min touch **44×44**; primary CTAs ≥ `min-h-11`/`12`; avoid hover-only                                            |
| **E — Kiosk (future)**  | Touch-first, larger type       | Future                                  | Deferred Phase 5; larger targets + simplified chrome                                                             |
| **F — QR / mobile**     | Narrow                         | `/qr`                                   | Single column; sticky pay/order CTA; Phase 5                                                                     |

**Component rules**

| Pattern               | Behavior                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| AppShell sidebar      | Collapsible / sheet on narrow (already shadcn sidebar-capable)                                              |
| POS cart              | `md+`: `clamp(280px, 28vw, 380px)` (or similar) — replace hard `w-[320px]`                                  |
| Product / floor grids | CSS grid with `minmax`; never fixed column count that clips                                                 |
| Tables                | Prefer wrap / priority columns / card list `<md`; else contained `overflow-x-auto` with sticky first column |
| Dialogs               | `max-h-[90vh]` + internal scroll; full-width on narrow                                                      |
| Fixed bars            | Settings save bar / QR footer — reserve bottom padding so content isn’t covered                             |

**What should stay fixed**

- Touch minimums on POS primary actions
- Full-bleed for `/pos` and `/kds`
- Numeric tabular alignment for money (`text-numeric*` utilities already exist)

---

## 5. Design System Assessment

### 5.1 Current state (real tokens)

Canonical file: `frontend/src/app/globals.css`.

**Present**

- Brand ramp (partial): `--flo-brand-50/100/500/600/700/900`
- Surfaces / text / borders / sidebar
- Semantic success/warning/danger/info (+ subtle)
- Radius scale `--flo-radius-*`
- Shadows / motion vars (underused in `@theme`)
- shadcn bridge (`--primary`, `--background`, …)
- Typography **utilities**: `text-display` … `text-caption`, `text-numeric*`
- Fonts: Geist sans/mono via Next

**Missing / weak for V1**

- No `--flo-space-*` spacing scale (ad-hoc `p-3 md:p-4`)
- No named touch-target token (POS hardcodes `min-h-11`)
- Incomplete brand intermediate stops (not blocking)
- `--flo-text-muted` (#A8A29E) contrast risk on light surfaces
- Flo shadows not fully exposed as theme utilities

**Primitives**

| Prefer                                                                  | Avoid inventing                              |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| Flo `Panel`, `PageHeader`, `EmptyState`, `LoadingState`, `MoneyDisplay` | New card framework                           |
| shadcn `Button`, `Dialog`, `Sheet`, `Drawer`, `Input`, `Select`, `Tabs` | Parallel button kits                         |
| One **DataTable** wrapper around shadcn `Table`                         | More raw `<table className="w-full">` copies |

### 5.2 Recommended minimal token additions (Phase 1 foundations)

Keep small:

```text
--flo-space-1…6          # 4/8/12/16/24/32 (map to Tailwind usage guidance)
--flo-touch-min: 2.75rem # 44px
--flo-page-pad-x / y
--flo-pos-cart-min / max
```

Document **density modes**:

- **Ops density** — POS, KDS, tables, orders
- **Admin density** — settings, reports, CRM (more whitespace)

Do **not** build a marketing design system.

---

## 6. Shared Component Assessment

### 6.1 Standardize (high value)

| Component                   | Why                  | Location today                                          |
| --------------------------- | -------------------- | ------------------------------------------------------- |
| `PosWorkspace` cart width   | Responsive POS core  | `components/flo/pos/PosWorkspace.tsx`                   |
| `ProductGrid` / `CartPanel` | Order speed + touch  | `components/pos/`                                       |
| `AddonModal` steppers       | Touch P1 gap         | `components/pos/AddonModal.tsx`                         |
| Payment / Prepaid modals    | Duplication → drift  | `PaymentModal.tsx`, `PrepaidCheckoutModal.tsx`          |
| Admin DataTable             | Many raw tables      | `ProductsTable`, `CustomersTable`, `CategoriesTable`, … |
| Page chrome                 | Consistency          | `PageHeader` + `Panel` (+ optional filter bar)          |
| Form field                  | POS bypasses `Input` | Prefer `ui/input` or FloField wrapper                   |

### 6.2 Do **not** over-abstract

- KDS ticket cards (domain-specific)
- Tax configuration internals (extract for maintainability, not for “design system glory”)
- One-off diagnostic pages (`/print-test`)

### 6.3 Shell

- Keep `AppShell` + `FLO_NAV_ITEMS`
- Align standalone shells’ **tokens** with Flo (fonts/colors) without forcing sidebar chrome onto kitchen devices

---

## 7. POS UX Assessment

### 7.1 Cashier workflow (primary)

Typical path: open `/pos` → search/category → tap product → addons → cart qty → customer/table → place / pay.

**Strengths (code-evident)**

- Product cards `min-h-[88px]`; categories/search `min-h-11`
- Cart primary actions often `min-h-11` / place order `min-h-12`
- Layout integrity E2E asserts no horizontal grid overflow and ≥44×44 cards

**Friction / risk**

| Issue                              | Impact                                             |
| ---------------------------------- | -------------------------------------------------- |
| Fixed 320px cart on mid widths     | Product grid feels squeezed on ~768–1100px tablets |
| `AddonModal` 24px steppers         | Slow / error-prone on touch                        |
| SplitCheck small steppers on `sm+` | Accidental mis-taps                                |
| Payment vs prepaid twin UIs        | Inconsistent discount/payment affordances          |
| Category chip horizontal scroll    | Categories easy to miss without affordance         |
| Mobile FAB `aria-label` mismatch   | Opens cart but labeled place-order                 |
| Cart qty ± missing `aria-label`    | A11y + assistive tech                              |

**Principle for Phase 3:** Optimize for **tap count and recoverability**, not visual minimalism. Never hide Place Order / Pay behind nested menus on POS.

### 7.2 Adjacent ops

- **Tables:** floor selection must remain glanceable; merge/QR/assign are secondary
- **Orders:** payment/refund/void must keep confirmation discipline (already PIN-sensitive backend) with clear modal hierarchy
- **KDS:** large status targets > decorative chrome

---

## 8. Touch / Accessibility Assessment

| Area                   | Status       | Notes                                              |
| ---------------------- | ------------ | -------------------------------------------------- |
| Primary POS targets    | Mostly good  | `min-h-11` / `12` pattern                          |
| Secondary POS controls | Weak         | Addon `w-6 h-6`; some `size="sm"` without override |
| Focus rings            | Mixed        | shadcn `focus-visible`; POS often `focus:`         |
| Labels on icon buttons | Incomplete   | Cart/Addon steppers                                |
| Contrast               | Watch        | `--flo-text-muted` on light bg                     |
| Dialogs                | Generally OK | Radix Dialog; ensure scroll lock + max height      |
| Keyboard               | Partial      | Admin better via shadcn; POS is touch-first        |

**POS/kiosk priority:** comfortable touch first; keyboard second. Admin pages: keyboard + focus completeness.

---

## 9. UI Issue Register

| ID     | Screen             | Issue                                           | Severity | Impact                                   | Recommended Fix                                              |
| ------ | ------------------ | ----------------------------------------------- | -------- | ---------------------------------------- | ------------------------------------------------------------ |
| UI-001 | POS                | Cart fixed `w-[320px]`                          | P1       | Squeezes product grid on compact tablets | Fluid `min/max` width in `PosWorkspace`                      |
| UI-002 | POS AddonModal     | Qty steppers `w-6 h-6` (24px)                   | P1       | Hard to tap; slows modifiers             | `min-h-11 min-w-11` + labels                                 |
| UI-003 | POS CartPanel      | Qty ± lack `aria-label`                         | P1       | A11y failure                             | Label increase/decrease                                      |
| UI-004 | POS AddonModal     | ± lack `aria-label`                             | P1       | A11y failure                             | Same                                                         |
| UI-005 | POS                | FAB aria-label says place order, opens cart     | P2       | Confusing AT / QA                        | Fix label to cart                                            |
| UI-006 | POS                | Drawer cart nested max-heights                  | P2       | Awkward scroll on phones                 | Single scroll owner                                          |
| UI-007 | POS ProductGrid    | Category chips overflow-x without cue           | P2       | Missed categories                        | Fade/edge affordance                                         |
| UI-008 | POS                | PaymentModal ≈ PrepaidCheckoutModal duplication | P2       | Visual/UX drift                          | Shared payment shell                                         |
| UI-009 | POS CustomerSearch | Fixed `w-48` / mixed heights                    | P2       | Topbar cramped                           | Flex grow + touch height                                     |
| UI-010 | SplitCheck         | `size-7` steppers on desktop                    | P2       | Touch regression                         | Always ≥44px                                                 |
| UI-011 | Admin tables       | Raw `<table>` + `overflow-x-auto`               | P2       | Phone/tablet admin pain                  | DataTable + column priority                                  |
| UI-012 | Global             | POS bypasses `ui/input`                         | P2       | Inconsistent focus/spacing               | FloField / Input adoption                                    |
| UI-013 | Settings           | ~6.6k LOC god-page                              | P1*      | Blocks safe UI hardening                 | Extract tabs **before** deep polish (*maintainability; R4.1) |
| UI-014 | Orders             | Large page + custom WS                          | P2       | Risky restyles                           | Reuse `useKdsConnection` when touching                       |
| UI-015 | Global             | Dual i18n catalogs                              | P2       | Copy drift during UI work                | Prefer one path for new strings                              |
| UI-016 | Global             | `--flo-text-muted` contrast                     | P3       | Captions hard to read                    | Darken muted or limit usage                                  |
| UI-017 | Global             | No spacing/touch tokens                         | P3       | Inconsistent padding                     | Minimal token add (Phase 1)                                  |
| UI-018 | KDS standalone     | Different font shell (Inter)                    | P3       | Brand inconsistency                      | Align token fonts carefully                                  |
| UI-019 | QR                 | Customer mobile polish incomplete               | P2       | Guest UX                                 | Phase 5 only                                                 |
| UI-020 | Reports            | Dense multi-panel + exports                     | P2       | Horizontal scroll / clutter              | Shared report filter + table chrome                          |

No **static-code P0 layout breaker** found beyond operational risk of touch targets (UI-002). Runtime overlap bugs may still appear in QA — capture in Phase 6.

---

## 10. Recommended Implementation Order

### Phase 1 — Foundations (tokens + primitives)

- Document density modes (ops vs admin)
- Add minimal spacing/touch/cart tokens in `globals.css`
- FloField / standardize Button size guidance for ops
- Introduce `DataTable` wrapper (shadcn Table) — migrate 1–2 tables as proof
- **Do not** redesign screens yet

### Phase 2 — Application shell

- AppShell padding rules per route class (full-bleed vs padded)
- Sidebar behavior at 1280
- PageHeader + filter/action row pattern
- Sticky footer/save-bar collision rules (Settings)

### Phase 3 — POS (highest product leverage)

- Fluid cart width
- AddonModal + cart stepper touch/a11y
- FAB label + drawer scroll
- Payment/Prepaid consolidation (shell only; no payment logic change)
- Extend Playwright layout checks to 1280 / 1440 viewports

### Phase 4 — Operations / admin

- Tables floor grid
- Orders board chrome
- Products / inventory hubs → DataTable
- Reports shell
- Settings: **extract domains first** (R4.1), then light responsive pass per tab

### Phase 5 — Customer-facing UI

- `/qr` mobile layout hardening
- Kiosk prep (targets, simplified chrome) — **no full kiosk product build unless authorized**
- Align standalone shells’ tokens

### Phase 6 — Responsive QA

- Checklist per viewport class A–F
- Touch device pass on POS/tables/KDS
- No horizontal scroll on P0 pages (except intentional chip/table regions)
- Visual regression notes (manual or Playwright screenshots)

---

## 11. V1 UI Acceptance Criteria

### 1280px (Class A)

- [ ] `/pos`: product grid usable; cart visible on `md+` without crushing cards below ~88px height
- [ ] No page-level horizontal scrollbar on `/pos`, `/tables`, `/orders`, `/kds`
- [ ] Primary POS CTAs remain ≥ 44px tall
- [ ] Dialogs fit viewport with internal scroll

### 1440px (Class B)

- [ ] AppShell + content comfortable; reports readable
- [ ] POS uses extra width for products without sparse empty voids in cart

### 1600px+ (Class C)

- [ ] Admin content has sensible max width for forms/text (not 100% stretched labels)
- [ ] POS grid continues to densify usefully
- [ ] No giant empty margins that look “broken”

### POS / touch (Class D)

- [ ] All primary and modifier steppers ≥ 44×44
- [ ] Icon-only controls labeled
- [ ] Accidental double-submit mitigated (busy/disabled already common — keep)
- [ ] Layout integrity E2E green at target viewports

### Kiosk (Class E) — future gate

- [ ] Defined later with authorized kiosk slice
- [ ] Until then: do not block Commercial V1 on kiosk chrome

### Mobile QR (Class F)

- [ ] Single column; sticky primary action not covering content
- [ ] Tap targets ≥ 44px on order/add flows
- [ ] Tracked under Phase 5 — not a Phase 3 exit criterion

---

## 12. Risks

| Risk                                       | Mitigation                                               |
| ------------------------------------------ | -------------------------------------------------------- |
| Rewriting frontend “for V1”                | Forbidden — incremental only                             |
| Polishing Settings without extraction      | Violates R4.1; extract first                             |
| Slowing cashiers with prettier UI          | POS Phase 3 must measure tap paths                       |
| Token sprawl                               | Keep additions minimal (space/touch/cart)                |
| Breaking Electron static export            | Avoid SSR-only APIs; keep `NEXT_BUILD_MODE=desktop`      |
| Dual i18n                                  | New UI strings: pick one catalog and stick to it         |
| Scope creep into QR Menu / Kiosk product   | Phase 5 polish only; no new product tracks               |
| Uncommitted ROPS-RWASTE FE idempotency fix | Close separately before remote push of restaurant branch |

---

## 13. Recommended Next Implementation Task

**Task ID:** `V1-UI-P1-FOUNDATIONS`  
**Title:** Establish V1 UI foundations (tokens + cart width contract + touch stepper fix on AddonModal)

**In scope**

1. Add minimal CSS tokens (`space`, `touch-min`, `pos-cart-min/max`) in `globals.css` + short comment block
2. Change `PosWorkspace` cart from fixed `w-[320px]` to tokenized min/max width
3. Fix `AddonModal` steppers to ≥44px + `aria-label`s (highest POS touch defect)
4. Fix cart qty ± `aria-label`s
5. Extend or add a focused Playwright viewport assertion for `/pos` at 1280 width (no page-level horizontal overflow)

**Out of scope**

- Settings extraction (schedule as follow-on under Phase 4 / R4.1)
- QR/kiosk product work
- Payment logic / API / schema changes
- Global redesign / replacing shadcn

**Exit:** POS at 1280 feels operable; AddonModal touch-safe; tokens documented for subsequent phases.

---

## Appendix A — Key file index

| Area           | Path                                               |
| -------------- | -------------------------------------------------- |
| Tokens         | `frontend/src/app/globals.css`                     |
| Shell          | `frontend/src/components/flo/AppShell.tsx`         |
| Nav            | `frontend/src/config/navigation.ts`                |
| POS shell      | `frontend/src/components/flo/pos/PosWorkspace.tsx` |
| POS page       | `frontend/src/app/(dashboard)/pos/page.tsx`        |
| POS components | `frontend/src/components/pos/*`                    |
| Prior FE audit | `docs/audit/FRONTEND-AUDIT.md`                     |
| Layout E2E     | `frontend/e2e/layout-integrity.spec.ts`            |

## Appendix B — Effort estimate (engineering hours)

Based on actual LOC and component surface (not aspirational):

| Phase             | Scope                                                    | Hours (eng)                             |
| ----------------- | -------------------------------------------------------- | --------------------------------------- |
| 1 Foundations     | Tokens + DataTable proof + Addon/cart a11y               | **16–24h**                              |
| 2 Shell           | AppShell/PageHeader patterns                             | **12–20h**                              |
| 3 POS             | Cart fluid, modals, drawers, E2E viewports               | **32–48h**                              |
| 4 Ops/admin       | Tables/orders/products/reports; Settings extract+pass    | **60–90h** (Settings extract dominates) |
| 5 Customer-facing | QR + standalone token align (+ kiosk prep if authorized) | **24–40h**                              |
| 6 QA              | Viewport matrix + touch pass + fixes                     | **16–24h**                              |
| **Total**         | Incremental V1-UI-RESPONSIVE                             | **≈160–250h**                           |

**First task only (`V1-UI-P1-FOUNDATIONS`):** **≈8–12h** including review and E2E.

---

_End of Phase 1 audit. Implementation starts only when `V1-UI-P1-FOUNDATIONS` (or an amended first task) is explicitly authorized._

# Flo POS — UI/UX Redesign Audit

**Date:** 2026-08-12  
**Branch:** `develop`  
**Scope:** Frontend only — visual system, information architecture, navigation, layouts, interactions  
**Constraint:** Business engine (API, services, DB, shift/reconciliation logic) is immutable

---

## Executive Summary

Flo POS is functionally complete through M5 (shift management + cash reconciliation). The frontend works but reflects an incremental build: monolithic pages, inconsistent UI primitives, entity-oriented navigation, and mixed design patterns. This audit maps the current state and defines a phased path to a **Restaurant Operating System** experience without touching backend contracts.

**Key findings:**

| Area | State | Redesign priority |
|------|-------|-------------------|
| Application shell | shadcn sidebar + status bar | **Replace** — new AppShell, ContextHeader |
| Navigation | Entity-based (Products, Staff, Settings) | **Restructure** — workflow-based IA |
| Design system | Partial shadcn + ad-hoc Tailwind | **Replace** — centralized Flo tokens |
| POS | Functional, 946 LOC page | **Redesign layout**, preserve checkout logic |
| Settings | 4,599 LOC monolith | **Split** into domain routes |
| Reports | Embedded in dashboard only | **Extract** to dedicated REPORTS hub |
| Operations | Scattered (dashboard, settings, status bar) | **Consolidate** under OPERATIONS |
| Inventory | Product checkbox only | **Defer** full inventory IA; redesign Products as MENU |

---

## 1. Current Architecture

### 1.1 Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 App Router (static export for Electron) |
| UI runtime | React 19 |
| Styling | Tailwind CSS v4 (CSS-first, no `tailwind.config.js`) |
| Components | shadcn/ui (new-york), 17 primitives installed |
| State | Zustand (4 stores) + page-local React state |
| HTTP | Axios (`frontend/src/lib/api.ts`) |
| i18n | Flat JSON keys (`en`, `es`, `pt`) — ~1,744 keys |
| Icons | lucide-react |
| Toasts | react-hot-toast |
| Fonts | Geist Sans/Mono (main app); Inter (KDS/server standalone) |

### 1.2 Directory Layout

```
frontend/src/
├── app/                    # Routes (App Router)
│   ├── (dashboard)/        # Main shell: sidebar + status bar
│   ├── auth/               # Login, register, recover
│   ├── setup/              # First-run wizard
│   ├── kds-standalone/     # Dedicated KDS device shell
│   └── server-standalone/  # Tableside ordering shell
├── components/
│   ├── ui/                 # shadcn primitives (17)
│   ├── layout/             # Sidebar, AuthGuard, StatusBar (6)
│   ├── pos/                # POS modals + grid (14)
│   ├── shifts/             # Shift modals + history (6)
│   ├── kds/                # Kitchen display (8)
│   ├── settings/           # Extracted settings panels (6)
│   ├── dashboard/          # DayCloseCard (1)
│   ├── orders/             # OrderHistoryGrid demo (1)
│   └── products/           # ImageUploader (1)
├── hooks/                  # 16 UI/data hooks
├── store/                  # auth, cart, pos-settings, held-orders
└── lib/                    # api, i18n, shifts, day-close, printer, types, money
```

### 1.3 Layout Hierarchy

```
app/layout.tsx
  ├── MenuActionHandler (Electron IPC)
  ├── AuthGuard
  └── Toaster

app/(dashboard)/layout.tsx
  ├── SidebarProvider + AppSidebar
  ├── SidebarInset (scrollable content)
  ├── GlobalNotifications (invalid-phone banner)
  ├── StatusBar (shift + Electron metrics)
  └── AuthGuard (duplicate wrap)

Exceptions:
  - POS/KDS: full-height, no GlobalNotifications
  - kds-standalone / server-standalone: own <html>, no sidebar
  - auth/*, setup: no dashboard chrome
```

### 1.4 State Management

| Store | Path | Persistence | Role |
|-------|------|-------------|------|
| `useAuthStore` | `store/auth.ts` | localStorage (`token`, `tenant`) | Auth, tenant selection |
| `useCartStore` | `store/cart.ts` | None | POS cart, order type, table, customer |
| `usePosSettingsStore` | `store/pos-settings.ts` | zustand/persist v3 | Language, printer prefs, feature flags |
| `useHeldOrdersStore` | `store/held-orders.ts` | None | Table held orders |
| `usePrinterStore` | `hooks/usePrinter.ts` | Persisted | Printer connection, print actions |

**No React Query/SWR.** Each page implements fetch/poll/error independently.

### 1.5 API Client Pattern

- Central Axios instance: `lib/api.ts`
- Base URL: `window.location.origin + '/api'`
- JWT from `localStorage.token`
- `X-Flo-Terminal-Id` on POS/shift routes via `lib/terminal-id.ts`
- 401 → logout + redirect (except KDS paths)
- Dedicated clients: `lib/shifts.ts`, `lib/day-close.ts`, standalone KDS/server axios instances

### 1.6 Auth & Access

| Path type | Routes |
|-----------|--------|
| Public | `/kds`, `/kds-standalone`, `/auth/*`, `/setup` |
| Protected | All other dashboard routes |
| Landing | `getLandingPage()` → `/pos` |
| Role-gated nav | Sidebar filters by role + `business_type` + feature flags |

Roles: `owner`, `manager`, `cashier`, `waiter`, `chef`

Feature flags (from backend → `pos-settings` store): `tablesRequired`, `kdsEnabled`, `whatsappEnabled`

### 1.7 i18n

- Hook: `useI18n()` → `t(key, params?)`
- Files: `lib/i18n/{en,es,pt}.json`
- Enum maps: `lib/i18n-enums.ts`
- Server sync: `/api/kds/info` for language defaults
- **All new UI strings must use i18n keys** — do not hardcode copy

### 1.8 CSS Architecture

- Single global file: `app/globals.css`
- shadcn semantic tokens in OKLCH + brand `#3248FF`
- Dark mode tokens defined (`.dark` variant) but **no toggle wired**
- `cn()` helper: `lib/utils.ts` (clsx + tailwind-merge)
- No CSS modules
- Mixed: shadcn components vs raw `bg-white rounded-2xl` modals

### 1.9 Responsive Behavior

| Breakpoint | Usage |
|------------|-------|
| 768px (`use-mobile.ts`) | Sidebar → Sheet on mobile |
| Tailwind `md` (768px) | POS cart sidebar vs drawer |
| Tailwind `lg` (1024px) | Dashboard grids, server standalone |

- Viewport: `userScalable: false` (kiosk behavior)
- POS: desktop fixed cart + mobile FAB/drawer
- No dedicated tablet breakpoint logic

### 1.10 Electron Coupling

Components that depend on `window.electronAPI`:

- `StatusBar` — server health, heap, port
- `MenuActionHandler` — backup/restore via IPC
- `UpdateBadge` / `useUpdateStatus` — app updates
- `usePrinter` — hardware printer

Redesign must preserve graceful degradation for web-only paths.

---

## 2. Screen Inventory

### 2.1 Route Map (21 pages)

| Route | File | Roles | Purpose | LOC (approx) |
|-------|------|-------|---------|--------------|
| `/` | `app/page.tsx` | — | Redirect → `/dashboard` | — |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | owner | Analytics, day close, top products/staff | ~536 |
| `/pos` | `(dashboard)/pos/page.tsx` | owner, manager, cashier | Primary selling surface | ~946 |
| `/orders` | `(dashboard)/orders/page.tsx` | owner, manager, cashier | Order ops, pay, void, print | ~1,689 |
| `/products` | `(dashboard)/products/page.tsx` | owner, manager | Menu admin, categories, addons | ~1,288 |
| `/tables` | `(dashboard)/tables/page.tsx` | owner, manager | Table floor plan (restaurant) | ~508 |
| `/customers` | `(dashboard)/customers/page.tsx` | owner, manager | CRM, wallet ledger | ~333 |
| `/staff` | `(dashboard)/staff/page.tsx` | owner, manager | Team CRUD, roles | ~317 |
| `/settings` | `(dashboard)/settings/page.tsx` | owner, manager | All back-office config | ~4,599 |
| `/whatsapp` | `(dashboard)/whatsapp/page.tsx` | owner, manager, cashier | WhatsApp connection + inbox | ~785 |
| `/support` | `(dashboard)/support/page.tsx` | all | Support ticket submission | — |
| `/kds` | `(dashboard)/kds/page.tsx` | owner, manager | In-app kitchen display | — |
| `/addon-groups` | `(dashboard)/addon-groups/page.tsx` | — | Orphan addon CRUD | ~353 |
| `/print-test` | `(dashboard)/print-test/page.tsx` | dev | Printer test harness | — |
| `/order-history-demo` | `(dashboard)/order-history-demo/page.tsx` | dev | Mock order history grid | — |
| `/auth/login` | `auth/login/page.tsx` | public | Login + tenant picker | — |
| `/auth/register` | `auth/register/page.tsx` | public | Account registration | — |
| `/auth/recover` | `auth/recover/page.tsx` | public | Password recovery | — |
| `/setup` | `setup/page.tsx` | public | First-run wizard | ~755 |
| `/kds-standalone` | `kds-standalone/page.tsx` | public | Dedicated KDS device | — |
| `/server-standalone` | `server-standalone/page.tsx` | public | Tableside ordering | ~408 |

### 2.2 Current Navigation (Sidebar)

Order in `Sidebar.tsx` → `ALL_NAV_ITEMS`:

1. POS → `/pos`
2. Dashboard → `/dashboard` (owner only)
3. Orders → `/orders`
4. WhatsApp → `/whatsapp` (if enabled)
5. Products → `/products`
6. Tables → `/tables` (restaurant + tables required)
7. KDS → `/settings?tab=kds` (**miswired** — not `/kds`)
8. Customers → `/customers`
9. Staff → `/staff`
10. Settings → `/settings`

Footer: Support, collapse, user identity, logout

### 2.3 Settings Sub-Screens (tabs in monolith)

| Tab | Content |
|-----|---------|
| `store` | Business profile, hours, tables required |
| `receipts-printers` | Printer hardware, templates |
| `payments` | PaymentMethodsSettings |
| `tax` | TaxConfigurationPanel |
| `pos` | Billing type, KOT toggles |
| `shifts` | Shift enable + ShiftHistoryPanel |
| `kds` | KDS config (not live KDS UI) |
| `server-app` | Tableside server config |
| `whatsapp` | WhatsAppEnableCard |
| `loyalty` | Cashback program |
| `discounts` | Discount limits |
| `mobile-access` | Mobile pairing |
| `data` | Backup, restore, master PIN, health |
| `orderflow` | Order workflow rules |
| `account` | Cloud account |
| `privacy` | Telemetry consent |
| `updates` | App update channel |
| `about` | Version / legal |

### 2.4 Proposed IA Mapping

| Proposed nav | Current source | Action |
|--------------|----------------|--------|
| **HOME** | `/dashboard` + `/pos` landing | Role-aware home: owners → command center; cashiers → POS |
| **POS** | `/pos` | Redesign layout; preserve checkout orchestration |
| **TABLES** | `/tables` | Redesign as operational floor workspace |
| **ORDERS** | `/orders` | Split views: Active / Held / Completed; reduce action density |
| **KITCHEN** | `/kds`, `/kds-standalone` | Fix nav link; promote to top-level |
| **INVENTORY** | Product `track_inventory` only | Phase 2+: stock health hub; Phase 1: rename Products → MENU |
| **CUSTOMERS** | `/customers` | Redesign; add wallet sub-view |
| **TEAM** | `/staff` | Rename; link to shift history |
| **REPORTS** | Dashboard analytics APIs | **New route** — extract from dashboard |
| **OPERATIONS** | Day close, shifts, WhatsApp ops | **New hub** — consolidate scattered ops |
| **SETTINGS** | `/settings` (trimmed) | Store config, printers, tax, account, privacy only |

**Items without IA bucket today:**

| Current | Proposed placement |
|---------|-------------------|
| `/support` | Settings → Help or footer utility |
| `/whatsapp` | Operations → Integrations (+ enable toggle in Settings) |
| `/addon-groups` | Merge → Products/Menu |
| `/print-test`, `/order-history-demo` | Dev-only; hide from production nav |

---

## 3. Component Inventory

### 3.1 By Domain (60 files under `components/`)

| Domain | Count | Key components |
|--------|-------|----------------|
| `ui/` | 17 | shadcn primitives |
| `pos/` | 14 | ProductGrid, CartPanel, PaymentModal, PrepaidCheckoutModal, AddonModal, CustomerSearch, TablePickerModal |
| `kds/` | 8 | KdsWorkspace, KdsKanbanBoard, KdsTabsView |
| `layout/` | 6 | Sidebar, AuthGuard, StatusBar, GlobalNotifications |
| `shifts/` | 6 | Open/Close/ForceClose modals, ShiftReconciliationPreviewStrip, ShiftHistoryPanel |
| `settings/` | 6 | TaxConfigurationPanel, PaymentMethodsSettings, MasterPinPrompt |
| `dashboard/` | 1 | DayCloseCard |
| `orders/` | 1 | OrderHistoryGrid (demo only) |
| `products/` | 1 | ImageUploader |

### 3.2 shadcn/ui Primitives

**Installed (17):** button, input, label, card, dialog, drawer, dropdown-menu, select, tabs, table, badge, avatar, separator, skeleton, sheet, tooltip, sidebar

**Heavily used:** Button, Dialog, Card, Tabs, Input, Label, Badge, Sidebar, Drawer

**Unused:** Select, Avatar

**Not installed:** Switch, Popover, Accordion, Alert, Command (search palette)

### 3.3 Page Monoliths (UI logic not extracted)

| Page | LOC | Extracted components |
|------|-----|---------------------|
| `settings/page.tsx` | ~4,599 | 6 settings panels + ShiftHistoryPanel |
| `orders/page.tsx` | ~1,689 | PaymentModal only |
| `products/page.tsx` | ~1,288 | ImageUploader, DietaryBadge |
| `pos/page.tsx` | ~946 | 12 POS components |
| `whatsapp/page.tsx` | ~785 | None (uses shadcn directly) |

### 3.4 Duplicated UI Patterns

| Pattern | Locations | Severity |
|---------|-----------|----------|
| Customer search/create | POS, Tables, Orders | High |
| Custom modal overlays vs shadcn Dialog | POS modals, orders/products/customers/staff pages | High |
| CRUD table + modal form | Products, Customers, Staff, Tables | Medium |
| Status color maps | tables, orders, staff, ProductGrid, DietaryBadge | Medium |
| WhatsApp admin | `/whatsapp` + Settings tab | Medium |
| Addon management | Products tab + `/addon-groups` | Medium |
| Support tickets | `/support` + POS print errors | Medium |
| Panel styling `bg-white rounded-xl border` | Settings, dashboard, many pages | Medium |

---

## 4. Current UX Problems

### 4.1 Structural

1. **God pages** — Settings (4.6k), Orders (1.7k), Products (1.3k), POS (946) LOC block consistent UX and testing
2. **Entity-oriented navigation** — Users think in workflows (close day, reconcile shift) not database tables
3. **No REPORTS or OPERATIONS hub** — Analytics and ops scattered across dashboard and settings
4. **Three app shells** — Main, KDS standalone, server standalone with different fonts and patterns
5. **Broken routes** — Electron menu → `/reports` (404); KDS nav → Settings tab not `/kds`

### 4.2 Visual / Interaction

6. **Inconsistent design system** — shadcn mixed with hand-built modals and raw HTML forms
7. **Brand drift** — Metadata "Nexora" vs FloCafe codebase; primary `#3248FF` only in sidebar tokens
8. **Information density without hierarchy** — Orders cards expose 10+ actions; dashboard mixes live + historical without clear cues
9. **StatusBar exposes dev telemetry** — Heap/port/uptime visible to restaurant staff
10. **Dark mode ready but unused** — Full token set exists; no toggle

### 4.3 Operational

11. **Shift/reconciliation buried** — Status bar pill + settings tab; not first-class in navigation
12. **Day close on dashboard** — Should live in Operations with guided workflow
13. **No inventory workflow** — Stock fields exist on products but no operational view
14. **History gap** — Completed orders lack dedicated view; demo exists but unwired
15. **Landing inconsistency** — `/` → dashboard; post-login → POS

### 4.4 Missing States

- Customers/Staff: loading UI discarded
- Many modals lack skeleton/error boundaries
- No unified offline/sync indicator (partial in StatusBar)
- Permission denied states inconsistent

---

## 5. Business Logic to Preserve (Do Not Modify)

These behaviors are embedded in UI and must survive redesign:

| Domain | Location | Critical behavior |
|--------|----------|-------------------|
| Prepaid/postpaid checkout | `pos/page.tsx` | Idempotency keys, discount PIN, order+bill sequencing |
| Shift gating | StatusBar + shift modals | `canManageShifts`, stale detection, force-close |
| Day close | DayCloseCard + `lib/day-close.ts` | Open-shift warnings, owner/manager only |
| Role-based nav | Sidebar | Role + business_type + feature flag filtering |
| Held orders | held-orders store + Orders | Table hold/resume → cart reload → POS |
| Payment/print | Orders + POS | Auto-print, KOT gating |
| Terminal ID | `lib/terminal-id.ts` | Header on shift/payment routes |
| KDS auth | `useKdsConnection` | Standalone vs dashboard API bases |
| WhatsApp share | Orders + `lib/whatsapp-share.ts` | Flo send vs native fallback |
| Barcode scan | `useBarcodeScanner` | SKU lookup |
| Master PIN | MenuActionHandler, settings | Backup/restore Electron flows |
| Tenant timezone | Dashboard date picker | Reports use tenant timezone |

**API contracts, stores, hooks, and lib clients are the integration boundary.** Redesign wraps them; does not rewrite them.

---

## 6. Components to Preserve

These are well-factored and should be wrapped by new UI, not reimplemented:

| Asset | Path |
|-------|------|
| Shift client | `lib/shifts.ts` |
| Day close client | `lib/day-close.ts` |
| Shift hook | `hooks/useShift.ts` |
| Shift modals + reconciliation strip | `components/shifts/*` |
| KDS workspace | `components/kds/*`, `useKdsConnection`, `useKdsView` |
| POS building blocks | ProductGrid, CartPanel, PaymentModal, PrepaidCheckoutModal, AddonModal |
| Printer stack | `hooks/usePrinter.ts`, `lib/printer/*` |
| Cart / held orders | `store/cart.ts`, `store/held-orders.ts` |
| POS settings sync | `store/pos-settings.ts` |
| Auth + landing | `components/layout/AuthGuard.tsx` |
| Day close card | `components/dashboard/DayCloseCard.tsx` |
| API + terminal | `lib/api.ts`, `lib/terminal-id.ts` |
| i18n/format | `useI18n`, `useFormatCurrency`, `useFormatDate` |
| Confirm pattern | `hooks/use-confirm.tsx` |
| Tax panel | `components/settings/TaxConfigurationPanel.tsx` |
| Payment methods | `components/settings/PaymentMethodsSettings.tsx` |

---

## 7. Components to Replace / Redesign

| Target | Why | Approach |
|--------|-----|----------|
| `AppSidebar` + dashboard layout | Entity nav, no context header | New AppShell, Sidebar, ContextHeader |
| `StatusBar` | Dev telemetry exposed; shift UX weak | Integrate shift into shell; hide dev metrics from operators |
| Custom modal overlays (POS, pages) | Inconsistent a11y, z-index, mobile | Migrate to shared Modal/Dialog primitive |
| Inline page modals (orders, products, etc.) | Duplication | Extract to domain components |
| Dashboard page layout | Generic analytics cards | Command center with attention-first hierarchy |
| POS page layout | Old grid + sidebar pattern | New product workspace + order panel structure |
| Tables page | Basic grid | Operational floor map with rich table states |
| Settings monolith | Unnavigable | Split into Settings + Operations routes |
| `OrderHistoryGrid` | Mock data only | Wire to real API or replace |
| Panel/card styling | Ad-hoc `bg-white rounded-xl` | Flo Panel/MetricCard primitives |

---

## 8. Redesign Strategy

### 8.1 Design Principles

1. **Workflow over entities** — Navigation follows what operators do, not DB tables
2. **Attention first** — Home and Operations surface what needs action now
3. **Calm density** — Information-rich without crowding; progressive disclosure for actions
4. **Original Flo language** — Not Toast/Square/Clover clone; deep indigo operational aesthetic
5. **Engine untouched** — UI is new cockpit; backend is engine
6. **Incremental migration** — One phase at a time; tests green after each phase

### 8.2 New Application Shell

```
┌─────────────────────────────────────────────────────┐
│ Sidebar │ Context Header (screen, actions, sync)   │
│         ├───────────────────────────────────────────┤
│ Logo    │                                           │
│ Location│           Main Workspace                  │
│ Terminal│                                           │
│ Nav     │                                           │
│ Shift   │                                           │
│ User    │                                           │
└─────────────────────────────────────────────────────┘
```

- Sidebar: compact, collapsible, icon mode — not oversized
- Context header: dynamic per route — search, date, shift status, sync
- Shift status: prominent in shell, not buried in footer bar

### 8.3 Shared Component System

Build primitives under `components/flo/` (or `components/system/`):

AppShell, Sidebar, ContextHeader, PageHeader, CommandBar, MetricCard, Stat, DataTable, FilterBar, SegmentedControl, StatusBadge, StatusDot, EmptyState, ErrorState, MoneyDisplay, VarianceIndicator, ShiftStatus, ReconciliationCard, QuickAction, Panel

All pages compose from these — no one-off page styles.

### 8.4 POS Redesign Direction

```
┌──────────────────────────────────────────────────────┐
│ Categories / Search / Favorites                      │
├──────────────────────────────┬───────────────────────┤
│ Product workspace            │ Current Order         │
│ (grid + modifiers)           │ Items, discounts      │
│                              │ Totals, actions       │
└──────────────────────────────┴───────────────────────┘
```

Preserve: ProductGrid logic, CartPanel, all modals, checkout orchestration in page/hooks.

Replace: layout structure, topbar, visual hierarchy, category navigation.

---

## 9. Migration Strategy (Phased)

| Phase | Deliverable | Risk |
|-------|-------------|------|
| **1** | Audit + design tokens (`flo-ui-design-system.md`, CSS tokens) | Low |
| **2** | Application shell (AppShell, Sidebar, ContextHeader) | Medium — touches all routes |
| **3** | Shared components (Panel, Modal, StatusBadge, MoneyDisplay, etc.) | Low |
| **4** | Dashboard → HOME command center | Medium |
| **5** | POS layout redesign | High — primary workflow |
| **6** | Tables operational workspace | Medium |
| **7** | Orders/Bills workspace | High — 1.7k LOC page |
| **8** | Products → MENU; inventory placeholders | Medium |
| **9** | Customers / TEAM | Low |
| **10** | REPORTS + OPERATIONS hubs (reports, shifts, day close) | Medium |
| **11** | Settings split + trim | High — 4.6k LOC |
| **12** | Responsive, a11y, performance pass | Medium |

**Per-phase checklist:**

- [ ] Run focused frontend tests
- [ ] `npm run lint`
- [ ] `npm run build:frontend`
- [ ] Manual smoke: POS checkout, shift open/close, day close
- [ ] No backend/API changes unless UI integration requires none

### 9.1 Route Migration (non-breaking)

New routes can be added alongside existing ones during transition:

- `/home` → new command center (eventually replace `/dashboard`)
- `/reports` → fix Electron menu 404
- `/operations` → shifts, day close, reconciliation, activity
- `/menu` → alias or rename of `/products` (i18n update)

Use feature flag or gradual nav cutover if needed.

### 9.2 Quick Wins (Phase 1–2)

- Fix KDS nav link: `/settings?tab=kds` → `/kds`
- Create `/reports` route (even stub → dashboard analytics)
- Role-aware `/` redirect
- Hide dev routes from production nav
- Unify brand metadata: Nexora → Flo POS
- Remove operator-visible heap/port from StatusBar

---

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking POS checkout during layout change | **Critical** | Extract orchestration to hooks first; test idempotency paths |
| Settings split breaks deep links | High | Maintain `?tab=` redirects during transition |
| i18n key explosion | Medium | Namespace new keys under `flo.*`; preserve existing keys |
| Electron menu routes stale | Medium | Update MenuActionHandler with new routes |
| Three shells diverge further | Medium | Shared Flo tokens across main, KDS, server standalone |
| Performance regression on POS | High | Avoid re-render churn; measure before memoization |
| Dark mode half-implemented | Low | Ship light-first; dark tokens ready in design system |
| Subagents invent different styles | High | **`flo-ui-design-system.md` is single source of truth** |
| Scope creep into backend | **Critical** | Code review gate: no changes to `main/services/*`, migrations |

---

## 11. Recommended Design System

See **`docs/15-project-management/flo-ui-design-system.md`** — the authoritative token and component specification for all UI work.

Summary:

- **Primary:** Deep indigo/violet (`#4F46E5` family) — operational, premium
- **Success:** Emerald — balanced variance, sync complete
- **Warning:** Amber — stale shift, open shifts at day close
- **Danger:** Red — short variance, errors
- **Neutral:** Cool slate backgrounds — soft, not pure white
- **Typography:** Geist (already loaded) + tabular nums for money
- **Radius:** Slightly tighter than current (0.5rem base) for density
- **Motion:** Subtle; no animation during payment flows

---

## 12. Verification Baseline (Pre-Redesign)

Before Phase 2 implementation, establish green baseline:

```sh
npm test
npm run build
npm run build:frontend
npm run lint
```

Record results in `ui-redesign-final-report.md` at project completion.

---

## 13. Next Steps

1. **Approve** this audit and `flo-ui-design-system.md`
2. **Phase 1 complete:** Add Flo CSS tokens to `globals.css` (alongside existing shadcn vars during transition)
3. **Phase 2:** Implement AppShell behind feature flag or parallel layout
4. **Fix quick wins:** KDS nav, `/reports` stub, brand metadata, StatusBar telemetry

---

*This document is the gate for UI implementation. No screen redesign should begin without referencing this audit and the Flo design system.*

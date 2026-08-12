# Flo POS Design System

**Version:** 1.0.0 (draft)  
**Date:** 2026-08-12  
**Status:** Source of truth for UI redesign — all agents and phases must follow this spec

---

## Purpose

Flo POS is a **Restaurant Operating System**, not a generic admin dashboard or a clone of incumbent POS vendors. This design system defines an original visual and interaction language that is:

- Modern, premium, calm, operational
- Information-dense without feeling crowded
- Touch-friendly (44px minimum targets) and keyboard-friendly
- Highly glanceable for fast-paced restaurant environments
- Compatible with existing shadcn/ui primitives and Tailwind CSS v4

**Rule:** All UI work references this document. Subagents must not invent alternate palettes, typography, or spacing scales.

---

## Design Philosophy

### What Flo POS should feel like

| Attribute | Expression |
|-----------|------------|
| Modern SaaS | Clean surfaces, purposeful whitespace, subtle elevation |
| Command center | Attention-first layouts, status at a glance |
| High-performance POS | Fast interactions, minimal animation in critical flows |
| Professional | Restrained color, strong numeric hierarchy |
| Original | Deep indigo identity — not Toast blue, not Square black |

### What to avoid

- Generic "dashboard template" aesthetics (20 stat cards, purple gradients everywhere)
- Excessive gradients and glassmorphism
- Oversized permanent sidebar
- Pure white `#FFFFFF` on every surface
- Competing visual hierarchies on one screen
- Animation during payment or shift close flows

---

## Color System

Colors communicate **state, hierarchy, interaction, and emphasis** — not decoration.

### Brand Palette

| Token | Light mode | Dark mode | Usage |
|-------|------------|-----------|-------|
| `--flo-brand-50` | `#EEF2FF` | `#1E1B4B` | Subtle brand backgrounds |
| `--flo-brand-100` | `#E0E7FF` | `#312E81` | Hover backgrounds, selected nav |
| `--flo-brand-500` | `#6366F1` | `#818CF8` | Primary actions, active nav |
| `--flo-brand-600` | `#4F46E5` | `#6366F1` | Primary hover, links |
| `--flo-brand-700` | `#4338CA` | `#4F46E5` | Primary pressed |
| `--flo-brand-900` | `#312E81` | `#E0E7FF` | Display text accents |

**Primary brand:** Deep indigo (`#4F46E5` / indigo-600). Replaces legacy `#3248FF` during migration.

### Semantic Colors

| Token | Value (light) | Usage |
|-------|---------------|-------|
| `--flo-success` | `#059669` (emerald-600) | Balanced cash, sync complete, available table |
| `--flo-success-subtle` | `#ECFDF5` | Success backgrounds |
| `--flo-warning` | `#D97706` (amber-600) | Stale shift, open shifts at day close, low stock |
| `--flo-warning-subtle` | `#FFFBEB` | Warning backgrounds |
| `--flo-danger` | `#DC2626` (red-600) | Short variance, errors, void |
| `--flo-danger-subtle` | `#FEF2F2` | Error backgrounds |
| `--flo-info` | `#0284C7` (sky-600) | Informational, in-progress |
| `--flo-info-subtle` | `#F0F9FF` | Info backgrounds |

### Neutral Palette (Cool Slate)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--flo-bg` | `#F8FAFC` (slate-50) | `#0F172A` (slate-900) | App background |
| `--flo-surface` | `#FFFFFF` | `#1E293B` (slate-800) | Cards, panels |
| `--flo-surface-raised` | `#FFFFFF` | `#334155` (slate-700) | Modals, popovers |
| `--flo-border` | `#E2E8F0` (slate-200) | `#334155` | Borders, dividers |
| `--flo-border-strong` | `#CBD5E1` (slate-300) | `#475569` | Emphasized borders |
| `--flo-text` | `#0F172A` (slate-900) | `#F8FAFC` | Primary text |
| `--flo-text-secondary` | `#64748B` (slate-500) | `#94A3B8` | Secondary text |
| `--flo-text-muted` | `#94A3B8` (slate-400) | `#64748B` | Captions, placeholders |

**Background principle:** Soft neutral app background with white/light raised surfaces — not pure white everywhere.

### shadcn Token Mapping

During migration, map Flo tokens to existing shadcn CSS variables:

```css
:root {
  /* Flo → shadcn bridge (light) */
  --primary: var(--flo-brand-600);
  --primary-foreground: #FFFFFF;
  --background: var(--flo-bg);
  --foreground: var(--flo-text);
  --card: var(--flo-surface);
  --card-foreground: var(--flo-text);
  --border: var(--flo-border);
  --muted: #F1F5F9;
  --muted-foreground: var(--flo-text-secondary);
  --destructive: var(--flo-danger);
  --sidebar-primary: var(--flo-brand-600);
  --sidebar-accent: var(--flo-brand-50);
  --sidebar-accent-foreground: var(--flo-brand-700);
}
```

Dark mode overrides follow the same mapping with dark column values.

### Operational Status Colors

Use consistently across tables, orders, shifts, sync:

| State | Color | Dot | Badge variant |
|-------|-------|-----|---------------|
| Available / Open / Online | `--flo-success` | ● | `success` |
| Occupied / Active / Syncing | `--flo-brand-500` | ● | `default` |
| Reserved / Pending | `--flo-info` | ● | `info` |
| Waiting / Stale | `--flo-warning` | ● | `warning` |
| Needs attention | `--flo-warning` | ● pulsating | `warning` |
| Payment pending | `--flo-brand-600` | ● | `default` |
| Error / Short / Offline | `--flo-danger` | ● | `destructive` |
| Closed / Completed / Cancelled | `--flo-text-muted` | ○ | `secondary` |

### Variance Semantics (Cash Reconciliation)

| Condition | Label pattern | Color |
|-----------|---------------|-------|
| Balanced (±$0.00) | "Balanced" | `--flo-success` |
| Over | "+$X.XX over" | `--flo-success` (neutral-positive) |
| Short | "-$X.XX short" | `--flo-danger` |
| Unknown (not counted) | "—" | `--flo-text-muted` |

---

## Typography

### Font Stack

```css
--font-sans: "Geist", system-ui, -apple-system, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;
--font-numeric: "Geist", tabular-nums, system-ui, sans-serif;
```

Geist is already loaded in the main app. KDS and server standalone should adopt Geist for consistency in Phase 12.

### Type Scale

| Token | Size | Weight | Line height | Usage |
|-------|------|--------|-------------|-------|
| `display` | 2rem (32px) | 600 | 1.2 | Command center headlines |
| `h1` | 1.5rem (24px) | 600 | 1.3 | Page titles |
| `h2` | 1.25rem (20px) | 600 | 1.35 | Section headers |
| `h3` | 1rem (16px) | 600 | 1.4 | Card titles, panel headers |
| `body` | 0.875rem (14px) | 400 | 1.5 | Default UI text |
| `body-lg` | 1rem (16px) | 400 | 1.5 | POS product names, primary content |
| `small` | 0.8125rem (13px) | 400 | 1.45 | Secondary labels |
| `caption` | 0.75rem (12px) | 500 | 1.4 | Timestamps, metadata |
| `numeric` | inherit | 600 | 1.2 | Money, quantities — **tabular-nums** |
| `numeric-lg` | 1.25rem (20px) | 700 | 1.1 | Order totals, variance amounts |
| `numeric-xl` | 1.5rem (24px) | 700 | 1.1 | POS grand total |

### Money Display Rules

1. Always use `font-variant-numeric: tabular-nums`
2. Currency symbol same size as amount or slightly smaller — never larger
3. Grand totals: `numeric-xl` + semibold/bold
4. Line items: `numeric` + regular weight
5. Variance: color per semantics above + prefix sign
6. Use `useFormatCurrency()` — never hardcode `$` or locale

### Tailwind Utilities (to add)

```
.text-display    → text-[2rem] font-semibold leading-tight
.text-h1         → text-2xl font-semibold
.text-h2         → text-xl font-semibold
.text-h3         → text-base font-semibold
.text-body       → text-sm
.text-body-lg    → text-base
.text-small      → text-[0.8125rem]
.text-caption    → text-xs font-medium
.text-numeric    → font-semibold tabular-nums
.text-numeric-lg → text-xl font-bold tabular-nums
.text-numeric-xl → text-2xl font-bold tabular-nums
```

---

## Spacing

Base unit: **4px**. Use Tailwind default scale.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight inline gaps |
| `space-2` | 8px | Icon-text gaps, badge padding |
| `space-3` | 12px | Compact card padding |
| `space-4` | 16px | Default card padding, form gaps |
| `space-5` | 20px | Section gaps |
| `space-6` | 24px | Panel padding (desktop) |
| `space-8` | 32px | Page section separation |
| `space-10` | 40px | Major layout gaps |

### Layout Constants

| Constant | Value | Usage |
|----------|-------|-------|
| Sidebar expanded | 240px | Primary nav |
| Sidebar collapsed | 56px | Icon-only mode |
| Context header height | 56px | Top bar |
| Status bar (legacy) | 32px | Deprecated — merge into shell |
| Content max-width | none | Full workspace width for POS/operations |
| Settings max-width | 1200px | Config pages |
| Touch target minimum | 44px | Buttons, nav items, table tiles |

---

## Radius

Slightly tighter than current (0.625rem) for operational density.

| Token | Value | Usage |
|-------|-------|-------|
| `--flo-radius-sm` | 0.375rem (6px) | Badges, small chips |
| `--flo-radius-md` | 0.5rem (8px) | Buttons, inputs |
| `--flo-radius-lg` | 0.75rem (12px) | Cards, panels |
| `--flo-radius-xl` | 1rem (16px) | Modals, large cards |
| `--flo-radius-full` | 9999px | Avatars, status dots |

---

## Shadows & Elevation

Restrained. Prefer borders over shadows for most surfaces.

| Token | Value | Usage |
|-------|-------|-------|
| `--flo-shadow-sm` | `0 1px 2px rgba(15,23,42,0.05)` | Subtle card lift |
| `--flo-shadow-md` | `0 4px 12px rgba(15,23,42,0.08)` | Dropdowns, popovers |
| `--flo-shadow-lg` | `0 8px 24px rgba(15,23,42,0.12)` | Modals, drawers |
| `--flo-shadow-none` | none | Flat panels (preferred default) |

**Default panel:** border `var(--flo-border)` + no shadow. Shadow only for floating elements.

---

## Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--flo-border-width` | 1px | Default |
| `--flo-border-width-strong` | 2px | Focus rings, selected states |
| `--flo-border-color` | `var(--flo-border)` | Standard |
| `--flo-border-color-strong` | `var(--flo-border-strong)` | Emphasized |
| `--flo-border-color-brand` | `var(--flo-brand-500)` | Active/selected |

---

## Motion

### Principles

- Subtle and functional
- **No animation** during payment, shift close, or day close confirmation
- Respect `prefers-reduced-motion`

### Durations

| Token | Value | Usage |
|-------|-------|-------|
| `--flo-duration-fast` | 100ms | Button feedback, toggle |
| `--flo-duration-normal` | 200ms | Drawer, dropdown |
| `--flo-duration-slow` | 300ms | Modal entrance |
| `--flo-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default easing |

### Allowed Animations

- Modal/drawer enter/exit (opacity + translateY 8px)
- Toast slide-in
- Status dot pulse (needs-attention only)
- Sidebar collapse width transition
- Skeleton shimmer (loading)

### Forbidden

- Page transition animations
- Bouncing elements
- Parallax
- Animated gradients
- Cart item fly-to animations (latency risk)

---

## Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| `base` | 0 | Default content |
| `sticky` | 10 | Context header, sticky filters |
| `dropdown` | 20 | Dropdowns, popovers |
| `overlay` | 30 | Modal backdrop |
| `modal` | 40 | Modal content |
| `toast` | 50 | Notifications |
| `tooltip` | 60 | Tooltips |

**Rule:** Never use ad-hoc `z-[70]`. Migrate existing overlays to this scale.

---

## Component States

Every interactive component supports:

| State | Visual treatment |
|-------|------------------|
| Default | Base border/background |
| Hover | Subtle background shift (`--flo-brand-50` or `--flo-bg`) |
| Focus | 2px ring `--flo-brand-500` offset 2px |
| Active/Pressed | Darker background or scale(0.98) |
| Disabled | 50% opacity, no pointer events |
| Loading | Spinner or skeleton; disabled interaction |
| Error | `--flo-danger` border + `--flo-danger-subtle` background |
| Selected | `--flo-brand-50` background + `--flo-brand-600` border/text |

---

## Component Specifications

### AppShell

The root layout wrapper for all authenticated dashboard routes.

```
┌──────────┬────────────────────────────────────────┐
│ Sidebar  │ ContextHeader                          │
│ 240/56px ├────────────────────────────────────────┤
│          │                                        │
│          │  {children} — scrollable workspace     │
│          │                                        │
└──────────┴────────────────────────────────────────┘
```

- Sidebar collapses to icon mode (56px)
- ContextHeader fixed height 56px
- Workspace scrolls independently
- POS/KDS: optional full-bleed mode (no padding)

### Sidebar

Contents (top to bottom):

1. Flo POS logo (wordmark or icon in collapsed mode)
2. Location name (tenant business name)
3. Terminal ID (truncated, tooltip full)
4. Online/offline indicator
5. Primary navigation (max 10 items)
6. Shift status pill (compact)
7. User profile + logout

**Nav item anatomy:** Icon (20px) + label; active = brand background; 44px min height.

### ContextHeader

Dynamic per route. Slots:

- `title` — screen name
- `subtitle` — optional context (date, table, shift)
- `actions` — primary/secondary buttons
- `search` — optional CommandBar trigger
- `meta` — sync status, notifications

### Panel

Base surface for content sections. Replaces ad-hoc `bg-white rounded-xl border border-gray-100`.

```tsx
<Panel>
  <PanelHeader title="..." action={...} />
  <PanelContent>...</PanelContent>
</Panel>
```

- Background: `--flo-surface`
- Border: 1px `--flo-border`
- Radius: `--flo-radius-lg`
- Padding: `space-4` (compact) or `space-6` (default)
- No shadow by default

### MetricCard

Dashboard/operations stat display.

- Label: `caption` + `--flo-text-secondary`
- Value: `numeric-lg`
- Trend/delta: optional, `small` + semantic color
- Clickable variant: hover border brand

### StatusBadge

Pill badge for order/table/shift/sync status.

- Height: 24px
- Padding: 0 8px
- Radius: `--flo-radius-full`
- Variants: `default`, `success`, `warning`, `danger`, `info`, `secondary`
- Optional leading StatusDot

### StatusDot

6px circle. Colors per operational status table. Pulsing animation only for `needs-attention`.

### MoneyDisplay

```tsx
<MoneyDisplay cents={2500} size="lg" variant="default" />
```

- Wraps `useFormatCurrency()`
- Applies numeric typography tier
- Variants: `default`, `positive`, `negative`, `muted`

### VarianceIndicator

Specialized MoneyDisplay for reconciliation.

- Balanced: green "Balanced" text
- Over: green with + prefix
- Short: red with − prefix

### EmptyState

Centered illustration area + title + description + optional action.

- Used when lists are empty, not during loading
- Min height: 200px

### ErrorState / OfflineState

- ErrorState: retry action + error message (from API, not stack traces)
- OfflineState: amber indicator + "Working offline" + last sync time

### DataTable

- Sticky header
- Row height: 44px minimum
- Hover row highlight
- Sortable columns via header click
- Empty/loading/error slots
- Virtualization for 100+ rows (Phase 12)

### FilterBar

Horizontal bar: SegmentedControl + search + date range + filter dropdowns.

- Sticky below ContextHeader on list pages
- Wraps on tablet

### SegmentedControl

iOS-style pill toggle for view switching (Active / Held / Completed).

- 44px height
- Active segment: white surface + shadow-sm on `--flo-bg` track

### CommandBar / SearchCommand

⌘K palette for global search (products, orders, customers). Phase 3+ — stub in shell.

### Modal / ConfirmDialog

- Use shadcn Dialog as base
- Max-width: sm (400px), md (512px), lg (640px), xl (768px)
- Mobile: bottom sheet variant via Drawer for POS contexts
- Backdrop: `rgba(15, 23, 42, 0.5)`
- Z-index: overlay 30, modal 40

**Migration rule:** All custom `fixed inset-0 bg-black/50` overlays must migrate to this primitive.

---

## Screen-Specific Guidelines

### POS

- Product grid: min tile 120px; category bar sticky top
- Order panel: fixed width 320px desktop; drawer mobile
- Grand total: `numeric-xl` fixed at panel bottom
- Primary action ("Charge", "Send"): full-width, 48px height, brand color
- Category pills: horizontal scroll, 36px height

### Tables

- Table card: min 100×100px touch target
- Status communicated by left border (4px) + badge + background tint
- Show: number, guests, elapsed time, order value, server initials
- Floor map: CSS grid with gap-3; optional section labels

### Dashboard (HOME)

- **Attention strip** top: pending orders, stale shift, day close, low stock
- **Today metrics** row: 4–6 MetricCards max
- **Progressive disclosure:** details behind "View all" links
- No more than 2 chart panels above fold

### Operations

- Shift card: prominent OPEN/CLOSED/STALE badge
- Day close: step indicator (Review → Confirm → Close)
- Warnings: `--flo-warning-subtle` banner, never dismissible for safety-critical

### Orders

- Card actions: max 3 visible; overflow in dropdown
- Status: left border color + StatusBadge
- Kitchen state: icon + color only (no text on compact view)

---

## Responsive Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| `sm` | ≥640px | 2-column grids |
| `md` | ≥768px | Sidebar visible; POS cart panel |
| `lg` | ≥1024px | Full dashboard grids |
| `xl` | ≥1280px | Optional third columns |

### Tablet (768–1024px)

- Sidebar collapsed by default
- 2-column workspaces
- Bottom drawer for secondary panels

### Small (<768px)

- Sidebar → sheet drawer
- Bottom nav for primary routes (Phase 12)
- POS: full-screen product area + cart drawer

---

## Accessibility

- Focus ring: 2px `--flo-brand-500`, offset 2px — always visible
- Color contrast: WCAG AA minimum (4.5:1 body, 3:1 large text)
- All icons with action have `aria-label`
- Status not conveyed by color alone — include text/icon
- Modal focus trap via shadcn Dialog
- `prefers-reduced-motion`: disable pulse and transitions
- Touch targets: 44×44px minimum

---

## Dark Mode

Tokens defined and shipped under `.dark` in `globals.css`. Implementation:

1. Toggle `document.documentElement.classList` with preference `light` | `dark` | `system`
2. Persist to `localStorage['flo_theme']`
3. Sidebar `ThemeToggle` cycles modes; root layout bootstraps before paint; AppShell re-applies on load
4. System mode follows `prefers-color-scheme`

All components must use semantic tokens (not hardcoded `#FFFFFF` or `#000000`).

---

## Iconography

- Library: lucide-react (existing)
- Size: 16px (inline), 20px (nav/buttons), 24px (empty states)
- Stroke width: default 2
- Color: inherit from text unless semantic

---

## File Organization (New Components)

```
frontend/src/components/
├── flo/                    # Design system components (NEW)
│   ├── AppShell.tsx
│   ├── Sidebar.tsx
│   ├── ContextHeader.tsx
│   ├── Panel.tsx
│   ├── MetricCard.tsx
│   ├── StatusBadge.tsx
│   ├── StatusDot.tsx
│   ├── MoneyDisplay.tsx
│   ├── VarianceIndicator.tsx
│   ├── EmptyState.tsx
│   ├── ErrorState.tsx
│   ├── FilterBar.tsx
│   ├── SegmentedControl.tsx
│   └── index.ts
├── ui/                     # shadcn primitives (existing)
└── [domain]/               # Feature components (existing, migrate gradually)
```

---

## Migration from Legacy Styles

| Legacy | Flo equivalent |
|--------|----------------|
| `bg-white rounded-xl border border-gray-100 p-6` | `<Panel>` |
| `bg-black/50 fixed inset-0 z-50` | shadcn `<Dialog>` or `<Drawer>` |
| `#3248FF` | `var(--flo-brand-600)` |
| Inline status color maps | `<StatusBadge variant=...>` |
| Raw money formatting | `<MoneyDisplay>` |
| "Nexora" branding | "Flo POS" |

---

## i18n Conventions for New UI

- New keys under `flo.*` namespace: `flo.nav.home`, `flo.shift.stale`, `flo.variance.over`
- Reuse existing keys where semantics match (`nav.pos`, `shifts.*`)
- All user-visible strings through `useI18n()` — no hardcoded English
- Add keys to `en.json`, `es.json`, `pt.json` simultaneously

---

## Implementation Checklist (Phase 1)

- [ ] Add Flo CSS custom properties to `globals.css`
- [ ] Map shadcn tokens to Flo tokens (bridge layer)
- [ ] Add typography utility classes
- [ ] Create `components/flo/Panel.tsx` as first primitive
- [ ] Document component API in Storybook or inline JSDoc (optional)
- [ ] Update brand metadata: Nexora → Flo POS

---

*This document is immutable during a phase unless explicitly revised. All subagents and implementers must read this before writing UI code.*

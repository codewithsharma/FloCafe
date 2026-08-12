# Design System

## CURRENT STATE

shadcn/ui **new-york** style with Tailwind CSS v4.

**Config:** `frontend/components.json`
**Tokens:** `frontend/src/app/globals.css` — oklch color system, sidebar tokens

### Components (17 ui primitives)
button, input, label, card, dialog, drawer, sheet, tabs, table, select, dropdown-menu, badge, avatar, tooltip, skeleton, separator, sidebar

### Utility
`cn()` in `frontend/src/lib/utils.ts` — clsx + tailwind-merge

## TARGET STATE
- Document component usage patterns per feature area
- Add Storybook or equivalent (NOT IMPLEMENTED)
- Formalize spacing/typography scale beyond Tailwind defaults

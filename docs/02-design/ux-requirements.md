# UX Requirements

## CURRENT STATE

- Touch-friendly POS with minimum 44px targets (E2E verified: `layout-integrity.spec.ts`)
- Role-based navigation in sidebar (`Sidebar.tsx`)
- Toast notifications via react-hot-toast
- Modal-driven checkout flows (Payment, Split, Table checkout)
- KDS kanban and tab views for kitchen workflow
- Settings organized in tabs (17 sections in settings page)

## Design constraints
- Static export — no SSR in desktop mode
- Same-origin API (no CORS complexity in Electron)
- Offline — no loading states for external assets in core flows

## TARGET STATE (PROPOSED)
- Shift status indicator in status bar
- Inventory alerts on POS product grid
- Consistent error messages with correlation IDs (cloud plan)
- WCAG 2.1 AA for critical POS flows

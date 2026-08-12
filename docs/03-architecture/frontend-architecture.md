# Frontend Architecture

## CURRENT STATE

```
frontend/src/
├── app/           App Router pages (static export)
├── components/    Feature components (pos, kds, settings, ui)
├── store/         Zustand (auth, cart, held-orders, pos-settings)
├── hooks/         usePrinter (Zustand), useKdsConnection, useI18n
├── lib/           api.ts, i18n/, printer/, types
```

### Build modes
- **Desktop:** `NEXT_BUILD_MODE=desktop` → `output: "export"` (`next.config.ts`)
- **Cloud:** standard Next.js server (INFERRED — less used)

### Auth flow
`AuthGuard` → localStorage JWT → axios interceptor

### State persistence
- `pos-settings` and `flo-printer-settings` in localStorage

## TARGET STATE
- Feature-based modules with co-located hooks
- Shared API types generated from route registry (PROPOSED)

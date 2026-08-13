/**
 * Client vs server state boundaries (Opervia frontend).
 *
 * Server/API state → TanStack Query (`@tanstack/react-query`)
 * Client/UI state  → Zustand (`frontend/src/store/*`)
 * Persistent domain → SQLite via Express API
 *
 * Do not duplicate React Query cache inside Zustand stores.
 */
export const STATE_OWNERSHIP = {
  serverApi: 'tanstack-query',
  clientUi: 'zustand',
  persistentDomain: 'sqlite',
} as const;

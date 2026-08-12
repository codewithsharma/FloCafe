# ADR-003: Next.js Static Export for UI

## Status
Accepted (CURRENT STATE)

## Context
Need React UI inside Electron without running Node server for frontend in production.

## Decision
Next.js 16 with static export (`NEXT_BUILD_MODE=desktop`) served by Express.

## Consequences
- (+) Modern React tooling, App Router
- (+) Same codebase can target cloud mode
- (-) No SSR in desktop mode
- (-) Build step required for frontend changes

## Evidence
`frontend/next.config.ts`, `npm run build:frontend`

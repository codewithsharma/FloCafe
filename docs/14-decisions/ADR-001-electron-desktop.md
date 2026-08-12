# ADR-001: Electron Desktop Runtime

## Status
Accepted (CURRENT STATE)

## Context
Restaurant POS requires offline operation, thermal printer access, and cross-platform desktop deployment.

## Decision
Use Electron 43 as the desktop shell with embedded Express servers and SQLite.

## Consequences
- (+) Offline-first, hardware access, single install
- (+) Proven in FloCafe production
- (-) Large bundle size, Electron version coupling
- (-) Native module rebuild for better-sqlite3

## Evidence
`main/index.ts`, `package.json`

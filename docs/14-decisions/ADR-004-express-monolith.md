# ADR-004: Express Monolith API

## Status
Accepted (CURRENT STATE)

## Context
LAN-scale API serving POS, KDS, and waiter apps from one machine.

## Decision
Express 5 monolith with route modules — no microservices.

## Consequences
- (+) Simple deployment, shared DB connection
- (+) Adequate for single-location scale
- (-) Fat route handlers, limited layer separation
- (-) Three separate Express apps share logic informally

## Evidence
`main/server.ts`, `main/routes/`

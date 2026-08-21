# Project context

OPERAVIA / Operavia Restaurant POS (repo legacy: FloCafe). Electron + Express + SQLite + Next.js static export.

## Active vertical

Restaurant Commercial V1 — **UI/UX + responsive hardening** (`V1-UI-RESPONSIVE`) is the next major track after ROPS-RWASTE.

## Schema tip

**v89** — `rops_rwaste_recipe_linked_waste` (ADR-015 / ROPS-RWASTE v1).

## Recently shipped

- ROPS-RWASTE v1 (audited; FE idempotency key hold may still be local uncommitted)
- ROPS-FC-ING / ROPS-FC-CSV; RCP-05; PRC-DRAFT

## Active planning

- Phase 1 audit: `docs/ui/V1-UI-RESPONSIVE-AUDIT.md`
- **V1-UI-P1-FOUNDATIONS** + **V1-UI-P2-SHELL** + **V1-UI-P3-POS** COMPLETE (local, uncommitted)
- **V1-UI-CART-KDS-TABS** + **V1-UI-KDS-HYBRID** also present locally — do not mix commits
- Keep separate from ROPS-RWASTE FE idempotency fix when committing
- **Next:** `V1-UI-P4` Operations/Admin responsive harden → QR → Kiosk → final QA

## Explicit non-goals (still)

QR-ORD-IDEM · Apple signing · Live Go-Live · multi-location · waste reverse · waste COGS report · ROPS-REFREV · ROPS-AVT · full UI rewrite · unauthorized kiosk/QR product builds

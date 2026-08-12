# RestaurantOS / FloCafe Documentation

Evidence-based documentation for evolving the FloCafe POS fork into **RestaurantOS**. Generated from repository analysis on 2026-08-12.

## Repository state at documentation time

| Item | Value |
|------|-------|
| Branch | `develop` |
| Working tree | Clean |
| Version | 3.0.5 (`package.json`) |
| Schema version | 66 (`main/db.ts`) |
| Origin | `codewithsharma/FloCafe` |
| Upstream | `FreeOpenSourcePOS/FloCafe` |

## What this documentation contains

This `docs/` tree is the **RestaurantOS documentation system**. It supplements (does not replace) existing FloCafe docs:

| Existing doc | Purpose |
|--------------|---------|
| `docs/API.md` | Legacy API reference |
| `docs/tax-packs.md` | Tax pack authoring |
| `docs/printers.md` | Printer setup |
| `docs/linux.md` | Linux installation |
| `docs/security-audit-2.7.0.md` | Security audit |
| `docs/cloud-v2-plan.md` | Cloud integration plan |

## Documentation map

| Section | Path | Contents |
|---------|------|----------|
| Product | [00-product/](00-product/) | Vision, PRD, features, roadmap, personas |
| Requirements | [01-requirements/](01-requirements/) | Functional/non-functional requirements |
| Design | [02-design/](02-design/) | UX, flows, design system |
| Architecture | [03-architecture/](03-architecture/) | System, frontend, backend, database, API |
| Technology | [04-technology/](04-technology/) | Tech stack, dependencies, ADR summary |
| API | [05-api/](05-api/) | Auth, authorization, error handling |
| Database | [06-database/](06-database/) | Schema, migrations, data model |
| Security | [07-security/](07-security/) | Threat model, permissions, audit findings |
| Development | [08-development/](08-development/) | Setup, standards, git workflow |
| Testing | [09-testing/](09-testing/) | Strategy, unit, integration, E2E |
| AI (optional) | [10-ai/](10-ai/) | Future optional AI module |
| DevOps | [11-devops/](11-devops/) | CI/CD, deployment, configuration |
| Observability | [12-observability/](12-observability/) | Logging, metrics (gaps documented) |
| Operations | [13-operations/](13-operations/) | Runbooks, backup, disaster recovery |
| Decisions | [14-decisions/](14-decisions/) | Architecture Decision Records |
| Project mgmt | [15-project-management/](15-project-management/) | Gaps, risks, debt, implementation plan |
| Release | [16-release/](16-release/) | Checklists, production readiness |

## Current project state (FloCafe)

**VERIFIED:** Electron 43 desktop POS with three LAN servers (ports 3001/3002/3003), SQLite WAL database, Next.js 16 static frontend, Express 5 API, WebSocket KDS, JWT auth with five roles, 40 database tables, 95+ test files.

**Strengths:** Offline-first, comprehensive payment/tax/KDS test coverage, cross-platform packaging, tax pack system, backup/restore.

**Key gaps for RestaurantOS:** shift management, refunds, inventory ledger/recipes, multi-location, payment terminals, general audit logging, LAN encryption.

Start here: [feature-list.md](00-product/feature-list.md) · [architecture.md](03-architecture/architecture.md) · [implementation-plan.md](15-project-management/implementation-plan.md)

## Target state (RestaurantOS)

Production-grade restaurant operating platform evolving incrementally from FloCafe:

- Preserve local-first Electron + SQLite architecture
- Add operational completeness (shifts, refunds, audit)
- Extend inventory beyond product stock counts
- Design multi-location without breaking single-terminal deployments
- Keep AI optional and non-blocking

See [vision.md](00-product/vision.md) and [roadmap.md](00-product/roadmap.md).

## How to use these docs

### For product managers
1. [problem-statement.md](00-product/problem-statement.md) — why RestaurantOS
2. [feature-list.md](00-product/feature-list.md) — what exists vs planned
3. [roadmap.md](00-product/roadmap.md) — priorities
4. [implementation-plan.md](15-project-management/implementation-plan.md) — gap analysis

### For engineers
1. [architecture.md](03-architecture/architecture.md) — system overview
2. [tech-stack.md](04-technology/tech-stack.md) — verified versions
3. [data-model.md](06-database/data-model.md) — entities and relationships
4. [development-guide.md](08-development/development-guide.md) — local setup
5. [test-strategy.md](09-testing/test-strategy.md) — verification approach

### For security review
1. [security.md](07-security/security.md)
2. [threat-model.md](07-security/threat-model.md)
3. Existing audit: [security-audit-2.7.0.md](security-audit-2.7.0.md)

## Documentation conventions

Every document distinguishes:

| Label | Meaning |
|-------|---------|
| **CURRENT STATE** | Verified in FloCafe codebase today |
| **TARGET STATE** | RestaurantOS planned evolution |
| **PLANNED / PROPOSED / NOT IMPLEMENTED** | Not in code — do not treat as shipped |
| **VERIFIED** | Confirmed from source files |
| **INFERRED** | Strongly implied, not explicitly documented |
| **UNKNOWN** | Cannot establish from repository |

### Source-of-truth rules

1. **Code wins** — if docs conflict with code, code is correct; file an issue to fix docs.
2. **Do not invent** — no fictional APIs, tables, or services.
3. **Cite evidence** — reference paths like `main/db.ts`, `frontend/src/`.
4. **Preserve history** — FloCafe capabilities are not rewritten as RestaurantOS plans.
5. **Upstream awareness** — track `upstream` remote for open-source FloCafe changes.

## Quick reference — key evidence files

```
package.json              Version, dependencies, build config
main/index.ts             Electron entry, startup sequence
main/db.ts                Schema, migrations (v66), DB utilities
main/routes/index.ts      API route registry
main/server.ts            Main API server (:3001)
frontend/package.json     Frontend dependencies
frontend/src/app/         UI routes
tests/                    95+ test files
.github/workflows/ci.yml  CI pipeline
AGENTS.md                 Agent/developer conventions
```

## Maintaining this documentation

Update docs when:
- Schema version increments (update `06-database/`)
- New routes or features ship (update `00-product/feature-list.md`, `05-api/`)
- Architecture changes (new ADR in `14-decisions/`)
- Security findings change (`07-security/`)

Do **not** document planned features as implemented.

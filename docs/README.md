# Operavia Documentation

Evidence-based documentation for **Operavia** — a modular business platform. Phase 1 ships **Operavia Restaurant** (local-first Electron POS). The repo remains a FloCafe fork for open-source lineage.

> Canonical brand: **Operavia**. Operavia POS is retired as an active product name. Historical audits under `15-project-management/` may still say Operavia/FloCafe.

## Start here (platform)

| Doc                                                                                      | Purpose                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`STRATEGY.md`](../STRATEGY.md)                                                          | CEO/CTO north star + pilot KPI                                 |
| [00-product/opervia-platform.md](00-product/opervia-platform.md)                         | Platform vision + 3-layer model                                |
| [00-product/verticals.md](00-product/verticals.md)                                       | Vertical compositions                                          |
| [00-product/principles.md](00-product/principles.md)                                     | Architecture principles 1–10                                   |
| [00-product/vision.md](00-product/vision.md)                                             | CURRENT vs TARGET product vision                               |
| [00-product/capability-matrix.md](00-product/capability-matrix.md)                       | Product plan (Existing / Hardening / Planned / Later / Frozen) |
| [03-architecture/modular-architecture.md](03-architecture/modular-architecture.md)       | Lego / modular model                                           |
| [03-architecture/architecture-gap-report.md](03-architecture/architecture-gap-report.md) | Phase 1 → Operavia gap (A–H)                                   |
| [14-decisions/ADR-010-opervia-platform.md](14-decisions/ADR-010-opervia-platform.md)     | Brand + modular vision ADR                                     |
| [modules/README.md](modules/README.md)                                                   | Module index                                                   |

## Repository state

| Item             | Value                                   |
| ---------------- | --------------------------------------- |
| Product brand    | Operavia (`package.json` `productName`) |
| Phase 1 vertical | Operavia Restaurant                     |
| Version          | 3.0.5 (`package.json`)                  |
| Schema version   | 75 (`main/db.ts`)                       |
| Origin           | `codewithsharma/FloCafe`                |
| Upstream         | `FreeOpenSourcePOS/FloCafe`             |

## What this documentation contains

This `docs/` tree is the **Operavia documentation system**. It supplements (does not replace) existing FloCafe operational docs:

| Existing doc                   | Purpose                     |
| ------------------------------ | --------------------------- |
| `docs/API.md`                  | Legacy API reference        |
| `docs/tax-packs.md`            | Tax pack authoring          |
| `docs/printers.md`             | Printer setup               |
| `docs/linux.md`                | Linux installation          |
| `docs/security-audit-2.7.0.md` | Security audit (historical) |
| `docs/cloud-v2-plan.md`        | Cloud integration plan      |

## Documentation map

| Section       | Path                                             | Contents                                                                 |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Product       | [00-product/](00-product/)                       | Vision, Operavia platform, verticals, principles, PRD, features, roadmap |
| Requirements  | [01-requirements/](01-requirements/)             | Functional/non-functional requirements                                   |
| Design        | [02-design/](02-design/)                         | UX, flows, design system                                                 |
| Architecture  | [03-architecture/](03-architecture/)             | System + modular / vertical architecture                                 |
| Modules       | [modules/](modules/)                             | Planned reusable module index                                            |
| Technology    | [04-technology/](04-technology/)                 | Tech stack, dependencies, ADR summary                                    |
| API           | [05-api/](05-api/)                               | Auth, authorization, error handling                                      |
| Database      | [06-database/](06-database/)                     | Schema, migrations, data model                                           |
| Security      | [07-security/](07-security/)                     | Threat model, permissions, audit findings                                |
| Development   | [08-development/](08-development/)               | Setup, standards, git workflow                                           |
| Testing       | [09-testing/](09-testing/)                       | Strategy, unit, integration, E2E                                         |
| AI (optional) | [10-ai/](10-ai/)                                 | Future optional AI module                                                |
| DevOps        | [11-devops/](11-devops/)                         | CI/CD, deployment, configuration                                         |
| Observability | [12-observability/](12-observability/)           | Logging, metrics (gaps documented)                                       |
| Operations    | [13-operations/](13-operations/)                 | Runbooks, backup, disaster recovery                                      |
| Decisions     | [14-decisions/](14-decisions/)                   | Architecture Decision Records                                            |
| Project mgmt  | [15-project-management/](15-project-management/) | Plans, RFCs, **historical audits** (preserve names)                      |
| Release       | [16-release/](16-release/)                       | Checklists, production readiness                                         |

## Current project state (Operavia Restaurant / Phase 1)

**VERIFIED:** Electron 43 desktop POS with three LAN servers (ports 3001/3002/3003), SQLite WAL database, Next.js 16 static frontend, Express 5 API, WebSocket KDS, JWT auth with five roles, schema **v79**, extensive test suite.

**Strengths:** Offline-first, payment/tax/KDS coverage, cross-platform packaging, tax pack system, backup/restore, shifts/refunds/day-close.

**Architectural TARGET (not fully built):** multi-vertical composition, inventory ledger depth, package extraction. Lightweight module registry is **CURRENT** (Phase 2.1 + 2.2 consumers/diagnostics). See [architecture-gap-report.md](03-architecture/architecture-gap-report.md), [phase-2.1-module-registry.md](03-architecture/phase-2.1-module-registry.md), [phase-2.2-module-consumers.md](03-architecture/phase-2.2-module-consumers.md).

## Target state (Operavia platform)

Modular business platform evolving incrementally from Phase 1:

- Preserve local-first Electron + SQLite architecture
- Compose verticals from reusable modules (configuration over forking)
- Extend Operavia Restaurant depth after pilots
- Introduce additional verticals without separate codebases
- Keep AI optional and non-blocking
- Do **not** build Operavia Custom until composition model is real

See [vision.md](00-product/vision.md), [capability-matrix.md](00-product/capability-matrix.md), [opervia-platform.md](00-product/opervia-platform.md), and [roadmap.md](00-product/roadmap.md).

## How to use these docs

### For product managers

1. [opervia-platform.md](00-product/opervia-platform.md) — platform vision
2. [capability-matrix.md](00-product/capability-matrix.md) — product plan (Existing / Hardening / Planned / Later / Frozen)
3. [feature-list.md](00-product/feature-list.md) — code evidence
4. [roadmap.md](00-product/roadmap.md) — priorities
5. [master-implementation-plan.md](15-project-management/master-implementation-plan.md) — execution plan

### For engineers

1. [modular-architecture.md](03-architecture/modular-architecture.md) — TARGET modular model
2. [architecture.md](03-architecture/architecture.md) — CURRENT system overview
3. [tech-stack.md](04-technology/tech-stack.md) — verified versions
4. [development-guide.md](08-development/development-guide.md) — local setup
5. [test-strategy.md](09-testing/test-strategy.md) — verification approach

### For security review

1. [security.md](07-security/security.md)
2. [threat-model.md](07-security/threat-model.md)
3. Existing audit: [security-audit-2.7.0.md](security-audit-2.7.0.md)

## Documentation conventions

Every document distinguishes:

| Label                                    | Meaning                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| **CURRENT STATE**                        | Verified in codebase today (Operavia Restaurant Phase 1) |
| **TARGET STATE**                         | Operavia modular platform planned evolution              |
| **PLANNED / PROPOSED / NOT IMPLEMENTED** | Not in code — do not treat as shipped                    |
| **VERIFIED**                             | Confirmed from source files                              |
| **INFERRED**                             | Strongly implied, not explicitly documented              |
| **UNKNOWN**                              | Cannot establish from repository                         |

### Source-of-truth rules

1. **Code wins** — if docs conflict with code, code is correct; file an issue to fix docs.
2. **Do not invent** — no fictional APIs, tables, or services.
3. **Cite evidence** — reference paths like `main/db.ts`, `frontend/src/`.
4. **Preserve history** — do not rewrite `15-project-management/` audits for brand; add CURRENT/TARGET notes in living docs instead.
5. **Upstream awareness** — track `upstream` remote for open-source FloCafe changes.

## Quick reference — key evidence files

```
package.json              Version, productName (Operavia), build config
STRATEGY.md               Canonical strategy
main/index.ts             Electron entry, startup sequence
main/db.ts                Schema, migrations (v79), DB utilities
main/routes/index.ts      API route registry
main/server.ts            Main API server (:3001)
frontend/package.json     Frontend dependencies
frontend/src/app/         UI routes
tests/                    Test suite
.github/workflows/ci.yml  CI pipeline
AGENTS.md                 Agent/developer conventions
.ai/                      Agent project memory
```

## Maintaining this documentation

Update docs when:

- Schema version increments (update `06-database/`)
- New routes or features ship (update `00-product/feature-list.md`, `00-product/capability-matrix.md` if posture changes, `05-api/`)
- Architecture changes (new ADR in `14-decisions/`)
- Security findings change (`07-security/`)
- Brand/platform decisions change (`00-product/`, `STRATEGY.md`, ADR)

Do **not** document planned features as implemented.

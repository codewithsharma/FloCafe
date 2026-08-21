# Documentation Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5
**Scope:** root community-health files, `docs/` tree (333 markdown files), README/CHANGELOG currency, code-level documentation. Read-only.

> Verdict: **documentation is a real strength — breadth, community-health completeness, architecture decision records, and release discipline are all above average for a project this size.** The issues are _organizational consistency_, not absence: a numbered taxonomy with **prefix collisions and near-duplicate directories**, three separate "audit" locations, a product-name typo in the CHANGELOG, and some **currency drift** (schema/feature references trailing the live `user_version = 86`). The Operavia/FloCafe branding split — a frequent false-positive — is **explicitly documented as intentional** (README:39) and should not be treated as a defect.

---

## 1. What exists (verified)

- **Complete community-health set at root:** `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE` (MIT), `SECURITY.md`, `CODE_OF_CONDUCT.md`, `STRATEGY.md`, plus the agent guides `AGENTS.md`/`CLAUDE.md`. This is the full checklist most repos are missing pieces of.
- **README is product-grade and current:** clear value proposition (local-first, offline), platform badges, CI badge, install/uninstall instructions, a printer-troubleshooting runbook referencing specific app versions (2.6.1), and an explicit **naming note** explaining the Operavia (product) vs FloCafe/`flo-desktop`/`flocafe` (repo/package/executable) split "for upgrade continuity."
- **CHANGELOG follows Keep a Changelog**, is release-gating (the release workflow **fails** if a version has no entry — DEVOPS-AUDIT §3), and carries a detailed `[Unreleased]` section.
- **A large, numbered `docs/` taxonomy (333 files):** `00-product` (21), `01-requirements` (5), `02-design` (5), `03-architecture` (54), `05-production` (40), `13-operations` (19), `14-decisions` (13, ADR-style), `15-project-management` (46), `16-release` (7), plus domain guides (`printers.md`, `tax-packs.md`, `tax-engine-v2-spec.md`, `google-drive-setup.md`, `linux.md`) and a QA/debt log (`docs/qa`, 24 files).
- **Debt is tracked in `docs/qa/` rather than inline** — consistent with the codebase's deliberate near-absence of `TODO` markers (CODING-STYLE-AUDIT §4).

## 2. Findings

### 2.1 Numbered-taxonomy prefix collisions and duplicate directories (Low)

- **Location/Evidence:** two directories share prefix **`04`** (`docs/04-product/`, `docs/04-technology/`) and two share prefix **`05`** (`docs/05-api/`, `docs/05-production/`); there are **two product directories** (`docs/00-product/` and `docs/04-product/`) whose scopes overlap.
- **Why it matters:** the numbered scheme implies a single ordered spine; collisions and a duplicated "product" area make it ambiguous which directory is canonical (AGENTS.md points to `docs/00-product/` for the capability matrix, implying `04-product` is secondary/legacy).
- **Recommendation:** renumber to remove collisions and consolidate the two product directories (or add a one-line README in each stating its scope and which is canonical). **Confidence:** High.

### 2.2 Three separate audit locations (Low)

- **Location/Evidence:** `docs/audit/` (this audit), `docs/audits/` (`second-pass-audit.md`), and a root-level `docs/security-audit-2.7.0.md`.
- **Why it matters:** future readers won't know where the current audit lives. **Recommendation:** consolidate under one directory (e.g. `docs/audit/`) with dated subfolders, and cross-link the older ones. **Confidence:** High.

### 2.3 Product-name typo in the CHANGELOG (Low)

- **Location/Evidence:** `CHANGELOG.md` header reads _"All notable changes to **Opervia**…"_ and `[Unreleased]` entries say _"Production **Opervia** Retail vertical."_ The product is **Operavia** (per README and `package.json` `productName: "Operavia"`).
- **Why it matters:** it's the product name, in the most user-facing history file. **Recommendation:** fix "Opervia" → "Operavia" repo-wide (grep the docs tree). **Confidence:** High.

### 2.4 Currency drift: schema/feature references trail the live schema (Low-Medium)

- **Location/Evidence:** `CHANGELOG.md` `[Unreleased]` references a "documentation truth pass … aligned to **schema v75**," while the live schema is **`user_version = 86`** (DATABASE-AUDIT). Some `docs/` content necessarily lags 11 schema versions.
- **Why it matters:** docs describing schema/feature state at v75 may misdescribe current behavior; readers can't easily tell which docs are current. **Recommendation:** add a "last verified against schema vNN / app vX.Y.Z" stamp to the living reference docs (capability matrix, feature-list, database docs) and refresh the feature-list against v86. **Confidence:** Medium (drift confirmed; per-doc staleness not exhaustively checked).

### 2.5 API documentation is split across locations (Informational)

- **Location/Evidence:** a root `docs/API.md` plus a `docs/05-api/` directory (6 files) and `docs/README.md`.
- **Why it matters:** minor discoverability overlap. **Recommendation:** make one the index and have it link the rest. **Confidence:** High (that both exist); overlap severity not assessed in depth.

### 2.6 Inline/code-level documentation is sparse by design (Informational — trade-off)

- **Evidence:** the codebase has only ~2 `TODO` markers and generally low comment density, **except** for high-value explanatory comments on the governed hotspots (the `db.ts` R4.1 re-export banner; the extensive inline rationale in `release.yml` referencing specific issues #178/#199/#220) and measured-optimization notes (e.g. the `batchHydrateOrders` "~300→6 queries" comment).
- **Why it matters:** onboarding leans on prose docs + tests rather than inline API docs; where comments _do_ exist they are unusually high-quality (the "why," not the "what"). This is a defensible choice, but new contributors to un-commented service files rely on reading the code.
- **Recommendation:** keep the "comment the why, on the risky parts" convention; consider light module-header docblocks on the largest service files. **Confidence:** High.

## 3. Strengths (credit)

- **Architecture Decision Records** (`docs/14-decisions`, 13 files) — durable rationale capture that most projects skip.
- **Operational runbooks** (`docs/13-operations`, `docs/16-release`, `printers.md`, `google-drive-setup.md`, `linux.md`) and a **QA/debt ledger** (`docs/qa`) — the project writes down its known issues instead of hiding them, which materially aided this audit.
- **Release documentation is enforced, not aspirational** — CHANGELOG entries gate releases; signing/notarization requirements are documented in `CONTRIBUTING.md` (referenced by `release.yml`).
- **The branding split is documented** (README:39) — turning a would-be inconsistency into a stated, rationalized decision.
- **Agent/contributor guidance** (`AGENTS.md`, `frontend/AGENTS.md`) is specific and current, including the Next 16 "this is not the Next.js you know" warning.

## 4. Verdict

**Documentation maturity: high.** The repository is, if anything, _over_-documented rather than under-documented, and the meta-documentation (ADRs, QA ledger, release gates, naming note) is what makes the rest of this audit tractable. The remaining work is janitorial: fix the taxonomy collisions and duplicate product/audit directories (2.1/2.2), correct the "Opervia" typo (2.3), and add currency stamps so readers can trust which docs reflect schema v86 (2.4). None of these affect correctness; all improve navigability and trust.

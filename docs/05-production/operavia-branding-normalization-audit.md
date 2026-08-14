# OPERAVIA branding normalization audit

**Date:** 2026-08-14  
**Baseline:** `0200cae`  
**Schema:** v75 (unchanged)  
**Scope:** Identity / branding only. No Phase 4.16. No ADR-014. No money/inventory/schema/API contract changes. No push. No version bump. No signing.

---

## 1. Discovery methodology

Parallel read-only agents:

| Agent | Focus                                                          |
| ----- | -------------------------------------------------------------- |
| A     | Repo-wide brand string search (Nexora / FloCafe / Flo / flo-*) |
| B     | Electron / electron-builder / userData / backups               |
| C     | Frontend user-visible surfaces                                 |
| D     | docs / `.ai` / tests / scripts                                 |
| E     | Safety denylist (money, schema, auth, persisted IDs)           |

Human policy for this pass:

- **User-visible brand:** `OPERAVIA`
- **Electron `productName`:** remains `Opervia` (Application Support / installer path continuity; changing to `OPERAVIA` deferred as **UNSAFE** without dual-path migration)
- **Frozen forever (or migration plan required):** `appId` `com.flo.desktop`, npm `name` `flo-desktop`, Linux `executableName` `flocafe`, `flo.db`, `flo-backup-*` (+ restore regex), `jwt-secret.enc`, `master-pin.enc`, `X-Flo-Terminal-Id` / `flo_terminal_id`, localStorage `flocafe:*`, mDNS host `flo` / `flo.local`, FloAdmin, RevFlo, FloCafe-Plugins URLs, `flopos.com` infrastructure URLs, telemetry `app: 'flocafe'`, vertical IDs, CSS `--flo-*` tokens, `tests/flo-*.test.ts` filenames

---

## 2. Changed categories (this task)

| Category                                         | Action                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Electron window / tray / About / menus           | Flo / Nexora → OPERAVIA (display)                                        |
| `package.json` display fields                    | author / AppX displayName / Linux desktop Name / Linux description prose |
| Receipt footer name                              | `Powered by OPERAVIA` (URL left `flopos.com`)                            |
| Frontend titles / alts / i18n brand keys         | OPERAVIA                                                                 |
| Manifest / root layout title                     | OPERAVIA                                                                 |
| Uninstallers / kill-ports                        | Dual-target Opervia/OPERAVIA **and** legacy Flo Cafe                     |
| Living docs / AGENTS / LICENSE / issue templates | Current product identity → OPERAVIA                                      |
| Printer / flo-ui-shell tests                     | Assert OPERAVIA; restore Nexora negative checks                          |

---

## 3. Intentionally unchanged legacy references

| Reference                                         | Allowed?       | Reason                                        |
| ------------------------------------------------- | -------------- | --------------------------------------------- |
| `appId` `com.flo.desktop`                         | Yes            | Upgrade / updater / MAS identity              |
| `name` `flo-desktop`                              | Yes            | userData / WM_CLASS                           |
| `executableName` `flocafe`                        | Yes            | Linux binary / Snap / shortcuts               |
| `flo.db` / `flo-backup-*.db`                      | Yes            | Live DB + managed restore regex               |
| `jwt-secret.enc` / `master-pin.enc`               | Yes            | Secret filenames                              |
| `X-Flo-Terminal-Id` / `flo_terminal_id`           | Yes            | API + localStorage contract                   |
| `flocafe:*` localStorage                          | Yes            | Session keys                                  |
| mDNS `flo.local`                                  | Yes            | LAN bookmarks                                 |
| FloAdmin / RevFlo                                 | Yes            | Separate products                             |
| GitHub `…/FloCafe` / FloCafe-Plugins              | Yes            | Live repo / plugin feed                       |
| `flopos.com` / `blue.flopos.com` / telemetry host | Yes            | Live infrastructure                           |
| telemetry `app: 'flocafe'`                        | Yes            | Analytics contract (human decision to change) |
| `docs/15-project-management/*` historical audits  | Yes            | Evidence freeze                               |
| CHANGELOG historical bullets                      | Yes            | History                                       |
| ADR-010 decision text                             | Yes            | Brand decision record (append-only)           |
| CSS `flo-*` / `components/flo/`                   | Yes            | Design-system identifiers                     |
| `tests/flo-*.test.ts` filenames                   | Yes            | Wired to `package.json` scripts               |
| AppX `applicationId` / `identityName` FloCafe     | Yes            | Store identity                                |
| publish.repo `FloCafe`                            | Yes            | electron-updater feed                         |
| Nexora.app mentions in dry-run evidence           | Yes            | Historical TRAINING artifact observation      |
| `productName: Opervia`                            | Yes (deferred) | Path continuity; display chrome uses OPERAVIA |

---

## 4. Unsafe / compatibility-sensitive (human decision required)

1. Rename `productName` Opervia → OPERAVIA (Mac/Win Application Support split risk).
2. Rename backup prefix to `operavia-backup-*` (breaks managed restore of existing café backups).
3. Rename `flo.db` / userData folder.
4. Rename Snap / AppImageHub `flocafe` artifacts.
5. Rename GitHub repository.
6. Cut over `flopos.com` DNS to OPERAVIA domain.
7. Rename FloAdmin cloud product.
8. Change telemetry `app` field.
9. Mechanical rewrite of frozen `docs/15-*` audits.

---

## 5. Filename / folder renames

**None in this pass.** Proposed renames (`tests/flo-*.test.ts`, `flo-cafe-pos.webp`, Linux `flocafe.png` icons) deferred — compatibility or low value vs blast radius.

---

## 6. Package metadata changes

Display-only fields updated to OPERAVIA where applicable. Frozen: `name`, `appId`, `productName` (Opervia), `executableName`, AppX identity fields, publish.repo.

---

## 7. User-visible changes

Window titles, tray, About, receipt “Powered by”, KDS/Server App document titles, setup alt, sidebar mark, i18n brand strings, manifest.

---

## 8. Test changes

- `tests/printer.test.ts` — footer asserts OPERAVIA
- `tests/flo-ui-shell.test.ts` — metadata asserts OPERAVIA; negative asserts exclude Nexora/FloCafe product chrome
- `tests/dev-tooling-scripts.test.ts` — dual uninstaller / kill-ports expectations if updated

---

## 9. Regression verification (2026-08-14 session)

| Command                                                | Result            |
| ------------------------------------------------------ | ----------------- |
| `npm run test:flo-ui-shell`                            | PASS              |
| `npm run test:printer`                                 | PASS (110/110)    |
| `tests/module-vertical-composition.test.ts`            | PASS              |
| `tests/module-composition.test.ts`                     | PASS              |
| `tests/platform-composition-api.test.ts`               | PASS              |
| `tests/release-config.test.ts`                         | PASS              |
| `npm run lint`                                         | PASS (0 errors)   |
| `npm run build`                                        | PASS              |
| `npm run build:frontend`                               | PASS              |
| `npm test`                                             | PASS (exit 0)     |
| Schema last migration                                  | **v75** unchanged |
| `flo.db` / `flo-backup-*` / `appId` / `executableName` | **unchanged**     |
| H1 code `ORDER_HAS_SUCCESSFUL_TENDER`                  | present           |
| FIN-01 code `BILL_NO_OUTSTANDING_BALANCE`              | present           |

Independent final reviews: branding completeness / packaging / money-schema safety / compatibility / pilot hygiene — see commit message and final report.

---

## 12. Commit hygiene

Staging set for `chore: normalize branding to operavia` must **exclude**:

- `docs/15-project-management/*` historical audit rewrites
- prior pilot ops sheets not required for branding (`first-cafe-dry-run-result.md`, large pilot-runbook ops rewrite) unless branding-only
- unrelated dirty audit tree under `audit/`

Include: runtime display branding, i18n, packaging display fields, uninstallers/kill-ports dual-target, living root docs (AGENTS/LICENSE/SECURITY/COC), branding audit doc, related tests.

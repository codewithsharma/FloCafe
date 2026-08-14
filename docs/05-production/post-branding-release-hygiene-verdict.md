# Post-branding release hygiene verdict

**Date:** 2026-08-14  
**Scope:** OPERAVIA post-Phase-4 pilot gate — branding cleanup + pilot ops package only.  
**Engineering baseline before branding:** `0200cae`  
**Branding normalization:** `eeab8ef`  
**This cleanup:** finalize Operavia spelling; restore historical evidence; separate pilot ops docs.

## Verdict

**RELEASE HYGIENE PASS WITH NITS** → after this cleanup: engineering is **READY FOR HUMAN PILOT GATE**.

Automated green does **not** equal café GO. Physical gates remain human-owned.

## Classification (pre-cleanup mixed commit `42028a6`)

| Category                                    | Count | Action                  |
| ------------------------------------------- | ----: | ----------------------- |
| A Runtime / user-visible OPERAVIA branding  |    38 | Keep in branding commit |
| B Living documentation                      |    52 | Keep in branding commit |
| C Pilot operations documentation            |    11 | Separate docs commit    |
| D Historical evidence (must remain frozen)  |    27 | Revert to `eeab8ef`     |
| E Compatibility identifiers wrongly changed |     0 | None                    |
| F Unknown / unrelated production            |     0 | None                    |

## Frozen compatibility (do not rename)

`com.flo.desktop` · `flo-desktop` · `flocafe` · `flo.db` · `flo-backup-*` · FloAdmin · RevFlo · FloCafe repo/AppX IDs · `flopos.com` · CSS `flo-*` · type `OperviaModule` / `OPERVIA_*` constants · legacy `Opervia` uninstall/kill-ports/Drive folder matchers.

## User-visible brand

- Chrome / About / tray: **OPERAVIA**
- Title / sentence / `productName`: **Operavia**
- Drive folder: `Operavia Backups` (also finds legacy `Opervia Backups`; no userData migration)
- i18n key: `settings.aboutOperavia` (was misspelled `aboutOpervia`)

## Intentionally not done

No version bump · no tag · no RC artifact · no sign/notarize · no push · no schema change · no ADR-014 · no Phase 4.16 · no money/inventory/vertical changes · no userData migration.

## Next gate (HUMAN)

Signed/notarized artifact · version/RC · OPS-01 · Master PIN escrow · backup policy · printer/cash drawer · KDS · restore · financial dry run · staff training/sign-off · incident drill.

Engineering **STOP** until human GO.

<!-- Last updated: 2026-08-15, schema v75 -->

# OPS-01 — Pilot release checklist

**Product:** Operavia Restaurant  
**Use for:** Controlled single-café pilot after H1–H4.  
**Engineering baseline:** `24966ba7272aa4e0e6650796ec469a3cd60ed423`  
**App version:** 3.0.5 · **Schema:** v75  
**Do not retag** historical `3.0.5` artifacts built from older commits.

Related: [`../05-production/ops-01-pilot-release-operations-closure.md`](../05-production/ops-01-pilot-release-operations-closure.md) · [`../13-operations/pilot-runbook.md`](../13-operations/pilot-runbook.md) · [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md) · [`../13-operations/ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md)

Mark items only with evidence. Automated tests ≠ on-site PASS for hardware/network/PIN escrow.

**Status:** `PASS` · `FAIL` · `PENDING` · `N/A`

---

## Software

- [ ] Exact commit recorded: `24966ba7272aa4e0e6650796ec469a3cd60ed423` (or authorized descendant with clean tree)
- [ ] Working tree clean at build time
- [ ] Schema version verified: **v75**
- [ ] Configuration verified per [`ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md) (`shifts_enabled`, cash gate, `network_mode`)
- [ ] `npm run test:h1` PASS
- [ ] `npm run test:h2` PASS
- [ ] `npm run test:h3` PASS
- [ ] `npm run test:h4` PASS
- [ ] `npm run test:backup` PASS
- [ ] Focused payment/refund/shift/KDS/authz suites PASS (see OPS-01 closure report)
- [ ] Artifact class = **PILOT/PRODUCTION** (signed/notarized) — **not** adhoc TRAINING/QA for live service
- [ ] No uncommitted production changes in the release tree

---

## Hardware

- [ ] POS machine ready (target OS)
- [ ] Thermal printer tested (Test Print + one paid receipt) — or **N/A** if no printer this café
- [ ] KDS device/server tested — or **N/A** if counter-only
- [ ] Backup media available (local path + optional offline copy)

---

## Staff

- [ ] Owner account
- [ ] Manager account
- [ ] Cashier account
- [ ] Waiter account (if used)
- [ ] Chef account (if KDS used)
- [ ] Staff passwords / role PINs tested
- [ ] Master PIN set + **offline escrow** documented
- [ ] Manager PIN refund/cancel path briefed

---

## Operations

- [ ] Opening procedure tested (services, KDS, printer, login, shift, float)
- [ ] Normal sale tested (order → KDS → pay → receipt → complete → close)
- [ ] KDS failure tested (stale UX + paper/verbal + companion recovery) — or **N/A**
- [ ] Printer failure tested (pay succeeds; no false print success; reprint) — or **N/A**
- [ ] Backup tested (create + integrity)
- [ ] Restore tested on **spare/test** environment (not surprise live)
- [ ] Shift close + variance + Z-report tested
- [ ] OPS-01 network site check (guest cannot reach :3001–3003)

---

## Recovery

- [ ] Local backup available under `{userData}/backups/`
- [ ] Restore procedure available ([`../13-operations/backup-restore.md`](../13-operations/backup-restore.md) + runbook)
- [ ] Paper KDS fallback available if KDS used
- [ ] Printer fallback / reprint path available if printer used
- [ ] Drive **not** sole backup (DRV-01)

---

## Sign-off pointer

Complete human signatures on [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md). Engineering evidence alone does not authorize live service.

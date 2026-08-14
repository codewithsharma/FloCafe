# First supervised café — pilot handoff (P1.6)

**Product:** Opervia Restaurant v3.0.5  
**Scope:** Exactly **one** supervised café. Not mass rollout. Not Retail.  
**Authorization status:** **PILOT READY — HUMAN GATES PENDING** (see [`pilot-signoff.md`](./pilot-signoff.md)).  
**Do not install a live café until all applicable sign-off gates are PASS (or written CEO/CTO waiver).**

Related: [`pilot-runbook.md`](./pilot-runbook.md) · [`incident-response.md`](./incident-response.md) · [`backup-restore.md`](./backup-restore.md) · [`p1.6-cto-release-control-decision.md`](../15-project-management/p1.6-cto-release-control-decision.md)

---

## 1. Artifact to install

| Item                    | Value                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Version                 | **3.0.5**                                                                                                                        |
| Brand / vertical        | **Opervia Restaurant**                                                                                                           |
| Required artifact class | **Signed + notarized PILOT/PRODUCTION** Mac (or platform chosen for the café)                                                    |
| Forbidden               | Local `release/mac-arm64/Nexora.app` (or any build) with **Signature=adhoc**                                                     |
| How to obtain           | CI `.github/workflows/release.yml` with secrets populated, **or** local `npm run build:mac` with Developer ID + Apple notary env |
| Secrets required (Mac)  | `MAC_CERTS` / `CSC_LINK`, `MAC_CERTS_PASSWORD` / `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`     |
| Verify before install   | `codesign -dv --verbose=4 <App>` → **not** adhoc; `spctl --assess`; stapler/notarization checks per release workflow             |

**Current engineering machine (2026-08-14):** 0 codesign identities; signing env UNSET → **cannot** produce pilot artifact here.

---

## 2. Restaurant vertical confirmation

| Check                | Required                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ACTIVE_VERTICAL_ID` | **Unset** or `restaurant`                                                                                    |
| Never                | `retail`, `retail-test`                                                                                      |
| Evidence             | `.env.example`, `docs/08-development/local-setup.md`, `main/modules/vertical-config.ts` (unset → restaurant) |

After install: confirm Settings / composition shows restaurant capabilities (tables/KDS available when enabled). If Retail modules appear without tables/KDS, **stop** — wrong vertical.

---

## 3. Master PIN escrow (human)

**Never put the Master PIN in chat, git, Drive, DB, or this document.**

Procedure (`pilot-runbook.md`):

1. During first setup, set Master PIN.
2. Write it on paper or sealed envelope offline with the café owner.
3. Brief: only authorized owner/manager may know it.
4. Mark `pilot-signoff.md` Master PIN escrow gate **PASS** only after owner confirms escrow exists offline.

Lost PIN + no escrow = critical escalate (`incident-response.md`). Do not brute-force.

---

## 4. OPS-01 site check (human)

From `pilot-runbook.md` / `operations.md`:

- [ ] Default prefer `network_mode = localhost`
- [ ] If multi-device: `kds_lan` or `lan` **only** on staff-only SSID/VLAN
- [ ] Guest Wi‑Fi / public hotspot **cannot** reach POS IP on ports **3001–3003**
- [ ] Stop rule: if guest can reach POS → set `localhost` and restart

Mark OPS-01 **PASS** only after on-site verification (screenshot/notes attached to sign-off). Policy text alone is not PASS.

---

## 5. Backup policy confirmation (human)

`backup-restore.md` still has:

- Approved frequency → **POLICY VALUE PENDING APPROVAL**
- Local retention → **POLICY VALUE PENDING APPROVAL**
- Drive retention → **POLICY VALUE PENDING APPROVAL**

Recommended (not approved SLA): verify ≥1 local backup per service day; escrow Master PIN offline.

CEO/owner must approve numeric values **or** attach written waiver accepting recommended practice. Do not invent numbers in the repo.

---

## 6. Pilot sign-off

Complete [`pilot-signoff.md`](./pilot-signoff.md):

1. Fill release identity (commit/tag, artifact URL, platform, artifact class = PILOT/PRODUCTION).
2. Close all PENDING applicable gates with evidence.
3. CTO + CEO/operator + Pilot owner signatures.

Until then: **no live service day.**

---

## 7. First-day verification

Use `pilot-runbook.md` FIRST INSTALL + first service checks. Minimum:

- [ ] Fresh install of **signed** artifact on café machine
- [ ] Vertical = Restaurant
- [ ] Master PIN escrowed offline
- [ ] OPS-01 holds
- [ ] Open shift (if shifts enabled)
- [ ] Cash sale + card/manual tender smoke
- [ ] Refund smoke (if used)
- [ ] Local backup created (Master PIN)
- [ ] Printer smoke if printer required
- [ ] KDS smoke if KDS required
- [ ] Day-close / recon path understood

---

## 8. Escalation

| Topic                 | Doc                                                 |
| --------------------- | --------------------------------------------------- |
| Severity / escalate   | [`incident-response.md`](./incident-response.md)    |
| Pilot incident log    | [`pilot-incident-log.md`](./pilot-incident-log.md)  |
| Recovery / missing DB | REC-01 + [`backup-restore.md`](./backup-restore.md) |
| Rollback              | [`rollback.md`](./rollback.md)                      |

---

## Explicit non-goals for this handoff

- Phase 3.5 / Retail productization
- Multi-café mass rollout
- Unsigned or adhoc “training” builds for live trade

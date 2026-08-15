# R16 — OPS-02 On-Site Drill Script

**Purpose:** Operator-facing script to produce **evidence** for `ops-02-site-readiness-checklist.md`.
**Does not authorize Go-Live by itself.** Complete checklist + signed RC + escrow + executive sign-off required.
**Simulation (`npm run test:r15`) does not satisfy this script.**

**Prerequisites**

- [ ] Artifact class = **PILOT/PRODUCTION** (Developer ID signed + notarized on macOS; not adhoc)
- [ ] Artifact path + SHA-256 recorded on `pilot-signoff.md`
- [ ] Café POS host; staff LAN only; guest Wi‑Fi isolation planned
- [ ] Master PIN known to owner; escrow envelope ready (blank attestation form)

---

## Drill 1 — Fresh install smoke (15–20 min)

1. Install signed RC on café machine (clean userdata preferred).
2. Complete first-run / owner setup.
3. Confirm app opens; Restaurant vertical; record schema tip from About/health if available.
4. Create Owner, Manager, Cashier; verify role logins.
5. **Evidence:** photo of About/version + commit/build id; initials/date on checklist §A–D.

## Drill 2 — Happy path sale → Z → backup (20–30 min)

1. Set `shifts_enabled` + `require_open_shift_for_cash` per OPS-01.
2. Open shift + float.
3. Create order → (KDS bump or paper N/A) → pay → receipt.
4. Second sale; Owner/Manager discount once.
5. Close shift; day-close / Z; local Master-PIN backup.
6. **Evidence:** Z export or screenshot; backup filename; initials on checklist §E.

## Drill 3 — Failure drills (30–45 min)

1. **Printer:** disconnect → payment still succeeds; reconnect → Test Print.
2. **KDS (if used):** kill companion → POS still sells; recover board.
3. **LAN:** confirm guest SSID cannot reach `:3001`–`:3003`.
4. **Restart:** force-quit app mid-shift → reopen → orders/shift intact.
5. **Restore:** restore from Drill 2 backup to spare userdata or documented restore path; confirm continuity.
6. **Corrupt-DB awareness (R14):** if engineering provides a lab corrupt fixture on TRAINING only, observe 503 `recovery_required` then restore — **do not corrupt production DB**. On live café, document that operators know recovery UI / support path.
7. **Evidence:** short notes + timestamps on checklist §F.

## Drill 4 — Operator acceptance

1. Walk owner/manager through incident escalation (`incident-response.md`).
2. Confirm training checklist items verbally.
3. **Evidence:** names/dates on checklist §G and `pilot-signoff.md`.

---

## After drills

1. Attach evidence paths (Drive folder / paper packet — **not** git).
2. Do **not** mark PASS on empty checkboxes.
3. Proceed to Master PIN escrow attestation + executive signatures.

# R16 — Production Release — Human Blocker

**Status:** BLOCKED (human-only) — engineering R-waves R1–R15 deepen COMPLETE for planned executable scope
**Date:** 2026-08-15
**Schema tip:** **v86**

## Verdict

| Gate                                          | Status                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Engineering R1–R15 (authorized deepen slices) | COMPLETE                                                                     |
| Signed / notarized RC                         | **BLOCKED** — no codesign/notarization identities in engineering environment |
| OPS-02 site drills (café hardware)            | **PENDING HUMAN/SITE**                                                       |
| Master PIN escrow (offline paper)             | **PENDING HUMAN**                                                            |
| Operational + CTO + CEO sign-off              | **PENDING**                                                                  |
| Live café validation                          | **DEFERRED**                                                                 |
| Controlled Pilot                              | READY WITH CONDITIONS                                                        |
| Live Go-Live                                  | **NO-GO**                                                                    |

## Why this is not an engineering continue-target

R16 is an ops/release gate, not a feature wave. Remaining work requires humans:

1. Produce signed/notarized installers for target café OS
2. Install signed RC on café hardware (not adhoc/dev builds)
3. Complete OPS-02 checklist (LAN isolation, backup/restore, FIN-01 drills, training)
4. Escrow Master PIN offline
5. Sign pilot go/no-go

## Explicit non-claims

Do **not** claim: live café PASS, signed RC VERIFIED, production PASS, Live Go-Live GO.

## Next human action

1. Follow gate checklist: [`r16-release-gate-checklist.md`](./r16-release-gate-checklist.md)
2. Site drills: [`../13-operations/r16-ops-02-drill-script.md`](../13-operations/r16-ops-02-drill-script.md) + [`../13-operations/ops-02-site-readiness-checklist.md`](../13-operations/ops-02-site-readiness-checklist.md)
3. Escrow attestation (no PIN in git): [`../13-operations/r16-master-pin-escrow-attestation.md`](../13-operations/r16-master-pin-escrow-attestation.md)
4. Sign-off packet: [`../13-operations/r16-executive-signoff-packet.md`](../13-operations/r16-executive-signoff-packet.md) → [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md)

## Related

- R15 sim ≠ OPS-02 (`docs/05-production/r15-simulation-s1.md`)
- Packaging: unsigned local builds remain TRAINING/QA only
- Engineering completion: `roadmap-engineering-completion-r0-r16.md`

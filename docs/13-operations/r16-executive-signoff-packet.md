# R16 — Executive Sign-off Evidence Packet (pointer)

Use existing templates; do not duplicate conflicting signature blocks.

| Gate                                                      | Fill here                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Release identity (commit, artifact path, checksum, class) | `docs/13-operations/pilot-signoff.md` § Release identity                      |
| OPS-02 site checklist                                     | `docs/13-operations/ops-02-site-readiness-checklist.md`                       |
| Drill script                                              | `docs/13-operations/r16-ops-02-drill-script.md`                               |
| Master PIN escrow attestation                             | `docs/13-operations/r16-master-pin-escrow-attestation.md` (PIN never in repo) |
| Aggregated release gate                                   | `docs/05-production/r16-release-gate-checklist.md`                            |
| Human blocker summary                                     | `docs/05-production/r16-production-release-blocker.md`                        |

**Release decision language (only when all gates PASS):**

> Live café service on signed RC [artifact] at [site] authorized effective [date]. Approvers: Operational / CTO / CEO as signed on pilot-signoff.md.

Until then, Live Go-Live remains **NO-GO**.

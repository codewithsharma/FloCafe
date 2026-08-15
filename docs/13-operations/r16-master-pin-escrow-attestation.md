# R16 — Master PIN Escrow Attestation (template)

**WARNING:** Never write the Master PIN value in this file, chat, Drive shared docs linked from git, or the repository.

**Purpose:** Prove that offline escrow exists without recording the secret.

| Field                              | Value (fill by hand / sealed process)            |
| ---------------------------------- | ------------------------------------------------ |
| Café / site name                   |                                                  |
| App version / RC commit            |                                                  |
| Escrow medium                      | Paper sealed envelope / other offline (describe) |
| Storage location (physical)        |                                                  |
| Dual-control holders (roles/names) |                                                  |
| Date escrowed                      |                                                  |
| Next review date                   |                                                  |
| Attestor name / role               |                                                  |
| Attestor signature                 |                                                  |
| Witness name / role                |                                                  |
| Witness signature                  |                                                  |

## Checklist

- [ ] PIN is **not** stored in DB, Settings export shared insecurely, chat, git, or cloud notes
- [ ] Recovery procedure briefed (`pilot-runbook.md` Master PIN sections)
- [ ] Envelope / medium sealed and labeled (café + date only — no PIN)
- [ ] Owner knows how to rotate PIN after break-glass use

**Status after completion:** record **PENDING → PASS** only on `pilot-signoff.md` / OPS-02 checklist **without** attaching the PIN.

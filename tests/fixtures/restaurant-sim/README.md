# Restaurant simulation fixtures (R15)

Versioned seeds and mock sinks for the virtual café scenario packs.

**Banner: simulation ≠ OPS-02 signed café pilot.**

A green `npm run test:r15` run proves deterministic CI/local automation on clean userdata. It does **not** satisfy OPS-02 live café site readiness, signed RC, or human pilot sign-off.

| Path                | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `s1-cafe.json`      | S1 normal-sale café profile (menu, float, terminal) |
| `printer-sink.json` | Mock ESC/POS sink contract (no hardware)            |

See `docs/05-production/r15-simulation-s1.md` and `docs/00-product/restaurant-simulation.md`.

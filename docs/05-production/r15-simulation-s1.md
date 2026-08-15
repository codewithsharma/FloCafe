<!-- Last updated: 2026-08-15 -->

# R15 — Simulation S1 foundation

**Status:** COMPLETE (S1 foundation pack)  
**Suite:** `npm run test:r15`  
**Fixtures:** `tests/fixtures/restaurant-sim/`  
**Schema:** no bump — test / fixture / docs only

> **BANNER: simulation ≠ OPS-02 signed café pilot**  
> Green CI/local simulation proves a deterministic virtual-café path on clean userdata.  
> It does **not** replace OPS-02 site readiness, signed/notarized RC, or human café pilot sign-off.

## S1 flow covered

| Step              | Exercised                                                             |
| ----------------- | --------------------------------------------------------------------- |
| Open shift        | Yes (`openShift` on fixture terminal + float)                         |
| Create order      | Yes (`POST /api/orders`)                                              |
| Bill + cash pay   | Yes (`POST /api/bills/generate`, `POST /api/bills/:id/payment`)       |
| Close shift       | Yes (counted cash = expected)                                         |
| Day-close / Z     | Yes (`POST /api/reports/day-close`, `GET .../export/z.txt`)           |
| Local backup      | Yes (`POST /api/db/backup` + Master PIN)                              |
| Mock printer sink | Fixture + in-test sink only — **no** `printers.ts` / thermal hardware |
| KDS companion     | **Gap** — deferred to later R15 packs                                 |

## How to run

```sh
npm run test:r15
```

Uses `tests/run-electron-node-test.cjs` + clean temp userdata (Electron `getPath` mock). Reuses `tests/helpers/test-setup.ts`.

## Remaining gaps (not S1 foundation)

- S2–S10 scenario packs (`restaurant-simulation.md`)
- KDS stop/start, real receipt reprint, Playwright UI E2E
- Failure injection (network deny, corrupt restore) beyond local backup create
- Claiming OPS-02 / live go-live readiness from this suite

## OPS-02 truth

Live café validation: **DEFERRED**  
Controlled Pilot: unchanged by R15  
Live Go-Live: **NO-GO** (simulation PASS ≠ site PASS)

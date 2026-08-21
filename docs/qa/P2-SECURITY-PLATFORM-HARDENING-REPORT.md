# P2 Security & Platform Hardening Report

**Date:** 2026-08-21  
**Branch:** `restaurant-vertical`  
**Baseline commit (P1.1):** `8111878`  
**Product:** OPERAVIA (flo-desktop) 3.0.5 · schema tip **v86**

---

## 1. Scope

P2 hardens security and platform boundaries for a **local-first Electron POS**:

1. Server security headers (main + companion listeners)
2. KDS / WebSocket upgrade guards
3. Authentication boundary hardening (JWT algorithm pin, refresh rotation)
4. Sensitive API cache policy + login timing
5. Electron boundary verification (no weakening)

**Out of scope (deferred):** CSP nonce migration / JWT out of `localStorage` (Phase C), Master PIN length/persistence, TLS on LAN, REAL→cents, product features.

---

## 2. Baseline (pre-change)

| Control                         | Main `:3001`            | Server App `:3003` | KDS `:3002` |
| ------------------------------- | ----------------------- | ------------------ | ----------- |
| Helmet / CSP                    | Yes                     | **No**             | **No**      |
| Hide `X-Powered-By`             | Yes (Helmet)            | **No**             | **No**      |
| API `Cache-Control: no-store`   | No                      | No                 | No          |
| JWT `algorithms: ['HS256']`     | No pin                  | No pin             | No pin      |
| Refresh revokes presented token | **No**                  | n/a                | n/a         |
| WS `maxPayload`                 | Default                 | n/a                | Default     |
| WS Origin allowlist             | No                      | n/a                | No          |
| Electron sandbox / IPC          | Already hardened (P0.6) | —                  | —           |

---

## 3. Architecture / security boundaries

```text
Electron renderer (sandbox, contextIsolation, no nodeIntegration)
        │ HTTP localhost only
        ▼
Main Express :3001 ── JWT requireAuth (DB role) ── routes
        │ WS /kds
        ▼
KDS protocol (auth message ≤5s, kitchen roles)

Companion Server App :3003 ── staff JWT ── proxy mutations → loopback main
Companion KDS :3002 ── kitchen JWT ── REST + WS /kds

Trust boundary: JWT + DB user status + role (CORS is not a security boundary).
```

---

## 4. Findings

| ID    | Severity        | Finding                                                          | Fix                                                       | Test                                |
| ----- | --------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- |
| P2-01 | **P2**          | Server App / KDS lacked Helmet; exposed `X-Powered-By`           | `applySecurityHeaders` on both listeners                  | `tests/unit/helmet-headers.test.ts` |
| P2-02 | **P2**          | Helmet advertised HSTS on plain HTTP                             | `strictTransportSecurity: false`                          | helmet unit (HSTS undefined)        |
| P2-03 | **P2**          | Auth/token/export responses cacheable by LAN browsers            | `applyApiNoStoreCache` (image GET exempt)                 | helmet unit                         |
| P2-04 | **P2**          | JWT verify/sign did not pin HS256                                | `main/security/jwt.ts` used everywhere                    | alg pin unit                        |
| P2-05 | **P2**          | `/auth/refresh` (and select-tenant reissue) left old token valid | Revoke presented token; refresh embeds DB role            | `jwt-logout-lifecycle`              |
| P2-06 | **P2**          | KDS WS upgrade had no Origin check / unbounded payload           | Origin allowlist + `maxPayload` 64KiB                     | origin unit + KDS suites            |
| P2-07 | **P3**          | Login skipped bcrypt when user missing (timing enumeration)      | Always compare (dummy hash)                               | covered by auth suites              |
| P2-08 | **P1** residual | CSP `'unsafe-inline'` + JWT in `localStorage`                    | **Deferred** Phase C                                      | documented                          |
| P2-09 | **P1** residual | Master PIN 4-digit + in-memory lockout                           | **Deferred** (install compatibility)                      | documented                          |
| P2-10 | **P2** residual | Pre-auth WS connect-then-auth (5s window)                        | Caps already exist; full upgrade-auth would break clients | deferred with justification         |
| P2-11 | —               | Electron sandbox / navigation / IPC                              | **Verified controlled** — no change                       | Phase A/B2 PASS                     |

---

## 5. Intentional exceptions

| Exception                                      | Why                                               |
| ---------------------------------------------- | ------------------------------------------------- |
| No TLS / HSTS off                              | Localhost + LAN HTTP POS                          |
| CSP `script-src`/`style-src` `'unsafe-inline'` | Next static export until Phase C                  |
| `connect-src` localhost ports                  | Multi-port API + KDS WS                           |
| Missing WS `Origin` allowed                    | Native Electron/`ws` clients omit Origin          |
| Private-IP general rate-limit bypass           | Busy LAN POS; auth rate limit does **not** bypass |
| Product images `Cache-Control: no-cache`       | Cross-terminal freshness + ETag                   |
| COEP off                                       | Electron + static compatibility                   |

---

## 6. Validation evidence

| Suite                                      | Result                                            |
| ------------------------------------------ | ------------------------------------------------- |
| `tests/unit/helmet-headers.test.ts`        | **7/7 PASS**                                      |
| `tests/jwt-logout-lifecycle.test.ts`       | **PASS** (refresh rotation)                       |
| `tests/security-hardening.test.ts`         | **PASS**                                          |
| `tests/kds-websocket-revalidation.test.ts` | **PASS**                                          |
| `tests/kds-integration.test.ts`            | **PASS**                                          |
| `tests/cors-security.test.ts`              | **PASS**                                          |
| `tests/electron-sandbox-phase-a.test.ts`   | **PASS**                                          |
| `tests/electron-ipc-phase-b2.test.ts`      | **PASS**                                          |
| `npm run test:unit`                        | **PASS** 7 files / 34 tests (includes helmet 7/7) |
| `npm run test:unit:frontend`               | **PASS** 2 files / 10 tests                       |
| `npm run test:recovery`                    | **PASS** pass=3                                   |
| `npm run test:critical`                    | **PASS** pass=24                                  |
| `npm run test:integration` (merge)         | **PASS** pass=180 fail=0                          |
| `npm run test:discover-guard`              | **PASS** 239 classified                           |
| `npx tsc --noEmit`                         | **PASS**                                          |
| `npm run lint:backend`                     | **PASS** (warnings only)                          |
| `npm run build:frontend`                   | **PASS**                                          |

---

## 7. Remaining risks

1. Cleartext JWT on `kds_lan` / `lan` (ops / VLAN; TLS later).
2. XSS → token theft while CSP allows `'unsafe-inline'` and JWT lives in `localStorage`.
3. Master PIN brute-force after process restart (in-memory lockout).
4. Pre-auth WS sockets (≤25) can still be used for short connection churn DoS.
5. Companion static UI served without auth (by design for login pages).

---

## 8. Deferred

| Item                                        | Why deferred                                            |
| ------------------------------------------- | ------------------------------------------------------- |
| CSP nonces + HttpOnly token storage         | Phase C; large frontend migration                       |
| Master PIN ≥6 + durable lockout             | Breaks existing 4-digit installs without migration plan |
| JWT at WS upgrade time                      | Would break current connect-then-auth clients           |
| Role gate on LAN info routes                | Low impact; schedule with P2.1 follow-up                |
| Server-app progressive login lockout parity | Separate auth UX change                                 |

---

## 9. Files changed (important)

- `main/middleware/http-observability.ts` — headers + no-store
- `main/security/jwt.ts` — HS256 pin helpers (new)
- `main/security/websocket-upgrade.ts` — Origin + payload helpers (new)
- `main/server.ts`, `main/server-app.ts`, `main/kds-server.ts`
- `main/routes/auth.ts`, `main/services/kds.ts`, `main/security/ipc-auth.ts`
- `tests/unit/helmet-headers.test.ts`, `tests/jwt-logout-lifecycle.test.ts`
- `docs/qa/P2-SECURITY-PLATFORM-HARDENING-REPORT.md`

---

## 10. Final status

**COMPLETE** for the scoped P2 slice (headers, companions, JWT pin/rotation, WS upgrade guards, auth timing). Residual P1 items intentionally deferred with documentation.

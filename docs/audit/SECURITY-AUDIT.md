# Security Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5
**Scope:** Electron 43 main process (Express 5 API, better-sqlite3, printing, IPC), static Next.js renderer, standalone LAN server-app, KDS. Read-only; no files modified.

> **Headline: this is a well-secured codebase.** No **Critical** or **High** vulnerability was confirmed. Electron hardening, SQL parameterization, command-execution discipline, authentication/RBAC, and secret storage are solid — several are exemplary. All confirmed findings are **Medium or lower** and are largely defense-in-depth. Two premises this audit started with — a command-injection surface in `thermal.ts`, and "no CSP" — were **disproven by the code** and are documented under Verified-Safe. No finding here is asserted without file-level evidence.

---

## 1. Severity roll-up

| #   | Finding                                                                | Severity   | Class                             |
| --- | ---------------------------------------------------------------------- | ---------- | --------------------------------- |
| 1   | Master PIN is 4 digits with a restart-resettable in-memory lockout     | **Medium** | Confirmed                         |
| 2   | CSP allows `'unsafe-inline'` scripts while JWT lives in `localStorage` | **Medium** | Confirmed                         |
| 3   | Standalone LAN server-app sets no security headers                     | **Medium** | Confirmed                         |
| 4   | Login user-enumeration via response timing                             | Low        | Confirmed                         |
| 5   | `jwt.verify`/`sign` don't pin the algorithm                            | Low        | Confirmed (non-exploitable today) |
| 6   | Predictable world-readable temp file holds receipt PII while printing  | Low        | Confirmed                         |
| 7   | Server-app login lacks the per-account progressive lockout             | Low        | Confirmed                         |
| 8   | General `/api` rate limiter bypassed for private IPs by default        | Info/Low   | Confirmed (by design)             |
| 9   | Zod validation not uniformly enforced across routes                    | Info       | Confirmed (no exploit today)      |
| 10  | Network printing opens a socket to an operator-configured `ip:port`    | Info       | Confirmed (config-gated)          |
| —   | bcrypt cost factor 10 (below common cost-12 recommendation)            | Low/Info   | Confirmed                         |

## 2. Confirmed findings (detail)

### 2.1 Master PIN — 4 digits, restart-resettable lockout (Medium)

- **Location:** `main/services/master-pin.ts` (`PIN_REGEX = /^\d{4}$/`; `RATE_LIMIT_MAX_ATTEMPTS = 5` over 15 min in an in-memory map; `bcrypt.hashSync(pin, 10)` → `master-pin.enc`).
- **Evidence/Why it matters:** the Master PIN gates destructive operations (backup/restore via IPC, recovery flows, void/cancel). 4 digits = 10,000-value keyspace; the lockout counter is **not persisted**, so restarting the app resets it, enabling slow grinding **from a context that already has local access**.
- **Impact:** unauthorized DB restore (malicious backup injection) or data destruction — but only from a context that can already reach the entry points (renderer IPC, or owner JWT / localhost `requireLocalSetup`). **Not remotely reachable by a low-privilege user** — this is what holds it at Medium.
- **Recommendation:** persist the failed-attempt counter + lockout deadline across restart; add exponential backoff; allow 6+ digit PINs.
- **Confidence:** High (mechanics); severity bounded by the local-access precondition.

### 2.2 CSP `'unsafe-inline'` + JWT in `localStorage` (Medium)

- **Location:** `main/middleware/http-observability.ts` (helmet CSP: `scriptSrc: ["'self'","'unsafe-inline'"]`); token in `frontend/src/lib/api.ts:24` (`localStorage`, sent as Bearer).
- **Why it matters:** `'unsafe-inline'` neutralizes CSP's main XSS mitigation, and a JS-readable bearer token means any XSS escalates directly to token/account compromise.
- **Mitigating factors (verified):** `contextIsolation`/`sandbox` on, only bundled static assets loaded, navigation allowlisted — so current XSS surface is small; `'unsafe-eval'` is already absent.
- **Recommendation:** remove `'unsafe-inline'` from `script-src` (nonce/hash the inline scripts Next.js needs); longer-term hold the token in memory or an httpOnly cookie.
- **Confidence:** High.

### 2.3 Standalone server-app has no security headers (Medium; Low if loopback-only)

- **Location:** `main/server-app.ts:148-157` (setup), `:315` (network-mode bind).
- **Evidence:** pipeline is `cors → express.json → /api rateLimit` with **no** `applySecurityHeaders`/helmet, unlike `server.ts`; it serves the HTML bundle via `express.static` and can bind beyond loopback.
- **Impact:** on a shared/hostile LAN, waiter-tablet responses are clickjackable and unhardened. Lower than the main renderer (targets trusted service devices).
- **Recommendation:** apply the same `applySecurityHeaders(app)` used in `server.ts`.
- **Confidence:** High. (Cross-referenced in ARCHITECTURE §7.3, BACKEND §6.)

### 2.4 Login user-enumeration via timing (Low)

- **Location:** `main/routes/auth.ts` (~login handler); `main/server-app.ts:196-204`.
- **Evidence:** `if (user) { passwordMatches = bcrypt.compareSync(...) }` — unknown emails skip the bcrypt compare and return measurably faster.
- **Recommendation:** always run a bcrypt compare against a dummy hash on the absent-user path (constant work). **Confidence:** High.

### 2.5 JWT algorithm not pinned (Low, non-exploitable today)

- **Location:** `main/routes/auth.ts`, `main/server-app.ts:86,211`, `main/security/ipc-auth.ts:39`.
- **Evidence:** `jwt.verify(token, secret)` with no `{algorithms:['HS256']}`; signing omits explicit `algorithm`. Not exploitable (symmetric secret; jsonwebtoken v9 rejects `alg:none`; no public key for confusion), but pinning prevents regressions.
- **Recommendation:** pass `{algorithms:['HS256']}` to verify and `algorithm:'HS256'` to sign. **Confidence:** High.

### 2.6 World-readable temp file with receipt PII (Low)

- **Location:** `main/printers/thermal.ts` (~2216, ~2462) — `flo_print_${pid}_${Date.now()}.bin` in `os.tmpdir()` with default perms, then spooled via `lp`/PowerShell.
- **Impact:** brief local disclosure of receipt contents (customer name, items, totals) on multi-user machines under a guessable name.
- **Recommendation:** create with `0o600` (or a per-process `mkdtemp` dir) and unlink in a `finally`. **Confidence:** High. (Also noted by the peripherals review.)

### 2.7 Server-app login lacks per-account lockout (Low)

- **Location:** `main/server-app.ts:183-215` — uses only per-IP `authRateLimit`, not the per-account `checkRateLimit`/lockout (`MAX_ATTEMPTS 5`/15-min) that `main/routes/auth.ts` applies.
- **Recommendation:** share the account-lockout logic across both login paths. **Confidence:** High.

### 2.8–2.10 & bcrypt cost (Info/Low)

- **2.8** General `/api` limiter defaults `bypassPrivateIp:true` (exempts 127/10/172.16-31/192.168/Tailscale 100.64). Auth endpoints correctly override (`bypassPrivateIp:false`). Non-auth abuse is unthrottled on the LAN by design — keep a coarse ceiling or document the accepted risk.
- **2.9** 24 of 43 route files don't use the zod middleware (incl. `orders/*`, `printers.ts`, `reports.ts`, `database.ts`). **Not a vulnerability** — SQL is parameterized and identifiers allowlisted — but a consistency/hardening gap. Extend zod to remaining mutation routes. (Cross-ref CODE-QUALITY §5.)
- **2.10** `printViaNetwork` opens a raw TCP socket to a DB-configured printer `ip:port`; requires privileged config write to abuse; inherent to network printing. Optionally constrain to private ranges.
- **bcrypt cost 10** (`bcrypt.hashSync(x,10)` throughout) is below the common cost-12 recommendation; raising it is a one-line hardening.

## 3. Verified-Safe (checked against code — not assumed)

- **Command injection — SAFE (premise disproven):** every `execSync` uses a **static** string (e.g. `'lpstat -v 2>/dev/null'`, `thermal.ts:176`). All dynamic values go through `execFile`/`execFileSync` with **array args, no shell** (e.g. `execFileSync('lpstat', ['-p', name])`). Windows printing passes printer name + file path as **environment variables** into a **static** `-EncodedCommand` PowerShell script — deliberately injection-proof.
- **SQL injection — SAFE:** values always parameterized; dynamic identifiers gated by `isSafeIdentifier()` (`db.ts:2491`, `^[A-Za-z_][A-Za-z0-9_]*$`); dynamic `IN(...)` uses generated `?` placeholders; the two dynamic SET-clause builders use hardcoded keys (`kitchen-stations.ts`) or an `ALLOWED_TIMESTAMP_FIELDS.has()` allowlist (`whatsapp.ts`); interpolated table names come from `sqlite_master` introspection, not user input.
- **Electron isolation — SAFE:** `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` (`index.ts:281-283`); navigation allowlist (`security/browser-window-security.ts` + `url-allowlist.ts`); `setWindowOpenHandler` deny.
- **Global authentication — STRONG:** `server.ts` applies `requireAuth` globally: Bearer extraction + revocation check (`isTokenRevoked`, sha256-hashed, table + in-memory) + `jwt.verify` + active-user check + token staleness (`iat < tokens_valid_after`), and **sets the role from the DB, not the JWT claim** — a stolen/edited token can't self-elevate.
- **RBAC & no IDOR:** `requireRole` guards every mutation; destructive order ops are Master-PIN gated (`orders/cancel.ts:172`); item lookups are order-scoped (`WHERE id=? AND order_id=?`); staff management enforces privilege-escalation guards and last-active-owner protection. The shared-store model has no per-user record ownership, so classic IDOR doesn't apply.
- **Secret storage:** JWT secret = 32 random bytes via `safeStorage` → `jwt-secret.enc` (`0o600`), env override tightly gated, fail-closed recovery. Master PIN encrypted at rest.
- **Privileged IPC — minimal & guarded:** `preload.ts` exposes a tiny fixed API (no arbitrary invoke); backup/restore require `authorizeMasterPin`; restart-and-install requires `authorizeOwnerManagerJwt` (full verify + active + staleness + role, fail-closed).
- **Path traversal — SAFE:** `security/restore-path.ts` rejects separators/`..`/absolute paths, enforces a filename regex, verifies the resolved dirname, rejects symlinks (managed + external paths).
- **CSP present (premise disproven):** helmet CSP applied with `frameAncestors 'none'`, `objectSrc 'none'`, `baseUri 'self'`, frameguard deny. (Its `'unsafe-inline'` script weakness is Finding 2.2.)
- **Data-export redaction:** `routes/database.ts:38-63` strips `jwt_secret`, cloud creds, pairing codes; redacts `password`/`pin`/`pin_hash`; excludes cloud outbox tables.
- **Logging hygiene:** pino `redact:{paths:REDACT_PATHS, remove:true}`; a scan of ~480 `console.*` found no secret/PII **values** logged (labels/status only). No hardcoded secrets in `main/` or `frontend/src/`; `.env*` gitignored. _(Note: the `console.*` prevalence is a code-quality issue — see CODE-QUALITY §3 — but not a secret-leak issue as written.)_
- **Dependencies:** electron ^43.3.0, express ^5.2.1, helmet ^8.3.0, jsonwebtoken ^9.0.2, bcryptjs ^3.0.3, better-sqlite3 ^13.0.3, zod ^4.4.3 — no known-critical CVEs at audit time.

## 4. Prioritization

The three **Mediums** are the highest-value hardening targets, in order:

1. **Master PIN**: persist lockout + allow longer PINs (2.1).
2. **CSP `'unsafe-inline'` + `localStorage` token**: tighten CSP; move token off `localStorage` (2.2).
3. **Server-app security headers**: reuse `applySecurityHeaders` (2.3).

Then the quick Lows: constant-time login (2.4), algorithm pinning (2.5), `0o600` temp files (2.6), shared account lockout (2.7), bcrypt cost 12.

## 5. Residual unknowns (honest scope note)

- The frontend's CSP `<meta>` / `next.config` settings could not be fully confirmed from the main-process code alone.
- This is a **static** review — no live penetration testing, fuzzing, or runtime exploitation was performed (see README "Areas that could not be fully verified").
- LAN/hostile-network behavior was reasoned from code, not exercised on a real hostile network.

**Security posture: strong for a local-first desktop POS.** The confirmed items are hardening, not holes; the exemplary areas (auth role-from-DB, command/SQL discipline, secret storage, path-traversal defense) are what matter most for a money-handling app.

# GUI QA supporting checks (quick) — 2026-08-15

Not a full GUI pass. Spot checks only.

## 1. E2E server health

| Endpoint                               | Result                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET http://127.0.0.1:3001/api/health` | **200** `{"status":"ok","db":"ok","service":"Flo Local API","version":"2.4.7",...}` |
| `GET http://127.0.0.1:3002/api/health` | **200** `{"status":"ok","service":"Flo KDS Server","version":"1.0.0",...}`          |

## 2. Manager API login

`POST /api/auth/login` (`manager@flo.local` / `E2ePass123!`) → **200**, role `manager`, bearer token issued. Auth path healthy for GUI sessions.

## 3. QA-SEC-CSP-JWT-01 (safe header/body check)

### Routes checked

- `http://127.0.0.1:3001/auth/login/` → 200 HTML
- `http://127.0.0.1:3001/pos/` → 200 HTML

### Content-Security-Policy (both pages)

```
Content-Security-Policy: default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data:;font-src 'self' data:;connect-src 'self' http://localhost:3000 http://localhost:3001 http://localhost:3002 http://localhost:3003 ws://localhost:3001 ws://localhost:3002;frame-ancestors 'none';object-src 'none';base-uri 'self'
```

- CSP **present** on both responses.
- Note: `script-src` / `style-src` allow `'unsafe-inline'` (hardening residual, not absence of CSP).

### JWT / token in HTML body

`grep -iE 'jwt|token'` on first 50KB of each HTML body → **no matches**. Static HTML does not embed JWT/token strings in the sampled prefix.

## 4. SPA exclude `/kds` (bug-report root cause quote)

`main/server.ts` SPA fallback:

```ts
app.get(/^(?!\/api|\/kds).*$/, (req: Request, res: Response) => {
```

Regex: `/^(?!\/api|\/kds).*$/`

Negative lookahead excludes only paths starting with `/api` or `/kds`. Paths such as nested KDS app routes under other prefixes may still hit SPA `sendFile` unless served another way; standalone KDS is on :3002.

## Verdict (supporting only)

- API + KDS health: OK
- Manager login: OK
- CSP header: present (with unsafe-inline)
- JWT in static HTML (50KB sample): not found
- KDS SPA exclude regex documented for root-cause reference

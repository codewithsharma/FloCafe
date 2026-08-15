#!/usr/bin/env node
/**
 * Deep-link HTTP probe for static frontend routes.
 * NOT a GUI pass — records HTTP status + body markers only.
 *
 * Usage:
 *   node docs/qa/evidence/gui/full/probe-routes.mjs <email> <password> <role>
 * Example:
 *   node docs/qa/evidence/gui/full/probe-routes.mjs owner@flo.local 'E2ePass123!' owner
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = process.env.PROBE_API_BASE || 'http://127.0.0.1:3001';
const APP_BASE = process.env.PROBE_APP_BASE || 'http://127.0.0.1:3001';
const KDS_BASE = process.env.PROBE_KDS_BASE || 'http://127.0.0.1:3002';

/** 35 App Router screens from docs/qa/GUI-COVERAGE.md (page.tsx inventory). */
const ROUTES = [
  '/',
  '/dashboard',
  '/pos',
  '/tables',
  '/orders',
  '/kds',
  '/customers',
  '/customers/detail',
  '/products',
  '/addon-groups',
  '/products/low-stock',
  '/products/valuation',
  '/products/movements',
  '/products/counts',
  '/products/recipes',
  '/products/purchasing',
  '/reports',
  '/expenses',
  '/operations',
  '/audit',
  '/staff',
  '/staff/detail',
  '/settings',
  '/whatsapp',
  '/support',
  '/print-test',
  '/order-history-demo',
  '/auth/login',
  '/auth/register',
  '/auth/recover',
  '/setup',
  '/recovery',
  '/qr',
  '/kds-standalone',
  '/server-standalone',
];

const __dirname = dirname(fileURLToPath(import.meta.url));

function usageAndExit() {
  console.error(
    "Usage: node docs/qa/evidence/gui/full/probe-routes.mjs <email> <password> <role>",
  );
  process.exit(1);
}

function withTrailingSlash(path) {
  if (path === '/') return '/';
  return path.endsWith('/') ? path : `${path}/`;
}

async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      `Login failed HTTP ${res.status}: ${typeof body === 'object' ? JSON.stringify(body) : text}`,
    );
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.map((c) => c.split(';')[0]).filter(Boolean).join('; ') || null;
  return {
    status: res.status,
    access_token: body?.access_token ?? null,
    cookie: cookieHeader,
    user: body?.user ?? null,
  };
}

function authHeaders(session) {
  const headers = { Accept: 'text/html,application/xhtml+xml,*/*' };
  if (session.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (session.cookie) {
    headers.Cookie = session.cookie;
  }
  return headers;
}

async function probeUrl(url, headers) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });
    const body = await res.text();
    return {
      url,
      status: res.status,
      redirect: res.headers.get('location') || null,
      ms: Date.now() - started,
      containsCannotGet: body.includes('Cannot GET'),
      containsOperavia: body.includes('Operavia'),
      bodyBytes: Buffer.byteLength(body),
    };
  } catch (err) {
    return {
      url,
      status: 0,
      redirect: null,
      ms: Date.now() - started,
      containsCannotGet: false,
      containsOperavia: false,
      bodyBytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const [email, password, role] = process.argv.slice(2);
  if (!email || !password || !role) usageAndExit();
  if (ROUTES.length !== 35) {
    throw new Error(`Expected 35 routes, got ${ROUTES.length}`);
  }

  const session = await login(email, password);
  const headers = authHeaders(session);

  const results = [];
  for (const route of ROUTES) {
    const path = withTrailingSlash(route);
    const url = `${APP_BASE}${path === '/' ? '/' : path}`;
    results.push(await probeUrl(url, headers));
  }

  const kdsRoot = await probeUrl(
    KDS_BASE.endsWith('/') ? KDS_BASE : `${KDS_BASE}/`,
    headers,
  );

  const summary = {
    kind: 'deep-link-http-probe',
    disclaimer:
      'HTTP deep-link status only — NOT a GUI pass, NOT interaction coverage.',
    probedAt: new Date().toISOString(),
    role,
    email,
    apiBase: API_BASE,
    appBase: APP_BASE,
    kdsBase: KDS_BASE,
    login: {
      ok: Boolean(session.access_token),
      status: session.status,
      hasAccessToken: Boolean(session.access_token),
      hasCookie: Boolean(session.cookie),
      userRole: session.user?.role ?? null,
    },
    routeCount: results.length,
    counts: {
      http2xx: results.filter((r) => r.status >= 200 && r.status < 300).length,
      http3xx: results.filter((r) => r.status >= 300 && r.status < 400).length,
      http4xx: results.filter((r) => r.status >= 400 && r.status < 500).length,
      http5xx: results.filter((r) => r.status >= 500).length,
      networkError: results.filter((r) => r.status === 0).length,
      containsCannotGet: results.filter((r) => r.containsCannotGet).length,
      containsOperavia: results.filter((r) => r.containsOperavia).length,
    },
    routes: results,
    kdsStandaloneRoot: kdsRoot,
  };

  const outPath = join(__dirname, `deep-link-probe-${role}.json`);
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

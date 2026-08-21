import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  applyApiNoStoreCache,
  applySecurityHeaders,
} from '../../main/middleware/http-observability';
import { JWT_ALGORITHM, signAccessToken, verifyAccessToken } from '../../main/security/jwt';
import { isAllowedWebSocketOrigin } from '../../main/security/websocket-upgrade';

describe('helmet security headers', () => {
  it('sets nosniff, CSP, frame deny, Permissions-Policy; hides powered-by; no HSTS', async () => {
    const app = express();
    applySecurityHeaders(app);
    app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));

    const res = await request(app).get('/probe');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'");
    expect(res.headers['content-security-policy']).toContain('ws://localhost:3001');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets Cache-Control no-store on /api except product images', async () => {
    const app = express();
    applyApiNoStoreCache(app);
    app.get('/api/auth/me', (_req, res) => res.json({ ok: true }));
    app.get('/api/products/p1/image', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.status(200).end();
    });

    const me = await request(app).get('/api/auth/me');
    expect(me.headers['cache-control']).toBe('no-store');

    const img = await request(app).get('/api/products/p1/image');
    expect(img.headers['cache-control']).toBe('no-cache');
  });
});

describe('JWT algorithm pin', () => {
  const secret = 'p2-test-secret-at-least-32-chars!!';

  it('signs and verifies HS256 only', () => {
    const token = signAccessToken({ userId: 'u1', role: 'owner' }, secret, { expiresIn: '1h' });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(header.alg).toBe(JWT_ALGORITHM);
    expect(verifyAccessToken(token, secret).userId).toBe('u1');
  });

  it('rejects tokens signed with a different algorithm', () => {
    // Craft HS384 token with same secret — verifyAccessToken must reject.
    const bad = jwt.sign({ userId: 'u1' }, secret, { algorithm: 'HS384', expiresIn: '1h' });
    expect(() => verifyAccessToken(bad, secret)).toThrow();
  });
});

describe('WebSocket Origin allowlist', () => {
  it('allows missing Origin (native / Electron clients)', () => {
    expect(isAllowedWebSocketOrigin(undefined)).toBe(true);
  });

  it('allows localhost and private LAN Origins', () => {
    expect(isAllowedWebSocketOrigin('http://localhost:3001')).toBe(true);
    expect(isAllowedWebSocketOrigin('http://192.168.1.10:3002')).toBe(true);
  });

  it('rejects public Origins', () => {
    expect(isAllowedWebSocketOrigin('https://evil.example')).toBe(false);
    expect(isAllowedWebSocketOrigin('not-a-url')).toBe(false);
  });
});

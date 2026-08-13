import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { applySecurityHeaders } from '../../main/middleware/http-observability';

describe('helmet security headers', () => {
  it('sets nosniff and CSP suitable for Electron static export', async () => {
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
  });
});

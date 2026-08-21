/**
 * Express observability: helmet, compression, pino-http.
 * Safe for Electron desktop + LAN POS (no WS compression interference).
 */

import type { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger, httpLogRedactPaths } from '../lib/logger';
import { currentTraceId } from '../lib/tracing';

const CONNECT_SRC = [
  "'self'",
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'ws://localhost:3001',
  'ws://localhost:3002',
].join(' ');

/**
 * Helmet with Electron/static-export-friendly CSP.
 * Preserves existing connect-src localhost allowances for KDS/dev.
 *
 * Intentional exceptions (local-first POS):
 * - script/style 'unsafe-inline' — Next static export (Phase C: nonces)
 * - HSTS disabled — listeners are plain HTTP (localhost / LAN)
 * - COEP off — Electron + static loads
 */
export function applySecurityHeaders(app: Express): void {
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Next.js static export + Tailwind need unsafe-inline for scripts/styles.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: CONNECT_SRC.split(' '),
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      // Local/LAN HTTP POS — do not advertise HTTPS-only to clients.
      strictTransportSecurity: false,
      // API is same-origin / localhost; COEP/COOP can break Electron file loads.
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      originAgentCluster: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  // Helmet 8 no longer ships Permissions-Policy; set explicitly for POS HTML.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
}

/**
 * Sensitive API responses must not be stored by shared LAN browser caches.
 * Product image GET sets its own Cache-Control (no-cache + ETag) later.
 */
export function applyApiNoStoreCache(app: Express): void {
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const path = req.path || '';
    if (req.method === 'GET' && /\/products\/[^/]+\/image\/?$/.test(path)) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
}

/**
 * Compress API JSON responses above a small threshold.
 * Skips WebSocket upgrades and already-encoded bodies.
 */
export function applyCompression(app: Express): void {
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers.upgrade?.toLowerCase() === 'websocket') return false;
        if (req.path && !req.path.startsWith('/api')) return false;
        return compression.filter(req, res);
      },
    }),
  );
}

export function applyRequestLogging(app: Express): void {
  app.use(
    pinoHttp({
      logger,
      genReqId: (req: Request, res: Response) => {
        const existing = req.headers['x-request-id'];
        const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: () => {
        const traceId = currentTraceId();
        return traceId ? { traceId } : {};
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      redact: {
        paths: httpLogRedactPaths,
        remove: true,
      },
      autoLogging: {
        ignore: (req) => req.url === '/api/health' || req.url?.startsWith('/api/health?') === true,
      },
    }),
  );
}

/** Attach request id / method helpers for routes that need them. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!(req as Request & { id?: string }).id) {
    (req as Request & { id?: string }).id = randomUUID();
  }
  next();
}

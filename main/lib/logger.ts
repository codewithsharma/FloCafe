/**
 * Shared Pino logger for Opervia Express / domain services.
 *
 * Development → pino-pretty (human-readable)
 * Production  → structured JSON
 *
 * Electron main-process logging remains on electron-log where appropriate.
 * Never log passwords, JWTs, PINs, payment credentials, or unnecessary PII.
 */

import pino, { type Logger } from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'pin',
  'master_pin',
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'secret',
  'card_number',
  'cvv',
];

function buildLogger(): Logger {
  if (isTest) {
    return pino({ level: 'silent', redact: { paths: REDACT_PATHS, remove: true } });
  }

  if (!isProduction) {
    try {
      // Lazy require so packaged ASAR builds without pino-pretty still boot.
      const transport = pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      });
      return pino(
        {
          level: process.env.LOG_LEVEL || 'info',
          redact: { paths: REDACT_PATHS, remove: true },
        },
        transport,
      );
    } catch {
      // Fall through to JSON if pretty transport unavailable.
    }
  }

  return pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    redact: { paths: REDACT_PATHS, remove: true },
  });
}

export const logger: Logger = buildLogger();

export const httpLogRedactPaths = REDACT_PATHS;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

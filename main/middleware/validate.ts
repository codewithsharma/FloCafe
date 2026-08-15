/**
 * Zod request validation middleware for Express boundaries.
 */

import { Request, Response, NextFunction } from 'express';
import type { ZodType, ZodError } from 'zod';

/** Zod 4 issue paths are `PropertyKey[]` (may include symbol); stringify for API errors. */
function formatIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const segments = issue.path.map((segment) => String(segment));
      const path = segments.length > 0 ? `${segments.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      res.status(400).json({ error: formatIssues(result.error) || 'Invalid request body' });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params ?? {});
    if (!result.success) {
      res.status(400).json({ error: formatIssues(result.error) || 'Invalid path parameters' });
      return;
    }
    // Express may expose params as a getter-only property — replace via defineProperty.
    Object.defineProperty(req, 'params', {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      res.status(400).json({ error: formatIssues(result.error) || 'Invalid query parameters' });
      return;
    }
    Object.defineProperty(req, 'query', {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

/**
 * Zod request-body validation middleware for Express boundaries.
 */

import { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
          return `${path}${issue.message}`;
        })
        .join('; ');
      res.status(400).json({ error: message || 'Invalid request body' });
      return;
    }
    req.body = result.data;
    next();
  };
}

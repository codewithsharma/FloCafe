/**
 * M4-D5 — Reusable Express middleware for opt-in POS shift enforcement.
 *
 * Apply only to routes that explicitly require an open shift. Orders, payments,
 * and other soft-attribution paths must not use this middleware (RFC §9 / §20).
 */
import { Request, Response, NextFunction } from 'express';
import {
  ShiftServiceError,
  assertOpenShiftForPosTerminal,
  readTerminalIdHeaderFromRequest,
  type ShiftRecord,
} from '../services/shift';

export type ShiftEnforcedRequest = Request & { floActiveShift?: ShiftRecord | null };

/**
 * Require an open shift for the request terminal when shifts_enabled=true.
 * No-op when shifts are disabled. Never uses host terminal fallback.
 */
export function requireOpenShiftForTerminal() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const terminalIdHeader = readTerminalIdHeaderFromRequest(req);
      const activeShift = assertOpenShiftForPosTerminal(terminalIdHeader);
      (req as ShiftEnforcedRequest).floActiveShift = activeShift;
      next();
    } catch (error) {
      if (error instanceof ShiftServiceError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      next(error);
    }
  };
}

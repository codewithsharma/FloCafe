/**
 * Minimal IPC JWT authorization for privileged desktop-bridge mutators.
 * Reuses HTTP auth primitives — not a second session system.
 */
import { verifyAccessToken } from './jwt';
import { getJWTSecret } from '../routes/auth';
import { getUserAuthStatus, isTokenRevoked, isTokenStale } from '../middleware/security';

export type IpcJwtAuthSuccess = {
  ok: true;
  userId: string;
  role: string;
};

export type IpcJwtAuthFailure = {
  ok: false;
  error: string;
  code: 'unauthorized' | 'forbidden';
};

export type IpcJwtAuthResult = IpcJwtAuthSuccess | IpcJwtAuthFailure;

const OWNER_MANAGER_ROLES = new Set(['owner', 'manager']);

/**
 * Verify a renderer-supplied access token for owner/manager IPC actions.
 * Fail-closed. Never persists the token. Never returns the JWT secret.
 */
export function authorizeOwnerManagerJwt(token: string | undefined | null): IpcJwtAuthResult {
  if (typeof token !== 'string' || token.trim() === '') {
    return { ok: false, error: 'Authentication required', code: 'unauthorized' };
  }

  try {
    if (isTokenRevoked(token)) {
      return { ok: false, error: 'Invalid or expired token', code: 'unauthorized' };
    }

    const decoded = verifyAccessToken(token, getJWTSecret()) as {
      userId?: unknown;
      iat?: number;
    };

    if (typeof decoded.userId !== 'string' || !decoded.userId) {
      return { ok: false, error: 'Invalid or expired token', code: 'unauthorized' };
    }

    const status = getUserAuthStatus(decoded.userId, { fresh: true });
    if (!status || !status.isActive) {
      return { ok: false, error: 'Invalid or expired token', code: 'unauthorized' };
    }

    if (isTokenStale(decoded.iat, status.tokensValidAfter)) {
      return { ok: false, error: 'Invalid or expired token', code: 'unauthorized' };
    }

    if (!OWNER_MANAGER_ROLES.has(status.role)) {
      return { ok: false, error: 'Insufficient permissions', code: 'forbidden' };
    }

    return { ok: true, userId: decoded.userId, role: status.role };
  } catch {
    return { ok: false, error: 'Invalid or expired token', code: 'unauthorized' };
  }
}

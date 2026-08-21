/**
 * Shared JWT sign/verify with algorithm pin (defense-in-depth).
 * All access tokens are HS256; alg=none / RSA confusion is rejected.
 */

import jwt from 'jsonwebtoken';

export const JWT_ALGORITHM = 'HS256' as const;

export type AccessTokenClaims = {
  userId: string;
  email?: string;
  role?: string;
  tenantId?: string;
  remember?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
};

export function signAccessToken(
  payload: object,
  secret: string,
  options: { expiresIn: string | number },
): string {
  return jwt.sign(payload, secret, {
    expiresIn: options.expiresIn,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string, secret: string): AccessTokenClaims {
  return jwt.verify(token, secret, {
    algorithms: [JWT_ALGORITHM],
  }) as AccessTokenClaims;
}

/**
 * KDS WebSocket upgrade guards shared by POS (:3001) and companion (:3002).
 */

import type { IncomingMessage } from 'node:http';
import { isAllowedPrivateIp } from '../middleware/security';

/** Reject oversized frames before JSON.parse (DoS / memory). */
export const KDS_WS_MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * Origin policy for browser WS clients.
 * Missing Origin is allowed (Electron/native `ws` clients often omit it).
 * Present Origin must be localhost / .local / private LAN — fail closed otherwise.
 */
export function isAllowedWebSocketOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
      return true;
    }
    return isAllowedPrivateIp(hostname);
  } catch {
    return false;
  }
}

export function rejectWebSocketUpgrade(
  socket: { write: (chunk: string) => void; destroy: () => void },
  statusLine: string,
): void {
  socket.write(`${statusLine}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Returns false when the upgrade must be rejected (caller destroys socket). */
export function assertKdsUpgradeOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return isAllowedWebSocketOrigin(typeof origin === 'string' ? origin : undefined);
}

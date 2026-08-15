/**
 * GET /api/kds-info
 * Returns the KDS access URLs (mDNS + local IP) so the POS UI can render a QR code.
 * The tablet/display on the same network opens either URL in a browser.
 *
 * Requires network_mode=kds_lan or lan. Localhost mode does not advertise LAN KDS.
 * H2: also requires the KDS companion process to be running (no dead-port QR).
 */
import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { getLocalIP, getAllLocalIPs } from '../server';
import { getKdsPort, isKdsServerRunning } from '../kds-server';
import { requireKdsEnabled } from '../middleware/security';
import {
  getNetworkMode,
  isLanKdsEnabled,
  networkModeRequiresRestartMessage,
} from '../services/network-mode';
import { shouldAdvertiseLanKds } from '../services/kds-recovery';

const router = Router();

router.use(requireKdsEnabled);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const mode = getNetworkMode();
    if (!isLanKdsEnabled(mode)) {
      return res.status(403).json({
        error: 'LAN KDS pairing requires network_mode=kds_lan or lan on a staff-only network.',
        code: 'NETWORK_MODE_REQUIRES_KDS_LAN',
        network_mode: mode,
        hint: networkModeRequiresRestartMessage(),
      });
    }

    if (!shouldAdvertiseLanKds({ networkMode: mode, kdsCompanionRunning: isKdsServerRunning() })) {
      return res.status(503).json({
        error: 'KDS companion server is not running. Restart Operavia or check the KDS port.',
        code: 'KDS_SERVER_NOT_RUNNING',
        network_mode: mode,
        kds_server_running: false,
      });
    }

    const kdsPort = getKdsPort();
    const ip = getLocalIP();
    const allIps = getAllLocalIPs();

    const mdnsUrl = `http://flo.local:${kdsPort}`;
    const ipUrl = `http://${ip}:${kdsPort}`;
    const qrUrl = ipUrl;

    const ipsData = await Promise.all(
      allIps.map(async (localIp) => {
        const url = `http://${localIp}:${kdsPort}`;
        try {
          const qr_data = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 256 });
          return { ip: localIp, url, qr_data };
        } catch {
          return { ip: localIp, url, qr_data: null };
        }
      }),
    );

    const primaryIpData = ipsData.find((entry) => entry.ip === ip);
    const qrDataUrl = primaryIpData?.qr_data ?? null;

    res.json({
      network_mode: mode,
      kds_server_running: true,
      mdns_url: mdnsUrl,
      ip_url: ipUrl,
      qr_url: qrUrl,
      qr_data_url: qrDataUrl,
      ips_data: ipsData,
    });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const kdsInfoRoutes = router;

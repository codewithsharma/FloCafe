/**
 * GET /api/pos-info
 * Returns the POS access URLs (mDNS + local IP) so the app can render a QR code.
 * A second cashier scans this from Settings → POS Workflow to open the same
 * POS on another device on the local network.
 *
 * Requires network_mode=lan (staff LAN). Localhost / kds_lan do not advertise
 * unreachable LAN POS URLs.
 */
import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { getLocalIP, getAllLocalIPs, getServerPort } from '../server';
import {
  getNetworkMode,
  isLanPosEnabled,
  networkModeRequiresRestartMessage,
} from '../services/network-mode';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const mode = getNetworkMode();
  if (!isLanPosEnabled(mode)) {
    return res.status(403).json({
      error: 'LAN POS pairing requires network_mode=lan on a staff-only network. Guest Wi-Fi is unsupported.',
      code: 'NETWORK_MODE_REQUIRES_LAN',
      network_mode: mode,
      hint: networkModeRequiresRestartMessage(),
    });
  }

  const port = getServerPort();
  const ip = getLocalIP();
  const allIps = getAllLocalIPs();

  const mdnsUrl = `http://flo.local:${port}`;
  const ipUrl   = `http://${ip}:${port}`;
  const qrUrl   = ipUrl;

  const ipsData = await Promise.all(allIps.map(async (localIp) => {
    const url = `http://${localIp}:${port}`;
    try {
      const qr_data = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 256 });
      return { ip: localIp, url, qr_data };
    } catch {
      return { ip: localIp, url, qr_data: null };
    }
  }));

  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', width: 256 });
  } catch (err) {
    console.warn('[POS-Info] QR generation failed:', err);
  }

  res.json({
    network_mode: mode,
    mdns_url:    mdnsUrl,
    ip_url:      ipUrl,
    qr_url:      qrUrl,
    qr_data_url: qrDataUrl,
    ips_data:    ipsData,
  });
});

export const posInfoRoutes = router;

# Integration Architecture

## CURRENT STATE

| Integration | Direction | Module | Offline behavior |
|-------------|-----------|--------|------------------|
| FloAdmin cloud | Outbound HTTPS + WSS | `cloud-sync.ts` | Outbox queues events |
| Google Drive | Outbound OAuth | `google-drive.ts` | Manual backup still works |
| WhatsApp | Outbound (Baileys) | `whatsapp.ts` | Queue messages locally |
| RevFlo mobile | Pairing code | cloud-sync + `/api/mobile/*` | Pairing requires LAN/cloud |
| Telemetry | Outbound; **enabled by default** on new installs (`telemetry_enabled='true'` in `seedInstallDefaults()`). Owner can disable in Settings → Privacy. | `telemetry.ts` | Silently skips when disabled |
| mDNS | LAN broadcast | bonjour-service | Local only |
| Tax pack catalog | Outbound fetch | `tax-packs.ts` | Bundled packs work offline |

### Cloud design rule
**Billing never blocks on cloud** — `docs/cloud-v2-plan.md`

## TARGET STATE (PLANNED)
| Integration | Priority |
|-------------|----------|
| Payment terminals | P2 |
| Delivery aggregators | P3 |
| Accounting (QuickBooks/Xero export) | P2 |
| Online ordering webhook | P3 |

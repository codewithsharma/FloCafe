# Configuration

## CURRENT STATE

### Environment variables
| Variable | Default | Purpose |
|----------|---------|---------|
| PORT | 3001 | Main API port |
| KDS_PORT | 3002 | KDS server port |
| SERVER_APP_PORT | 3003 | Server app port |
| JWT_SECRET | (generated) | Token signing override |
| MAS_BUILD | — | Mac App Store build flag |
| NODE_ENV | — | development/production |

### Runtime settings
Stored in SQLite `settings` table — accessed via `/api/settings` and IPC.

Key settings include: business info, tax, loyalty, discount, kds_enabled, cloud, google-drive, bill template.

### Electron builder
Configured in `package.json` `build` section.

## TARGET STATE
- `.env.example` documenting all env vars (PROPOSED)
- Settings schema documentation

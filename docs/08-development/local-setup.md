# Local Setup

## CURRENT STATE

### Repository remotes
- `origin`: codewithsharma/FloCafe (fork)
- `upstream`: FreeOpenSourcePOS/FloCafe

### Default branch
`develop` (verified at analysis time)

### Database location
- Dev: adjacent to repo (`flo.db`)
- Packaged: OS userData directory

### Ports
| Service | Default port | Env override |
|---------|--------------|--------------|
| Main API | 3001 | PORT |
| KDS | 3002 | KDS_PORT |
| Server App | 3003 | SERVER_APP_PORT |

### Recovery scripts
- `npm run dev:restart` — Unix restart
- `npm run dev:reset` — nuclear reset (requires confirmation)

### First-run in dev
Navigate to http://localhost:3001/setup or login after initialize.

## Troubleshooting
See README.md Troubleshooting section for printers.

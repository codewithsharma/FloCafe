# Deployment

## CURRENT STATE

FloCafe deploys as **desktop installers**, not server containers.

### Build commands
| Platform | Command |
|----------|---------|
| Linux | npm run build:linux |
| macOS | npm run build:mac |
| Windows | npm run build:win |
| All | npm run build:all-platforms |

### Release pipeline
Tag push → `.github/workflows/release.yml` → GitHub Releases

### Distribution channels
- GitHub Releases (primary)
- Mac App Store (`build:mas`)
- Microsoft Store (AppX)
- Snap Store

### No Docker/Kubernetes deployment exists.

## TARGET STATE
- RestaurantOS uses same desktop deployment model
- Optional cloud management portal (FloAdmin) — separate repo

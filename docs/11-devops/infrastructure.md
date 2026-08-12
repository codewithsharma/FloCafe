# Infrastructure

## CURRENT STATE

**No cloud infrastructure in this repository.**

FloCafe runs on operator hardware:
- Desktop/laptop at restaurant
- LAN for KDS/waiter tablets
- Optional internet for cloud/WhatsApp/Drive

### Build infrastructure
GitHub Actions runners (Linux, macOS, Windows)

### Snap build
LXD + core24 confinement (`package.json` snapcraft config)

## TARGET STATE
- RestaurantOS cloud hub (if any) lives outside this repo
- Document minimum LAN requirements (Wi-Fi, mDNS)

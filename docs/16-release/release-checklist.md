# Release Checklist

## Pre-release (from AGENTS.md)
- [ ] CHANGELOG.md updated
- [ ] package.json version bumped
- [ ] npm run lint
- [ ] npm run build
- [ ] npm run build:frontend
- [ ] npm test
- [ ] npm run test:e2e (if UI changed)
- [ ] tests/upgrade-path.test.ts passes
- [ ] Manual smoke on target OS

## Platform-specific
- [ ] macOS: notarization configured (release.yml)
- [ ] Windows: code signing cert (or document unsigned)
- [ ] Linux: Snap LXD build verified
- [ ] MAS: provisioning profile valid

## Post-release
- [ ] GitHub Release created with artifacts
- [ ] latest-mac.yml / latest.yml verified (release.yml does this)
- [ ] Community announcement (optional)

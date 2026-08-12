# Branching Strategy

## CURRENT STATE

**INFERRED from repository state:**
- Active branch: `develop`
- Upstream default: likely `main` (FreeOpenSourcePOS/FloCafe)
- Release tags trigger production builds (`release.yml`)

### Suggested flow (RestaurantOS)
```
main        ← production-ready releases
develop     ← integration branch (current)
feat/*      ← feature branches
fix/*       ← bug fixes
docs/*      ← documentation
```

## TARGET STATE
- Document whether RestaurantOS uses `main` or `develop` as integration trunk
- Protect main with required CI checks
- Cherry-pick upstream FloCafe fixes via upstream remote

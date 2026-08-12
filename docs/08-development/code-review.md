# Code Review

## CURRENT STATE

CODEOWNERS: `.github/CODEOWNERS`

### Pre-PR checklist (AGENTS.md)
```sh
npm run lint
npm run build
npm test
```

### Review focus areas
| Change type | Review focus |
|-------------|--------------|
| Database migration | Data preservation, upgrade test |
| Auth/permissions | authz tests updated |
| Payment/tax | decimal integrity tests |
| Printing | test print on target OS |
| Frontend | lint + build:frontend |

## TARGET STATE
- Require 1 approval for main merges
- Security review checklist for auth/crypto changes

# Git Workflow

## CURRENT STATE

### Remotes
- Work on fork (`origin`)
- Sync with upstream FloCafe as needed

### Branches
Prefix convention: `fix/`, `feat/`, `docs/`, `test/`, `refactor/`, `chore/`

### Commits
Follow existing repository style (concise, imperative).

### Pull requests
Template: `.github/pull_request_template.md`

Required checks: CI lint, build, npm test, Playwright.

### Rules (AGENTS.md)
- Do not commit unless asked
- Do not push release tags unless asked
- Database migrations must preserve data

# Coding Standards

## CURRENT STATE (from AGENTS.md and codebase patterns)

### General
- TypeScript throughout main/ and frontend/
- Inspect existing code before changing; reuse patterns
- Minimize diff scope
- No credentials in commits

### Backend
- Express route handlers in `main/routes/`
- Shared logic in `main/services/`
- Parameterized SQL only
- New schema changes → append migration in `main/db.ts`

### Frontend
- App Router in `frontend/src/app/`
- Zustand for client state
- shadcn/ui components for UI primitives
- i18n keys in en.json (keep es/pt in sync)

### Database changes
- Additive migrations only for production
- Test fresh install AND upgrade path
- Destructive changes require maintainer review

## TARGET STATE
- ESLint rules documented per directory
- Max function length guideline: 25 lines (aspirational)
- Explicit return types on new code

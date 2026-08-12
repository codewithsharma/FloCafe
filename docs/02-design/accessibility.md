# Accessibility

## CURRENT STATE

**UNKNOWN:** No dedicated a11y audit found in repository.

**Partial support (INFERRED):**
- Radix UI primitives provide basic keyboard/focus behavior
- Semantic HTML in shadcn components
- i18n for 3 languages
- KDS `KdsHtmlLang` sets document language

**Gaps (INFERRED):**
- No axe/playwright a11y tests
- Touch targets verified for POS grid only (layout-integrity E2E)
- Color contrast not systematically tested

## TARGET STATE (PROPOSED)
- WCAG 2.1 AA for login, POS checkout, KDS status updates
- Screen reader labels for cart and payment modals
- Keyboard shortcuts for high-frequency POS actions
- Automated a11y checks in CI

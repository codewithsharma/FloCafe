# AI Architecture

## CURRENT STATE

NOT IMPLEMENTED.

## TARGET STATE (PROPOSED)

```
[RestaurantOS Local]
  ├── Core POS (no AI dependency)
  └── Optional AI Module (disabled by default)
        ├── Local inference (small models) OR
        └── Cloud API (owner opt-in)
              ├── Anonymized aggregates only
              └── No raw customer PII
```

### Integration points
- Read-only access to reports API
- Batch export of anonymized sales data
- Human-in-the-loop for all recommendations

### Anti-patterns to avoid
- AI agent with direct DB write access
- Real-time AI in order critical path

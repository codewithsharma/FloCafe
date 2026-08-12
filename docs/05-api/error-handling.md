# Error Handling

## CURRENT STATE

### HTTP errors
JSON body: `{ error: string }` or `{ error: string, details: ... }`

Common codes:
| Code | Usage |
|------|-------|
| 400 | Validation failure |
| 401 | Missing/invalid token |
| 403 | Role insufficient |
| 404 | Resource not found / feature disabled |
| 409 | Conflict (e.g., KDS optimistic lock) |
| 429 | Rate limit exceeded |
| 503 | Database maintenance lock |

### Async errors
`asyncHandler` middleware forwards to Express error handler.

### Frontend
axios 401 → clear token, redirect login (except KDS paths).

### Printer errors
Structured stage + correlation ID (cloud v2 plan).

## TARGET STATE
- Standard error code enum (PROPOSED)
- User-facing error messages via i18n keys

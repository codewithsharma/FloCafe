# Tracing

## CURRENT STATE

**NOT IMPLEMENTED.** No OpenTelemetry or distributed tracing.

Request correlation exists partially for:
- Printer failure correlation IDs (cloud v2)
- Support ticket client_ticket_id

## TARGET STATE (PROPOSED)
- Request ID middleware for API calls
- Trace print job lifecycle: order → bill → print → log

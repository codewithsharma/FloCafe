# AI Requirements

## CURRENT STATE

**No AI features implemented.** FloCafe operates entirely without AI/ML.

## TARGET STATE (OPTIONAL — P3)

AI must remain **optional** — core POS functions without AI.

### Potential capabilities
| Capability | Value | Dependency |
|------------|-------|------------|
| Demand forecasting | Inventory planning | Historical order data |
| Low-stock recommendations | Reduce waste | Stock ledger (not built) |
| Anomaly detection | Fraud/errors | Audit log (partial) |
| Menu analysis | Pricing optimization | Product cost data |
| NL analytics | Owner queries | Report API |
| Automated summaries | Daily ops brief | Cloud connectivity |

### Non-requirements
- AI must not process payments
- AI must not modify orders without human approval
- Customer PII must not leave premises without consent

# Model Selection

## CURRENT STATE

NOT APPLICABLE.

## TARGET STATE (PROPOSED criteria)

| Use case | Model type | Rationale |
|----------|------------|-----------|
| Demand forecast | Time-series (Prophet/ARIMA) | Interpretable, no LLM needed |
| NL analytics | Small LLM or API | Owner-facing queries |
| Anomaly detection | Statistical + rules | Low cost, explainable |

Prefer local/smallest model that meets accuracy targets.

# Performance Testing

## CURRENT STATE

**NOT IMPLEMENTED** as formal performance test suite.

### Informal indicators
- `test-data/stress-products.csv` — stress product import data
- SQLite WAL mode for concurrent KDS reads
- CI completes full test suite (timing not tracked)

## TARGET STATE (PROPOSED)
- Benchmark order creation with 1000 products
- KDS WebSocket fan-out with 10 clients
- Migration timing on 100MB database
- 12-hour soak test checklist for releases

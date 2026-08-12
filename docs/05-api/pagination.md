# Pagination

## CURRENT STATE

Pagination is **inconsistent** — not all list endpoints paginate.

### Verified paginated endpoints
- `GET /api/customers` — `page`, `per_page` params (`tests/customer-pagination.test.ts`)

### Non-paginated (returns full lists)
- Products, categories, staff (typical for local POS scale)

## TARGET STATE
- Standard pagination contract: `page`, `per_page`, `total`, `items`
- Cursor-based pagination for order history at scale (PROPOSED)

# Indexing Strategy

## CURRENT STATE

### Baseline indexes (v1 createSchema)
- products: category, active
- orders: status, created, user
- order_items: order
- bills: order
- tax tables: pack_version

### Performance indexes (v45+)
- orders: customer, table_id, type
- bills: created_at, **payment_status**, paid_at, customer_id
- order_items: product_id
- customers: created_at
- print_logs: bill_id
- loyalty_ledger: bill_id + type
- payment_idempotency: bill
- bill_items: order_item
- bills: split_group_id

Index name in code: `idx_bills_paid_status_paid_at` — indexes **`payment_status`**, not a column named `paid_status`.

### Unique constraints
- tables.number, users.email, orders.order_number, bills.bill_number
- customers.phone_digits (partial unique, v23)
- payment_methods.name (NOCASE)

## TARGET STATE
- Index review when order history exceeds 100k rows (PROPOSED)
- Covering indexes for reporting queries (PROPOSED)

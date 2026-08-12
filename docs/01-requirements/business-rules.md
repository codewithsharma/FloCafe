# Business Rules

## CURRENT STATE (VERIFIED)

### Orders
- Stock-checked products reject orders when `stock_quantity < quantity` (`orders.ts`)
- Voiding prepared items does not restock inventory (`routes/index.ts` comments)
- Order numbers generated via `sequences` table (daily reset)

### Payments
- Payment idempotency keys prevent duplicate charges (`payment_idempotency`)
- Transaction references must be unique per payment method (`payment_transaction_refs`)
- Split payments tracked per bill with decimal precision (`decimal.js`)

### Tax
- Taxes disabled until owner enables (`settings`, tax packs)
- Tax calculated via pack rules + overrides (`tax-engine.ts`)
- Inclusive vs exclusive behavior per product/category

### Loyalty
- Points earned on paid bills per product `cb_percent` or global rate
- Redemption reduces bill total (integration tests)

### Discounts
- Order-level and item-level discounts supported
- Settings control max discount and stacking rules

### Staff
- Managers cannot create/modify owner accounts
- Deactivated users cannot authenticate
- Password/PIN change invalidates existing JWTs (`tokens_valid_after`)

### KDS
- Disabled when `kds_enabled` setting is false (404 on WS)
- Chef users scoped to assigned stations/categories

## TARGET STATE (PROPOSED)
- Shift must be open before cash payments recorded
- Refunds require manager approval
- Stock movements require reason codes

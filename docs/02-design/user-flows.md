# User Flows

## CURRENT STATE — Verified implementation paths

### Open POS
1. Electron starts → `main/index.ts` initialize
2. Loads `http://localhost:3001` → static frontend
3. `AuthGuard` checks token → redirect `/auth/login` or `/setup`

### First-run setup
1. `GET /api/auth/setup/status`
2. `POST /api/auth/setup/initialize` — owner + business
3. Optional `POST /api/auth/setup/seed`

### Login
1. `POST /api/auth/login` → JWT in localStorage
2. `useAuthStore` hydrates user
3. Redirect to `/dashboard` or `/pos`

### Create order (POS)
1. `useCartStore` add items locally
2. `POST /api/orders` → server order
3. `POST /api/orders/:id/items` for line items
4. Stock decremented if tracked

### Send to kitchen
1. Order status → `preparing` (from `pending` or current status)
2. `notifyKdsUpdate()` broadcasts WS
3. Optional KOT print via `POST /api/printers/print-kot`

### KDS processing
1. KDS connects WS `/kds`, authenticates with JWT
2. Receives `initial_data` snapshot
3. `PATCH /api/kds/items/:id/status` or WS `status_update`

### Payment
1. `POST /api/bills/generate` from order
2. `PaymentModal` → `POST /api/bills/:id/payments`
3. Idempotency key prevents duplicates
4. Print via WebUSB, backend printer, or browser fallback

### Split payment
1. `SplitCheckModal` → `POST /api/bills/:id/split-check`
2. Multiple `bill_items` allocations
3. Separate payment per split bill

### Cancel order
1. `PATCH /api/orders/:id/status` → cancelled
2. Manager PIN if status was in-progress

### Table management
1. `/tables` page → CRUD via `/api/tables`
2. Hold order: `POST /api/held-orders`
3. Move: `POST /api/tables/:id/move-order`

### Backup
1. Settings → Database Tools
2. `POST /api/db/backup` or IPC `backupDatabase`
3. Optional Google Drive via `google-drive.ts`

## NOT IMPLEMENTED flows
- Start/close shift
- Refund payment
- Purchase order receiving

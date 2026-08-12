# User Stories

Format: **As a** [role], **I want** [action], **so that** [benefit].

## CURRENT STATE — Implemented

| ID | Story | Evidence |
|----|-------|----------|
| US-01 | As a cashier, I want to add products to a cart and checkout, so that I can serve customers quickly | `pos/page.tsx` |
| US-02 | As a waiter, I want to hold an order on a table, so that I can continue later | `held-orders.ts` |
| US-03 | As a chef, I want realtime kitchen updates, so that I know what to prepare | KDS WebSocket |
| US-04 | As an owner, I want to backup my database, so that I can recover from failure | `database-tools.ts` |
| US-05 | As a manager, I want to void an item with PIN approval, so that fraud is controlled | cancel-override test |
| US-06 | As a cashier, I want split payments, so that groups can pay separately | `bills.ts` |
| US-07 | As an owner, I want country-specific tax rules, so that bills are compliant | tax packs |
| US-08 | As a cashier, I want to scan barcodes, so that I can ring up products faster | barcode hook |
| US-09 | As an owner, I want loyalty points on bills, so that customers return | loyalty integration tests |
| US-10 | As an owner, I want WhatsApp bill delivery, so that customers get digital receipts | whatsapp service |

## TARGET STATE — Planned

| ID | Story | Priority |
|----|-------|----------|
| US-20 | As a manager, I want to open/close a cash shift, so that I can reconcile the drawer | P1 |
| US-21 | As a cashier, I want to process a refund, so that I can reverse a payment | P1 |
| US-22 | As an inventory manager, I want stock movements logged, so that I know what's on hand | P1 |
| US-23 | As a regional manager, I want multi-location reports, so that I can compare stores | P2 |
| US-24 | As an owner, I want payment terminal integration, so that card payments auto-reconcile | P2 |

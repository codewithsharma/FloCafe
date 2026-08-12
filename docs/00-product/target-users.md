# Target Users

## CURRENT STATE (FloCafe)

**Primary:** Owner-operators of cafés, restaurants, cloud kitchens, bakeries, food trucks.

**Evidence:** `README.md` positioning, business type settings in `main/routes/settings.ts`.

## User roles (VERIFIED)

| Role | Typical user | Access |
|------|--------------|--------|
| owner | Business owner | Full access, master PIN |
| manager | Shift manager | Staff, settings (limited), overrides |
| cashier | Counter staff | POS, payments |
| waiter | Floor staff | Server App (:3003) |
| chef | Kitchen staff | KDS |

## TARGET STATE (RestaurantOS)

Additional personas (PLANNED):

| Persona | Needs |
|---------|-------|
| Multi-unit operator | Cross-location reporting, config sync |
| Accountant | Export, tax reports, audit trail |
| Inventory manager | Stock, purchasing, wastage |
| IT/support | Deployment, backup, monitoring |

## Geographic focus

CURRENT: Tax packs for India, Thailand + generic engine; i18n en/es/pt.

TARGET: Expand tax packs via plugin model without code releases.

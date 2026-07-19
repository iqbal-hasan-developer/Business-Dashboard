# Manual-entry MVP write boundary

## Local checkpoint and migration state

- Local checkpoint `f24738c` contains `202607190000_product_reporting_ambiguous_refund_scope.sql`.
- The migration remains intentionally unapplied. Top Products remains unavailable.
- This MVP slice adds no migration and does not change any installed database contract.

## Installed authenticated write RPC inventory

| RPC | Installed role gate | MVP status |
| --- | --- | --- |
| `create_dashboard_order(jsonb,jsonb)` | owner, admin, data_entry | Implemented through an authenticated server action |
| `transition_dashboard_order(uuid,text,text,text,numeric)` | owner/admin; data_entry may change only operational status | Implemented for owner/admin without refund input |
| `set_product_buying_cost(uuid,numeric,integer,text,text,text)` | owner, admin | Implemented for private buying cost, reorder level, dashboard SKU, variation and internal notes |
| `set_business_setting(text,jsonb,text)` | owner | Installed, not part of this slice |
| `upsert_campaign(uuid,text,text,date,date,numeric,boolean)` | owner, admin | Installed, deferred |
| `record_daily_ad_spend(uuid,date,text,numeric,text)` | owner, admin, data_entry | Installed, deferred |
| `record_expense(date,text,text,numeric,text,uuid,text,text)` | owner, admin | Installed, deferred |
| `record_cash_movement(date,text,text,numeric,text,uuid,uuid,uuid)` | owner, admin | Installed, deferred |
| `record_settlement(text,text,date,numeric,numeric,text)` | owner, admin | Installed, deferred |
| `record_dashboard_refund(...)` / `record_dashboard_return(...)` | authorized dashboard roles | Explicitly excluded from this slice |

All implemented writes use the cookie-backed server Supabase client and the signed-in user's JWT. No service-role client or direct browser table write is used.

## Exact product blocker

There is no installed authenticated RPC that creates a row in the storefront-owned `public.products` table or safely edits its public `name`, `slug`, selling `price`, active state, or stock. `set_product_buying_cost` updates only the private `public.product_business_data` companion row. Product creation and public catalogue editing therefore remain disabled until a separately reviewed RPC contract is approved; this task does not create that migration.

## Safety boundary

- Order creation calls the existing atomic RPC once and relies on its unique order-number constraint.
- Order, payment and settlement statuses remain separate values.
- Refund and return states are excluded from the forms and no refund amount is sent during transitions.
- Delivered recognition remains owned by existing database triggers and immutable snapshots.
- No implemented repository path calls a stock or inventory function.
- Mock mode renders the forms for deterministic UI testing but disables every persistence button.

## Manual connected-mode acceptance checks

Perform these only after separately approving development writes:

1. Sign in as the development owner and confirm the app is using the Supabase provider.
2. On Products, edit one product's private buying cost or reorder metadata and verify the public selling price and stock do not change.
3. Create one Pending order with a unique number, required customer delivery details and one active product.
4. Confirm the order and its items appear after the redirect and the dashboard operational order count refreshes.
5. Update Order Status, Payment Status and Settlement Status independently.
6. Move the order to Delivered and confirm existing authoritative dashboard recognition updates without any stock change.
7. Submit the same order number again and confirm it is rejected safely.
8. Do not run Top Products, refund, return, restoration or fixture workflows.

# Phase 2 preflight

No SQL in this repository has been applied. The existing NexaNotion repository was inspected read-only at commit `f68021a55f92cd33489bd15c461503a5c13502c8` and remained unchanged by this work.

## Confirmed legacy contract

- Next.js 16.2.9, React 19.2.7, React DOM 19.2.7, and `@supabase/supabase-js` 2.108.2 were installed in the website repository during inspection.
- `products`, `orders`, and `order_items` use UUID primary keys.
- Public RLS permits only active product reads. Private buying cost is not present in the inspected `products` migration.
- Orders require the legacy customer, payment, status, subtotal, delivery-charge, and total columns. Order items already snapshot product name, slug, unit price, quantity, and line total.
- The website admin signs into Supabase Auth, then authorizes with an `ADMIN_EMAILS` allowlist. Admin data access uses a service-role client. That authorization/data-access pattern is not reused by this dashboard.
- The website creates an order, its items, and stock changes in separate calls. The dashboard migration therefore introduces a separate atomic order-and-items RPC and does not alter the website code.

## Assumptions requiring live-schema verification

The inspected migrations are repository evidence, not proof of the current remote schema. Before applying anything, obtain a schema-only dump from the separate development project and verify:

1. The three shared tables exist in `public`, retain UUID identifiers, and contain every column checked by migration `202607140000`.
2. The deployed constraint names, types, defaults, triggers, indexes, grants, and RLS policies match the repository migrations.
3. Every existing order item has a trustworthy historical buying cost source. Migration `202607140004` deliberately leaves `buying_cost_snapshot` null when no evidence exists; do not backfill it with the current product cost without an approved accounting rule.
4. Existing `orders.order_status`, `payment_status`, and `payment_method` values are within the inspected legacy constraints.
5. `products.sku`, `inventory_tracking`, and other Phase 5 website columns are present if later order-entry or inventory work will rely on them.
6. The development project uses Supabase Auth and supports `security_invoker` views and pgTAP.
7. The intended owner Auth user exists before the first `dashboard_user_profiles` row is inserted manually.

## Migration execution order

1. `202607140000_live_schema_preflight.sql`
2. `202607140001_dashboard_identity_and_roles.sql`
3. `202607140002_private_catalog_and_settings.sql`
4. `202607140003_campaigns_and_ad_spend.sql`
5. `202607140004_order_compatibility_and_financial_snapshots.sql`
6. `202607140005_settlements_expenses_cash_and_audit.sql`
7. `202607140006_constraints_and_indexes.sql`
8. `202607140007_row_level_security.sql`
9. `202607140008_atomic_order_rpc.sql`
10. `202607140009_financial_and_reconciliation_views.sql`

## Compatibility and review notes

- All private buying costs live in `product_business_data`; the public `products` table remains free of dashboard-only cost fields.
- Legacy order columns remain in place. New dashboard status, payment status, settlement, campaign, channel, and cost-snapshot columns are additive.
- The atomic RPC accepts only `cod`, `bkash`, and `nagad`, matching the inspected website constraint. Cash and bank-transfer persistence require an explicit compatibility decision before the RPC is broadened.
- Historical COGS is null, not zero, until trustworthy snapshots are backfilled. Financial views expose `cogs_complete` and the reconciliation view returns null aggregate COGS/profit when a Delivered order is incomplete.
- Website service-role calls continue to bypass RLS. The dashboard runtime intentionally has no service-role key and uses authenticated user sessions plus database policies.
- `order_date` backfill currently derives from `created_at::date`; review timezone semantics against `Asia/Dhaka` before execution.
- Audit rows contain full before/after records, including order customer data. Confirm retention, access, and privacy requirements.
- The RPC creates orders and items atomically but does not decrement inventory. Coordinate a single inventory transaction design with the storefront before enabling dashboard order creation.

## Manual development-project actions

1. Create or select a separate Supabase development project.
2. Export and review its schema-only dump; compare it with the preflight assumptions.
3. Link a local Supabase CLI workspace only to the development project.
4. Review SQL in order, then run the pgTAP suite locally before any remote push.
5. Create Auth users through the Supabase dashboard and manually insert the first active `owner` profile by Auth UUID.
6. Backfill `product_business_data` and historical order-item buying-cost snapshots from approved source records.
7. Reconcile Delivered revenue/COGS views against a known accounting sample before enabling real dashboard mode.

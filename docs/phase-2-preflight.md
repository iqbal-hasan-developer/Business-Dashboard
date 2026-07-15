# Phase 2 preflight

No migration or development baseline SQL in this repository has been applied.
The production schema was inspected through the metadata-only SQL Editor export,
and the existing NexaNotion website repository remained read-only.

## Confirmed schema comparison

- Production PostgreSQL is 17.6 and the database timezone is UTC.
- Production `public` contains the five shared storefront tables:
  `categories`, `contact_messages`, `products`, `orders`, and `order_items`.
- Production exposes `set_updated_at()` as a SECURITY INVOKER trigger function.
- Production exposes `decrement_product_stock(uuid, integer)` as a SECURITY
  DEFINER function. Its emergency ACL hotfix was verified separately: PUBLIC,
  `anon`, and `authenticated` have no effective EXECUTE; `service_role` does.
- Production has active-catalog RLS policies and update triggers on categories,
  products, and orders.
- The separate development project has an empty `public` schema.
- Both retained metadata exports reported zero sensitive-value signals. Their
  CSV files remain locally ignored and must not be committed.

## Development bootstrap and migration order

The guarded storefront baseline is intentionally outside `supabase/migrations`.
It is for the confirmed-empty development project only.

1. Review `supabase/development-baseline/README.md`.
2. In the development SQL Editor only, set the documented acknowledgement and
   run `202607150000_storefront_public_schema.sql`.
3. Re-run `docs/schema-audit/read-only-schema-inspection.sql` and verify that
   the five-table contract matches the confirmed production structure.
4. Run `202607140000_live_schema_preflight.sql` alone. Continue only when it
   completes without a compatibility exception.
5. Review and apply migrations `202607140001` through `202607140009` in numeric
   order in development only.
6. Create development Auth test users and bootstrap the first active `owner`
   profile by UUID through a separately reviewed manual statement.
7. Run the pgTAP tests under `supabase/tests/database` in development.
8. Re-run the metadata inspection and compare grants, RLS, functions, triggers,
   constraints, and indexes to the reviewed migration contract.
9. Reconcile a controlled Delivered-order accounting fixture before configuring
   the dashboard app to use development Supabase mode.

Do not add the development baseline to production migration history. Production
already has the five shared tables, so the baseline's existence guard rejects
that target.

## Migration-chain contract

1. `202607140000_live_schema_preflight.sql` performs metadata and count-only
   gates. It does not change schema or rows.
2. `202607140001_dashboard_identity_and_roles.sql` creates dashboard identities,
   removes broad default function execution, makes the verified stock ACL
   durable, and hardens `set_updated_at()` without changing either function body.
3. `202607140002_private_catalog_and_settings.sql` keeps buying costs and private
   product facts outside the public `products` table.
4. `202607140003_campaigns_and_ad_spend.sql` creates campaign and daily spend
   records with a null-safe business identity.
5. `202607140004_order_compatibility_and_financial_snapshots.sql` adds shared
   order compatibility fields, keeps Website inserts synchronized, and creates
   immutable Delivered snapshots plus append-only refund adjustments.
6. `202607140005_settlements_expenses_cash_and_audit.sql` adds settlement,
   expense, cash, and field-minimized audit records.
7. `202607140006_constraints_and_indexes.sql` validates shared data before
   required-column changes, supports five payment methods, and adds FK/filter
   indexes. It needs a low-traffic lock review.
8. `202607140007_row_level_security.sql` replaces draft generic policies with
   table- and role-specific policies and removes direct financial writes.
9. `202607140008_atomic_order_rpc.sql` exposes authorized, audited business RPCs.
   Order and items are atomic; inventory is deliberately untouched.
10. `202607140009_financial_and_reconciliation_views.sql` reports only from the
    immutable Delivered recognition ledger and exposes a role-gated filtered
    summary function.

## Website compatibility

- The website and dashboard continue to share the same eventual production
  Supabase backend; the separate project is for migration testing only.
- Legacy order, order-item, product, status, and payment columns remain present.
- Website inserts are normalized by an ongoing trigger: `created_at` becomes an
  `Asia/Dhaka` business date, legacy statuses map to dashboard statuses, and COD
  delivery becomes Awaiting settlement when no settlement state exists.
- The website's `cod`, `bkash`, and `nagad` values remain valid. The additive
  constraint also supports distinct `cash` and `bank_transfer` values for
  dashboard/manual orders; neither is mapped to COD.
- The website service-role checkout remains the only confirmed stock-function
  caller. The durable ACL preserves service-role execution.
- No migration changes `products.stock`, calls `decrement_product_stock`, or
  changes the existing function body.

## Financial recognition

- Revenue and COGS are recognized only when a Delivered order has at least one
  item and receives one immutable `order_financial_snapshots` row.
- Product revenue is the sum of Delivered item quantity times the snapshotted
  actual unit selling price. Delivery revenue, discount, refund, COGS, courier
  cost, and packaging cost are frozen in the same recognition record.
- Later refund changes are append-only deltas. Later product price or verified
  buying-cost changes cannot rewrite recognized history.
- Product Revenue, Net Revenue, COGS, Gross Profit, Average Order Value, Net
  Profit, and Profit Margin all derive from the same filtered snapshot set.
- Unknown historical buying cost is never guessed. Aggregate COGS and profit are
  `NULL` while any selected Delivered order lacks verified COGS.
- Unknown courier or packaging history is never treated as zero. Contribution,
  Net Profit, and Profit Margin are `NULL` while fulfillment costs are incomplete.
- Historical Delivered orders require an explicit, reviewed backfill into the
  recognition ledger. The live migration intentionally does not manufacture
  those records from current costs.

## RLS authorization matrix

| Surface | Owner | Admin | Data entry | Viewer | anon |
| --- | --- | --- | --- | --- | --- |
| Active public catalog | Read all | Read all | Active rows | Active rows | Active rows |
| User profiles | Manage all | Own row | Own row | Own row | None |
| Lookup values | Manage | Read active | Read active | Read active | None |
| Orders/items and private finance | Read; RPC writes | Read; RPC writes | Authorized operational RPCs only | No base rows | None |
| Buying costs/settings | Read; authorized RPCs | Cost read/write RPC | None | None | None |
| Filtered financial summary | Execute | Execute | None | Execute aggregate only | None |
| Audit history | Read | Read | None | None | None |

`service_role` retains the trusted website/server path and bypasses RLS. It must
never be exposed to the dashboard browser.

## Inventory transaction design (future migration, not implemented)

Shared `products.stock` remains the source of truth, but no dashboard inventory
mutation is enabled in this chain. A later reviewed design should introduce an
immutable inventory ledger with:

- a unique operation/idempotency key;
- product, signed quantity delta, reason, order/source reference, actor, and
  `Asia/Dhaka` business timestamp;
- one SECURITY DEFINER transaction that locks the product row, validates
  non-negative resulting stock, writes the ledger row, and updates stock;
- explicit order-created deduction and cancel/return restoration operations;
- audit evidence and duplicate-operation rejection;
- website and dashboard adoption of the same atomic path before it is enabled.

Until that work is approved and the website is changed in a separate task,
dashboard order creation must not deduct or restore inventory.

## Locks, privacy, and manual gates

- Constraint validation, `SET NOT NULL`, and index creation on shared tables can
  scan or lock production relations. Measure table sizes and active traffic, set
  maintenance timeouts, and approve a low-traffic window before production.
- The audit payload excludes customer contact/address/note fields, payment
  identifiers, profile email/display name, free-text expense/cash/settlement
  notes, and request metadata. Audit retention has no automatic purge and needs
  an owner-approved policy before production.
- The filtered summary treats `daily_ad_spend.platform` and
  `expenses.sales_channel` as the channel attribution fields. Standardize lookup
  values before relying on a channel-filtered net-profit result.
- Historical COGS, courier cost, and packaging cost need documented evidence.
  Unknown values remain unknown rather than being inferred from current data.
- Production application remains blocked until development application, pgTAP,
  accounting reconciliation, lock review, owner bootstrap review, and a fresh
  production preflight all pass.

## Environment variables

Names only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DASHBOARD_DATA_SOURCE`

`DASHBOARD_DATA_SOURCE=mock` is development/test only. A production build or
runtime without required Supabase configuration must fail closed.

# Phase 2 preflight

## Development rehearsal status - verified 16 July 2026

The Docker-free development migration rehearsal passed from Git checkpoint
`ef866f80e8eceefad33a6808622fa1b4dc619e29`. The guarded storefront baseline,
read-only preflight, and migrations `202607140001` through `202607140009` were
applied manually and separately through the Supabase SQL Editor in
**NexaNotion Business Dashboard Dev**. Migration `202607140000` remained a
read-only compatibility gate.

The verified development result is:

- storefront baseline verification: 8/8;
- final schema verification: 10/10;
- one active development `owner` profile preserved, with no email or password
  recorded in Git or project documentation;
- pgTAP: 13/13 RLS, 9/9 function security, and 14/14 financial recognition
  assertions (36/36 total);
- controlled reconciliation passed for all five payment methods;
- Delivered recognition snapshots: 3 expected and 3 actual;
- Pending recognition snapshots: 0 expected and 0 actual;
- refund adjustment: 20.00 expected and 20.00 actual;
- inventory unchanged and `decrement_product_stock` not called;
- all eight data-quality counts were zero;
- cleanup verifier: 18/18 synthetic-record counts were zero after rollback.

No production database was changed. The production schema was only inspected
through the metadata-only SQL Editor export, and the existing NexaNotion website
repository remained read-only and unmodified.

## Migration-history gate

The manual SQL Editor executions verified schema behavior, but they did not use
the normal Supabase CLI migration workflow. Direct SQL Editor changes do not
automatically establish matching history in
`supabase_migrations.schema_migrations`. The development schema and its CLI
migration history must therefore be treated as potentially out of sync.

Do **not** run `supabase db push`, `supabase migration repair`, or any production
migration application until a separate review compares the local migration
timestamps, the actual development schema, and the remote history table, then
approves an explicit history strategy. Supabase documents that SQL Editor
changes bypass migration history and may cause `db push` synchronization
failures. It also documents that `migration repair` mutates tracking state
without applying or reverting SQL.

References:

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase CLI `db push`](https://supabase.com/docs/reference/cli/supabase-db-push)

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
- The separate development project started with an empty `public` schema. Its
  verified post-migration metadata contains 18 tables, 4 views, 22 functions,
  26 policies, 31 triggers, 79 indexes, and 103 constraints, with RLS enabled
  on all 18 tables and zero sensitive-value signals.
- Both retained metadata exports reported zero sensitive-value signals. Their
  CSV files remain locally ignored and must not be committed.

## Verified development execution order

The guarded storefront baseline is intentionally outside `supabase/migrations`.
It is for the confirmed-empty development project only.

1. Confirmed the development `public` schema was empty.
2. Applied `202607150000_storefront_public_schema.sql` with its development-only
   acknowledgement and verified the five-table storefront contract (8/8).
3. Ran `202607140000_live_schema_preflight.sql` as a read-only compatibility
   gate.
4. Applied migrations `202607140001` through `202607140009` individually and in
   numeric order through the development SQL Editor.
5. Re-ran metadata inspection and the dashboard schema verifier (10/10).
6. Created one development-only Auth user in the Supabase Dashboard and
   bootstrapped the retained active `owner` profile. No owner email or password
   is recorded in the repository.
7. Enabled pgTAP 1.3.3 and ran the three corrected source suites through the SQL
   Editor wrappers `202607160005` through `202607160007` (36/36).
8. Ran the controlled accounting fixture through wrapper `202607160008`; all
   financial, payment, inventory, snapshot, refund, and data-quality checks
   passed inside a rollback-only transaction.
9. Ran read-only cleanup verifier `202607160009`; all 18 persisted-record counts
   were zero.

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
- Production migration application remains blocked until the migration-history
  strategy, development application integration, production lock window,
  backup, and a fresh production preflight are separately reviewed and approved.

## Environment variables

Names only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `BUSINESS_DATA_PROVIDER`

`BUSINESS_DATA_PROVIDER=supabase` is required for the development project
connection. `BUSINESS_DATA_PROVIDER=mock` is an explicit isolated
development/test fallback only and is rejected in production. A runtime without
the complete Supabase configuration fails closed.

The development-only values are held in ignored `.env.local`. No value, owner
email, password, or privileged key is recorded in the repository. The dashboard
uses the normal authenticated user session and RLS; no service-role client or
fallback path exists in the application connection.

## Rehearsal artifact validation

The repository checks run before the rehearsal commit passed:

- `npm run lint`;
- `npm run typecheck`;
- `npm test`: 6 files and 44 tests passed;
- `npm run build`: Next.js production build passed;
- SQL static validation: 28 files checked, 10 migration files present, five
  rollback contracts passed, three corrected pgTAP suites verified, one
  structured fixture result preserved, 18 cleanup counts preserved, and zero
  stock mutations found;
- committable-file secret scan: zero key, token, password, owner-email, or
  environment-specific owner-UUID findings;
- `git diff --check` passed;
- `docs/schema-audit/outputs/` remained ignored and uncommitted.

## Verified live development application connection

The application was connected only to **NexaNotion Business Dashboard Dev** on
16 July 2026. The connection used the preserved development owner and the
ignored `.env.local`; no credential value was printed, recorded, or committed.

Verified results:

- owner authentication, active-profile and `owner` role resolution, protected
  routes, refresh persistence, sign out, post-sign-out denial, and owner sign-in
  again all passed;
- anonymous private-table requests returned HTTP 401;
- desktop (1440 x 900) and Pixel 7 (412 x 915) layouts passed;
- the account menu opened with keyboard and pointer input, exposed the owner name,
  role, and accessible Sign out action, and produced no Base UI, console, page,
  or warning errors;
- all 14 connected empty-dashboard metrics rendered truthful zero states, with
  no prototype trend metadata, false pending-order urgency, or stale hard-coded
  timestamp; the displayed update time came from the server query;
- inventory RPC traffic, stock mutation, and all product/business mutation
  traffic remained zero; and
- no SQL, migration, database change, production access, persistent test data,
  or NexaNotion website change occurred.

Connected-mode write controls remain disabled anywhere persistence has not been
implemented. New-order creation, product creation/editing, order editing,
marketing, expense, settlement, settings, export, and other mutation-oriented
controls must remain unavailable until their authenticated, audited, RLS-backed
write paths are implemented and separately accepted. Dashboard code must not
call `decrement_product_stock` or alter product stock.

### Remaining authoritative-reporting gap

The live empty/read-only connection is verified, but it is not yet real
business-data acceptance. The connected repository still loads selected base
rows and performs part of the dashboard aggregation in application code. It
does not yet fully consume the authoritative snapshot-backed reporting RPC and
views created by migrations `202607140004` and `202607140009`.

Before real business-data acceptance, the connected dashboard must use the
role-gated filtered financial summary and the snapshot-backed financial and
reconciliation views as the source of reported revenue, COGS, gross profit, net
profit, margin, AOV, refund adjustments, and reconciliation status. The
integration must preserve the normal user JWT and RLS, keep unknown historical
costs unknown, reconcile summary and detail results, and introduce no inventory
or other business-data mutation.

## Exact next authoritative-reporting integration prompt

The following is the recommended next prompt after the live development
connection commit. It does not authorize database, migration-history, production,
inventory, or website changes:

> Integrate the NexaNotion Business Dashboard's connected financial reporting
> with the authoritative snapshot-backed reporting RPC and views already present
> in **NexaNotion Business Dashboard Dev**. First inspect their committed SQL
> contracts and the current `SupabaseBusinessRepository`. Use only server-side
> queries with the normal authenticated owner JWT and RLS. Make the filtered
> summary, financial detail, and reconciliation surfaces consume the authoritative
> reporting sources; preserve correct unknown-cost behavior and truthful empty
> states; and add unit, contract, and focused browser coverage that reconciles
> summary and detail results. Keep all unimplemented write controls disabled. Do
> not run SQL, migrations, `db push`, migration repair, or reset; do not create
> business data, call inventory RPCs, alter stock, connect production, expose
> environment values, commit or push, or modify the NexaNotion website repository.

# Universal database foundation

This is the clean-install schema track for the universal product. It is kept
separate from `../migrations`, the 44-migration legacy single-business chain.
The legacy chain depends on pre-existing storefront tables and is not a
fresh-install path.

## Schema

The ordered migrations create:

- Workspaces, multi-workspace memberships, stores, email-bound invitations,
  and encrypted store-credential storage.
- Canonical store-scoped products and variants, customers, orders and immutable
  order-item snapshots, refunds, fulfillments, per-store inventory levels and
  movement history.
- Expenses, append-only financial entries, synchronization runs/checkpoints,
  deduplicated webhook receipts, background jobs, and audit events.

Every business record carries a `workspace_id`; composite foreign keys keep its
store, customer, order, and variant relationships inside that workspace.
Money uses exact `numeric(20,6)` values and currency codes are explicit.
Inventory is keyed by store so a quantity in one store is never assumed to be
available in another.

`workspace_memberships` supports owner, admin, manager, staff, and viewer roles.
Membership changes go through scoped security-definer RPCs; normal authenticated
clients have read-only membership access. Invitations store only a SHA-256
digest computed with `pgcrypto`, expire after seven days, and require the
authenticated account's confirmed email to match, and cannot grant ownership.
Only an owner can invite or promote admins or transfer ownership. The database
prevents removing the last active owner.

RLS is enabled and forced on tenant data. Memberships can read their workspace;
workspace managers can edit the catalog; managers can add expenses; financial
and audit records are owner/admin only; customer PII is hidden from viewers.
Financial, sync, webhook, and job writes are reserved for server workflows.
Store credentials are ciphertext-only in a separate table with no authenticated
table grants. Never put secrets in `stores.platform_metadata`. Invitation
hashing uses `pgcrypto`, supported by the PostgreSQL 17 Supabase target.

The Supabase `service_role` bypasses RLS by design. Its server-side uses must
scope every query and mutation by both `workspace_id` and resource ID. It must
never be placed in browser code.

## Application connection

In Supabase mode, server authentication uses `auth.getUser()` and loads active
workspace memberships for that authenticated user. The `active_workspace_id`
HTTP-only cookie is only a selection preference: its value is accepted only
when it appears in the server-loaded membership list. Workspace switching
repeats the membership check, and every universal data query also filters by
the selected `workspace_id`; PostgreSQL RLS independently enforces the same
tenant boundary.

New accounts use Supabase email/password registration and a code-exchange
callback. After authentication, `create_workspace` atomically creates the
workspace and grants the creator the `owner` role. `/workspace` manages names,
members, roles, ownership transfer, and pending invitations through the
existing scoped RPCs. Membership email display uses the restricted
`list_workspace_members` RPC. Owners and administrators can make invitations
only in `NODE_ENV=development` until production SMTP is configured. The raw
token is returned once to the authorized server-action caller for a private
copy link; only its digest is stored. Acceptance requires an authenticated,
email-confirmed Supabase account that matches the invited address.

Production invitations require a real SMTP provider. Configure it in the
Supabase Auth email settings (host, port, username, password, sender address,
and sender name), then add a server-side invite-mail action that sends the
one-time link without logging or returning it from a public API. For a local
CLI project, Supabase's config supports an `[auth.email.smtp]` block with
`enabled`, `host`, `port`, `user`, `pass = "env(<SMTP_SECRET_NAME>)"`,
`admin_email`, and `sender_name`; keep the password in an untracked local env
file or CI secret. No SMTP secret belongs in this repository or `.env.example`.

Supabase routes for products, orders, customers, inventory, and expenses use
explicit workspace filters and RLS. Writes use role-checked database RPCs.
Order creation records immutable line prices and private cost snapshots;
fulfillment atomically reduces store inventory and writes revenue, discount,
tax, shipping, and COGS entries when the required values are known. Refund
recording documents a completed external refund and does not process payments.
Returns do not automatically restock goods.

`/dashboard` combines workspace counts with a 30-day summary, revenue trend,
best sellers, customer growth, recent orders, and low-stock alerts. `/reports`
supports a bounded Dhaka-date range and CSV profit/loss export. Profit metrics
are marked incomplete when completed orders lack revenue, COGS, refund, or
shipping-cost evidence. Revenue is the sum of recognized `revenue` entries;
gross profit subtracts discounts, refunds, and COGS; net profit also adds
shipping income and subtracts shipping cost, fees, and recorded operating
expenses. Tax is excluded from profit, and inventory purchases/unallocated
procurement are not treated as operating expense. Values are grouped by
currency and never converted.

Order, product, customer, inventory, expense, and financial CSV exports are
workspace scoped, bounded to 20,000 rows, and escape spreadsheet formula cells.
Customer exports omit phone/email by default. Viewer access cannot read customer
PII; customer notes and costs are manager-only. The existing mock demo keeps its
workflows unchanged.

The legacy importer is separate from the clean-install runner. It requires two
loopback PostgreSQL databases, explicit owner/workspace/store IDs, a disconnected
`.invalid` import store, and all seven universal migrations. Dry run is the
default. See `docs/universal-legacy-migration-plan.md`; no legacy database has
been imported in this environment. Cash, owner funds, courier settlements,
marketing attribution, purchase batch allocations, and audited legacy
corrections remain in the source and appear as migration holds.

Workspace commerce lists use 25-row exact-count database pagination, workspace
scoping, substring search, and allow-listed sorting. Product filters include
status, category, price, stock status, and stock quantity range. Orders include
status, payment status, Dhaka-local date, total, customer name, and store.
Customers include creation-date, activity, and min/max order count. Inventory
includes variation/product search, category, stock status, and quantity range.
Stock aggregates across tracked stores. Missing levels mean `untracked`; low
stock means any tracked store level is at or below the larger of its own reorder
level and the variant threshold. Untracked aggregate quantities are null, so
quantity ranges do not count unknown stock as zero. Customer counts include
cancelled and refunded orders. Migration 007 adds security-invoker aggregate
views and the inventory filter index; the list views retain RLS and require
workspace scope. PGlite tests
cover semantics and tenant isolation. The PostgreSQL 17 CI check is prepared to
verify `pg_trgm`, 13 trigram operator-class indexes, and a 20,001-row `ILIKE`
plan, but remains unverified until the workflow runs.

## Migration tracking and clean installation

Use the runner only against a dedicated local PostgreSQL/Supabase-compatible
development database with its Auth schema and roles already initialized:

```powershell
$env:UNIVERSAL_DATABASE_URL = '<local database connection string>'
npm run db:universal:migrate
```

The runner refuses non-loopback hosts and non-superuser roles. On first use it
also refuses a non-empty `public` schema, including the legacy dashboard tables.
Each migration runs in its own transaction. A private
`universal_migrations.schema_versions` ledger records the version and SHA-256
checksum; reruns skip verified versions and stop if an applied migration file
has changed. Add a new ordered migration instead of editing released history.

The legacy application schema is not converted by this runner. A detailed
source-to-target mapping, exception handling, repeatability, and rollback plan
is in `docs/universal-legacy-migration-plan.md`. Existing single-business
databases need a separately reviewed, backed-up data migration before legacy
features can be re-enabled. No external or production database has been changed.

## PostgreSQL verification

Run the isolated integration suite with:

```powershell
npm test -- tests/database/workspace-isolation.integration.test.ts
```

The suite uses PGlite, an embedded PostgreSQL 18.6 engine, and executes the real
SQL migrations, grants, constraints, triggers, security-definer functions, and
RLS policies with separate `authenticated` and `service_role` database roles.
It also runs the shared application overview reader under RLS. PGlite is not a
Supabase Auth or PostgREST test.

For the actual platform path, `config.toml` pins a disposable local Supabase
database to PostgreSQL 17. `.github/workflows/universal-supabase.yml` starts an
isolated Auth/PostgREST/PostgreSQL stack, resets it from these migrations, runs
the pgTAP tenant checks, and signs in two real local Auth users to test
PostgREST reads and denied writes. It then launches the app and runs a Playwright
flow covering registration, workspace onboarding, invitation acceptance,
workspace switching, and membership revocation. The disposable local config
disables email confirmation so the flow needs no external SMTP. Run the same
steps locally with the Supabase CLI, Docker, and Playwright Chromium installed.
That workflow has been added but was not run in the current environment.

Docker and `psql` are not installed in the current development environment, so
the local Supabase Auth/PostgREST/application workflow remains unverified here.
No external or production database has been used.

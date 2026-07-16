# Docker-free development rehearsal operator checklist

This runbook is for the Supabase SQL Editor in the separate development project.
It must never be used in the existing NexaNotion production project.

## Verified completion record - 16 July 2026

The Docker-free rehearsal completed successfully from Git checkpoint
`ef866f80e8eceefad33a6808622fa1b4dc619e29` against only
**NexaNotion Business Dashboard Dev**. The storefront baseline and migrations
`202607140000` through `202607140009` were opened and executed manually, one
file at a time, through the development Supabase SQL Editor.

Verified results:

- storefront baseline verification: 8/8 passed;
- final dashboard schema verification: 10/10 passed;
- one active development `owner` profile was bootstrapped and preserved;
- owner email and password are intentionally not recorded in this repository;
- pgTAP suites: 13/13, 9/9, and 14/14 (36/36 total);
- controlled financial reconciliation and all five payment methods passed;
- Delivered snapshots: 3 expected and 3 actual;
- Pending snapshots: 0 expected and 0 actual;
- refund adjustment: 20.00 expected and 20.00 actual;
- inventory remained unchanged and the stock function was never called;
- all eight data-quality counts were zero;
- post-rehearsal cleanup: 18/18 persisted-record counts were zero;
- no production project changed and the existing website repository remained
  unmodified.

### Migration-history warning

Manual SQL Editor execution changed the development schema but did **not** run
the normal Supabase CLI migration workflow. It therefore must not be assumed to
have established matching entries in
`supabase_migrations.schema_migrations`. Supabase documents that direct remote
SQL Editor changes bypass migration history and can cause `db push` sync
failures.

Do not run `supabase db push`, `supabase migration repair`, or any production
migration application until the local files, actual development schema, and
remote migration-history table have been reviewed and an explicit history
strategy has been approved. `migration repair` changes tracking state; it is
not a harmless validation command.

References:

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase CLI `db push`](https://supabase.com/docs/reference/cli/supabase-db-push)

## Mandatory gate before every execution

1. Visually confirm the Supabase breadcrumb says exactly:
   **NexaNotion Business Dashboard Dev**.
2. Use a new SQL Editor query for one file only.
3. Never paste a database password, service-role key, access token, or Auth-user
   password into SQL, a result export, Git, or chat.
4. Run one file, stop, and report only the requested result summary.
5. Stop immediately on any `ERROR`, failed boolean/check, unexpected `WARNING`,
   or result that differs from this runbook. `NOTICE` messages produced by
   `IF EXISTS`/`IF NOT EXISTS` are expected when their statement succeeds.
6. Do not proceed because a later step appears simple. Every step requires a
   separately reviewed result from the preceding execution.

No step after **A** is authorized until the first inspection result has been
returned and reviewed.

## A — Confirm the development public schema is empty

Run only:

`docs/schema-audit/read-only-schema-inspection.sql`

Return only the `summary` counts and sensitive-signal categories; do not paste
the full JSON, definitions, grants, or any detected values.

Required result:

- `table_count = 0`
- `function_count = 0`
- `policy_count = 0`
- `trigger_count = 0`
- `sensitive_value_signal_count = 0`

Stop on any non-zero value. Do not run B until Codex explicitly reviews A.

## B — Apply the guarded development-only storefront baseline

After A is accepted, open only:

`supabase/development-baseline/202607150000_storefront_public_schema.sql`

In the same SQL Editor query, place this acknowledgement immediately above the
file contents:

```sql
set nexanotion.development_baseline_ack =
  'confirmed-empty-development-project';
```

Run once, then stop. Any guard exception means the selected project/schema is
not eligible and the rehearsal must end.

## C — Verify the baseline before dashboard migrations

Run these separately, stopping after each result:

1. `docs/schema-audit/read-only-schema-inspection.sql`
2. `supabase/development-rehearsal/202607160001_verify_storefront_baseline.sql`

The inspection must report exactly five public tables, two application
functions, two policies, three triggers, and zero sensitive signals. Every row
from the baseline verifier must have `passed = true`, including the secure stock
ACL check.

## D — Run the read-only migration preflight

Run only:

`supabase/migrations/202607140000_live_schema_preflight.sql`

Expected: successful completion with no exception. Stop and return the complete
error message if any guard fails. Do not run migration 001 on a failure.

## E — Apply each dashboard migration separately

Run exactly one file per SQL Editor execution, in this order. Stop after every
file and return its result before opening the next:

1. `supabase/migrations/202607140001_dashboard_identity_and_roles.sql`
2. `supabase/migrations/202607140002_private_catalog_and_settings.sql`
3. `supabase/migrations/202607140003_campaigns_and_ad_spend.sql`
4. `supabase/migrations/202607140004_order_compatibility_and_financial_snapshots.sql`
5. `supabase/migrations/202607140005_settlements_expenses_cash_and_audit.sql`
6. `supabase/migrations/202607140006_constraints_and_indexes.sql`
7. `supabase/migrations/202607140007_row_level_security.sql`
8. `supabase/migrations/202607140008_atomic_order_rpc.sql`
9. `supabase/migrations/202607140009_financial_and_reconciliation_views.sql`

Migration 006 performs validation, indexes, and `SET NOT NULL`. Even in
development, stop if it takes unexpectedly long or reports a lock/timeout.

## F — Create the development Auth user and first owner

1. In **Authentication → Users** of **NexaNotion Business Dashboard Dev**, create
   a synthetic development owner. Enter its password only in the Supabase UI.
2. Copy only the non-secret Auth user UUID.
3. Open
   `supabase/development-rehearsal/202607160002_bootstrap_first_owner.sql`.
4. Replace its all-zero UUID sentinel with that development Auth user UUID.
5. Run the file once and stop. Return only `user_id`, `role`, and `is_active`.

Never send the Auth password or session tokens to Codex.

## G — Enable pgTAP if needed and run database tests

Run each file separately and stop after each result:

1. `supabase/development-rehearsal/202607160000_enable_pgtap.sql`
2. `supabase/development-rehearsal/202607160005_run_001_rls_policies.sql`
3. `supabase/development-rehearsal/202607160006_run_002_function_security.sql`
4. `supabase/development-rehearsal/202607160007_run_003_financial_recognition.sql`

The wrappers preserve the assertions in `supabase/tests/database/001` through
`003` and collect every assertion plus the final plan in one SQL Editor result
set. They do not replace the source pgTAP suites.

Every pgTAP assertion must be `ok`; any `not ok`, exception, or missing
`finish()` result stops the rehearsal. Each test rolls back its fixtures.

## H — Reinspect and verify the final development schema

Run separately:

1. `docs/schema-audit/read-only-schema-inspection.sql`
2. `supabase/development-rehearsal/202607160003_verify_dashboard_schema.sql`

Return summary counts plus the verifier rows only. Every verifier row must have
`passed = true`. Do not return raw definitions or complete grant JSON.

## I — Run the controlled rollback-only financial fixtures

Run only:

`supabase/development-rehearsal/202607160008_run_004_controlled_financial_fixtures.sql`

This SQL Editor wrapper preserves the logic and assertions from
`202607160004_controlled_financial_fixtures.sql`, returns all results as one
structured JSON value, never calls the stock function, verifies stock is
unchanged, and ends with `ROLLBACK`. It covers Pending and Delivered Website and
manual orders, known/unknown COGS, a refund adjustment, and all five payment
methods.

## J — Reconcile the fixture results

Use only the result sets returned by step I. Required known-cost Website totals:

- Product Revenue: `200.00`
- Net Revenue: `220.00`
- COGS: `120.00`
- Gross Profit: `100.00`
- Contribution Profit: `60.00`
- AOV: `220.00`
- Net Profit: `45.00`
- Profit Margin: `20.45`

The all-channel result must show `NULL` aggregate COGS/profit because one
Delivered synthetic order intentionally has unknown COGS. All comparison rows,
coverage rows, data-quality checks, and inventory checks must pass before the
rehearsal can be accepted.

## K — Verify rollback cleanup

Run only:

`supabase/development-rehearsal/202607160009_verify_rehearsal_cleanup.sql`

The verifier is read-only and must return exactly 18 rows. Every row must have
`persisted_count = 0` and `passed = true`. Stop on any missing row, duplicate
row, non-zero count, false result, `ERROR`, or unexpected `WARNING`.

## Output handling

- Do not commit SQL Editor exports or fixture output.
- If an export is temporarily required, save it only under the ignored
  `docs/schema-audit/outputs/` directory and delete it after review.
- Do not run production scripts, production backfills, inventory changes, or
  website-repository SQL during this rehearsal.

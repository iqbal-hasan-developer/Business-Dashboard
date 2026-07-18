# Product financial recognition development rehearsal checklist

Status: the canonical product-recognition migration is applied in development;
the reporting-helper ACL follow-up below is prepared only. Nothing in this
checklist authorizes Supabase contact, SQL execution, production access,
migration-history repair, inventory mutation, or Website repository changes.

Target for a later separately approved rehearsal:
**NexaNotion Business Dashboard Dev** only.

Canonical candidate:
`supabase/migrations/202607170000_product_financial_recognition_allocations.sql`

Pending canonical least-privilege follow-up:
`supabase/migrations/202607180000_authenticated_reporting_helper_execute.sql`

## Scope and accounting contract

The candidate adds immutable delivered item allocations, scoped append-only
refund allocations, separately recorded return and inspection evidence, product
reconciliation/data-quality views, and role-gated RPCs. It performs no backfill.

- Revenue and COGS begin only at immutable Delivered recognition.
- Refunds reverse scoped revenue only. They never automatically reverse COGS,
  cash, delivered units, returns, or inventory.
- A return event records returned units separately. Only a later owner/admin
  inspection can create exactly-once resellable-restoration evidence and its
  supported COGS reversal; no function changes physical stock.
- Ambiguous historical refunds remain `needs_review` and cannot be inferred.
- Integer-poisha allocation uses proportional largest remainder with immutable
  order-item UUID tie-breaking unless exact item allocations are supplied.
- Product Revenue excludes delivery. Delivery, discounts, and refunds remain
  separately reportable.

Top Products is not connected to the application in this rehearsal.

## Files and execution order

### A. Read-only SQL Editor preflight

1. Open a new SQL Editor query whose visible breadcrumb says exactly
   **NexaNotion Business Dashboard Dev**.
2. Paste only
   `supabase/development-rehearsal/202607180000_read_only_product_financial_preflight.sql`.
3. Replace its single `__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__` sentinel with
   the exact visible breadcrumb and run it once.
4. Stop unless `metadata_preflight_allowed = true`,
   `application_allowed = true`, and `stop_required = false`.
5. Also require ten aligned migration names through `202607140009`, no recorded
   `202607150000` or `202607170000`, absent product-allocation objects, and zero
   recognition snapshots, adjustments, Delivered orders, and non-zero refunds.

### B. Private local and linked CLI gate

From the clean repository at the separately approved checkpoint, use a private
PowerShell window. Authentication and linking must use private interactive
prompts only. Never pass or print a project reference, token, password,
connection string, or environment value.

Run the local checks:

```powershell
Set-Location -LiteralPath 'C:\Users\Iqbal\OneDrive\Desktop\Business-Dashboard'
supabase --version
git rev-parse HEAD
git status --short
git diff --exit-code -- supabase/migrations
```

Require Supabase CLI `2.106.0`, the approved checkpoint, a clean working tree,
unchanged canonical migrations, and an existing private link independently
confirmed as **NexaNotion Business Dashboard Dev**. Do not update the CLI.

Run only this read-only preview:

```powershell
supabase db push --dry-run --linked
```

The preview must show exactly one pending migration:
`202607170000_product_financial_recognition_allocations.sql`.

Stop after the preview and return its sanitized output for separate execution
approval. Do not apply the migration in the preview approval step.

### C. Separately approved linked application

Only after the preflight and dry-run evidence receive separate execution
approval, repeat the local/identity gates and run exactly:

```powershell
supabase db push --linked
supabase migration list --linked
```

Require `202607170000` in both Local and Remote, with no missing migration and no
unexpected Remote-only timestamp. Successful `db push` applies the canonical
migration and records `202607170000` through the supported migration workflow;
manual migration-history repair is not part of this procedure.

### D. Post-application SQL Editor verification

After CLI history verification, use a new SQL Editor query for each file below.
Before every query, reconfirm the exact development breadcrumb and replace only
that file's single breadcrumb sentinel.

1. Run
   `supabase/development-rehearsal/202607180001_verify_product_financial_schema.sql`.
   Require every check and `all_checks_passed` to be `true`.
2. Confirm pgTAP is already available. If absent, stop. Then run
   `supabase/development-rehearsal/202607180002_run_004_product_financial_allocations.sql`.
   Require all 90 assertions to pass and the transaction to reach `ROLLBACK`.
3. Run
   `supabase/development-rehearsal/202607180003_run_product_financial_fixtures.sql`.
   Require exact reconciliation, unchanged inventory, and final `ROLLBACK`.
4. Run
   `supabase/development-rehearsal/202607180004_verify_product_financial_cleanup.sql`.
   Require every persisted count to be zero and
   `all_fixture_records_removed = true`.
5. Return the preflight row, sanitized dry-run/application/list outputs,
   post-verifier rows, complete TAP output, fixture results, and cleanup rows.

## Pending reporting-helper ACL follow-up

The original sequence stopped at D.2. Resume at E; do not continue to D.3 or
run any fixture until the follow-up verifier and pgTAP rerun are reviewed.

The applied security-invoker reporting views call two immutable, strict,
fixed-search-path conversion helpers. The original migration revoked helper
execution from every application role while granting authenticated users
`SELECT` on those views. The follow-up grants `EXECUTE` only on
`dashboard_money_to_poisha(numeric)` and
`dashboard_poisha_to_money(bigint)` to `authenticated`. It does not grant anon
or service-role access and changes no table, RLS policy, data, or inventory.

### E. Read-only follow-up preflight

1. Open a new SQL Editor query whose visible breadcrumb says exactly
   **NexaNotion Business Dashboard Dev**.
2. Paste only
   `supabase/development-rehearsal/202607180005_read_only_reporting_helper_acl_preflight.sql`.
3. Replace its single breadcrumb sentinel and run it once.
4. Require every check and `followup_application_allowed` to be `true`, with
   every `stop_required` value `false`.
5. Stop and return the result before any linked CLI command.

### F. Follow-up checkpoint and linked dry run

Only in a separately authorized task, verify the approved local checkpoint,
clean tree, unchanged `202607170000` hash, CLI `2.106.0`, and private linked
development identity. Then run:

```powershell
supabase migration list --linked
supabase db push --dry-run --linked
```

Require `202607170000` in Local and Remote, and exactly
`202607180000_authenticated_reporting_helper_execute.sql` as Local-only and the
only pending dry-run migration. Stop after the dry run and return sanitized
output for separate application approval.

### G. Separately approved follow-up application

Only after the dry-run evidence receives separate execution approval, repeat
the local, identity, and migration-history gates and run exactly:

```powershell
supabase db push --linked
supabase migration list --linked
```

Require both `202607170000` and `202607180000` in Local and Remote, with no
unexpected Remote-only timestamp, seed, role application, warning, or error.

### H. Follow-up verification and pgTAP rerun

1. In a new SQL Editor query, run only
   `supabase/development-rehearsal/202607180006_verify_reporting_helper_acl.sql`.
   Require every check and `all_checks_passed` to be `true`.
2. In another new query, rerun only
   `supabase/development-rehearsal/202607180002_run_004_product_financial_allocations.sql`.
   Require all 90 assertions and final plan `1..90` to pass through `ROLLBACK`.
3. Stop and return both results. Do not run the controlled fixtures until those
   results receive review.

## Preflight stop conditions

Stop without applying the candidate if any of these is true:

- the visible project breadcrumb is not exact or is uncertain;
- the ten `202607140000`-`202607140009` entries or names are not aligned;
- any unexpected migration, `202607150000`, or `202607170000` is recorded;
- any product-allocation table, column, function, view, or policy already exists;
- any recognition snapshot, refund adjustment, Delivered order, or non-zero
  order refund exists;
- the existing service-role order/item grants or recognition trigger path are
  absent;
- any result contains customer data, Auth-user details, credentials, project
  references, environment values, or function bodies;
- the dry run shows zero, multiple, or any pending migration other than
  `202607170000`;
- the dry run shows a seed, role, history mismatch, error, warning, or ambiguous
  operation;
- the CLI version, approved checkpoint, clean tree, canonical files, or private
  linked development identity cannot be confirmed;
- anyone proposes backfill, production contact, inventory mutation, `db reset`,
  migration repair, or manual SQL Editor execution of the canonical migration.

The canonical candidate repeats the key history and partial-object guards inside
its transaction. A guard exception is a safe stop and rolls back the candidate.

## Post-application RLS and ACL expectations

| Surface | anon | authenticated browser | service_role |
| --- | --- | --- | --- |
| Item recognition/refund/return ledgers | None | `SELECT`, owner/admin RLS | None |
| Return events, inspections, restoration evidence | None | `SELECT`, owner/admin RLS | None |
| Product reconciliation/data-quality views | None | `SELECT`, invoker RLS | None |
| Pure reporting conversion helpers | None | `EXECUTE`, required by invoker views | None |
| Refund, return, inspection RPCs | None | `EXECUTE`, owner/admin check | None |
| Product financial reporting RPC | None | `EXECUTE`, owner/admin/viewer check | None |
| Internal allocators and validators | None | None | None |
| Delivered/refund capture triggers | None | Trigger-compatible `EXECUTE` | Trigger-compatible `EXECUTE` |

The verifier also requires fixed function search paths, expected foreign-key and
reporting indexes, immutable-ledger triggers, serialized refund/return locking,
and no stock-update or `decrement_product_stock` call in financial functions.

## pgTAP and fixture evidence

The tests cover cancellation before delivery, Delivered-only recognition,
integer-poisha largest remainder and UUID tie-breaking, explicit and fallback
refund allocation, product-only/delivery-only/full-order scope, exact retry and
conflicting idempotency, over-refund, refund reduction, missing cost evidence,
ambiguous legacy refund, resellable and damaged returns, exactly-once inspection,
preserved delivered units, returned units, immutable history, reconciliation,
ACL/RLS separation, and unchanged physical inventory.

Both test wrappers start a transaction and end with `ROLLBACK`. The controlled
fixture refuses reserved-identifier collisions before inserting synthetic data.
The cleanup verifier is read-only and independently proves no fixture row or
related audit/financial evidence persisted.

## Prohibited actions

- Do not run the reviewed file under `supabase/development-migrations`.
- Do not paste or run the canonical migration in SQL Editor.
- Do not run `db push` before its exact dry run and separate execution approval.
- Do not apply `202607180000` before its read-only preflight, exact linked dry
  run, sanitized evidence review, and separate execution approval.
- Do not use `--include-all`, `--include-seed`, `--include-roles`, `--db-url`, or
  `--password`.
- Do not run `db reset`, migration repair, baseline SQL, seed application, role
  application, or backfill.
- Do not inspect or modify production.
- Do not call inventory or stock RPCs or update `products.stock`.
- Do not modify the NexaNotion Website repository.
- Do not place credentials, project references, or environment values in SQL,
  command arguments, screenshots, logs, documentation, or chat.

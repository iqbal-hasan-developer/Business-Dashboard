# Development migration-history audit operator checklist

Status: read-only Stage A evidence collection. This checklist does not approve
migration repair, schema changes, SQL application, production access, or the
product-financial-allocation proposal.

Audit file:
`supabase/development-rehearsal/202607170002_read_only_migration_history_audit.sql`

## Purpose and boundaries

The storefront baseline and canonical migrations `202607140000` through
`202607140009` were run manually in the development SQL Editor. That established
the development schema contract but may not have populated
`supabase_migrations.schema_migrations`. This audit compares the expected local
timestamps, development migration-history metadata, and safe schema metadata.

The audit returns only database identity metadata, migration timestamps and
names, object-existence checks, and aggregate counts. It does not return public
business rows, customer records, Auth-user details, credentials, function
bodies, environment values, or private financial values.

The SQL file is outside `supabase/migrations`; it is not a canonical migration.
The development baseline `202607150000_storefront_public_schema.sql` is also not
an expected migration-history entry. If it appears in history, the audit reports
it as `unexpected_history_entry`.

## Confirmed Stage A result - 17 July 2026

The metadata-only audit was run against the project whose visible breadcrumb was
confirmed as **NexaNotion Business Dashboard Dev**. The returned evidence was:

| Field | Confirmed result |
| --- | ---: |
| `storefront_baseline_fingerprint_present` | `true` |
| `dashboard_migration_fingerprint_present` | `true` |
| `product_allocation_proposal_present` | `false` |
| `schema_migrations_exists` | `false` |
| `metadata_audit_allowed` | `false` |
| `stop_required` | `true` |
| `expected_migration_count` | `10` |
| `recorded_expected_count` | `0` |
| `missing_expected_count` | `10` |
| `unexpected_history_count` | `0` |
| `schema_contract_check_count` | `10` |
| `passed_schema_contract_count` | `10` |
| `history_aligned` | `false` |

All ten canonical migration schema-contract checks passed. The development
schema therefore contains the selected objects expected from migrations
`202607140000` through `202607140009`, while the Supabase CLI migration-history
table is absent. This is consistent with the migrations having been run manually
through SQL Editor rather than recorded through the CLI workflow.

This result authorizes planning only. It does not authorize linking, login,
repair, SQL execution, table creation, production contact, or any product
allocation change. The separately prepared Stage B checklist remains subject to
explicit execution approval.

## Mandatory project gate

1. Open the Supabase Dashboard project selector and SQL Editor.
2. Visually inspect the breadcrumb. It must say exactly:
   **NexaNotion Business Dashboard Dev**.
3. Stop if the breadcrumb is missing, truncated, different in any way, or says
   anything that could be the production project. Do not use a project URL,
   reference ID, credential, or remembered browser tab as a substitute.
4. Open a new SQL Editor query. Paste only the complete contents of the audit
   file named above.
5. In the pasted query, replace the single sentinel
   `__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__` with the exact visible text
   `NexaNotion Business Dashboard Dev`. Do not alter any other text.
6. Reconfirm that the query contains only the audit file. Run it once, then
   stop. Do not run any migration, baseline, fixture, pgTAP wrapper, stock RPC,
   CLI command, or repair command in the same query or session task.

The sentinel is a fail-closed operator acknowledgement. If it remains unchanged,
the query does not read migration-history rows and returns
`metadata_audit_allowed = false` and `stop_required = true`.

## Results to return

Return only:

- the complete `database_identity` result object;
- every `migration_history` row (timestamp, expected name, recorded name, and
  status);
- any `schema_contract` row where `passed = false`;
- the complete `summary` result object containing:
  - `expected_migration_count`;
  - `recorded_expected_count`;
  - `missing_expected_count`;
  - `unexpected_history_count`;
  - `schema_contract_check_count`;
  - `passed_schema_contract_count`;
  - `history_aligned`.

Do not return screenshots that expose another project, browser chrome, account
details, or unrelated SQL history. Do not export or paste full schema metadata,
table rows, Auth data, function definitions, environment values, or secrets.

## Stop conditions

Stop immediately and make no further database action if any of these occurs:

- the breadcrumb is not exactly **NexaNotion Business Dashboard Dev**;
- the SQL Editor contains anything besides the one audit file;
- `stop_required = true` or `metadata_audit_allowed = false`;
- `schema_migrations_exists`, `version_column_exists`, or `name_column_exists`
  is false;
- the storefront baseline or dashboard migration fingerprint is false;
- `product_allocation_proposal_present = true`;
- PostgreSQL support or the Supabase API-role fingerprint is false;
- any SQL Editor error, timeout, permission failure, or unexpected warning;
- any schema-contract check is false;
- any result exposes customer, Auth-user, credential, environment, function-body,
  or business-record content;
- any request or suggestion appears to run `db push`, repair history, apply a
  migration, change inventory, or inspect production;
- the returned counts or statuses cannot be explained from the expected ten
  canonical timestamps;
- any recorded migration name does not match its canonical filename stem.

An error caused by unavailable metadata is a safe stop, not permission to try a
broader query or a privileged key.

## Interpreting Stage A outcomes

- `history_aligned = true`: all ten expected timestamps are recorded, there are
  no unexpected history entries, and all ten schema-contract checks pass. This
  is evidence for review, not authorization to deploy or repair anything.
- Ten `missing_from_history` rows with ten passing schema checks: the manual SQL
  likely established the schema without recording CLI migration history. Do not
  infer or repair entries yet.
- A mixture of `recorded` and `missing_from_history` with all schema checks
  passing: history is partially recorded and requires an exact, separately
  reviewed strategy.
- A recorded timestamp with `name_matches_expected = false`: the history name
  disagrees with the canonical filename stem. Treat history as unaligned even
  when all timestamps and schema checks otherwise match.
- `unexpected_history_entry`: the development history contains a timestamp
  outside the approved `202607140000`-`202607140009` set. Identify its local
  source before considering any repair. The development baseline must not be
  treated as canonical.
- A recorded timestamp with a failed schema-contract check: history and actual
  schema evidence disagree. Stop; do not assume the history row proves the SQL
  was applied successfully.
- A missing timestamp with a failed schema-contract check: neither history nor
  the selected object fingerprint proves that migration. Stop and investigate
  read-only evidence only after approval.
- An inaccessible or incompatible history table: Stage A is incomplete. Do not
  escalate privileges or query production to fill the gap.

Development results must never be used to infer production migration history.

## Separate approval gate for Stage B

Migration-history repair is Stage B. It changes tracking state and remains
prohibited until the complete Stage A output is reviewed and the user explicitly
approves an exact repair plan. Approval to run this read-only audit is not
approval to run `supabase migration repair`, edit
`supabase_migrations.schema_migrations`, use `db push`, or apply/revert SQL.

## Prompt to use after returning the result

> Review the attached Stage A output from
> `202607170002_read_only_migration_history_audit.sql`. Compare the development
> identity result, all migration-history statuses, failed schema-contract checks,
> and the exact summary counts against local canonical migrations
> `202607140000` through `202607140009`. Explain the evidence and recommend a
> next step. Do not contact production, execute SQL, edit migration history, run
> migration repair or `db push`, create a canonical migration, or modify the
> Website repository. Treat any Stage B repair as separately approval-gated.

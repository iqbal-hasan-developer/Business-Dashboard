# Development migration-history initialization operator checklist

Status: Stage B completed on 18 July 2026. Commands retained below are the
historical reviewed procedure and are not reusable authorization for any later
migration repair.

Target: **NexaNotion Business Dashboard Dev** only.

Starting Git checkpoint:
`edf59f6dea8304da0a41372c65bda7f12596f3b7`.

## Completion record - 18 July 2026

Stage B was separately approved and completed against **NexaNotion Business
Dashboard Dev** with Supabase CLI `2.106.0`. The first entry was initialized and
audited before the remaining nine entries were recorded individually. Every
repair returned exit code `0`; every following read-only migration list showed
exactly one additional expected timestamp and no Remote-only entry.

The final read-only audit reported ten expected and ten recorded migrations,
zero missing, zero unexpected, ten of ten passing schema-contract checks, and
`history_aligned = true`. Every recorded name matched its canonical filename.
The development baseline `202607150000` and product-allocation proposal
`202607170000` were not recorded. No migration SQL, `db push`, `db reset`,
production operation, inventory action, manual history-table SQL, commit, or
push occurred during Stage B.

This completion record closes only the `202607140000`-`202607140009` history
initialization. It does not authorize applying or recording any later migration.

## Confirmed Stage A interpretation

Stage A found the expected storefront and dashboard schema fingerprints, no
product-allocation proposal objects, ten of ten passing canonical schema checks,
and no `supabase_migrations.schema_migrations` table. The schema objects exist,
but none of the ten canonical timestamps is recorded in Supabase migration
history.

This is a migration-tracking initialization problem, not approval to execute
the canonical SQL again. The development baseline remains outside canonical
history. Production history is out of scope and must not be inspected or
changed.

## Supported method and installed CLI behavior

The installed Supabase CLI is `2.106.0`. Its local help exposes:

```text
supabase migration repair [version...] --status applied --linked
```

Official Supabase guidance says that when a migration's schema change already
exists but its remote history entry is missing, use `migration repair --status
applied <timestamp>`. The command updates migration tracking only and does not
run or revert migration SQL.

For CLI `2.106.0`, the official source calls `CreateMigrationTable` before
upserting an applied repair entry. That initializer creates the internal
`supabase_migrations` schema and `schema_migrations` table when absent, then adds
the supported `statements` and `name` columns. The operator must let the CLI own
that initialization; do not create or edit the table manually.

Authoritative references:

- [Supabase database migration repair guidance](https://supabase.com/docs/guides/deployment/database-migrations#step-3-if-the-migration-history-table-is-wrong)
- [Supabase CLI migration repair reference](https://supabase.com/docs/reference/cli/supabase-migration-repair)
- [CLI 2.106.0 repair implementation](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/internal/migration/repair/repair.go)
- [CLI 2.106.0 migration-history initializer](https://github.com/supabase/cli/blob/v2.106.0/apps/cli-go/pkg/migration/history.go)

## Scope lock

Only these canonical versions may be recorded, in this order and one command at
a time:

1. `202607140000`
2. `202607140001`
3. `202607140002`
4. `202607140003`
5. `202607140004`
6. `202607140005`
7. `202607140006`
8. `202607140007`
9. `202607140008`
10. `202607140009`

Do not record the development baseline `202607150000` or the review-only
product-allocation proposal `202607170000`. Do not run `db push`, `db reset`,
`migration up`, `migration down`, migration SQL, fixtures, seed files, stock
RPCs, or any direct statement against migration history.

## Approval and environment gates

Before any future command execution:

1. Obtain explicit user approval to execute Stage B against development.
2. Close any Supabase production Dashboard tabs.
3. In the Supabase Dashboard, visually confirm the breadcrumb says exactly
   **NexaNotion Business Dashboard Dev**.
4. Use a private PowerShell window. Do not screen-share, record, transcript, or
   paste its authentication prompts into chat.
5. Confirm the working directory is the dashboard repository and the current
   `HEAD` is the reviewed checkpoint or an explicitly approved successor.
6. Confirm the ten canonical files and their timestamps are unchanged.
7. Confirm `supabase --version` is `2.106.0`. A different version requires a
   fresh documentation and source-behavior review.
8. Confirm Stage A still reports ten passing schema checks, no proposal objects,
   and no unexpected migration-history entries.

## Exact future PowerShell sequence

### 1. Local preflight

These commands do not contact a Supabase project:

```powershell
Set-Location -LiteralPath 'C:\Users\Iqbal\OneDrive\Desktop\Business-Dashboard'
supabase --version
git rev-parse HEAD
git status --short
Get-ChildItem -LiteralPath '.\supabase\migrations' -File | Sort-Object Name | Select-Object -ExpandProperty Name
```

Expected: CLI `2.106.0`; the reviewed commit or approved successor; exactly the
ten canonical migrations `202607140000` through `202607140009`; no unexpected
canonical file. Stop on any difference.

### 2. Private interactive authentication and development linking

Run without token, project-reference, password, debug, or environment flags:

```powershell
supabase login
supabase link
```

Complete all authentication privately. In the interactive project selector,
choose only **NexaNotion Business Dashboard Dev**. If the CLI privately requests
the development database password, enter it only in that prompt. Never place it
on the command line, in a variable, in a file, or in chat.

Stop before repair unless both the CLI selection and the visible Dashboard
breadcrumb independently identify **NexaNotion Business Dashboard Dev**.

### 3. Initialize history with the first applied entry

Run exactly one repair:

```powershell
supabase migration repair 202607140000 --status applied --linked
```

This is the only step expected to initialize the absent internal history schema
and table. It must not execute `202607140000_live_schema_preflight.sql`.

Immediately verify read-only CLI history:

```powershell
supabase migration list --linked
```

Expected: `202607140000` is present in both Local and Remote; versions
`202607140001` through `202607140009` remain Local-only. No other remote version
may appear.

Then rerun only the metadata audit SQL in the development SQL Editor:

`supabase/development-rehearsal/202607170002_read_only_migration_history_audit.sql`

Expected after initialization:

- `schema_migrations_exists = true`;
- `metadata_audit_allowed = true`;
- `stop_required = false`;
- `recorded_expected_count = 1`;
- `missing_expected_count = 9`;
- `unexpected_history_count = 0`;
- `passed_schema_contract_count = 10`;
- `history_aligned = false`;
- the recorded name for `202607140000` matches `live_schema_preflight`.

Stop and return both verification results for review. Do not continue to the
second repair in the same approval step.

### 4. Record each remaining version individually

After the first-entry verification is reviewed and continuation is explicitly
approved, run one repair followed by one read-only list. Pause and inspect the
output after every pair.

```powershell
supabase migration repair 202607140001 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140002 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140003 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140004 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140005 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140006 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140007 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140008 --status applied --linked
supabase migration list --linked

supabase migration repair 202607140009 --status applied --linked
supabase migration list --linked
```

The cumulative Remote count must increase by exactly one after each repair:

| Most recently recorded | Expected recorded | Expected missing |
| --- | ---: | ---: |
| `202607140001` | 2 | 8 |
| `202607140002` | 3 | 7 |
| `202607140003` | 4 | 6 |
| `202607140004` | 5 | 5 |
| `202607140005` | 6 | 4 |
| `202607140006` | 7 | 3 |
| `202607140007` | 8 | 2 |
| `202607140008` | 9 | 1 |
| `202607140009` | 10 | 0 |

At every pause, all earlier allowed versions must be Local-and-Remote, all later
allowed versions must remain Local-only, and there must be no other Remote row.

### 5. Final read-only verification

After all ten commands and their individual list checks pass, run:

```powershell
supabase migration list --linked
```

Expected: exactly the ten approved versions align in Local and Remote, with no
Remote-only or Local-only migration.

Rerun the same metadata audit SQL in the development SQL Editor. Expected final
summary:

- `expected_migration_count = 10`;
- `recorded_expected_count = 10`;
- `missing_expected_count = 0`;
- `unexpected_history_count = 0`;
- `schema_contract_check_count = 10`;
- `passed_schema_contract_count = 10`;
- `history_aligned = true`;
- every recorded migration name matches its canonical filename stem;
- `product_allocation_proposal_present = false`.

Stop and return the complete identity result, all ten history rows, any failed
schema check, and the summary. Do not run any deployment or migration command.

### 6. Optional local credential cleanup after evidence is captured

Only if the operator does not need the local development link or login session:

```powershell
supabase unlink
supabase logout
```

These commands clean local CLI state; they do not revert remote history.

## Private inputs required later

- Private interactive Supabase account authentication for `supabase login`.
- Interactive selection of **NexaNotion Business Dashboard Dev**.
- The development database password, only if the CLI requests it in a hidden or
  private prompt.

Do not provide any of these values to Codex or place them in command arguments,
PowerShell variables, environment variables, files, logs, screenshots, or Git.
No production project reference or production credential is required.

## Stop conditions

Stop immediately and run no later repair if:

- explicit Stage B execution approval has not been given;
- the Dashboard breadcrumb or CLI selector is not exactly the development
  project;
- CLI version differs from `2.106.0`;
- canonical filenames, timestamps, contents, or order differ from the reviewed
  set;
- Stage A schema checks no longer pass or proposal objects appear;
- any command requests production selection or production credentials;
- `migration repair` reports an error, timeout, lock failure, permission failure,
  unexpected prompt, or ambiguous completion;
- the expected new timestamp is absent after repair;
- more than one new Remote timestamp appears;
- any unexpected, out-of-order, or name-mismatched history entry appears;
- schema objects, business data, inventory, Auth users, or production show any
  sign of change;
- anyone suggests `db push`, `db reset`, direct migration-table SQL, or execution
  of a migration to resolve a tracking-only problem.

## If absent-table initialization fails

CLI `2.106.0` is designed to initialize the internal migration-history schema
and table before upserting an applied entry. If the first repair cannot do so:

1. Stop. Do not run the other nine repairs.
2. Do not create `supabase_migrations` or `schema_migrations` manually.
3. Do not retry with elevated, production, service-role, or command-line secrets.
4. Record only the sanitized error category and exit status; remove connection
   strings or identifiers before sharing.
5. Rerun the metadata-only Stage A audit to determine whether the failure left
   the table absent, created but empty, or containing `202607140000`.
6. If the table is absent or empty, request a new review of the CLI failure and
   current official guidance. If the first row exists, treat the repair as
   potentially successful and verify before any retry.

The CLI initializer and the applied-entry upsert are separate internal phases,
so a failed command can leave an empty initialized history table. That is a safe
stop condition, not authorization to drop or rebuild it. No manual-table fallback
is approved by this checklist.

## Recovery commands

Recovery changes migration tracking only and requires separate explicit approval.
Use it only for the most recent incorrect applied entry, after read-only evidence
proves the schema itself should remain unchanged.

| Incorrect most-recent entry | Exact single recovery command |
| --- | --- |
| `202607140009` | `supabase migration repair 202607140009 --status reverted --linked` |
| `202607140008` | `supabase migration repair 202607140008 --status reverted --linked` |
| `202607140007` | `supabase migration repair 202607140007 --status reverted --linked` |
| `202607140006` | `supabase migration repair 202607140006 --status reverted --linked` |
| `202607140005` | `supabase migration repair 202607140005 --status reverted --linked` |
| `202607140004` | `supabase migration repair 202607140004 --status reverted --linked` |
| `202607140003` | `supabase migration repair 202607140003 --status reverted --linked` |
| `202607140002` | `supabase migration repair 202607140002 --status reverted --linked` |
| `202607140001` | `supabase migration repair 202607140001 --status reverted --linked` |
| `202607140000` | `supabase migration repair 202607140000 --status reverted --linked` |

Run only the single line matching the incorrect most-recent entry, then run:

```powershell
supabase migration list --linked
```

Marking `reverted` removes the history record; it does not undo schema SQL. If
the first entry is reverted, the CLI-created internal schema/table may remain
empty. Do not drop it manually. Multiple-entry rollback, out-of-order rollback,
or production rollback is not approved.

If the wrong project was linked but no repair ran, use only:

```powershell
supabase unlink
```

Then stop. Do not relink until the project-selection failure is reviewed.

## Risks and manual approval boundary

- `migration repair` intentionally mutates remote migration tracking.
- Linking the wrong project is the highest-impact risk; the visible breadcrumb
  and interactive project-name checks are both mandatory.
- CLI behavior may change after an upgrade; this procedure is pinned to
  `2.106.0`.
- A command failure can leave partial tracking initialization even though no
  business schema migration ran.
- `migration list` compares timestamps; the metadata audit is still required to
  verify recorded names and schema fingerprints.
- Repair records the canonical files' parsed statements as history metadata but
  does not execute those statements.
- The product-allocation proposal remains review-only, unrecorded, and unapplied.

Preparation of this checklist is not execution approval. A future operator must
receive explicit approval for the first repair, stop after its verification, and
receive separate continuation approval before versions `202607140001` through
`202607140009`.

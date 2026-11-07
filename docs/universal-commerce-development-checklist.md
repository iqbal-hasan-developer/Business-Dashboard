# Universal commerce SaaS development checklist

This tracker follows the product transformation directive. Completion requires
implementation and evidence; existing NexaNotion MVP status is not evidence of
universal SaaS readiness.

Latest local evidence (7 November 2026): seven universal migrations ran on
embedded PostgreSQL 18.6 in PGlite; all 344 tests, lint, TypeScript, production
build, migration-script syntax checks, and `git diff --check` pass. The database
suite covers tenant RLS, invitation permissions, private credentials, relational
constraints, migration checksums, the workspace overview reader, commerce RPCs,
inventory issue, refund recording, and financial completeness. A PostgreSQL 17
Supabase CLI CI workflow includes real local Auth/PostgREST requests and a
Playwright registration, invitation, switching, and revocation flow. Docker is
unavailable here. The first hosted PR run, [42371442520](https://github.com/iqbal-hasan-developer/Business-Dashboard/actions/runs/42371442520), failed at `npm ci` because the lockfile omitted `@emnapi/runtime@1.11.3` and `@emnapi/core@1.11.3`; that lockfile fix was pushed. The next run passed install, tests, Supabase startup, and schema reset, then failed in the `pg_trgm` check ([run 42374401971](https://github.com/iqbal-hasan-developer/Business-Dashboard/actions/runs/42374401971)). The check has been hardened locally, but that change is not yet pushed. The
previously recorded dependency audit reported no production vulnerabilities
and 21 development-tree findings (2 high, 18 moderate, 1 low); dependency audit
was not rerun for Phase 4C.

Phase 4C local implementation adds server-side product and inventory stock
states and quantity ranges, inventory category, order customer/store, and
customer order-count bounds. Stock is aggregated across tracked stores;
missing inventory rows mean `untracked`, not zero. Low stock means any tracked
store level is at or below the larger of its reorder threshold and variant
threshold. Untracked aggregate quantities are null, so numeric quantity ranges
do not treat unknown stock as zero. Customer order counts include all order statuses, including
cancelled and refunded. All five commerce lists retain workspace scoping,
25-row pagination, exact counts, search, and allow-listed sorting.

The importer recovery suite injects interruptions after products, orders,
expenses, holds, and completion tracking; resumed imports are compared with a
clean import by destination records, identity links, holds, relationships, and
normalized final run state. These are synthetic PGlite fixtures and do not
replace a restored-source rehearsal. The importer does not create workspace,
membership, or store mappings; an operator must provide and verify them first.

`npm run benchmark:universal:lists` builds 4 fictional workspaces with 4,000
rows per workspace in each of seven entities (16,000 rows/entity) and records
plans and timings in
[`universal-commerce-query-plan-phase4c.json`](universal-commerce-query-plan-phase4c.json).
This is an embedded-engine baseline, not a production-scale or PostgreSQL 17
claim. Customer order-count and dashboard aggregates use no index scan in this
run; PGlite substring results do not prove trigram index use. The disposable
PostgreSQL 17 workflow checks `pg_trgm`, all 13 intended trigram indexes, and a
20,001-row `ILIKE` query plan; that check is prepared but pending execution.

Hosted verification checklist, after the workflow is pushed and visible on
GitHub:

1. Confirm `.github/workflows/universal-supabase.yml` is present on the default
   branch. Select the branch containing the changes for the run.
2. Open **Actions** → **Universal Supabase tenant checks** → **Run workflow**;
   select the target branch and submit. The disposable job needs no repository
   secrets.
3. Require the single `tenant-isolation` job to pass every step: npm tests,
   typecheck/lint, PostgreSQL 17 Supabase startup/readiness, schema reset,
   `pg_trgm` index/query-plan check, pgTAP, Auth/PostgREST isolation, and the
   Playwright workspace flow. The job step summary must report `success` and
   include the run URL.
4. If a step fails, inspect that step's redacted output and the summary; do not
   copy service keys or tokens into a report. Record the run URL, branch, job
   result, and failed step names. A local test or configured workflow is not a
   substitute for this run.

**Phase 4 status: PARTIAL.** Local implementation and embedded tests are
available; consult the run results recorded at completion for exact counts.
Successful PostgreSQL 17/`pg_trgm`, Supabase Auth/PostgREST, and Playwright
verification, plus the restored-source rehearsal, remain pending. The latest
hosted run failed at `pg_trgm`; rerun after publishing the check fix. Do not
treat this phase as release-ready.
## Audit and architecture

- [x] Complete read-only repository audit.
- [x] Record architecture, gaps, risks, and ordered roadmap.
- [x] Replace the visible app name/logo with configurable product identity.
- [ ] Define adapter contract.
- [x] Define tenant-scoped canonical commerce tables and migration boundary.
- [ ] Map current financial invariants to the universal model.
- [x] Add workspace/store ownership and role-safe membership policies.
- [x] Add invitation, acceptance, revocation, role-change, member removal, and
  ownership-transfer RPCs.
- [x] Add isolated migration version/checksum tracking and a loopback-only runner.
- [x] Execute all seven migrations and tenant-isolation tests on embedded
  PostgreSQL 18.6 (PGlite).
- [ ] Run the Supabase Auth/PostgREST/Playwright workflow on a standalone local
  stack or CI and review its results.
- [x] Document source mapping, held records, reconciliation, resumability, and
  recovery limits for legacy data migration.
- [ ] Complete row-level preflight for every legacy source entity before any
  apply; the current recovery matrix covers key committed-stage boundaries.

## Decoupling and tenancy

- [ ] Remove NexaNotion branding and real business history from buyer package.
- [ ] Add installation-level product branding.
- [x] Add registration, onboarding, workspace selection, membership management,
  invitations, and a tenant-scoped overview to the application.
- [ ] Tenant-scope every entity, query, action, export, RPC, and background job.
- [ ] Add universal store CRUD and map the held legacy business workflows.
- [x] Add PostgreSQL-engine cross-workspace authorization/RLS tests.
- [x] Route workspace catalog, orders, customers, inventory, and expenses
  through tenant-filtered reads and role-checked database operations.
- [x] Add workspace reporting, financial exports, and CSV exports with row
  limits and formula-injection protection.
- [x] Complete server-side search, filtering, and pagination across all five
  commerce lists, including stock, customer/store, and order-count filters.
- [ ] Rehearse the legacy importer against a restored legacy source and a clean
  disposable workspace database; reconcile all imported totals and held rows.

## Core commerce and integrations

- [x] Add tenant-scoped canonical products, variants, customers, orders, refunds,
  and fulfillment schema.
- [x] Add store-scoped inventory levels and append-only movement history schema.
- [ ] WooCommerce adapter with read-only sync first.
- [ ] Shopify adapter with read-only sync first.
- [ ] Custom REST/webhook adapter contract and example.
- [ ] Idempotency, checkpoints, pagination, rate limits, retries, and event dedupe.
- [ ] Encrypted credentials and safe reconnection/disconnection.

## Install, operate, and recover

- [ ] Secure first-run setup wizard and configurable business settings.
- [ ] Background worker, scheduler, monitoring, and recovery behavior.
- [ ] SMTP configuration and notification templates.
- [ ] Docker deployment guide and compose configuration.
- [ ] Manual VPS guide with HTTPS, process manager, worker, and scheduler.
- [ ] Fresh database initialization and upgrade path.
- [ ] Backup, export, restore, and rollback-limitation documentation.

## Demo, assurance, and Vibe96 package

- [ ] Isolated, resettable demo with fictional data and safe credentials.
- [x] Implement database, Auth/PostgREST, and application browser checks for
  roles, tenant isolation, onboarding, invitations, switching, and revoked
  access.
- [ ] Execute the isolated Supabase CI workflow and review its database,
  Auth/PostgREST, and browser results. Workflow execution is pending; do not
  infer success from its configuration or test files.
- [ ] Current dependency security and license review.
- [x] Patch critical/high production dependency advisories discovered on 4 Nov 2026.
- [ ] Resolve or formally assess the remaining 21 development-tree advisories
  (2 high, 18 moderate, 1 low).
- [ ] Security review, secret scan, and reproducible clean-machine build.
- [ ] README, HowToSetup, AGENTS, changelog, SECURITY, LICENSES, and admin docs.
- [ ] Accurate technical specification and known-limitations list.
- [ ] Genuine functioning-app screenshots and demonstration video.
- [ ] Clean source archive and listing draft.
- [ ] Verify current seller agreement and marketplace audit results.

## External gates

- [ ] Production database access/migration: separate explicit approval required.
- [ ] Existing storefront repository changes: separate explicit authorization required.
- [ ] Vercel, public demo hosting, and DNS: configure only under approved access.
- [ ] Do not claim official Vibe96 approval before receiving its actual report.

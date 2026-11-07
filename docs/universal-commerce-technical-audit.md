# Universal commerce SaaS transformation audit

**Audit date:** 4 November 2026  
**Scope:** Read-only repository review before implementation  
**Repository:** `Business-Dashboard`

## Summary

This repository is a substantial single-business operations and finance MVP. It is
not yet a universal, installable, multi-tenant e-commerce SaaS. The strongest
reusable work is its financial model, audited correction workflows, authenticated
server-side writes, database constraints, RLS, reporting, and regression tests.
The active database chain is still legacy single-business software. A separate
universal fresh-install chain now provides tenant-scoped commerce records,
membership/invitation RPCs, credential storage, and PostgreSQL RLS. The
Supabase application path now authenticates by workspace membership, supports
onboarding and workspace management, and reads a tenant-scoped canonical
overview. Legacy business features are held fail-closed until a safe data
migration and schema mappings exist.

During the read-only audit pass, no application source, migration, environment
file, or database was modified or contacted. The working tree already contained
uncommitted user changes when the audit began; `.env.local` is ignored and its
contents were not read or printed. A recovery snapshot of the existing tracked
diff and untracked files was created before implementation continued at
`.codex-tmp/pre-universal-phase-20261104/`.

## 1. Existing architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- Supabase Auth and PostgreSQL accessed through SSR clients and a typed server
  repository. A mock repository is also available for isolated workflows.
- Zod and React Hook Form for validation, TanStack Table for tabular UI, and
  Recharts for dashboards.
- Vitest unit/contract tests, Playwright desktop/mobile browser suites, and SQL
  database contract tests.
- 44 versioned migrations, 12 dashboard page files, 48 source test files, and
  10 Playwright specs were present at audit time.
- No Docker configuration, worker, scheduler, generic integration adapter,
  installation wizard, or fresh-install database chain was found.

## 2. Existing functionality

- Dashboard, orders, products, marketing, expenses, cash/settlements, reports,
  data checks, and settings.
- Manual order creation and constrained editing, financial snapshots, delivered
  order revenue/COGS recognition, and CSV exports.
- Append-only cash and owner-funds workflows, reversals, customer-payment
  receipts, and Steadfast COD settlement/reconciliation.
- Authenticated profiles and owner/admin/data-entry/viewer roles for one
  business installation.

## 3. Business-specific coupling

- NexaNotion name and logo appear in app metadata, shell labels, demo identity,
  exports, README, agent instructions, and migration/database naming.
- BDT, `Asia/Dhaka`, Dhaka delivery pricing, Steadfast, payment-account names,
  and existing operational rules are encoded as current defaults/workflows.
- Mock data contains historical owner names, internal references, and financial
  figures; audit the fixture set before including it in a distributable package.
- Migration preflight requires pre-existing storefront tables and functions.
- Project/deployment docs include NexaNotion references and historical business
  transaction/settlement details. They must be excluded or scrubbed before
  distributing a buyer package.

## 4. Preserve, remove, and replace

Preserve exact money arithmetic, immutable transaction snapshots, delivered-only
recognition, atomic order writes, audited reversals, validation, RLS and role
checks, bounded reads, export hardening, and their tests. Replace fixed branding,
sample login identity, location/courier/payment defaults, and single-business
assumptions with installation branding, configurable settings, fictional demo
fixtures, and workspace/store ownership. Keep the old migration lineage intact
until a clean replacement has been built and validated separately.

## 5. Product gaps recorded in the initial audit

- Workspace/store CRUD beyond the Phase 2 workspace membership and overview UI.
- Production invitation email delivery and broader integration identity/session
  management.
- Store registry and WooCommerce, Shopify, and custom REST/webhook adapters.
- Canonical synchronized products, orders, customers, inventory and refunds.
- Incremental sync, checkpoints, idempotency, rate limiting, retry/backoff,
  webhook authentication/deduplication, and sync history.
- Background queue/worker and scheduler, SMTP, setup wizard, and admin health UI.
- Self-host install, upgrade, backup/restore, safe public demo, and marketplace
  documentation/package.

## 6. Database and tenancy architecture

The separate `supabase/universal` track has seven ordered migrations. It creates
workspaces, multi-workspace memberships, stores, invitations, credential
ciphertext storage, and tenant-scoped products/variants, customers, orders/items,
refunds, fulfillments, inventory levels/movements, expenses, financial entries,
sync runs/checkpoints, webhook receipts, background jobs, and audit events.
Composite foreign keys bind store/customer/order/variant relationships to the
same workspace; money uses exact `numeric(20,6)` values. Inventory levels are
store-keyed.

Membership changes use scoped RPCs. Tokens are high entropy, stored only as a
SHA-256 digest, expire after seven days, and acceptance requires a confirmed
authenticated email match. Owners control administrator assignment and
ownership transfer; last-owner removal is blocked. Credential ciphertext has no
authenticated grants and remains separate from store metadata. Tenant tables
have forced RLS, immutable workspace IDs, role-specific read/write policies,
and no direct deletes for business-history tables.

The migration runner writes a private version/checksum ledger, applies each file
transactionally, validates immutable checksums, and refuses remote targets or a
non-empty public schema. It intentionally does not migrate legacy business
data. Invitation hashing uses `pgcrypto.digest` so it is compatible with the
PostgreSQL 17 target, rather than relying on PostgreSQL 18's built-in SHA-256.

PGlite executes the migration chain on PostgreSQL 18.6 with separate database
roles. The database suite covers workspace/store isolation, membership
permissions, invitation email/expiry/revocation/idempotence, owner transfer,
credential privacy, foreign keys, uniqueness, numeric checks, migration
checksums, and the application overview reader under RLS. This is real
PostgreSQL-engine evidence in an embedded test database; it is not verification
against Supabase Auth, PostgREST, or a separately installed PostgreSQL service.
Docker and `psql` are unavailable in the current environment.

## 6A. Phase 2 application connection — 4 November 2026

Supabase registration uses the existing email/password provider and exchanges
confirmation codes at `/auth/callback`. An authenticated user without a
membership goes to `/onboarding`; the database `create_workspace` RPC makes the
creator an owner atomically. The active workspace cookie is HTTP-only and is
only a selector: each request reloads the authenticated user's active
memberships and accepts the cookie ID only when it matches that server-verified
list. The workspace layout, switching action, member directory, and management
actions revalidate membership. Role and owner protections are repeated in
database RPCs and RLS.

The initial Supabase dashboard overview reads only workspace-filtered store,
product, order, customer, and expense counts. Its shared query reader is
exercised by PGlite with the actual RLS policies. Workspace settings include member/role
display, role changes, removals, transfer, invitation revocation, acceptance,
and a development-only one-time invitation link. The token is stored as a
digest, is email-bound and expires after seven days; production invitations are
disabled until SMTP delivery is configured.

At the Phase 2 checkpoint, old business routes still failed closed in Supabase
mode. Phase 3 now routes core products, orders, customers, inventory, expenses,
dashboard reporting, and CSV exports through workspace-filtered reads and
scoped database RPCs. The legacy tables themselves remain unchanged and the new
importer has not run against a real restored source database. Cash, owner funds,
courier settlement workflows, marketing attribution, purchase batch costing,
and legacy audited corrections still have no equivalent workspace workflow.

`docs/universal-legacy-migration-plan.md` records the source-to-target mapping,
unmapped accounting workflows, resumable migration design, reconciliation, and
recovery limits. A PostgreSQL 17 Supabase CLI config and GitHub Actions workflow
were added for disposable database, Auth, PostgREST, pgTAP, and browser-based
workspace checks. The Playwright flow covers signup, workspace creation,
invitation acceptance, switching, and stale access after revocation. Docker is
absent here, so that workflow was not executed locally. PGlite and static tests
are not reported as live Supabase verification.

## 6B. Phase 3 workspace commerce — 7 November 2026

Migration `202611040005_workspace_commerce_operations.sql` adds category,
brand, image and variant fields, manager-only private variant costs, customer
address and notes fields, order snapshots, inventory thresholds, expense
accounting classes, migration run/identity/hold ledgers, and scoped product,
inventory, order, refund, customer-note, and expense RPCs. Security-definer
functions repeat role and workspace checks; composite foreign keys and RLS
remain the database boundary.

Supabase-mode pages provide catalog create/edit/archive, order creation and
status/payment updates, completed-refund recording, customer order history and
manager notes, per-store inventory adjustments/history, expense create/edit,
date-filtered reporting, and CSV export. Current listings are bounded but do
not yet provide server-side search, filters, or pagination. New orders currently
support one line item per order; product removal is archival. Fulfillment
consumes stock and records recognized financial entries atomically. Returns do
not automatically restock inventory.

Legacy order detail/edit routes redirect to the workspace order list, and the
older single-business manual-entry actions reject writes when the Supabase
workspace provider is active. These routes do not yet have workspace-backed
detail views; the workspace order list shows item snapshots inline.

The reporting RPC groups by currency and Dhaka business dates. Revenue,
discount, refund, COGS, shipping, fee, expense, order, daily trend, best-seller,
customer-growth, recent-order, and low-stock values are read from workspace
tables. Gross profit is revenue less discounts, refunds, and COGS. Net profit
adds shipping income and subtracts shipping costs, fees, and operating expenses.
Profit is returned incomplete when completed orders lack recognized revenue,
COGS, refund, or shipping-cost evidence. Tax and unallocated procurement are
excluded; values are neither estimated nor currency-converted.

The loopback-only importer in `scripts/migrate-legacy-workspace.mjs` validates
an active source owner and explicit target owner, workspace, and disconnected
`.invalid` store. It preserves compatible IDs, hashes rows for change detection,
commits dependency groups, resumes unchanged rows safely, and records
unsupported/ambiguous rows by non-sensitive source ID and reason. Dry run is the
default and reports aggregate counts/checks only; it does not predict every
row-level hold. The tool must run only on disposable copies until it has a full
row-by-row preflight. No restored legacy source or target database was
available, so no actual data import, before/after reconciliation, or live
Supabase/PostgREST verification is claimed. PGlite covers the migrations and
core workspace RPC flows; the disposable Auth/PostgREST/Playwright workflow
remains to be run in CI or on a host with Docker.

## 7. Integration architecture

Define a platform-neutral adapter contract for connection testing, paginated
product/order/customer reads, incremental cursors, webhook verification, and
optional inventory writes. Default to read-only sync. Normalize into internal
types and retain source metadata. Make imports idempotent and checkpointed; use
queued jobs with retry/backoff and explicit rate-limit handling. No real
WooCommerce, Shopify, or custom connector exists in this repository today.

## 8. Security findings

Positive controls include server-side Supabase session checks, database-backed
workspace membership, explicit workspace-filtered commerce queries, forced RLS,
role-gated workspace RPCs, workspace-verified exports, fail-closed remaining
legacy routes/actions, and no service-role browser client. Service-role workflows intentionally bypass RLS
and must add explicit tenant/store filters when they are implemented. The visible demo
credentials are tied to mock mode and must only be used with isolated fictional
data. Legacy feature records still have no workspace association. Credential
encryption/decryption implementation, webhook signature verification, rate
limiting, upload policy, backup/restore, and complete license review remain
outstanding.

### Dependency audit update — 4 November 2026

The initial npm audit found a critical Next.js advisory and high advisories in
Zod and Sharp. The framework, validator, and affected transitive packages were
updated. The current production dependency audit (`npm audit --omit=dev`) reports
zero vulnerabilities. Full `npm audit` reports 21 development-tree findings
(2 high, 18 moderate, 1 low), including the shadcn CSS/CLI package and ESLint
toolchain. The shadcn package supplies the Tailwind stylesheet imported by the
dashboard and cannot be removed without replacing those used CSS variants.
This is local registry audit evidence, not a Vibe96 audit.

## 9. Self-hosting and Vibe96 gaps

The documented deployment is Vercel + Supabase, with a NexaNotion-specific
application environment contract. The universal schema has a local-only runner
and a PostgreSQL README, but no supported production install/upgrade process.
There is no Docker/VPS procedure, setup wizard, changelog, security policy,
licenses inventory, adapter docs, admin guide, standalone `HowToSetup.md`, clean
distributable archive, verified technical specification, real product
screenshots/video, or isolated public demo package. The supplied audit criteria
are not an official audit result.

The current [Vibe96 seller agreement](https://www.vibe96.com/seller-agreement)
requires the seller to have distribution rights, follow third-party licenses,
exclude secrets and personal data, accurately describe the shipped product, and
publish security/defect updates for 12 months after each sale. It also requires
two-business-day ticket responses for 30 days and a reachable demo while listed.
The current [seller submission guide](https://www.vibe96.com/sell) specifies
five 1920 × 1080 screenshots and two supported deployment routes. These are
project obligations to satisfy before submission, not completed deliverables.
Verified against Vibe96's public pages on 4 November 2026: the seller agreement
also states a minimum automated score of 75/100 with no failing check in the
submission guide; screenshots are at least five at 1920 × 1080, and a demo video
is optional. The signed per-project agreement and the then-current dashboard
requirements remain authoritative at submission time.

## 10. Prioritized implementation roadmap

1. Record the new architecture and maintain a phase checklist; protect the
   existing migration history and external-system approval boundaries.
2. Decouple product identity, brand assets, demo identity, and historical private
   business information from buyer-facing source/docs.
3. Build and test a clean-install baseline with workspaces, memberships, stores,
   tenant-scoped RLS, and cross-tenant denial tests.
4. Add configurable installation settings, setup/onboarding, users, and roles.
5. Make canonical product/order/customer/inventory workflows workspace-aware and
   preserve the financial invariants already tested.
6. Add adapter contracts, encrypted credentials, read-only sync, webhook intake,
   idempotency, checkpoints, retries, and worker/scheduler operations.
7. Add operational reporting, exports, SMTP, health, backups, restore, and safe
   upgrades.
8. Provide an isolated resettable fictional demo and verify destructive actions
   cannot affect its availability or any customer installation.
9. Document Docker and manual VPS deployment, create a clean source package,
   perform current security/dependency/license checks, and prepare genuine listing
   evidence. Do not claim an official Vibe96 pass without its report.

## Scope boundaries

This audit and code work do not authorize production database changes, edits to
the existing storefront repository, deployment, DNS, account access, or entering
external credentials. Those remain separate actions with their existing approval
requirements.

## 11. Phase 4B progress — 7 November 2026

**Status at the Phase 4B checkpoint: PARTIAL.** Its local PGlite, unit/contract,
lint, typecheck, and build checks had passed. The filter and importer gaps
listed below were addressed or re-scoped in the Phase 4C record in section 12;
hosted Supabase verification and the restored-source rehearsal remain pending.

The PGlite synthetic importer suite now compares predicted and applied row
outcomes for clean and invalid dependencies; it also verifies rollback-only dry
run, destination collision handling, unsupported rows, idempotency, and retry
after a transient expense failure. It does not replace the restored-source
rehearsal or cover every legacy entity and interruption stage.

At that checkpoint, product stock, inventory, store, and order-count filters
remained open. See section 12 for their implementation and current evidence.
Migration 006 adds workspace-prefixed sort/filter indexes and conditional
trigram indexes for substring fields. Its PostgreSQL 17 extension branch still
requires actual Supabase CI verification.

The CI workflow now includes Auth/PostgREST readiness checks and the browser
spec covers product create/edit/search/pagination, order create/update/filter,
expense creation/filter, inventory adjustment, customer search, reports, and
export isolation. The workflow has not executed: Docker is unavailable locally,
and no GitHub Actions run is available in this workspace. Real Auth/PostgREST and
browser verification therefore remain pending.

## 12. Phase 4C progress — 7 November 2026

**Status: PARTIAL.** Seven universal migrations and the commerce-view semantics
were exercised in PGlite 18.6. Product stock and inventory filtering now use
security-invoker views over workspace-owned products, variants, and inventory
levels. Orders join the associated workspace customer for name filtering; store
IDs remain workspace-filtered. Customer order counts are aggregated in SQL and
count every order status. The regression suite covers stock states and category
and quantity combinations, including workspace isolation.

Stock semantics: a missing inventory row is `untracked`; a tracked aggregate of
zero is `out_of_stock`; `low_stock` means at least one tracked store quantity is
at or below `greatest(inventory_level.reorder_level, variant.reorder_level)`;
otherwise a positive tracked aggregate is `in_stock`. Product quantity is the
sum of tracked variant/store quantities and is null for untracked products, so
quantity-range filters do not treat unknown stock as zero. Product low-stock
status propagates from any low tracked store. Customer activity counts
cancelled/refunded orders.

Importer recovery tests inject errors after products, orders, expenses, and
unsupported hold upserts, plus a final completion-marker failure. Each resumed
run is compared against an uninterrupted synthetic import using canonical
records, relationships, identity hashes, holds, counts, and final run markers.
The importer reports current and last-completed stages with imported, skipped,
held, rejected, failed-operation, and safe-resume information. A forced
termination during a transaction rolls back that dependency group; after a
committed stage, rerunning with the same run ID is idempotent. The tests inject
controlled failures at stage boundaries rather than terminating an OS process
at each statement. Workspace, owner/membership, and store mapping must exist in
the isolated destination before import. A restored legacy backup remains
unavailable, so the source rehearsal is pending.

The reproducible local plan artifact uses four fictional workspaces and 4,000
rows per workspace in each of seven entities (16,000 rows per entity). It
records query, workspace scope, result count, execution time, EXPLAIN ANALYZE,
and index scans in
[`universal-commerce-query-plan-phase4c.json`](universal-commerce-query-plan-phase4c.json).
Observed PGlite samples included product page 17.129 ms, SKU lookup 0.501 ms,
inventory filter page 7.301 ms, customer order-count page 8.842 ms, and
expense date/category page 1.360 ms. Exact counts were 12.812 ms for products
and 0.467 ms for expenses. PGlite plans used workspace B-tree indexes for
several list scans; the customer count view and dashboard aggregate had no index
scan, and the workspace/date indexes constrained the substring scans without
proving trigram use. These embedded timings are not hosted or production-load
evidence.

Migration 006 conditionally installs `pg_trgm` into `extensions` and defines 13
GIN `gin_trgm_ops` indexes when available. PGlite omits that extension. A CI
check now requires the extension, all 13 indexes with the expected opclass, and
an index-backed `ILIKE` query over 20,001 synthetic rows against the disposable
Supabase PostgreSQL 17 stack. The first hosted PR run failed earlier at `npm
ci`, before reaching this check. PostgreSQL documents the
`LIKE`/`ILIKE` support for trigram GIN indexes in
[pg_trgm](https://www.postgresql.org/docs/17/pgtrgm.html); Supabase documents
`pg_trgm` as an available extension in its
[extension catalog](https://supabase.com/docs/guides/database/extensions).
The application continues to use `ILIKE` if the extension is unavailable, but
without trigram indexes that search has no trigram performance benefit. The
migration runner applies each version once and skips only a matching recorded
checksum; migration 006 is not intended for stand-alone replay because its
ordinary B-tree indexes are created without `IF NOT EXISTS`.

The GitHub workflow covers unit/PGlite, typecheck/lint, isolated Supabase
startup/readiness, migration reset, PostgreSQL 17 `pg_trgm` checks, pgTAP, Auth
and PostgREST isolation, and Playwright. It writes a step summary with the job
status and run URL and redacts startup diagnostics. Hosted run `42371442520`
stopped at `npm ci` because the lockfile omitted `@emnapi/runtime@1.11.3` and
`@emnapi/core@1.11.3`; that lockfile fix was pushed. Run `42374401971` then
passed install, tests, Supabase startup, and schema reset but failed in the
`pg_trgm` check. The local check now uses a catalog query for its operator-class
assertion and an explicit `generate_series` column alias. This fix is not yet
hosted-verified. The clean install, all 344 tests, lint, typecheck, and build
pass locally. No restored-source rehearsal is available; Phase 4 remains
PARTIAL.

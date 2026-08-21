# NexaNotion Business Dashboard

## Required project context

Before planning or implementing a phase, read:

- `NexaNotion-Business-Dashboard-Development-Plan.md`

Follow the approved phases, architecture, business rules, responsibilities, and production-readiness criteria defined in that document.

## Project locations

Dashboard project:

`C:\Users\Iqbal\OneDrive\Desktop\Business-Dashboard`

Existing NexaNotion website:

`C:\Users\Iqbal\OneDrive\Desktop\Web development\Next JS Projects\NexaNotion`

The existing NexaNotion repository is read-only unless the user explicitly authorizes changes to it.

## Technology direction

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth and PostgreSQL
- Recharts
- Zod
- Vercel

Confirm the existing versions, package manager, and dependencies before installing or upgrading packages.

## Working rules

- Work only on the currently approved phase and scope.
- Inspect applicable instructions and existing files before editing.
- Preserve user changes and unrelated files.
- Do not use destructive Git or filesystem commands unless explicitly requested.
- Use versioned, reviewable Supabase migrations for schema changes.
- Never print, commit, or expose secret environment-variable values.
- Never expose the Supabase service-role key to client-side code.
- Do not modify the production Supabase project without explicit approval.
- Treat Supabase as the production source of truth after migration.
- Treat Google Sheets as an import, export, archive, or backup surface—not a second independently editable production database.
- Keep Order Status and Settlement Status separate.
- Recognize revenue and COGS only according to the approved Delivered-order rules.
- Store historical product prices, buying costs, courier costs, and other required financial values as transaction snapshots so later setting changes do not rewrite history.
- Use BDT for currency and `Asia/Dhaka` for business timezone behaviour.
- Use exact numeric database types for money; do not use floating-point arithmetic for financial values.
- Enforce important validation in both the application and database.
- Keep private business information behind authenticated, database-enforced access control.
- Make all interfaces responsive, accessible, and usable on mobile, tablet, and desktop.

## Existing-system safety

When inspecting the existing NexaNotion repository:

- Use read-only commands during Phase 0.
- Do not change its application code, migrations, environment files, or Git state without explicit authorization.
- Do not run migrations against production.
- Clearly separate confirmed findings from recommendations.
- Report any compatibility risk before proposing shared-table changes.

## Implementation quality

- Prefer server-side data access and aggregation for private business data.
- Use Supabase Row-Level Security on every private business table.
- Keep service credentials server-only.
- Use atomic database operations for an order and its items.
- Add database constraints and indexes for foreign keys and frequent filters.
- Use server-side pagination and bounded queries for large tables.
- Avoid duplicate sources of calculated truth.
- Include loading, empty, error, and success states in every operational module.
- Warn before destructive or financially significant actions.
- Maintain audit information for order status, settlement, refund, expense, and cash changes.

## Validation

Use the package manager detected from the project lockfile. Run the checks relevant to the changes before completing a task:

- lint
- TypeScript validation
- unit and integration tests
- production build
- Playwright tests when UI workflows change
- Supabase/RLS tests when database access rules change

Financial work must also verify:

- order-item revenue reconciles with order product revenue;
- order-item COGS reconciles with order product COGS;
- no unknown SKU or order links remain;
- duplicate order numbers are rejected;
- Delivered orders contain at least one order item;
- Dashboard totals match the underlying filtered records.

## Handoff requirements

Every completed Codex task must report:

- Summary
- Files changed
- Database migrations
- Tests and results
- Assumptions
- Remaining risks or blockers
- Manual actions required from the user
- Recommended next phase or task


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

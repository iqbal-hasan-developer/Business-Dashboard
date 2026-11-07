# Commerce Operations development guide

## Product direction

Transform this repository into an independent, self-hosted, multi-tenant
commerce operations SaaS. Each installation has one product identity and may
serve multiple workspaces, stores, and users. Do not depend on the original
business owner's infrastructure, credentials, or accounts.

Read `docs/universal-commerce-technical-audit.md` and
`docs/universal-commerce-development-checklist.md` before planning a new phase.
Update the checklist as evidence is produced; do not mark unimplemented work as
complete.

## Stack and architecture

- Preserve Next.js App Router, TypeScript, Tailwind, and Supabase unless a
  documented technical reason requires a change.
- Keep domain logic, repository access, server actions, and UI responsibilities
  separated using the existing `src/domain`, `src/data`, `src/actions`, and
  `src/components` boundaries.
- Validate all untrusted input with Zod and keep private database access on the
  server.
- Use exact numeric money and transaction snapshots for financial history.
- Preserve immutable financial evidence and audited correction workflows.
- The existing `supabase/migrations` chain is for a legacy single-business
  schema. Never present it as a fresh-install schema. Put any replacement chain
  in a clearly separated path and document which installer uses it.

## Security and data boundaries

- Every tenant-owned record, query, mutation, export, and background job must be
  scoped to an authorized workspace.
- Enforce access in database policies/RPCs and server code; hidden UI controls do
  not provide authorization.
- Never expose service-role keys, encrypted integration credentials, or raw
  secrets in client code, logs, fixtures, screenshots, or documentation.
- Use fictional sample data only. Never distribute the legacy business's orders,
  customers, financial history, credentials, identifiers, or operational exports.
- Treat integrations as read-only until a specific write workflow is reviewed
  and enabled. Preserve external platform metadata and never overwrite external
  data unexpectedly.
- Do not access or modify production databases, external storefront repositories,
  hosting accounts, DNS, or external services unless the user separately
  authorizes that action.

## Development checks

Use npm and the versions pinned in `package-lock.json`. Read the installed Next.js
guides in `node_modules/next/dist/docs/` before changing framework APIs. Run the
lint, typecheck, unit, browser, database, and build checks relevant to the change.
Report checks that cannot run and distinguish static contracts from live
integration verification.

## Product status

The dashboard is currently single-business software. Workspace isolation,
platform integrations, clean installation, background processing, SMTP,
self-hosted deployment guides, and marketplace packaging remain incomplete.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

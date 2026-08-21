# NexaNotion Business Dashboard

Private operations and finance dashboard for NexaNotion. The repository now contains the authenticated development MVP: RLS-backed Supabase contracts, immutable financial reporting, manual operational entry, safe order editing, append-only cash and owner-investment workflows, reversible Steadfast COD settlement evidence, owner-controlled order defaults, and owner-only CSV exports. An explicit development-only mock fallback remains available for isolated testing.

Production has not been migrated or deployed. The linked `NexaNotion Business Dashboard Dev` project is aligned through migration `202608170000`, including the controlled customer-payment receipt workflow. See [`docs/project-status.md`](docs/project-status.md) for the current launch tracker and manual approval gates.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`.

The local development default is mock data. Set `BUSINESS_DATA_PROVIDER=mock` explicitly when you want the fallback documented in `.env.example`. Set it to `supabase` only with credentials for the separate development project. Production always selects Supabase, rejects mock mode, and fails closed if required public variables are absent.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright runs deterministic mock-workflow and fail-closed authentication suites on desktop Chromium and a Pixel 7 viewport. The authentication suite uses deliberately missing test configuration and does not contact Supabase. Financial unit tests use integer poisha and verify Delivered-only revenue and COGS recognition.

## Architecture

- `src/domain`: business types, Zod form schema, money utilities, and calculations
- `src/data`: typed repository contract and isolated mock implementation
- `src/data/supabase-repository.ts`: server-only Supabase adapter behind the same repository contract
- `src/lib/supabase`: typed browser, server, and proxy clients
- `src/lib/auth`: authenticated profile and role enforcement
- `src/components`: application shell and reusable module UI
- `src/app/(dashboard)`: App Router pages for all operational modules
- `supabase/migrations`: additive, versioned SQL for review against a development schema
- `supabase/tests`: pgTAP RLS scaffolding for a local Supabase stack
- `tests/e2e`: cross-viewport smoke tests

The SQL sequence and live-schema assumptions are documented in `docs/phase-2-preflight.md`. Review and test that sequence against a fresh schema dump before applying it anywhere.

Owner operations are documented in [`docs/owner-operations-guide.md`](docs/owner-operations-guide.md). The spreadsheet dry-run, backup, recovery, and production gates are documented in [`docs/launch-and-recovery-runbook.md`](docs/launch-and-recovery-runbook.md).

Vercel project settings, environment-variable rules, Supabase Auth checks, DNS,
and cutover verification are listed in
[`docs/vercel-deployment-checklist.md`](docs/vercel-deployment-checklist.md).

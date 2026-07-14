# NexaNotion Business Dashboard

Private operations and finance dashboard for NexaNotion. Phase 2 preflight adds an RLS-backed Supabase architecture while retaining an explicit development-only mock fallback. No migration in this repository has been applied to a remote project.

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

Playwright covers desktop Chromium and a Pixel 7 viewport. The financial unit tests use integer poisha and verify Delivered-only revenue and COGS recognition.

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

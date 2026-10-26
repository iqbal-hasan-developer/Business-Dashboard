# Project status and launch tracker

**Updated:** 8 September 2026
**Target:** private NexaNotion owner dashboard MVP
**Advanced upgrades:** deferred until after launch

## Current position

The project is a development MVP, not a production deployment. The responsive
application, private authentication boundary, immutable financial reporting,
core manual-entry workflows, minimal Steadfast COD settlement, reconciliation
surfaces, and owner CSV exports exist locally. Production Supabase, Vercel, DNS,
and the existing NexaNotion website remain untouched.

## Completed locally

- Next.js App Router application shell and responsive desktop/mobile navigation.
- Supabase SSR authentication, protected routes, role resolution, and RLS-backed
  repository access without a service-role browser client.
- Versioned schema, authorization, atomic order, immutable financial-recognition,
  product-management, safe-order-edit, and Steadfast settlement migrations.
- Snapshot-backed dashboard KPIs, charts, reports, reconciliation, and data checks.
- Manual order creation, safe editing of eligible orders, and status updates.
- Product catalogue/private-cost, campaign, daily ad-spend, and expense entry.
- Minimal immutable full-order Steadfast COD settlement and cash-receipt workflow.
- Controlled customer-payment receipts for Delivered, Paid non-COD orders, with
  snapshot-derived amounts, account mapping, idempotency, and duplicate protection.
- Append-only manual cash ledger with owner investment/withdrawal, approved
  accounts, idempotency, running/account balances, and owner-only reversal.
- Owner-capital investment/withdrawal maintenance with per-record Edit and Delete
  actions. Edits append an atomic reversal plus corrected replacement; deletes
  append a reversal and remove the source from active totals without erasing it.
- Owner-only Steadfast batch reversal that preserves original evidence, appends
  the correcting cash movement, and safely restores settlement eligibility.
- Owner-only Orders, Products, and financial-report CSV downloads with bounded
  reads, exact BDT decimals, and spreadsheet-formula protection.
- Owner settings for Steadfast, BDT 65 inside-Dhaka courier cost, BDT 135
  outside-Dhaka courier cost, BDT 8 packaging, zero tax/VAT, and the approved
  Cash, bKash, Nagad, Bank, and Steadfast account labels.
- Automatic exact-poisha courier and packaging snapshots on new orders, including
  the Inside/Outside Dhaka courier-cost switch without rewriting prior orders.
- Deterministic browser validation split into isolated mock workflows and
  fail-closed authentication checks; neither suite needs development credentials.
- Read-only spreadsheet dry-run validator with rejection, unknown-SKU,
  duplicate-order, and integer-poisha reconciliation reporting.
- Owner operating, import, backup, production, and recovery runbooks.
- Vercel production environment preflight, pinned Node.js runtime family, and an
  exact deployment/Auth/DNS/cutover checklist.

## Verified development database state

The linked migration checks and approved development-only pushes through
17 August 2026 confirmed development is aligned through `202608170000`. The
applied launch set was:

1. `202607220000_edit_order_workflow.sql`
2. `202607230000_steadfast_cod_settlement_workflow.sql`
3. `202608080000_business_settings_defaults.sql`
4. `202608090000_cash_ledger_workflow.sql`
5. `202608100000_steadfast_settlement_reversal.sql`
6. `202608120000_owner_capital_corrections.sql`
7. `202608120001_marketing_workspace.sql`
8. `202608130000_expense_management.sql`
9. `202608170000_customer_payment_receipts.sql`

The post-application migration list shows every local version matched remotely.
The customer-payment migration was applied only to `NexaNotion Business Dashboard
Dev`; remote schema lint passed. Its rollback-only pgTAP runner remains blocked on
this workstation because Docker is unavailable. No production database was
connected to or changed.

On 9 August 2026, the owner-approved historical export was imported into
`NexaNotion Business Dashboard Dev` through one guarded transaction after a
zero-collision preflight. The committed scope contains 43 orders and 43 order
items: 36 Delivered, six Cancelled, and one Pending. All 36 Delivered financial
snapshots reconcile to BDT 25,900 product revenue and BDT 14,380 COGS, with no
unknown SKU links, duplicate order numbers, missing items, or snapshot parity
failures.

The same transaction recorded the two confirmed Steadfast batches atomically:

- `SFC-30826633`: 22 allocations, BDT 16,330 gross COD, BDT 2,618.30
  deductions, and BDT 13,711.70 received by bKash on 21 July 2026.
- `SFC-30935216`: 12 allocations, BDT 10,800 gross COD, BDT 1,718 deductions,
  and BDT 9,082 received by bKash on 26 July 2026.

Each batch has one immutable cash receipt. Only the masked bKash account ending
`3181` was stored; the full account number was not persisted.

On 12 August 2026, six owner-approved historical Meta campaigns were imported
into Development from the campaign-results export. The existing Hero Gym Bag
Messenger campaign retained its BDT 354.20 entry and received only the BDT
839.46 reconciliation difference. The owner later deleted the BDT 285.60 Eid
campaign spend with the audited reason `not included in nexanotion`, leaving the
approved pre-period baseline at BDT 3,112.65 across six ledger rows.

On 17 August 2026, five August campaigns were imported from the Meta export for
3–16 August. Four positive spend aggregates total BDT 1,490.14; they were posted
on the reporting end date, 16 August, rather than later scheduled campaign end
dates. The active Waterproof campaign was created without an artificial
zero-value ledger entry, while unavailable results, contacts, and purchases
remain null. The five zero-activity July rows retained their earlier lifetime
performance. The current Development marketing state is 11 campaigns and 10
spend rows totaling BDT 4,602.79. `NN – Final Stock Clearance – Panjabi/Jubba –
Aug 2026`, which had been excluded from the earlier historical import, was
included under the owner's new all-campaign import approval.

## Latest local validation

- ESLint: passed.
- TypeScript: passed.
- Vitest: 231/231 passed across 41 files, including deployment environment
  validation plus financial, action, RPC, append-only SQL-contract, and
  privilege-allowlist coverage.
- Next.js production build: passed.
- Playwright mock workflows: 52/52 passed across desktop and mobile.
- Playwright isolated expense/marketing controls: 6/6 passed across desktop and
  mobile.
- Playwright fail-closed authentication: 28/28 passed across desktop and mobile.
- Every Playwright server uses an isolated Next.js build directory, so validation
  does not stop or reuse a user-owned local development process.
- Secret-pattern scan: zero findings; `.env.local` remains ignored and untracked.
- Development SQL Editor pgTAP verification passed for the applied launch set:
  order editing 4/4, Steadfast settlement 14/14, business settings 16/16,
  cash ledger 15/15, settlement reversal 10/10, and owner-capital corrections
  9/9.
  Each suite ran inside a transaction and rolled back its test data.
- Connected read-only verification of the 3–16 August Meta import reconciled all
  five campaign rows, four spend rows, BDT 1,490.14 imported spend, and the five
  preserved July campaigns. Both the financial-summary calculation and the daily
  dashboard chart source report BDT 1,490.14 ad spend for the same period.

## Remaining launch blockers

The historical order and settlement migration is complete in development. No
customer-level export data was copied into this repository.

1. Complete owner acceptance with representative order, expense, cash,
   reversal, settlement, and report workflows.
2. Approve and execute the separate production backup, migration, deployment,
   private subdomain, and real order-to-settlement cutover.

## Manual gates

Codex must stop and ask the owner before each of these actions:

1. Contacting Supabase to inspect the currently linked development migration state.
2. Applying any missing migration to the development project.
3. Using or importing the business spreadsheet/export.
4. Creating or changing a GitHub remote, branch publication, or pull request.
5. Creating/configuring the Vercel project or adding environment secrets.
6. Accessing or migrating production Supabase.
7. Changing the existing NexaNotion website repository.
8. Adding the production DNS record or completing the real production test order.

Secret values, owner passwords, OTPs, service-role keys, and full financial-account
credentials must be entered only in their official dashboard or local secret store;
they must not be pasted into chat or committed.

## Required owner decisions before cutover

- Choose the private production subdomain and approve owner acceptance totals.

## Deferred upgrades

- Meta Ads API automation.
- Courier API status automation.
- Bank, bKash, or Nagad automatic feeds.
- Notifications, receipt OCR, scheduled PDF/email reports, multi-user approval
  workflows, forecasting, and AI-assisted insights.
- Partial settlements, cash-account transfer automation, and generic accounting
  journal functionality.
- Dashboard stock mutation until the shared website inventory-ledger contract is
  separately approved; launch inventory remains read-only.
- Server-side table pagination beyond the current bounded owner-MVP limits and
  additional high-volume report optimization.

## Production-ready exit gate

Launch is allowed only after the development migration list is verified, required
migrations and database tests pass in development, all MVP workflows pass owner
acceptance, spreadsheet reconciliation is approved, production backup/recovery
steps are documented, production migration is separately approved, and one real
order completes the production order-to-settlement workflow.

# Launch, import, backup, and recovery runbook

## Safety boundary

- Development and production are separate approval gates.
- Never paste passwords, OTPs, database passwords, service-role keys, or full
  financial-account credentials into chat, source files, or Git.
- Never apply a migration to production without an immediately preceding backup,
  exact target verification, reviewed migration list, and owner approval.
- The existing NexaNotion website repository remains read-only unless separately
  authorized.

## Spreadsheet import rehearsal

No import may begin until the owner supplies or approves the export. Preserve the
original export unchanged and work from a copy.

1. Map the source columns into copies of
   [`templates/orders-import-template.csv`](templates/orders-import-template.csv)
   and [`templates/products-import-template.csv`](templates/products-import-template.csv).
2. Keep one order-item line per orders CSV row. Repeat the order-level values
   identically for multi-item orders.
3. Run the read-only validator:

   ```powershell
   npm run import:dry-run -- --orders C:\approved\orders.csv --products C:\approved\products.csv --report C:\approved\dry-run-report.json
   ```

4. The command performs zero database writes and fails closed when it finds:
   missing fields, unknown SKU values, duplicate order conflicts, invalid status,
   invalid quantity, or money with more than two decimals.
5. Approval requires `readyForReviewedImport: true`, zero rejected rows, zero
   unknown SKU rows, zero duplicate-order conflicts, and zero Delivered orders
   without accepted item lines.
6. Compare the reported Delivered product revenue and COGS poisha totals with the
   approved spreadsheet baseline before any write-capable import is designed.
7. Resolve ambiguous records with the owner. Never guess a SKU, buying cost,
   order link, status, or settlement.

The current tool is intentionally dry-run only. A write-capable import remains a
separate reviewed migration task after the real export passes rehearsal.

## Development acceptance gate

- Local and remote migration histories match.
- Every new migration has a rollback-only pgTAP suite.
- Lint, TypeScript, unit/contract tests, production build, and desktop/mobile
  Playwright suites pass.
- Anonymous users cannot access private routes or exports.
- Owner/admin writes use authenticated JWT/RLS contracts; no browser service key.
- Financial reconciliations and data-quality counts pass.
- Owner tests representative Pending, Delivered, multi-item, refund, expense,
  owner-investment, cash reversal, and Steadfast settlement workflows.

## Production backup gate

Before production migration:

1. Confirm the visible Supabase project name and project reference.
2. Export/retain the current production schema and data backup using the approved
   Supabase backup method.
3. Record backup time, operator, project reference, and migration list.
4. Verify the backup is visible and downloadable/restorable according to the
   current Supabase plan.
5. Stop if the backup is missing, stale, incomplete, or belongs to another project.

## Production migration and deployment gate

These actions require separate explicit owner approval:

1. Apply the reviewed migration sequence to production.
2. Run read-only/post-migration schema verification and rollback-only tests.
3. Create/connect the GitHub repository and Vercel project if still absent.
4. Enter public Supabase URL/key and other required secrets directly in Vercel.
5. Deploy the private dashboard and verify authentication before DNS cutover.
6. Add the approved private subdomain DNS record.
7. Complete one real order through delivery, financial recognition, settlement,
   and cash receipt while comparing every total.

Use the exact project configuration, environment, Auth, verification, and DNS
steps in [`vercel-deployment-checklist.md`](vercel-deployment-checklist.md).

## Recovery decision tree

- **Application deployment failure:** roll back to the previous known-good Vercel
  deployment. Do not change database history merely to fix a frontend release.
- **Migration failed before commit:** preserve logs, verify migration history, and
  diagnose. Do not rerun blindly.
- **Migration committed but application incompatible:** stop writes, restore the
  compatible application deployment, and prepare an additive corrective migration.
- **Incorrect operational entry:** use the authorized status/cash reversal workflow.
- **Incorrect immutable settlement or financial evidence:** stop; use a reviewed,
  source-specific corrective migration/RPC. Never direct-edit production rows.
- **Data loss/corruption:** stop all writes, record incident time, preserve logs,
  and restore only from the owner-approved backup after confirming the target.

## Post-launch checks

- Owner can sign in from phone and computer.
- Private routes and exports deny anonymous access.
- No horizontal overflow blocks operational actions on mobile.
- Logs contain no secrets or raw internal database errors.
- Scheduled owner backup/export routine is assigned.
- Deferred features remain disabled until separately approved.

# Legacy single-business migration plan

## Status and boundary

The importer and workspace commerce schema are implemented, but no legacy rows
have been read or moved because this checkout has no restored legacy database.
The clean-install runner still refuses a non-empty `public` schema. Keep the
44-migration legacy chain and source data unchanged until an isolated rehearsal
passes from a verified backup.

The current workspace schema can represent products, variants, customers,
orders, order-item snapshots, refunds, fulfillments, store inventory,
expenses, and categorized financial entries. It does not yet represent the
legacy cash ledger, owner-funds accounting, courier settlement reconciliation,
campaign attribution, purchase-batch costing, audited expense corrections, or
all financial snapshots. These records must not be flattened into a generic
amount or silently omitted.

## Proposed mapping

The legacy storefront base migrations are not present in this repository. The
legacy row shape below was verified against the generated legacy database
types and migration-created relations. The source database must still pass the
importer's exact preflight checks before any rehearsal.

| Legacy source | Workspace destination | Migration rule / open decision |
|---|---|---|
| `auth.users` and `dashboard_user_profiles` | `auth.users`, one new `workspaces` row, `workspace_memberships` | Keep auth user UUIDs. Map owner/admin/data-entry/viewer to owner/admin/staff/viewer. Inactive profiles become inactive memberships. Require an explicit decision for missing, duplicate, or unrecognized profiles. |
| Legacy business identity | One disconnected `stores` row | Use an explicitly labeled `custom` import placeholder with a reserved `.invalid` URL. Do not claim that it is a connected marketplace. No credentials are copied. |
| `products`, `product_business_data`, `categories` | `products`, optionally `product_variants` | Preserve product UUIDs and SKU/name/price. Put unsupported category and private buying-cost metadata in a reviewed mapping or hold those rows; do not expose private costs in general product metadata. A default variant requires an explicit deterministic ID rule. |
| `orders` | `orders` | Preserve UUID, order number, source status, currency, totals, and placed date when present. Map legacy statuses through a reviewed lookup. Unknown or conflicting statuses are migration holds. |
| `order_items` | `order_items` | Preserve item UUIDs and immutable name/SKU/quantity/price/line-total snapshots. Link a variant only when the relation is unambiguous. Keep unsupported legacy cost fields in a reviewed private sidecar. |
| Order customer fields | `customers` | Preserve customer identity only when a stable relation exists. Do not merge on name alone. Store addresses and notes only after a PII retention review because the universal customer schema has no normalized address fields. |
| Confirmed refund records | `refunds` | Import only records with an auditable order link, amount, currency, state, and effective time. Do not treat COD adjustments or settlement corrections as refunds. |
| `expenses` | `expenses` | Preserve IDs, date, category, amount, currency, status, and creator where compatible. Keep correction/audit links in a reviewed sidecar until the universal audited-correction workflow is designed. |
| Legacy scalar product stock | `inventory_levels` | Do not import unless the value is a known point-in-time count and can be assigned to the explicit import store and variant. Never infer store ownership from a product row. |
| Settled financial snapshots | `financial_entries` | Map only after accounting owners approve entry types, sign conventions, effective dates, and idempotency keys. Keep original snapshot IDs and source references. |
| Cash movements, owner funds, courier batches, campaigns, purchase batches | No direct destination yet | Hold in the legacy schema and produce a reconciliation report. Add dedicated universal tables and mappings before migration; do not fold them into `financial_entries` without preserving their state machines and audit history. |
| Store credentials / courier secrets | No destination in this migration | Do not read or copy plaintext credentials. Reconnect through a reviewed encryption and key-management workflow after cutover. |

### Discovered legacy entities

| Entity group | Legacy relations | Phase 3 destination/status |
|---|---|---|
| Identity and configuration | `dashboard_user_profiles`, `business_settings`, `business_lookup_values` | Explicit source owner is verified; it is not used to auto-create members. Other profiles/settings/lookup rows are held for invitation or configuration review. |
| Catalog | `categories`, `products`, `product_business_data` | Products and deterministic default variants imported; category labels copied; category identity/state and uncertain costs held. |
| Orders and customers | `orders`, `order_items`, order contact snapshots | Orders and item snapshots imported with preserved UUIDs; customers derived only from normalized phone or one-order identity; ambiguous names and orphan references held. |
| Inventory and returns | scalar product stock, `inventory_restoration_movements`, `order_return_events`, `order_return_inspections`, `order_item_inventory_consumptions`, `order_item_return_allocations` | Opening stock imported to the explicitly mapped disconnected store; later restoration/return workflow held. Fulfillment movements are written atomically by the new app RPC. |
| Expenses and procurement | `expenses`, `procurement_expense_allocations`, `purchase_batches`, `purchase_batch_items` | Expense rows imported; source funding status is inspected; allocations and batch costing held. |
| Financial snapshots and corrections | `order_financial_snapshots`, `order_financial_adjustments`, `order_item_financial_allocations`, `order_item_refund_allocations`, `financial_source_fundings`, `financial_source_funding_reversals` | Delivered snapshot components are mapped when supported; correction, allocation, and ambiguous refund evidence held. |
| Cash and owner funds | `cash_movements`, `cash_account_balance_observations`, `owner_held_fund_events`, `owner_held_balance_observations`, `owner_money_taken_events`, `owner_non_cash_capital_events`, `owner_capital_return_events` | No faithful universal equivalent yet; retained in source and represented by identifier/reason holds. |
| Courier settlements | `settlement_records`, `settlement_order_allocations`, `settlement_receipt_allocations`, `settlement_reversals`, `rejected_cod_courier_adjustments`, `rejected_cod_adjustment_settlement_allocations`, `steadfast_receivable_observations` | No universal state machine yet; retained in source and held. |
| Marketing and attribution | `campaigns`, `daily_ad_spend` | Campaign and spend records held; ad spend is not copied into ordinary expenses. |
| Audit and contact | `audit_history`, `contact_messages` | Not copied; non-sensitive relation keys are held. Contact message contents are not copied. |

## Implemented migration behavior

`npm run db:legacy:migrate` uses two separate local PostgreSQL databases. It
refuses remote hosts, identical source/target database URLs, missing explicit
owner/workspace/store IDs, a target user who is not an active workspace owner,
or a target store that is not a disconnected `custom` store on an `.invalid`
URL. The source transaction is read-only and repeatable-read. The target must
already have all seven universal migrations applied.

The importer preserves product, order, order-item, and expense UUIDs where the
source key is a UUID. It derives stable UUIDv5 IDs for default product
variations, normalized-phone customer profiles, and snapshot entries. It
preserves persisted decimal amounts as major currency units; order-entry
application logic may use poisha internally, but the migration never divides
database numeric values by 100. Categories become product category labels;
legacy slugs and references are retained as source metadata. Product cost is
copied only when legacy verification evidence exists and remains in the
manager-only cost table. Opening stock is assigned only to the explicit
disconnected import store.

Delivered order snapshots create financial entries only for values present in
the immutable snapshot. Missing COGS, refund transactions, and other unsupported
evidence remain visible as holds and keep profit reporting incomplete. A legacy
order refund total is retained as a pending refund requiring transaction
evidence; it is not counted as realized refund expense. Expense funding and
unsupported ledgers remain in the source and receive non-sensitive import
holds. Contact messages and business settings are not copied.

Dry run is the default. It prints source counts and aggregate checks, then runs
the same product, order, expense, dependency, and destination-constraint code
used by apply inside a target transaction with row savepoints. It emits one
JSON Lines decision per mapped or unsupported source row, including destination
IDs, action, hold reason, related records, and manual-review flag. The target
transaction is rolled back before returning; the source remains in a read-only
repeatable-read transaction. A failed dry run also rolls the target transaction
back. This predicts outcomes against the target's current state without
persisting import data. It is still a rehearsal against the exact source and
target copies, not cutover approval; apply remains restricted to disposable
copies until the fixture matrix and restored-source rehearsal pass. The importer assigns a
run UUID; pass it to `--apply --run-id <uuid>` to resume a rehearsal. Each
product, order, and expense group is committed transactionally with a source
hash identity ledger. Re-running unchanged rows skips them; changed source rows
are held rather than overwritten. `--report` lists active hold identifiers and
reason codes for an explicit target workspace. Resolve or formally retain all
holds before any cutover; import completion does not approve cutover.

### Isolated operator procedure

1. Restore a verified legacy backup into a disposable local PostgreSQL 17/Supabase
   project. Create a separate disposable universal project and apply its seven
   migrations with `npm run db:universal:migrate`.
2. In a private PowerShell session, set `LEGACY_SOURCE_DATABASE_URL`,
   `UNIVERSAL_DATABASE_URL`, `LEGACY_OWNER_USER_ID`, `TARGET_OWNER_USER_ID`,
   `TARGET_WORKSPACE_ID`, and `TARGET_STORE_ID`. Do not put these connection
   strings in command history, files, logs, or `.env.local`.
3. Run `npm run db:legacy:migrate` and save the PII-safe output alongside the
   rehearsal record. Review every JSON Lines decision, especially `held` and
   `rejected` rows, and verify related child records are held with their parent.
   Dry run writes neither a run ledger nor persistent target rows.
4. Only on disposable copies, run the same command with `--apply --run-id
   <uuid>` using the dry-run ID. Retain the final target counts and inspect holds with
   `npm run db:legacy:migrate -- --report`.
5. Repeat with the same run ID to verify unchanged rows are skipped, then
   compare source/target counts, relationship checks, immutable finance totals,
   and the active-hold report. Do not switch the app or source schema.

PowerShell environment variables are process-local. Clear them after the
rehearsal with `Remove-Item Env:LEGACY_SOURCE_DATABASE_URL, Env:UNIVERSAL_DATABASE_URL,
Env:LEGACY_OWNER_USER_ID, Env:TARGET_OWNER_USER_ID, Env:TARGET_WORKSPACE_ID,
Env:TARGET_STORE_ID`.

## Repeatable execution design

1. Create an isolated Supabase project using PostgreSQL 17, Auth, and PostgREST.
2. Restore a sanitized copy of a legacy backup there; record source row counts,
   primary-key counts, relationship counts, and financial control totals.
3. Apply a new, ordered migration chain for the coexistence/import phase. Do not
   run the clean-install-only migration runner against the non-empty schema.
4. Use a migration ledger plus a `(source_table, source_id)` identity map. Use
   deterministic workspace/store IDs and stable destination IDs so retries
   upsert the same rows. Each batch records counts and failures without logging
   customer PII or credentials.
5. Produce a dry-run report first. Every unmapped row must be counted and
   listed by non-sensitive identifier and reason. A non-zero hold count blocks
   cutover until an operator resolves or formally retains it in the legacy
   schema.
6. Apply in transactions by dependency group: workspace/memberships/store,
   products/variants, customers, orders/items/refunds, expenses, then approved
   financial entries. Verify foreign keys, unique keys, row counts, amounts,
   and sampled relationship chains after each group.
7. Repeat the same migration to prove idempotency. Compare source and target
   control totals and a canonical, PII-safe row digest.
8. Keep the legacy schema read-only through an observation period. Switch app
   reads only after reconciliation sign-off; do not dual-write. Retain the
   backup and source tables according to the agreed data-retention policy.

## Recovery and rollback limits

Before applying, take a provider-native backup and prove it restores to a second
disposable project. A failed transaction can be rolled back before commit. After
committed batches, recovery is restore-and-replay from the verified backup and
ledger; there is no promise of a lossless reverse migration because the new
schema does not encode every legacy accounting workflow. Never delete the
legacy schema as part of cutover.

## Required tests before cutover

The synthetic PGlite importer suite builds separate source and destination
databases and executes the real migration function. It covers a clean product,
opening inventory, delivered order/item/customer, financial snapshot, expense,
unsupported cash row, invalid product with dependent order/item, orphan product
reference, duplicate order numbers, destination ID conflict, source primary-key
duplicate rejection, dry-run non-mutation, dry-run/apply decision matching for
clean and invalid fixtures, same-run idempotency, and retry after a transient
expense write failure. These are synthetic Postgres-engine fixtures, not a
restored legacy backup. Ambiguous multi-owner data and cross-workspace source
relationships are not representable by the source schema modeled here and
remain unverified. The database-level source has primary keys, so duplicate IDs
are rejected by PostgreSQL before the importer can report them.

The current synthetic PGlite suite covers stage interruptions after products,
orders, expenses, and unsupported holds, plus failure to write the final
completion marker. For each boundary it first records a clean uninterrupted
reference import, injects an error after the chosen completed stage, checks the
failed run's `current_stage` and `last_completed_stage`, resumes with the same
run ID, and compares normalized destination rows, parent-child relationships,
source identity hashes, held records, target counts, and final run state. A
separate check retries a transient order-item write failure. Attempt-specific
per-run skipped/imported counters are not compared because a resumed run
necessarily records different work in that invocation.

The actual stages are products (including variants and opening inventory),
orders (including customer profiles, items, refunds, and snapshot-derived
financial entries), expenses and their financial entries, unsupported-source
hold upserts, and final run completion. Workspace, ownership, membership, and
import-store mapping are explicit preflight inputs and are not created by this
importer. Each product/order/expense dependency group is transactional. If a
process halts within a group, that transaction rolls back; if it stops after a
committed stage, the run ledger reports its last completed stage and resume
repeats the current stage idempotently through source identity hashes. Hold
upserts are repeatable. A hard process kill can leave `status='running'`; the
report marks running and failed runs as resumable and shows stage markers and
PII-safe summaries. Tests inject deterministic stage-boundary errors rather
than killing a separate OS process at every individual SQL statement.

No restored source database was available. Before a real rehearsal, supply a
verified and sanitized backup restored into a disposable PostgreSQL 17/Supabase
project, plus a separate disposable target. Capture schema/version and table
counts without customer values; confirm source and target endpoints are isolated;
run dry-run; inspect every decision and hold; save its JSONL report and run ID;
only then apply on those disposable copies. Reconcile counts, identity ledgers,
relationships, and financial control totals, then rerun with the same ID. This
rehearsal remains pending.

- Fresh database and restored-legacy database both pass their intended
  migration paths.
- Re-running the import leaves counts and digests unchanged.
- Every imported child points to a parent in the same workspace.
- Workspace A cannot read, update, delete, export, or count Workspace B rows
  through PostgREST or the application data layer.
- Imported accounting totals reconcile to signed-off legacy control totals.
- Every held row is visible in a non-sensitive exception report.
- Restore and recovery steps are rehearsed by a different operator.

No production migration is authorized by this plan.

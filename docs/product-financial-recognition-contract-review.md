# Immutable product financial recognition and return-accounting review

Status: approved review contract. A canonical development-rehearsal candidate
was prepared on 18 July 2026, but nothing in this document authorizes SQL
execution, Supabase contact, production changes, migration-history repair, or
inventory mutation.

Starting review baseline: commit `1d742f3298deb5855e2adbc55e66f6ea76d50055`.

Promotion target:
`supabase/migrations/202607170000_product_financial_recognition_allocations.sql`.
The candidate removes the development acknowledgement setting, adds transaction
timeouts, and fails closed on existing/partial recognition history. It remains
unapplied and unrecorded pending a separately approved linked CLI rehearsal.
Application must use `supabase db push --dry-run --linked`, a separate approval,
and then `supabase db push --linked`; the canonical file must not be pasted into
SQL Editor.

## Decision

The proposal uses conservative small-business management-accounting defaults:

- Revenue and item-level COGS are recognized only when an order first becomes `Delivered`.
- Earlier statuses (`Pending`, `Confirmed`, `Processing`, and `Shipped`/`Dispatched`) do not create recognized revenue, COGS, or delivered units.
- Cash collected before delivery is cash received in advance, not revenue.
- Delivered recognition is immutable. Refunds and returns are append-only events.
- Monetary refunds and product returns are independent business events with
  separate idempotency keys, tables, and RPCs.
- Missing financial evidence produces `NULL` profit and a data-quality exception, never an inferred value or zero cost.
- Delivered history is preserved. Returns add returned-unit evidence; they do not delete delivered units.

## Accounting state transitions

| Event | Revenue | COGS | Delivered units | Returned units | Inventory-restoration movement |
|---|---|---|---|---|---|
| Cancelled before delivery | None | None | None | None | None |
| Delivered | Recognize product and delivery revenue, less discount | Recognize immutable item buying-cost snapshots | Add immutable delivered units | None | None |
| Delivered, refunded, no product returned | Reverse scoped revenue | Retain | Preserve | None | None |
| Delivered, resellable return recorded | No automatic change | Retain pending inspection | Preserve | Add explicit returned quantities | None |
| Later owner/admin confirms resellable | No automatic change | Reverse verified returned-item COGS | Preserve | Preserve | Create exactly-once `returned_resellable` movement |
| Delivered, returned damaged/non-resellable | No automatic change | Retain | Preserve | Add explicit returned quantities | None |
| Delivery-only refund | Reverse delivery revenue only | Retain | Preserve | None | None |

Recording a return never creates a restoration movement. A later authenticated
owner/admin inspection action may confirm a resellable return and create one
movement per returned item allocation, protected by unique event and allocation
keys. The movement is accounting/operational evidence only: this proposal does
not update `products.stock`, invoke an inventory RPC, or prove physical receipt.

## Refund scope and return disposition

Refund scope determines revenue reversal:

- `product_only`: refund explicit product allocations or deterministically allocate across remaining product net revenue. Delivery revenue remains intact.
- `delivery_only`: refund delivery allocations only. It requires disposition `not_applicable`.
- `full_order`: refund all remaining refundable product and delivery net revenue. Adjusted order Net Revenue becomes exactly zero.

Return disposition belongs to a separate return event and determines the later
inspection path:

- `not_applicable` and `not_returned` are legacy/order-header evidence markers;
  they never create a return event, returned units, COGS reversal, or movement.
- `returned_resellable`: explicit quantities are recorded immediately, but COGS
  and restoration remain unchanged until later owner/admin inspection confirms
  the goods are resellable.
- `returned_damaged`: explicit returned item quantities are required; retain COGS and create no restoration movement.

Refund RPCs accept no return disposition or return-item argument. Return
quantities cannot cumulatively exceed immutable delivered quantities, and a
damaged return can never create a restoration movement.

## Integer-poisha allocation rules

All allocation arithmetic uses signed PostgreSQL `bigint` poisha after rejecting monetary inputs with more than two decimal places. Floating-point arithmetic is prohibited.

For a positive amount `A`, keys `k[i]`, and non-negative remaining-capacity weights `w[i]`:

1. Reject negative amounts, refund reductions, zero/negative refund events, invalid weights, and an amount greater than total remaining capacity.
2. Compute `floor(A * w[i] / sum(w))` with exact integer/numeric arithmetic.
3. Allocate leftover poisha to the greatest fractional remainders.
4. Break equal-remainder ties by immutable order-item UUID ascending.
5. Require every event allocation to sum exactly to `A` and every order/product rollup to reconcile exactly.

Explicit item-level refund allocation is used when the refunded products are known. The request contains unique immutable `order_item_id` values and positive integer poisha. Otherwise `proportional_remaining` uses the same largest-remainder allocator against the applicable unrefunded capacity. The fallback never crosses from product capacity to delivery capacity or silently assumes delivery is refundable.

Refund, return, and inspection RPCs each have independent idempotency keys.
Exact retries return the original event/action ID; conflicting reuse is rejected.
The order and immutable snapshot locks serialize competing quantities and money,
while unique event, inspection, and allocation keys enforce exactly-once writes.

## Immutable evidence and legacy data

Delivered recognition snapshots capture:

- recognition/delivery business date and original order date separately;
- immutable order/item/product/price/buying-cost snapshots;
- product, delivery, discount, refund, COGS, courier, and packaging values;
- the original refund evidence status.

Historical financial values are never reconstructed from current product settings. Backfill may use only documented order-item snapshots and supported source evidence.

Any legacy refund without reliable scope or disposition is stored as:

- `refund_review_status = 'needs_review'`;
- `refund_scope = NULL`;
- `return_disposition = NULL`;
- `allocation_method = 'unallocated_needs_review'`.

It is not defaulted to `full_order` or `product_only`, and it is not included in authoritative product reporting. Product reporting fails closed when a selected population contains unresolved refund evidence. Order-level Net Revenue continues to show the recorded refund total, while the reconciliation and data-quality views expose the unresolved product allocation.

Positive refunds already present when delivery is recognized can be allocated only when scope is explicit and disposition is `not_applicable` or `not_returned`. Historical claims of returned goods require explicit item quantities and therefore remain `needs_review` until supported evidence is supplied through a separately reviewed resolution path.

## Dashboard measures

All revenue measures below are delivery-recognition measures, not cash measures.

| Measure | Authoritative definition |
|---|---|
| Gross Product Revenue | Sum of delivered item quantity × immutable selling-price snapshot. Excludes delivery. |
| Delivery Revenue | Delivery charge recognized at delivery. Product allocations may expose `allocated_delivery_revenue`, but it must never be labelled Product Revenue. |
| Discounts | Immutable order discount allocated between product and delivery, then across items, in integer poisha. |
| Refunds | Original and append-only refund adjustments, separated by product and delivery allocation. Unresolved legacy refunds remain a data-quality exception. |
| Net Revenue | Gross Product Revenue + Delivery Revenue − Discounts − Refunds. |
| Recognized COGS | Delivered item buying-cost snapshots less verified COGS reversals for `returned_resellable`. `NULL` when any required cost evidence is incomplete. |
| Gross Profit | Net Revenue − Recognized COGS. `NULL` when Recognized COGS is incomplete. |
| Fulfillment Costs | Verified courier + packaging costs attributable to delivered orders. Incomplete components remain `NULL`. |
| Advertising Spend | Posted advertising-expense ledger amounts for the reporting period. It is not inferred or automatically allocated to products without supported attribution evidence. |
| Contribution Profit | Net Revenue − Recognized COGS − Fulfillment Costs − attributable Advertising Spend. `NULL` when COGS, fulfillment costs, or required advertising attribution is incomplete. The current product RPC excludes advertising until that attribution contract exists. |
| Delivered Units | Original delivered item quantity. Never reduced by refunds or returns. |
| Returned Units | Explicit returned item quantities for resellable and damaged dispositions. |
| Delivered Order Count | Distinct orders with immutable Delivered recognition in the selected recognition-date window. |
| Delivery Success Rate | `delivered attempts / (delivered attempts + failed delivery attempts)`. Open orders and pre-delivery cancellations are excluded; a later return does not erase the original successful delivery. This remains nullable until immutable delivery-attempt history is authoritative. |

Top Products exposes distinct values for Gross Product Revenue, Allocated Delivery Revenue, Allocated Discount, Allocated Refund, Adjusted Product Net Revenue, Recognized COGS, Gross Profit, allocated courier/packaging costs, Contribution Profit, Delivered Units, Returned Units, and Delivered Order Count.

## Cash and equity separation

- Revenue is not the same as cash received.
- Prepaid cash before delivery is a liability (`cash received in advance`) until delivery recognition.
- Courier receivables are assets separate from cash available; collection changes the asset mix, not revenue.
- Owner capital and owner withdrawals are equity movements. They do not change revenue, COGS, Gross Profit, or Contribution Profit.
- Refund revenue recognition and cash repayment timing can differ and must reconcile through separate cash/receivable/payable records.

## Exact proposed schema and RPC changes

Review-only changes in `202607170000_product_financial_recognition_allocations.sql`:

- `orders`: nullable `refund_scope`, nullable `return_disposition`, and `refund_review_status`.
- `order_financial_snapshots`: `order_origin_date`, nullable original scope/disposition, and original review status. Existing `order_date` becomes the immutable recognition date for reporting.
- `order_financial_adjustments`: monetary refund allocation method, nullable legacy
  evidence markers, review status, explicit refund-item request, and idempotency key.
- `order_item_financial_allocations`: immutable delivered item monetary allocation in integer poisha; buying-cost and fulfillment fields remain nullable.
- `order_item_refund_allocations`: append-only product/delivery refund allocations.
- `order_return_events`: return disposition, explicit item quantities, and a
  return-specific idempotency key, independent from refund adjustments.
- `order_item_return_allocations`: append-only returned quantities and potential
  immutable COGS evidence; reporting does not reverse it before inspection.
- `order_return_inspections`: one immutable owner/admin inspection per event.
- `inventory_restoration_movements`: created only by confirmed-resellable
  inspection, unique per return allocation, and never a stock mutation.
- `dashboard_order_financials`: adjusted order revenue and verified resellable-return COGS reversal.
- `dashboard_product_allocation_reconciliation`: order/product/refund/return/COGS/movement reconciliation.
- `dashboard_product_allocation_data_quality`: unresolved refunds, missing allocations/costs, over-returns, and restoration mismatches.
- `record_dashboard_refund(uuid,numeric,text,text,date,jsonb)`: owner/admin
  monetary refund RPC with no return parameters.
- `record_dashboard_return(uuid,text,text,date,jsonb)`: separate owner/admin
  return RPC.
- `inspect_dashboard_return(uuid,text,text,date)`: later owner/admin inspection
  action; confirmed resellable creates exactly-once restoration evidence.
- `get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)`: authenticated role-checked reporting RPC including returned units and nullable profit.

This is a development proposal, not a canonical migration.

## RLS and ACL matrix

All private tables have RLS enabled. Browser access additionally requires `authenticated` plus the stated profile/role predicate. SECURITY DEFINER functions use an empty `search_path` and schema-qualify referenced objects.

| Object | public | anon | authenticated browser | service_role |
|---|---|---|---|---|
| `order_item_financial_allocations` | none | none | `SELECT`, owner/admin RLS | none |
| `order_item_refund_allocations` | none | none | `SELECT`, owner/admin RLS | none |
| `order_item_return_allocations` | none | none | `SELECT`, owner/admin RLS | none |
| `order_return_events` / `order_return_inspections` | none | none | `SELECT`, owner/admin RLS | none |
| `inventory_restoration_movements` | none | none | `SELECT`, owner/admin RLS | none |
| `order_financial_snapshots` | none | none | existing `SELECT` plus existing owner/admin RLS | none |
| `order_financial_adjustments` | none | none | existing `SELECT` plus existing owner/admin RLS | none |
| order financial/reconciliation/data-quality views | none | none | `SELECT`; underlying invoker RLS applies | none |
| product allocation reconciliation/data-quality views | none | none | `SELECT`; underlying invoker RLS applies | none |
| `record_dashboard_refund(...)` | none | none | `EXECUTE`; function requires owner/admin | none |
| return and inspection RPCs | none | none | `EXECUTE`; functions require owner/admin | none |
| `get_dashboard_product_financials(...)` | none | none | `EXECUTE`; function requires owner/admin/viewer | none |
| internal allocators/validators/return writer | none | none | none | none |
| delivered/refund capture trigger functions | none | none | trigger-compatible `EXECUTE` retained | trigger-compatible `EXECUTE` retained |

`anon` has no allocation, buying-cost, refund, return, restoration, view, or RPC privilege. `service_role` has no direct immutable-ledger table/view or public RPC grant. Static compatibility review confirms the existing Website service-role checkout/status path writes `orders`/`order_items`; PostgreSQL triggers invoke the SECURITY DEFINER capture functions without requiring direct ledger-table privileges. The Website repository is not changed.

## Test and rollback-fixture contract

The pgTAP proposal and rollback-only fixture cover:

- no recognition for cancellation before delivery, including prepaid orders;
- delivered recognition and immutable delivered units;
- full refund without return (revenue reversed, COGS retained);
- resellable return (revenue and supported COGS reversed, movement created);
- damaged return (revenue reversed, COGS retained, no movement);
- product-only and delivery-only scope isolation;
- ambiguous legacy refund quarantine;
- nullable COGS/profit for missing cost snapshots;
- exact integer-poisha allocation and UUID tie-breaking;
- exact-retry idempotency and conflicting duplicate rejection;
- sequential over-return rejection plus static row-lock/unique-guard assertions for concurrent protection;
- RLS/ACL separation, immutable ledgers, and zero direct inventory mutation.

The fixture begins a transaction and ends with `ROLLBACK`. It uses reserved synthetic identifiers and refuses to proceed if any collide. It does not call inventory mutation.

## Migration-history audit plan

Stage A is read-only and requires explicit environment identification:

1. List local migration timestamps and filenames.
2. Inspect the actual development schema.
3. Read `supabase_migrations.schema_migrations` in development.
4. Compare the three sources and report discrepancies without changing history.
5. Never infer production migration history from development.

Stage B is migration-history repair. It may occur only after the Stage A evidence is reviewed and the user explicitly approves an exact repair action. It is outside this proposal.

## Compatibility assessment

The service-role Website checkout path remains compatible because it does not need direct access to private allocation/COGS tables. Delivery recognition continues through the existing order-status trigger. The added nullable order fields and defaults do not require Website payload changes. Ambiguous header-only refund updates are accepted only into `needs_review`, never silently allocated.

The Website repository remains read-only and is not modified. Before any future migration is canonicalized, re-run static inspection against the then-current Website checkout/status writes and actual development schema.

## Remaining risks and manual decisions

- Decide how the separately verified physical-stock workflow consumes each
  inspected restoration movement. This proposal intentionally stops before
  updating available inventory.
- Design a reviewed resolution RPC for `needs_review` legacy events; immutable evidence must be appended, not overwritten.
- Establish authoritative immutable delivery-attempt history before publishing Delivery Success Rate.
- Establish advertising attribution rules before including Advertising Spend in product-level Contribution Profit.
- Confirm actual development ACLs, RLS, installed signatures, and migration history in Stage A before creating any canonical migration.
- PostgreSQL static parsing cannot prove runtime behavior, trigger ordering, RLS semantics, or true concurrent-session outcomes. Those require an approved development-only rehearsal later.

## Recommended checkpoint-commit prompt

> Review the five unstaged product-financial-recognition proposal files against the approved accounting contract. Confirm no SQL was executed and no Supabase or Website repository was contacted or modified. Re-run ESLint, TypeScript, Vitest, production build, static PostgreSQL/ACL checks, secret-value scan, and `git diff --check`. If all results are accepted, create one local checkpoint commit only; do not push and do not create or apply a canonical migration.

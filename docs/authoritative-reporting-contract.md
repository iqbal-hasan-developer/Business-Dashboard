# Authoritative connected reporting contract

## Scope and safety

This contract is for the authenticated **NexaNotion Business Dashboard Dev**
connection. Private reads run on the Next.js server with the normal user JWT and
database RLS. The application has no service-role client, inventory RPC, stock
update, SQL execution, migration execution, or financial fallback to mock or
mutable order-row calculations.

The response shapes below are the exact installed contracts from migration
`202607140009_financial_and_reconciliation_views.sql`. Runtime responses are
strictly validated with Zod before being mapped to integer poisha values.

## RPC and view response shapes

### `get_dashboard_financial_summary`

Arguments:

- `p_start_date date | null`
- `p_end_date date | null`
- `p_sales_channel text | null`
- `p_campaign_id uuid | null`

Exactly one result row:

| Field | Database type | Application behavior |
| --- | --- | --- |
| `delivered_order_count` | `bigint` | non-negative integer |
| `delivered_orders_missing_cogs` | `bigint` | non-negative integer |
| `delivered_orders_missing_fulfillment_costs` | `bigint` | non-negative integer |
| `product_revenue` | `numeric(14,2)` | integer poisha |
| `net_revenue` | `numeric(14,2)` | integer poisha; includes refund adjustments |
| `cogs` | `numeric(14,2) null` | `null` when any selected COGS is incomplete |
| `gross_profit` | `numeric(14,2) null` | `null` with incomplete COGS |
| `contribution_profit` | `numeric(14,2) null` | `null` with incomplete COGS or fulfillment cost |
| `average_order_value` | `numeric(14,2)` | integer poisha |
| `ad_spend` | `numeric(14,2)` | integer poisha |
| `expenses` | `numeric(14,2)` | integer poisha |
| `net_profit` | `numeric(14,2) null` | `null` when contribution profit is unknown |
| `profit_margin` | `numeric(8,2) null` | database percentage mapped to an application ratio |

### `dashboard_order_financials`

One row per immutable Delivered recognition snapshot. Its exact row shape is:

- `order_id uuid`, `order_number text`, `order_date date`,
  `sales_channel text`, `campaign_id uuid null`,
  `campaign_name_snapshot text null`, `payment_method text`,
  `settlement_status text`, `recognized_at timestamptz`, and
  `recognition_source text`;
- `is_delivered boolean` (always `true`), `cogs_complete boolean`, and
  `fulfillment_costs_complete boolean`; and
- `recognized_product_revenue numeric(14,2)`,
  `recognized_delivery_revenue numeric(14,2)`,
  `recognized_discount_amount numeric(14,2)`,
  `recognized_refund_amount numeric(14,2)`, `net_revenue numeric(14,2)`,
  `recognized_cogs numeric(14,2) null`, `gross_profit numeric(14,2) null`,
  and `contribution_profit numeric(14,2) null`.

The view adds all append-only `refund` adjustment deltas to the original refund
snapshot. The original snapshot is never updated by reporting.

### `dashboard_daily_financials`

One row per business date. `business_date` is `date`; the three Delivered-order
and missing-cost counts are `bigint`; Product Revenue, Net Revenue, Average Order
Value, expenses and ad spend are `numeric(14,2)`; COGS, Gross Profit,
Contribution Profit and Net Profit are nullable `numeric(14,2)`; and Profit
Margin is nullable `numeric(8,2)`.

The view is used directly when no channel or campaign dimension is selected.
For a channel/campaign filter, the daily order series is grouped only from
filtered `dashboard_order_financials` rows; filtered ad spend and expenses come
from their authoritative ledgers. Mutable orders and items are not financial
inputs.

### `dashboard_reconciliation`

Exactly one global row with the same 13 result fields as the financial summary
RPC, with the same database types and nullability. The application compares
this row to an unfiltered RPC call using exact integer-poisha equality and
explicit `null` equality.

### `dashboard_data_quality_checks`

Exactly one row containing eight non-negative `bigint` counts:

- `order_items_with_missing_links`
- `duplicate_order_numbers`
- `products_with_missing_sku`
- `duplicate_product_skus`
- `delivered_orders_without_items`
- `delivered_orders_missing_financial_snapshot`
- `snapshot_product_revenue_mismatches`
- `snapshot_cogs_mismatches`

## Immutable history sources

`order_financial_snapshots` has one Delivered row per order and freezes the
order/date/channel/campaign/payment/settlement dimensions plus Product Revenue,
delivery revenue, discount, original refund, Net Revenue, COGS completeness,
COGS, courier cost and packaging cost.

`order_financial_adjustments` is append-only and accepts only non-zero refund
deltas. `dashboard_order_financials`, the daily view and the summary RPC consume
those deltas; the application does not query mutable `orders.refund_amount` as
recognized truth.

## KPI and chart source map

| Surface | Authoritative connected source |
| --- | --- |
| Product Revenue, Net Revenue, COGS, Gross Profit, Contribution Profit, AOV, Ad Spend, Operating Expenses, Net Profit, Profit Margin | `get_dashboard_financial_summary` |
| Total, Delivered, Pending and status distribution | bounded server-side `orders` query; operational only |
| Cash Balance | bounded `cash_movements` ledger query |
| COD Receivable | adjusted Net Revenue from unsettled COD rows in `dashboard_order_financials` |
| Inventory Value | current `products.stock` multiplied by private `product_business_data.buying_price` on the server |
| Daily revenue/contribution | `dashboard_daily_financials`, or filtered `dashboard_order_financials` when a dimension is selected |
| Revenue versus ad spend | daily recognition source plus filtered `daily_ad_spend` ledger |
| Expense breakdown | filtered `expenses` ledger |
| Recent orders | bounded operational query; its displayed total is explicitly labeled operational |
| Reconciliation and data quality | `dashboard_reconciliation` and `dashboard_data_quality_checks` |

## Filter and NULL semantics

- Dates use `Asia/Dhaka` business dates and URL-preserved range parameters.
- Date, channel and campaign are passed consistently to the summary RPC and
  matching detail/ledger queries.
- `All statuses` and `Delivered` expose Delivered-only recognized financials.
- A non-Delivered status affects operational metrics only. Recognized financial
  KPIs and chart values render unavailable instead of attributing Delivered
  accounting to that status.
- Zero means the authoritative source returned a complete zero.
- `null` means a required cost is unknown or the selected operational status has
  no applicable recognized accounting. It is never coerced to zero.
- Any RPC/view error or schema mismatch reaches the protected route error state;
  connected mode never falls back to mock or mutable financial calculations.

## Known installed-contract gap

The installed recognition ledger has no immutable product-level allocation view.
It is therefore impossible to produce authoritative Top Products revenue without
falling back to mutable `order_items` or inventing a refund-allocation rule. The
connected panel fails closed as unavailable. A future reviewed migration must add
an immutable product-level recognition contract before that chart can be enabled.

## Live read-only verification

Completed against **NexaNotion Business Dashboard Dev** on 16 July 2026 using
the preserved owner session and normal RLS. The empty connected responses passed
all strict Zod contracts: the filtered summary, global reconciliation and data
quality surfaces returned their required singleton shapes, while the recognized
order and daily series were empty and rendered as truthful zero/empty states.

The authenticated `/dashboard`, `/reports`, and `/data-checks` routes passed at
1440 x 900 and 412 x 915. Six anonymous private-table/view requests were rejected
with HTTP 401. The run recorded zero console errors, warnings, page errors,
framework overlays, horizontal overflow, inventory RPC calls, and business-data
mutation requests. No customer row, environment value, credential or JWT was
printed or recorded.

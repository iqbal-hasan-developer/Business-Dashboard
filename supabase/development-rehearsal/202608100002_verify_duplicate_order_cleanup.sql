-- Development-only, read-only verification for 202608100001.
-- Run only against NexaNotion Business Dashboard Dev.
with status_counts as (
  select
    count(*)::bigint as total_orders,
    count(*) filter (where coalesce(dashboard_order_status, order_status) = 'Delivered')::bigint as delivered,
    count(*) filter (where coalesce(dashboard_order_status, order_status) = 'Pending')::bigint as pending,
    count(*) filter (where coalesce(dashboard_order_status, order_status) = 'Cancelled')::bigint as cancelled,
    count(*) filter (where order_number !~* '^SF-')::bigint as noncanonical_numbers
  from public.orders
), financial_counts as (
  select
    count(*)::bigint as snapshots,
    coalesce(sum(product_revenue), 0)::numeric(14,2) as product_revenue,
    coalesce(sum(cogs), 0)::numeric(14,2) as cogs
  from public.order_financial_snapshots
), duplicate_groups as (
  select lower(regexp_replace(order_number, '^sf-', '', 'i')) as normalized_order_number
  from public.orders
  group by lower(regexp_replace(order_number, '^sf-', '', 'i'))
  having count(*) > 1
), quality_failures as (
  select field.key as check_name, field.value::bigint as failure_count
  from public.dashboard_data_quality_checks quality
  cross join lateral jsonb_each_text(to_jsonb(quality)) field(key, value)
  union all
  select field.key, field.value::bigint
  from public.dashboard_product_allocation_data_quality quality
  cross join lateral jsonb_each_text(to_jsonb(quality)) field(key, value)
)
select
  status_counts.*,
  financial_counts.*,
  (select count(*)::bigint from public.order_items) as order_items,
  (select count(*)::bigint from public.order_item_financial_allocations) as item_financial_allocations,
  (select count(*)::bigint from duplicate_groups) as normalized_duplicate_groups,
  (select count(*)::bigint from quality_failures where failure_count <> 0) as failing_quality_checks,
  status_counts.total_orders = 43
    and status_counts.delivered = 36
    and status_counts.pending = 1
    and status_counts.cancelled = 6
    and status_counts.noncanonical_numbers = 0
    and financial_counts.snapshots = 36
    and financial_counts.product_revenue = 25900.00::numeric
    and financial_counts.cogs = 14380.00::numeric
    and (select count(*) from public.order_items) = 43
    and (select count(*) from public.order_item_financial_allocations) = 36
    and not exists (select 1 from duplicate_groups)
    and not exists (select 1 from quality_failures where failure_count <> 0)
    as all_checks_passed
from status_counts
cross join financial_counts;

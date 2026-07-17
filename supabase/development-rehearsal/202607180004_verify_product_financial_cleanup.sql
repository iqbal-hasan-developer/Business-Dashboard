-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Proves the rollback-only product-financial fixtures left no synthetic rows.
-- Replace the sentinel after confirming the visible development breadcrumb.

with gate as (
  select '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
    = 'NexaNotion Business Dashboard Dev' as confirmed
), fixture_orders as (
  select id from public.orders
  where id::text like '72000000-0000-4000-8000-%'
     or order_number like 'ALLOC-%'
), fixture_items as (
  select id from public.order_items
  where id::text like '73000000-0000-4000-8000-%'
     or order_id in (select id from fixture_orders)
), fixture_adjustments as (
  select id from public.order_financial_adjustments
  where id::text like '74000000-0000-4000-8000-%'
     or order_id in (select id from fixture_orders)
), fixture_returns as (
  select id from public.order_return_events
  where id::text like '75000000-0000-4000-8000-%'
     or order_id in (select id from fixture_orders)
), fixture_return_allocations as (
  select id from public.order_item_return_allocations
  where return_event_id in (select id from fixture_returns)
     or order_id in (select id from fixture_orders)
), fixture_inspections as (
  select id from public.order_return_inspections
  where return_event_id in (select id from fixture_returns)
), fixture_records(record_type, persisted_count) as (
  values
    ('categories', (
      select count(*) from public.categories
      where id = '70000000-0000-4000-8000-000000000001'
         or slug = 'product-allocation-fixture'
    )::bigint),
    ('products', (
      select count(*) from public.products
      where id::text like '71000000-0000-4000-8000-%'
         or sku like 'FIX-%'
    )::bigint),
    ('product_business_data', (
      select count(*) from public.product_business_data
      where product_id::text like '71000000-0000-4000-8000-%'
    )::bigint),
    ('orders', (select count(*) from fixture_orders)::bigint),
    ('order_items', (select count(*) from fixture_items)::bigint),
    ('order_financial_snapshots', (
      select count(*) from public.order_financial_snapshots
      where order_id in (select id from fixture_orders)
    )::bigint),
    ('order_financial_adjustments',
      (select count(*) from fixture_adjustments)::bigint),
    ('order_item_financial_allocations', (
      select count(*) from public.order_item_financial_allocations
      where order_id in (select id from fixture_orders)
         or order_item_id in (select id from fixture_items)
    )::bigint),
    ('order_item_refund_allocations', (
      select count(*) from public.order_item_refund_allocations
      where adjustment_id in (select id from fixture_adjustments)
         or order_id in (select id from fixture_orders)
    )::bigint),
    ('order_return_events', (select count(*) from fixture_returns)::bigint),
    ('order_item_return_allocations',
      (select count(*) from fixture_return_allocations)::bigint),
    ('order_return_inspections',
      (select count(*) from fixture_inspections)::bigint),
    ('inventory_restoration_movements', (
      select count(*) from public.inventory_restoration_movements
      where inspection_id in (select id from fixture_inspections)
         or return_allocation_id in (
           select id from fixture_return_allocations
         )
         or order_id in (select id from fixture_orders)
    )::bigint),
    ('business_settings', (
      select count(*) from public.business_settings
      where setting_key = 'fixture_financial_default'
         or setting_value::text ilike '%FIXTURE%'
    )::bigint),
    ('audit_history', (
      select count(*) from public.audit_history
      where record_id like '70000000-0000-4000-8000-%'
         or record_id like '71000000-0000-4000-8000-%'
         or record_id like '72000000-0000-4000-8000-%'
         or record_id like '73000000-0000-4000-8000-%'
         or record_id like '74000000-0000-4000-8000-%'
         or record_id like '75000000-0000-4000-8000-%'
         or coalesce(old_values::text, '') ilike '%ALLOC-%'
         or coalesce(new_values::text, '') ilike '%ALLOC-%'
         or coalesce(old_values::text, '') ilike '%FIXTURE%'
         or coalesce(new_values::text, '') ilike '%FIXTURE%'
    )::bigint)
), results as (
  select
    record_type,
    persisted_count,
    persisted_count = 0 and (select confirmed from gate) as passed
  from fixture_records
)
select record_type, persisted_count, passed
from results
union all
select
  'all_fixture_records_removed',
  sum(persisted_count)::bigint,
  bool_and(passed) and sum(persisted_count) = 0
from results
order by record_type;

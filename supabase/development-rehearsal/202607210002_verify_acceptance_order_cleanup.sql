-- Read-only verifier to run only after the separately approved cleanup commits.
-- Replace the placeholder only when the visible SQL Editor breadcrumb reads:
-- NexaNotion Business Dashboard Dev
with parameters as (
  select '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'::text
    as confirmation_sentinel
), breadcrumb_gate as materialized (
  select 1 / ((parameters.confirmation_sentinel =
    'NexaNotion Business Dashboard Dev')::integer) as gate
  from parameters
), expected_orders (order_id, order_number) as (
  values
    ('b77e4763-c619-4df4-a5d4-229e07ca3b28'::uuid, '272315039'::text),
    ('f269db91-59ec-4e8e-85ee-50d9a2eb95f0'::uuid, '271964410'::text),
    ('f78a7e99-3ae4-4aa5-b16d-cdff104bd8fa'::uuid, '272189783'::text)
), checks as (
  select
    (select gate = 1 from breadcrumb_gate) as development_breadcrumb_confirmed,
    (select count(*) from public.orders) = 0 as total_orders_zero,
    (select count(*) from public.orders
      where dashboard_order_status = 'Delivered') = 0 as delivered_orders_zero,
    (select count(*) from public.dashboard_order_financials) = 0
      as recognized_financial_rows_zero,
    (select coalesce(sum(recognized_product_revenue), 0)
      from public.dashboard_order_financials) = 0 as product_revenue_zero,
    (select coalesce(sum(net_revenue), 0)
      from public.dashboard_order_financials) = 0 as net_revenue_zero,
    (select coalesce(sum(recognized_cogs), 0)
      from public.dashboard_order_financials) = 0 as recognized_cogs_zero,
    (select coalesce(sum(gross_profit), 0)
      from public.dashboard_order_financials) = 0 as gross_profit_zero,
    (select coalesce(sum(contribution_profit), 0)
      from public.dashboard_order_financials) = 0 as contribution_profit_zero,
    (select case when count(*) = 0 then 0
       else coalesce(sum(net_revenue), 0) / count(*) end
      from public.dashboard_order_financials) = 0 as average_order_value_zero,
    (select coalesce(sum(net_revenue) filter (
        where lower(payment_method) = 'cod' and settlement_status <> 'Settled'
      ), 0) from public.dashboard_order_financials) = 0 as cod_receivable_zero,
    not exists (
      select 1 from public.orders as orders
      join expected_orders as expected on expected.order_id = orders.id
    ) as exact_target_orders_removed,
    not exists (
      select 1 from public.order_items as item
      join expected_orders as expected on expected.order_id = item.order_id
      union all
      select 1 from public.order_financial_snapshots as snapshot
      join expected_orders as expected on expected.order_id = snapshot.order_id
      union all
      select 1 from public.order_financial_adjustments as adjustment
      join expected_orders as expected on expected.order_id = adjustment.order_id
      union all
      select 1 from public.order_item_financial_allocations as allocation
      join expected_orders as expected on expected.order_id = allocation.order_id
      union all
      select 1 from public.order_item_refund_allocations as refund
      join expected_orders as expected on expected.order_id = refund.order_id
      union all
      select 1 from public.order_return_events as return_event
      join expected_orders as expected on expected.order_id = return_event.order_id
      union all
      select 1 from public.order_item_return_allocations as returned
      join expected_orders as expected on expected.order_id = returned.order_id
      union all
      select 1 from public.inventory_restoration_movements as movement
      join expected_orders as expected on expected.order_id = movement.order_id
      union all
      select 1 from public.settlement_order_allocations as allocation
      join expected_orders as expected on expected.order_id = allocation.order_id
      union all
      select 1 from public.cash_movements as movement
      join expected_orders as expected on expected.order_id = movement.order_id
    ) as target_dependencies_removed,
    not exists (
      select 1
      from public.audit_history as audit
      join expected_orders as expected
        on audit.record_id = expected.order_id::text
        or audit.old_values ->> 'order_id' = expected.order_id::text
        or audit.new_values ->> 'order_id' = expected.order_id::text
    ) as target_audit_history_removed,
    (select count(*) from public.products
      where slug = 'gym-bag-black') = 1 as acceptance_product_preserved,
    (select count(*) from public.products
      where slug = 'gym-bag-black' and stock = 0) = 1 as product_stock_remains_zero,
    (select count(*) from public.product_business_data as business
      join public.products as product on product.id = business.product_id
      where product.slug = 'gym-bag-black') = 1 as private_product_cost_row_preserved,
    (select count(*) = 1 and coalesce(sum(amount), 0) = 6840.00::numeric
      from public.expenses where category_key = 'operations')
      as operating_expense_preserved,
    (select count(*) from public.campaigns
      where name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026') = 1
      as campaign_preserved,
    (
      select count(*) = 1 and coalesce(sum(spend.amount), 0) = 354.20::numeric
      from public.daily_ad_spend as spend
      join public.campaigns as campaign on campaign.id = spend.campaign_id
      where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
        and spend.spend_date = date '2026-07-20'
    ) as daily_ad_spend_preserved,
    not exists (
      select 1
      from public.dashboard_data_quality_checks as quality
      cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
      where field.value::bigint <> 0
    ) and not exists (
      select 1
      from public.dashboard_product_allocation_data_quality as quality
      cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
      where field.value::bigint <> 0
    ) as all_data_quality_checks_pass,
    (
      select count(*) = 8
      from pg_catalog.pg_trigger as trigger
      where trigger.tgrelid in (
        'public.order_financial_snapshots'::regclass,
        'public.order_financial_adjustments'::regclass,
        'public.order_item_financial_allocations'::regclass,
        'public.order_item_refund_allocations'::regclass,
        'public.order_return_events'::regclass,
        'public.order_item_return_allocations'::regclass,
        'public.order_return_inspections'::regclass,
        'public.inventory_restoration_movements'::regclass
      ) and trigger.tgname in (
        'order_financial_snapshots_immutable',
        'order_financial_adjustments_immutable',
        'order_item_financial_allocations_immutable',
        'order_item_refund_allocations_immutable',
        'order_return_events_immutable',
        'order_item_return_allocations_immutable',
        'order_return_inspections_immutable',
        'inventory_restoration_movements_immutable'
      ) and trigger.tgenabled = 'O'
    ) as immutable_triggers_restored,
    exists (select 1 from supabase_migrations.schema_migrations
      where version = '202607190000')
      and exists (select 1 from supabase_migrations.schema_migrations
      where version = '202607200000') as migration_history_preserved
), decision as (
  select
    checks.*,
    coalesce((
      select bool_and(coalesce(check_result.value::boolean, false))
      from jsonb_each_text(to_jsonb(checks)) as check_result(key, value)
    ), false) as all_checks_passed,
    coalesce((
      select array_agg(check_result.key order by check_result.key)
        filter (where not coalesce(check_result.value::boolean, false))
      from jsonb_each_text(to_jsonb(checks)) as check_result(key, value)
    ), array[]::text[]) as failed_checks
  from checks
)
select *, not all_checks_passed as stop_required
from decision;

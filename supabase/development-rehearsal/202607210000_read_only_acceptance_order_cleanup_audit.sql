-- Development-only, read-only audit for the three manual-entry acceptance orders.
-- In the SQL Editor, replace the placeholder below only after the visible
-- project breadcrumb reads exactly: NexaNotion Business Dashboard Dev
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
), audited_orders as (
  select
    expected.order_id as expected_order_id,
    expected.order_number as expected_order_number,
    orders.id as order_id,
    orders.order_number,
    orders.dashboard_order_status as order_status,
    orders.dashboard_payment_status as payment_status,
    orders.settlement_status,
    financial.net_revenue::numeric(14,2) as recognized_net_revenue,
    financial.recognized_cogs::numeric(14,2) as recognized_cogs,
    financial.contribution_profit::numeric(14,2) as contribution_profit,
    financial.recognized_product_revenue::numeric(14,2)
      as recognized_product_revenue,
    financial.payment_method as recognized_payment_method,
    financial.settlement_status as recognized_settlement_status,
    (select count(*)::bigint from public.order_items as item
      where item.order_id = expected.order_id) as order_items_count,
    (select count(*)::bigint from public.order_financial_snapshots as snapshot
      where snapshot.order_id = expected.order_id) as financial_snapshots_count,
    (select count(*)::bigint from public.order_item_financial_allocations as allocation
      where allocation.order_id = expected.order_id) as item_financial_allocations_count,
    (select count(*)::bigint from public.order_financial_adjustments as adjustment
      where adjustment.order_id = expected.order_id) as financial_adjustments_count,
    (select count(*)::bigint from public.order_item_refund_allocations as refund
      where refund.order_id = expected.order_id) as item_refund_allocations_count,
    (select count(*)::bigint from public.order_return_events as return_event
      where return_event.order_id = expected.order_id) as return_events_count,
    (select count(*)::bigint from public.order_item_return_allocations as returned
      where returned.order_id = expected.order_id) as item_return_allocations_count,
    (
      select count(*)::bigint
      from public.order_return_inspections as inspection
      join public.order_return_events as return_event
        on return_event.id = inspection.return_event_id
      where return_event.order_id = expected.order_id
    ) as return_inspections_count,
    (select count(*)::bigint from public.inventory_restoration_movements as movement
      where movement.order_id = expected.order_id) as restoration_movements_count,
    (select count(*)::bigint from public.settlement_order_allocations as allocation
      where allocation.order_id = expected.order_id) as settlement_allocations_count,
    (select count(*)::bigint from public.cash_movements as movement
      where movement.order_id = expected.order_id) as cash_movements_count,
    (
      select count(*)::bigint
      from public.audit_history as audit
      where audit.record_id = expected.order_id::text
         or audit.old_values ->> 'order_id' = expected.order_id::text
         or audit.new_values ->> 'order_id' = expected.order_id::text
    ) as audit_history_count
  from expected_orders as expected
  left join public.orders as orders
    on orders.id = expected.order_id
   and orders.order_number = expected.order_number
  left join public.dashboard_order_financials as financial
    on financial.order_id = expected.order_id
), guard_inputs as (
  select
    (select gate = 1 from breadcrumb_gate) as development_breadcrumb_confirmed,
    (select count(*) = 3 from public.orders) as exactly_three_orders_exist,
    count(*) filter (where order_id is not null) = 3
      and count(distinct order_id) filter (where order_id is not null) = 3
      as exact_target_identity_match,
    bool_and(order_status = 'Delivered') as all_targets_delivered,
    bool_and(payment_status = 'Paid') as all_targets_paid,
    bool_and(settlement_status = 'Settled') as all_targets_operationally_settled,
    bool_and(
      recognized_net_revenue = 1050.00::numeric
      and recognized_cogs = 500.00::numeric
      and contribution_profit = 435.00::numeric
    ) as per_order_financials_match,
    coalesce(sum(recognized_product_revenue), 0) = 3150.00::numeric
      and coalesce(sum(recognized_net_revenue), 0) = 3150.00::numeric
      and coalesce(sum(recognized_cogs), 0) = 1500.00::numeric
      and coalesce(sum(contribution_profit), 0) = 1305.00::numeric
      as reported_totals_reconcile,
    coalesce(sum(recognized_net_revenue) filter (
      where lower(recognized_payment_method) = 'cod'
        and recognized_settlement_status <> 'Settled'
    ), 0) = 1050.00::numeric as cod_receivable_reconciles,
    bool_and(
      order_items_count = 1
      and financial_snapshots_count = 1
      and item_financial_allocations_count = 1
      and cash_movements_count = 0
    ) as dependent_rows_match_acceptance_scope
  from audited_orders
), preserved_business_guards as (
  select
    (
      select count(distinct item.product_id) = 1
        and bool_and(product.stock = 0)
      from public.order_items as item
      join expected_orders as expected on expected.order_id = item.order_id
      join public.products as product on product.id = item.product_id
    ) as target_product_stock_is_zero,
    (select count(*) = 1 from public.products
      where slug = 'gym-bag-black') as acceptance_product_exists,
    (select count(*) = 1 from public.product_business_data as business
      join public.products as product on product.id = business.product_id
      where product.slug = 'gym-bag-black') as private_product_cost_row_exists,
    (select count(*) = 1 and coalesce(sum(amount), 0) = 6840.00::numeric
      from public.expenses where category_key = 'operations')
      as acceptance_expense_is_preserved,
    (select count(*) = 1 from public.campaigns
      where name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026')
      as acceptance_campaign_is_preserved,
    (
      select count(*) = 1 and coalesce(sum(spend.amount), 0) = 354.20::numeric
      from public.daily_ad_spend as spend
      join public.campaigns as campaign on campaign.id = spend.campaign_id
      where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
        and spend.spend_date = date '2026-07-20'
    ) as acceptance_ad_spend_is_preserved,
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
    ) as all_data_quality_checks_pass
), guard_results as (
  select
    guard_inputs.*,
    preserved.*
  from guard_inputs
  cross join preserved_business_guards as preserved
), decision as (
  select
    guard_results.*,
    coalesce((
      select bool_and(coalesce(guard.value::boolean, false))
      from jsonb_each_text(to_jsonb(guard_results)) as guard(key, value)
    ), false) as cleanup_allowed,
    coalesce((
      select array_agg(guard.key order by guard.key)
        filter (where not coalesce(guard.value::boolean, false))
      from jsonb_each_text(to_jsonb(guard_results)) as guard(key, value)
    ), array[]::text[]) as failed_guards
  from guard_results
)
select
  audited.order_id,
  audited.order_number,
  audited.order_status,
  audited.payment_status,
  audited.settlement_status,
  audited.recognized_net_revenue,
  audited.recognized_cogs,
  audited.contribution_profit,
  jsonb_build_object(
    'order_items', audited.order_items_count,
    'order_financial_snapshots', audited.financial_snapshots_count,
    'order_item_financial_allocations', audited.item_financial_allocations_count,
    'order_financial_adjustments', audited.financial_adjustments_count,
    'order_item_refund_allocations', audited.item_refund_allocations_count,
    'order_return_events', audited.return_events_count,
    'order_item_return_allocations', audited.item_return_allocations_count,
    'order_return_inspections', audited.return_inspections_count,
    'inventory_restoration_movements', audited.restoration_movements_count,
    'settlement_order_allocations', audited.settlement_allocations_count,
    'cash_movements', audited.cash_movements_count,
    'audit_history', audited.audit_history_count
  ) as dependent_row_counts,
  to_jsonb(decision) - 'cleanup_allowed' - 'failed_guards' as guard_results,
  decision.failed_guards,
  decision.cleanup_allowed,
  not decision.cleanup_allowed as stop_required
from audited_orders as audited
cross join decision
order by audited.order_number;

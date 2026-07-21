-- SELECT-only diagnosis for 202607210000 cleanup_allowed = false.
-- Replace the placeholder only after the visible SQL Editor breadcrumb reads:
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
), audited_orders as (
  select
    expected.order_id as expected_order_id,
    orders.id as order_id,
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
    (select count(*)::bigint from public.cash_movements as movement
      where movement.order_id = expected.order_id) as cash_movements_count
  from expected_orders as expected
  left join public.orders as orders
    on orders.id = expected.order_id
   and orders.order_number = expected.order_number
  left join public.dashboard_order_financials as financial
    on financial.order_id = expected.order_id
), order_metrics as (
  select
    (select count(*)::bigint from public.orders) as total_order_count,
    count(*) filter (where order_id is not null)::bigint
      as matched_target_count,
    count(distinct order_id) filter (where order_id is not null)::bigint
      as distinct_target_count,
    count(*) filter (where order_status = 'Delivered')::bigint
      as delivered_target_count,
    count(*) filter (where payment_status = 'Paid')::bigint
      as paid_target_count,
    count(*) filter (where settlement_status = 'Settled')::bigint
      as settled_target_count,
    count(*) filter (
      where recognized_net_revenue = 1050.00::numeric
        and recognized_cogs = 500.00::numeric
        and contribution_profit = 435.00::numeric
    )::bigint as matching_per_order_financial_count,
    coalesce(sum(recognized_product_revenue), 0)::numeric(14,2)
      as product_revenue_total,
    coalesce(sum(recognized_net_revenue), 0)::numeric(14,2)
      as net_revenue_total,
    coalesce(sum(recognized_cogs), 0)::numeric(14,2) as cogs_total,
    coalesce(sum(contribution_profit), 0)::numeric(14,2)
      as contribution_profit_total,
    coalesce(sum(recognized_net_revenue) filter (
      where lower(recognized_payment_method) = 'cod'
        and recognized_settlement_status <> 'Settled'
    ), 0)::numeric(14,2) as cod_receivable_total,
    count(*) filter (
      where order_items_count = 1
        and financial_snapshots_count = 1
        and item_financial_allocations_count = 1
        and cash_movements_count = 0
    )::bigint as matching_dependency_count,
    coalesce(sum(order_items_count), 0)::bigint as order_items_count,
    coalesce(sum(financial_snapshots_count), 0)::bigint
      as financial_snapshots_count,
    coalesce(sum(item_financial_allocations_count), 0)::bigint
      as item_financial_allocations_count,
    coalesce(sum(cash_movements_count), 0)::bigint as cash_movements_count
  from audited_orders
), preservation_metrics as (
  select
    (
      select count(distinct item.product_id)::bigint
      from public.order_items as item
      join expected_orders as expected on expected.order_id = item.order_id
    ) as target_product_count,
    (
      select count(distinct product.id) filter (where product.stock = 0)::bigint
      from public.order_items as item
      join expected_orders as expected on expected.order_id = item.order_id
      join public.products as product on product.id = item.product_id
    ) as zero_stock_target_product_count,
    (select count(*)::bigint from public.products)
      as total_product_count,
    (select count(*)::bigint from public.products
      where slug = 'gym-bag-black') as matching_product_count,
    (select count(*)::bigint from public.product_business_data)
      as total_private_product_row_count,
    (select count(*)::bigint from public.product_business_data as business
      join public.products as product on product.id = business.product_id
      where product.slug = 'gym-bag-black') as matching_private_product_row_count,
    (select count(*)::bigint from public.expenses) as total_expense_count,
    (select count(*)::bigint from public.expenses
      where category_key = 'operations') as matching_expense_count,
    (select coalesce(sum(amount), 0)::numeric(14,2) from public.expenses)
      as total_expense_amount,
    (select coalesce(sum(amount), 0)::numeric(14,2) from public.expenses
      where category_key = 'operations') as matching_expense_amount,
    (select count(*)::bigint from public.campaigns) as total_campaign_count,
    (select count(*)::bigint from public.campaigns
      where name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026')
      as matching_campaign_count,
    (select count(*)::bigint from public.daily_ad_spend)
      as total_ad_spend_count,
    (select coalesce(sum(amount), 0)::numeric(14,2)
      from public.daily_ad_spend) as total_ad_spend_amount,
    (
      select count(*)::bigint
      from public.daily_ad_spend as spend
      join public.campaigns as campaign on campaign.id = spend.campaign_id
      where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
        and spend.spend_date = date '2026-07-20'
    ) as matching_ad_spend_count,
    (
      select coalesce(sum(spend.amount), 0)::numeric(14,2)
      from public.daily_ad_spend as spend
      join public.campaigns as campaign on campaign.id = spend.campaign_id
      where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
        and spend.spend_date = date '2026-07-20'
    ) as matching_ad_spend_amount,
    (select md5(coalesce(
      jsonb_agg(to_jsonb(product) order by product.id)::text, '[]'
    )) from public.products as product where product.slug = 'gym-bag-black')
      as product_fingerprint,
    (select md5(coalesce(
      jsonb_agg(to_jsonb(business) order by business.product_id)::text, '[]'
    )) from public.product_business_data as business
      join public.products as product on product.id = business.product_id
      where product.slug = 'gym-bag-black') as private_product_fingerprint,
    (select md5(coalesce(
      jsonb_agg(to_jsonb(expense) order by expense.id)::text, '[]'
    )) from public.expenses as expense where expense.category_key = 'operations')
      as expense_fingerprint,
    (select md5(coalesce(
      jsonb_agg(to_jsonb(campaign) order by campaign.id)::text, '[]'
    )) from public.campaigns as campaign
      where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026')
      as campaign_fingerprint,
    (select md5(coalesce(
      jsonb_agg(to_jsonb(spend) order by spend.id)::text, '[]'
    )) from public.daily_ad_spend as spend
      join public.campaigns as campaign on campaign.id = spend.campaign_id
      where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
        and spend.spend_date = date '2026-07-20') as ad_spend_fingerprint
), base_quality as (
  select field.key as check_name, field.value::bigint as failure_count
  from public.dashboard_data_quality_checks as quality
  cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
), product_quality as (
  select field.key as check_name, field.value::bigint as failure_count
  from public.dashboard_product_allocation_data_quality as quality
  cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
), quality_metrics as (
  select
    (select count(*)::bigint from base_quality where failure_count <> 0)
      as failing_base_quality_count,
    (select count(*)::bigint from product_quality where failure_count <> 0)
      as failing_product_quality_count
), metrics as (
  select order_metrics.*, preservation_metrics.*, quality_metrics.*,
    breadcrumb_gate.gate
  from order_metrics
  cross join preservation_metrics
  cross join quality_metrics
  cross join breadcrumb_gate
), guard_rows as (
  select 1 as guard_order, 'development_breadcrumb_confirmed'::text as guard_name,
    gate = 1 as passed,
    jsonb_build_object('confirmed_count', (gate = 1)::integer) as observed,
    jsonb_build_object('confirmed_count', 1) as expected,
    null::text as preservation_fingerprint
  from metrics
  union all
  select 2, 'exactly_three_orders_exist', total_order_count = 3,
    jsonb_build_object('order_count', total_order_count),
    jsonb_build_object('order_count', 3), null from metrics
  union all
  select 3, 'exact_target_identity_match',
    matched_target_count = 3 and distinct_target_count = 3,
    jsonb_build_object('matched_count', matched_target_count,
      'distinct_count', distinct_target_count),
    jsonb_build_object('matched_count', 3, 'distinct_count', 3), null from metrics
  union all
  select 4, 'all_targets_delivered', delivered_target_count = 3,
    jsonb_build_object('Delivered', delivered_target_count),
    jsonb_build_object('Delivered', 3), null from metrics
  union all
  select 5, 'all_targets_paid', paid_target_count = 3,
    jsonb_build_object('Paid', paid_target_count),
    jsonb_build_object('Paid', 3), null from metrics
  union all
  select 6, 'all_targets_operationally_settled', settled_target_count = 3,
    jsonb_build_object('Settled', settled_target_count),
    jsonb_build_object('Settled', 3), null from metrics
  union all
  select 7, 'per_order_financials_match', matching_per_order_financial_count = 3,
    jsonb_build_object('matching_order_count', matching_per_order_financial_count),
    jsonb_build_object('matching_order_count', 3, 'net_revenue_each', 1050.00,
      'cogs_each', 500.00, 'contribution_profit_each', 435.00), null from metrics
  union all
  select 8, 'reported_totals_reconcile',
    product_revenue_total = 3150.00 and net_revenue_total = 3150.00
      and cogs_total = 1500.00 and contribution_profit_total = 1305.00,
    jsonb_build_object('product_revenue', product_revenue_total,
      'net_revenue', net_revenue_total, 'cogs', cogs_total,
      'contribution_profit', contribution_profit_total),
    jsonb_build_object('product_revenue', 3150.00, 'net_revenue', 3150.00,
      'cogs', 1500.00, 'contribution_profit', 1305.00), null from metrics
  union all
  select 9, 'cod_receivable_reconciles', cod_receivable_total = 1050.00,
    jsonb_build_object('cod_receivable', cod_receivable_total),
    jsonb_build_object('cod_receivable', 1050.00), null from metrics
  union all
  select 10, 'dependent_rows_match_acceptance_scope',
    matching_dependency_count = 3,
    jsonb_build_object('matching_order_count', matching_dependency_count,
      'order_items', order_items_count,
      'financial_snapshots', financial_snapshots_count,
      'item_financial_allocations', item_financial_allocations_count,
      'cash_movements', cash_movements_count),
    jsonb_build_object('matching_order_count', 3, 'order_items', 3,
      'financial_snapshots', 3, 'item_financial_allocations', 3,
      'cash_movements', 0), null from metrics
  union all
  select 11, 'target_product_stock_is_zero',
    target_product_count = 1 and zero_stock_target_product_count = 1,
    jsonb_build_object('target_product_count', target_product_count,
      'zero_stock_target_product_count', zero_stock_target_product_count),
    jsonb_build_object('target_product_count', 1,
      'zero_stock_target_product_count', 1), product_fingerprint from metrics
  union all
  select 12, 'acceptance_product_exists', matching_product_count = 1,
    jsonb_build_object('matching_count', matching_product_count,
      'total_product_count', total_product_count),
    jsonb_build_object('matching_count', 1), product_fingerprint from metrics
  union all
  select 13, 'private_product_cost_row_exists',
    matching_private_product_row_count = 1,
    jsonb_build_object('matching_count', matching_private_product_row_count,
      'total_private_product_row_count', total_private_product_row_count),
    jsonb_build_object('matching_count', 1), private_product_fingerprint from metrics
  union all
  select 14, 'acceptance_expense_is_preserved',
    matching_expense_count = 1 and matching_expense_amount = 6840.00,
    jsonb_build_object('matching_count', matching_expense_count,
      'matching_amount', matching_expense_amount,
      'total_expense_count', total_expense_count,
      'total_expense_amount', total_expense_amount),
    jsonb_build_object('matching_count', 1, 'matching_amount', 6840.00),
    expense_fingerprint from metrics
  union all
  select 15, 'acceptance_campaign_is_preserved', matching_campaign_count = 1,
    jsonb_build_object('matching_count', matching_campaign_count,
      'total_campaign_count', total_campaign_count),
    jsonb_build_object('matching_count', 1), campaign_fingerprint from metrics
  union all
  select 16, 'acceptance_ad_spend_is_preserved',
    matching_ad_spend_count = 1 and matching_ad_spend_amount = 354.20,
    jsonb_build_object('matching_count', matching_ad_spend_count,
      'matching_amount', matching_ad_spend_amount,
      'total_ad_spend_count', total_ad_spend_count,
      'total_ad_spend_amount', total_ad_spend_amount),
    jsonb_build_object('matching_count', 1, 'matching_amount', 354.20),
    ad_spend_fingerprint from metrics
  union all
  select 17, 'all_data_quality_checks_pass',
    failing_base_quality_count = 0 and failing_product_quality_count = 0,
    jsonb_build_object('failing_base_check_count', failing_base_quality_count,
      'failing_product_check_count', failing_product_quality_count),
    jsonb_build_object('failing_base_check_count', 0,
      'failing_product_check_count', 0), null from metrics
), quality_detail_rows as (
  select
    1000 + (row_number() over (order by source_name, check_name))::integer
      as guard_order,
    source_name || '.' || check_name as guard_name,
    failure_count = 0 as passed,
    jsonb_build_object('failure_count', failure_count) as observed,
    jsonb_build_object('failure_count', 0) as expected,
    null::text as preservation_fingerprint
  from (
    select 'dashboard_data_quality_checks'::text as source_name,
      check_name, failure_count from base_quality
    union all
    select 'dashboard_product_allocation_data_quality',
      check_name, failure_count from product_quality
  ) as detailed_quality
)
select guard_name, passed, observed, expected, preservation_fingerprint
from (
  select * from guard_rows
  union all
  select * from quality_detail_rows
) as diagnostic
order by guard_order;

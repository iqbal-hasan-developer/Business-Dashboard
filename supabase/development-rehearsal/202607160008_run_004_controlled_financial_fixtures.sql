-- DEVELOPMENT SQL EDITOR ONLY. ROLLBACK-ONLY SYNTHETIC REHEARSAL.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.
-- SQL Editor wrapper for 202607160004_controlled_financial_fixtures.sql.
-- It never calls decrement_product_stock and ends with ROLLBACK.
-- All verification output is returned as one structured JSON value.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table rehearsal_ids (
  name text primary key,
  id uuid not null,
  stock_before integer
) on commit drop;

insert into rehearsal_ids (name, id, stock_before) values
  ('category', pg_catalog.gen_random_uuid(), null),
  ('product_known_cost', pg_catalog.gen_random_uuid(), 50),
  ('product_unknown_cost', pg_catalog.gen_random_uuid(), 30),
  ('order_website_pending_cod', pg_catalog.gen_random_uuid(), null),
  ('order_website_delivered_bkash', pg_catalog.gen_random_uuid(), null),
  ('order_manual_pending_nagad', pg_catalog.gen_random_uuid(), null),
  ('order_manual_delivered_cash', pg_catalog.gen_random_uuid(), null),
  ('order_manual_delivered_bank', pg_catalog.gen_random_uuid(), null),
  ('ad_spend', pg_catalog.gen_random_uuid(), null),
  ('expense', pg_catalog.gen_random_uuid(), null);

insert into public.categories (id, name, slug)
select id, 'REHEARSAL ONLY', 'rehearsal-category-' || id
from rehearsal_ids where name = 'category';

insert into public.products (
  id, category_id, name, slug, price, stock, sku, is_active
)
select
  product.id,
  category.id,
  'REHEARSAL known-cost product',
  'rehearsal-known-product-' || product.id,
  150,
  product.stock_before,
  'REHEARSAL-KNOWN-' || product.id,
  true
from rehearsal_ids as product
cross join rehearsal_ids as category
where product.name = 'product_known_cost' and category.name = 'category';

insert into public.products (
  id, category_id, name, slug, price, stock, sku, is_active
)
select
  product.id,
  category.id,
  'REHEARSAL unknown-cost product',
  'rehearsal-unknown-product-' || product.id,
  80,
  product.stock_before,
  'REHEARSAL-UNKNOWN-' || product.id,
  true
from rehearsal_ids as product
cross join rehearsal_ids as category
where product.name = 'product_unknown_cost' and category.name = 'category';

insert into public.product_business_data (
  product_id, buying_price, buying_price_verified_at
)
select id, 60, pg_catalog.now()
from rehearsal_ids where name = 'product_known_cost';

-- Pending Website / COD. Compatibility fields are populated by the Website
-- synchronization trigger and the order must not be recognized.
insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, created_at
)
select
  id,
  'REHEARSAL-WEB-PENDING-COD-' || id,
  'REHEARSAL SYNTHETIC CUSTOMER',
  'REHEARSAL-NOT-A-PHONE',
  'REHEARSAL SYNTHETIC ADDRESS',
  'Inside Dhaka',
  'cod',
  'unpaid',
  'pending',
  100,
  40,
  140,
  '2026-07-16 10:00:00+06'::timestamptz
from rehearsal_ids where name = 'order_website_pending_cod';

-- Delivered Website / bKash. A refund is appended after recognition.
insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, created_at, discount_amount, refund_amount,
  courier_cost_snapshot, packaging_cost_snapshot
)
select
  id,
  'REHEARSAL-WEB-DELIVERED-BKASH-' || id,
  'REHEARSAL SYNTHETIC CUSTOMER',
  'REHEARSAL-NOT-A-PHONE',
  'REHEARSAL SYNTHETIC ADDRESS',
  'Inside Dhaka',
  'bkash',
  'verified',
  'delivered',
  200,
  50,
  240,
  '2026-07-16 10:05:00+06'::timestamptz,
  10,
  0,
  30,
  10
from rehearsal_ids where name = 'order_website_delivered_bkash';

-- Pending manual / Nagad. Manual dashboard fields are explicit.
insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, created_at, sales_channel,
  dashboard_order_status, dashboard_payment_status, settlement_status
)
select
  id,
  'REHEARSAL-MANUAL-PENDING-NAGAD-' || id,
  'REHEARSAL SYNTHETIC CUSTOMER',
  'REHEARSAL-NOT-A-PHONE',
  'REHEARSAL SYNTHETIC ADDRESS',
  'Outside Dhaka',
  'nagad',
  'pending',
  'pending',
  300,
  0,
  300,
  '2026-07-16 10:10:00+06'::timestamptz,
  'Messenger',
  'Pending',
  'Unpaid',
  'Not Applicable'
from rehearsal_ids where name = 'order_manual_pending_nagad';

-- Delivered manual / Cash with complete COGS and fulfillment costs.
insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, created_at, sales_channel,
  dashboard_order_status, dashboard_payment_status, settlement_status,
  courier_cost_snapshot, packaging_cost_snapshot
)
select
  id,
  'REHEARSAL-MANUAL-DELIVERED-CASH-' || id,
  'REHEARSAL SYNTHETIC CUSTOMER',
  'REHEARSAL-NOT-A-PHONE',
  'REHEARSAL SYNTHETIC ADDRESS',
  'Inside Dhaka',
  'cash',
  'verified',
  'delivered',
  150,
  20,
  170,
  '2026-07-16 10:15:00+06'::timestamptz,
  'Facebook',
  'Delivered',
  'Paid',
  'Not Applicable',
  15,
  5
from rehearsal_ids where name = 'order_manual_delivered_cash';

-- Delivered manual / Bank Transfer with intentionally unknown COGS.
insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, created_at, sales_channel,
  dashboard_order_status, dashboard_payment_status, settlement_status,
  courier_cost_snapshot, packaging_cost_snapshot
)
select
  id,
  'REHEARSAL-MANUAL-DELIVERED-BANK-' || id,
  'REHEARSAL SYNTHETIC CUSTOMER',
  'REHEARSAL-NOT-A-PHONE',
  'REHEARSAL SYNTHETIC ADDRESS',
  'Outside Dhaka',
  'bank_transfer',
  'verified',
  'delivered',
  80,
  20,
  100,
  '2026-07-16 10:20:00+06'::timestamptz,
  'WhatsApp',
  'Delivered',
  'Paid',
  'Not Applicable',
  10,
  5
from rehearsal_ids where name = 'order_manual_delivered_bank';

insert into public.order_items (
  order_id, product_id, product_name, product_slug,
  unit_price, quantity, line_total, actual_unit_selling_price
)
select orders.id, product.id, 'REHEARSAL known-cost product',
  'rehearsal-known-product-' || product.id, 100, 1, 100, 100
from rehearsal_ids as orders cross join rehearsal_ids as product
where orders.name = 'order_website_pending_cod'
  and product.name = 'product_known_cost';

insert into public.order_items (
  order_id, product_id, product_name, product_slug,
  unit_price, quantity, line_total, actual_unit_selling_price
)
select orders.id, product.id, 'REHEARSAL known-cost product',
  'rehearsal-known-product-' || product.id, 100, 2, 200, 100
from rehearsal_ids as orders cross join rehearsal_ids as product
where orders.name = 'order_website_delivered_bkash'
  and product.name = 'product_known_cost';

insert into public.order_items (
  order_id, product_id, product_name, product_slug,
  unit_price, quantity, line_total, actual_unit_selling_price
)
select orders.id, product.id, 'REHEARSAL known-cost product',
  'rehearsal-known-product-' || product.id, 300, 1, 300, 300
from rehearsal_ids as orders cross join rehearsal_ids as product
where orders.name = 'order_manual_pending_nagad'
  and product.name = 'product_known_cost';

insert into public.order_items (
  order_id, product_id, product_name, product_slug,
  unit_price, quantity, line_total, actual_unit_selling_price
)
select orders.id, product.id, 'REHEARSAL known-cost product',
  'rehearsal-known-product-' || product.id, 150, 1, 150, 150
from rehearsal_ids as orders cross join rehearsal_ids as product
where orders.name = 'order_manual_delivered_cash'
  and product.name = 'product_known_cost';

insert into public.order_items (
  order_id, product_id, product_name, product_slug,
  unit_price, quantity, line_total, actual_unit_selling_price
)
select orders.id, product.id, 'REHEARSAL unknown-cost product',
  'rehearsal-unknown-product-' || product.id, 80, 1, 80, 80
from rehearsal_ids as orders cross join rehearsal_ids as product
where orders.name = 'order_manual_delivered_bank'
  and product.name = 'product_unknown_cost';

-- Force the deferred Delivered snapshot triggers only after all items exist.
set constraints dashboard_capture_delivered_snapshot immediate;

-- This becomes an append-only refund adjustment because recognition exists.
update public.orders
set refund_amount = 20
where id = (
  select id from rehearsal_ids
  where name = 'order_website_delivered_bkash'
);

insert into public.daily_ad_spend (
  id, spend_date, platform, amount, source_reference
)
select id, '2026-07-16'::date, 'Website', 10,
  'REHEARSAL-' || id
from rehearsal_ids where name = 'ad_spend';

insert into public.expenses (
  id, expense_date, category_key, description, amount, sales_channel,
  reference
)
select id, '2026-07-16'::date, 'rehearsal',
  'REHEARSAL synthetic expense', 5, 'Website', 'REHEARSAL-' || id
from rehearsal_ids where name = 'expense';

create temporary table rehearsal_expected_metrics (
  scope text primary key,
  delivered_order_count bigint not null,
  delivered_orders_missing_cogs bigint not null,
  delivered_orders_missing_fulfillment_costs bigint not null,
  product_revenue numeric(14,2) not null,
  net_revenue numeric(14,2) not null,
  cogs numeric(14,2),
  gross_profit numeric(14,2),
  contribution_profit numeric(14,2),
  average_order_value numeric(14,2) not null,
  ad_spend numeric(14,2) not null,
  expenses numeric(14,2) not null,
  net_profit numeric(14,2),
  profit_margin numeric(8,2)
) on commit drop;

insert into rehearsal_expected_metrics values
  ('All', 3, 1, 0, 430, 490, null, null, null, 163.33, 10, 5, null, null),
  ('Website', 1, 0, 0, 200, 220, 120, 100, 60, 220, 10, 5, 45, 20.45),
  ('Facebook', 1, 0, 0, 150, 170, 60, 110, 90, 170, 0, 0, 90, 52.94),
  ('WhatsApp', 1, 1, 0, 80, 100, null, null, null, 100, 0, 0, null, null);

create temporary view rehearsal_actual_metrics as
with scopes(scope, sales_channel) as (
  values
    ('All'::text, null::text),
    ('Website'::text, 'Website'::text),
    ('Facebook'::text, 'Facebook'::text),
    ('WhatsApp'::text, 'WhatsApp'::text)
), base as (
  select
    scope.scope,
    order_totals.delivered_order_count,
    order_totals.delivered_orders_missing_cogs,
    order_totals.delivered_orders_missing_fulfillment_costs,
    order_totals.product_revenue,
    order_totals.net_revenue,
    order_totals.cogs,
    order_totals.gross_profit,
    order_totals.contribution_profit,
    case when order_totals.delivered_order_count = 0 then 0
      else pg_catalog.round(
        order_totals.net_revenue / order_totals.delivered_order_count,
        2
      ) end::numeric(14,2) as average_order_value,
    ad_totals.ad_spend,
    expense_totals.expenses
  from scopes as scope
  cross join lateral (
    select
      count(*)::bigint as delivered_order_count,
      count(*) filter (where not financial.cogs_complete)::bigint
        as delivered_orders_missing_cogs,
      count(*) filter (
        where not financial.fulfillment_costs_complete
      )::bigint as delivered_orders_missing_fulfillment_costs,
      coalesce(
        sum(financial.recognized_product_revenue), 0
      )::numeric(14,2) as product_revenue,
      coalesce(sum(financial.net_revenue), 0)::numeric(14,2)
        as net_revenue,
      case when count(*) filter (where not financial.cogs_complete) = 0
        then coalesce(sum(financial.recognized_cogs), 0)::numeric(14,2)
        else null end as cogs,
      case when count(*) filter (where not financial.cogs_complete) = 0
        then coalesce(sum(financial.gross_profit), 0)::numeric(14,2)
        else null end as gross_profit,
      case when count(*) filter (
        where not financial.cogs_complete
          or not financial.fulfillment_costs_complete
      ) = 0
        then coalesce(sum(financial.contribution_profit), 0)::numeric(14,2)
        else null end as contribution_profit
    from public.dashboard_order_financials as financial
    where financial.order_id in (
      select id from rehearsal_ids where name like 'order_%'
    )
      and (
        scope.sales_channel is null
        or pg_catalog.lower(financial.sales_channel)
          = pg_catalog.lower(scope.sales_channel)
      )
  ) as order_totals
  cross join lateral (
    select coalesce(sum(spend.amount), 0)::numeric(14,2) as ad_spend
    from public.daily_ad_spend as spend
    where spend.id = (select id from rehearsal_ids where name = 'ad_spend')
      and (
        scope.sales_channel is null
        or pg_catalog.lower(spend.platform)
          = pg_catalog.lower(scope.sales_channel)
      )
  ) as ad_totals
  cross join lateral (
    select coalesce(sum(expense.amount), 0)::numeric(14,2) as expenses
    from public.expenses as expense
    where expense.id = (select id from rehearsal_ids where name = 'expense')
      and (
        scope.sales_channel is null
        or pg_catalog.lower(expense.sales_channel)
          = pg_catalog.lower(scope.sales_channel)
      )
  ) as expense_totals
)
select
  base.*,
  case when base.contribution_profit is null then null
    else (
      base.contribution_profit - base.ad_spend - base.expenses
    )::numeric(14,2) end as net_profit,
  case when base.contribution_profit is null or base.net_revenue = 0
    then null
    else pg_catalog.round(
      (
        base.contribution_profit - base.ad_spend - base.expenses
      ) / base.net_revenue * 100,
      2
    )::numeric(8,2) end as profit_margin
from base;

do $assert_rehearsal$
declare
  quality record;
begin
  if (
    select count(*) from public.orders
    where id in (select id from rehearsal_ids where name like 'order_%')
  ) <> 5 then
    raise exception 'Fixture coverage failed: expected five orders.';
  end if;

  if (
    select count(distinct payment_method) from public.orders
    where id in (select id from rehearsal_ids where name like 'order_%')
  ) <> 5 then
    raise exception 'Fixture coverage failed: expected five payment methods.';
  end if;

  if (
    select count(*) from public.order_financial_snapshots
    where order_id in (select id from rehearsal_ids where name like 'order_%')
  ) <> 3 then
    raise exception 'Recognition failed: expected three Delivered snapshots.';
  end if;

  if exists (
    select 1
    from public.order_financial_snapshots as snapshot
    join rehearsal_ids as identifier on identifier.id = snapshot.order_id
    where identifier.name in (
      'order_website_pending_cod', 'order_manual_pending_nagad'
    )
  ) then
    raise exception 'Recognition failed: a Pending order was recognized.';
  end if;

  if (
    select count(*)
    from public.order_financial_snapshots
    where order_id in (select id from rehearsal_ids where name like 'order_%')
      and not cogs_complete
  ) <> 1 then
    raise exception 'COGS coverage failed: expected one unknown-COGS snapshot.';
  end if;

  if coalesce((
    select sum(amount_delta)
    from public.order_financial_adjustments
    where order_id = (
      select id from rehearsal_ids
      where name = 'order_website_delivered_bkash'
    )
  ), 0) <> 20 then
    raise exception 'Refund adjustment did not reconcile to 20.00.';
  end if;

  if exists (
    select 1
    from rehearsal_expected_metrics as expected
    full join rehearsal_actual_metrics as actual using (scope)
    where row(
      actual.delivered_order_count,
      actual.delivered_orders_missing_cogs,
      actual.delivered_orders_missing_fulfillment_costs,
      actual.product_revenue,
      actual.net_revenue,
      actual.cogs,
      actual.gross_profit,
      actual.contribution_profit,
      actual.average_order_value,
      actual.ad_spend,
      actual.expenses,
      actual.net_profit,
      actual.profit_margin
    ) is distinct from row(
      expected.delivered_order_count,
      expected.delivered_orders_missing_cogs,
      expected.delivered_orders_missing_fulfillment_costs,
      expected.product_revenue,
      expected.net_revenue,
      expected.cogs,
      expected.gross_profit,
      expected.contribution_profit,
      expected.average_order_value,
      expected.ad_spend,
      expected.expenses,
      expected.net_profit,
      expected.profit_margin
    )
  ) then
    raise exception 'Financial metrics did not match the approved fixture.';
  end if;

  if exists (
    select 1
    from public.products as product
    join rehearsal_ids as identifier on identifier.id = product.id
    where identifier.name like 'product_%'
      and product.stock is distinct from identifier.stock_before
  ) then
    raise exception 'Inventory changed during the rehearsal.';
  end if;

  select * into quality from public.dashboard_data_quality_checks;
  if quality.order_items_with_missing_links <> 0
     or quality.duplicate_order_numbers <> 0
     or quality.products_with_missing_sku <> 0
     or quality.duplicate_product_skus <> 0
     or quality.delivered_orders_without_items <> 0
     or quality.delivered_orders_missing_financial_snapshot <> 0
     or quality.snapshot_product_revenue_mismatches <> 0
     or quality.snapshot_cogs_mismatches <> 0 then
    raise exception 'A dashboard data-quality check failed.';
  end if;
end
$assert_rehearsal$;


with scenario_results as (
  select
    identifier.name as scenario,
    orders.payment_method,
    orders.dashboard_order_status,
    snapshot.order_id is not null as recognized,
    snapshot.cogs_complete
  from rehearsal_ids as identifier
  join public.orders as orders on orders.id = identifier.id
  left join public.order_financial_snapshots as snapshot
    on snapshot.order_id = orders.id
  where identifier.name like 'order_%'
), reconciliation_results as (
  select
    actual.*,
    row(
      actual.delivered_order_count,
      actual.delivered_orders_missing_cogs,
      actual.delivered_orders_missing_fulfillment_costs,
      actual.product_revenue,
      actual.net_revenue,
      actual.cogs,
      actual.gross_profit,
      actual.contribution_profit,
      actual.average_order_value,
      actual.ad_spend,
      actual.expenses,
      actual.net_profit,
      actual.profit_margin
    ) is not distinct from row(
      expected.delivered_order_count,
      expected.delivered_orders_missing_cogs,
      expected.delivered_orders_missing_fulfillment_costs,
      expected.product_revenue,
      expected.net_revenue,
      expected.cogs,
      expected.gross_profit,
      expected.contribution_profit,
      expected.average_order_value,
      expected.ad_spend,
      expected.expenses,
      expected.net_profit,
      expected.profit_margin
    ) as matches_expected
  from rehearsal_actual_metrics as actual
  join rehearsal_expected_metrics as expected using (scope)
), inventory_results as (
  select
    identifier.name as product_scenario,
    product.name as product_name,
    product.stock,
    identifier.stock_before,
    product.stock is not distinct from identifier.stock_before
      as inventory_unchanged
  from public.products as product
  join rehearsal_ids as identifier on identifier.id = product.id
  where identifier.name like 'product_%'
), payment_method_coverage as (
  select
    count(distinct orders.payment_method)::bigint as actual_count,
    5::bigint as expected_count,
    array_agg(
      distinct orders.payment_method order by orders.payment_method
    ) as actual_methods,
    array[
      'bank_transfer', 'bkash', 'cash', 'cod', 'nagad'
    ]::text[] as expected_methods
  from public.orders as orders
  where orders.id in (
    select id from rehearsal_ids where name like 'order_%'
  )
), snapshot_coverage as (
  select
    count(*)::bigint as actual_delivered_snapshot_count,
    3::bigint as expected_delivered_snapshot_count,
    count(*) filter (
      where identifier.name in (
        'order_website_pending_cod', 'order_manual_pending_nagad'
      )
    )::bigint as actual_pending_snapshot_count,
    0::bigint as expected_pending_snapshot_count
  from public.order_financial_snapshots as snapshot
  join rehearsal_ids as identifier on identifier.id = snapshot.order_id
  where identifier.name like 'order_%'
), refund_adjustment_result as (
  select
    coalesce(sum(adjustment.amount_delta), 0)::numeric(14,2)
      as actual_amount,
    20.00::numeric(14,2) as expected_amount
  from public.order_financial_adjustments as adjustment
  where adjustment.order_id = (
    select id from rehearsal_ids
    where name = 'order_website_delivered_bkash'
  )
), data_quality_result as (
  select
    quality.*,
    (
      quality.order_items_with_missing_links = 0
      and quality.duplicate_order_numbers = 0
      and quality.products_with_missing_sku = 0
      and quality.duplicate_product_skus = 0
      and quality.delivered_orders_without_items = 0
      and quality.delivered_orders_missing_financial_snapshot = 0
      and quality.snapshot_product_revenue_mismatches = 0
      and quality.snapshot_cogs_mismatches = 0
    ) as all_zero
  from public.dashboard_data_quality_checks as quality
)
select pg_catalog.jsonb_build_object(
  'scenario_results', (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(scenario)
        order by scenario.scenario
      ),
      '[]'::jsonb
    )
    from scenario_results as scenario
  ),
  'reconciliation_results', (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reconciliation)
        order by case reconciliation.scope
          when 'All' then 1
          when 'Website' then 2
          when 'Facebook' then 3
          when 'WhatsApp' then 4
        end
      ),
      '[]'::jsonb
    )
    from reconciliation_results as reconciliation
  ),
  'inventory_results', (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(inventory)
        order by inventory.product_scenario
      ),
      '[]'::jsonb
    )
    from inventory_results as inventory
  ),
  'payment_method_coverage', (
    select pg_catalog.to_jsonb(coverage)
      || pg_catalog.jsonb_build_object(
        'matches_expected',
        coverage.actual_count = coverage.expected_count
        and coverage.actual_methods = coverage.expected_methods
      )
    from payment_method_coverage as coverage
  ),
  'snapshot_coverage', (
    select pg_catalog.to_jsonb(coverage)
      || pg_catalog.jsonb_build_object(
        'matches_expected',
        coverage.actual_delivered_snapshot_count
          = coverage.expected_delivered_snapshot_count
        and coverage.actual_pending_snapshot_count
          = coverage.expected_pending_snapshot_count
      )
    from snapshot_coverage as coverage
  ),
  'refund_adjustment', (
    select pg_catalog.to_jsonb(refund)
      || pg_catalog.jsonb_build_object(
        'matches_expected',
        refund.actual_amount = refund.expected_amount
      )
    from refund_adjustment_result as refund
  ),
  'data_quality', (
    select pg_catalog.to_jsonb(quality)
    from data_quality_result as quality
  ),
  'rollback_only', true,
  'synthetic_records_persist_after_rollback', false,
  'decrement_product_stock_called', false
) as rehearsal_result;

rollback;

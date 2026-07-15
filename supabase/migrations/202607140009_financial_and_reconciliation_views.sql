-- Financial reporting is recognition-ledger based. Mutable orders and order
-- items are used only by the data-quality view and never as recognized truth.
create or replace view public.dashboard_order_financials
with (security_invoker = true)
as
with refund_adjustments as (
  select
    adjustment.order_id,
    coalesce(sum(adjustment.amount_delta), 0)::numeric(14,2)
      as refund_amount_delta
  from public.order_financial_adjustments as adjustment
  where adjustment.adjustment_type = 'refund'
  group by adjustment.order_id
), recognized as (
  select
    snapshot.order_id,
    snapshot.order_number_snapshot as order_number,
    snapshot.order_date,
    snapshot.sales_channel,
    snapshot.campaign_id,
    snapshot.campaign_name_snapshot,
    snapshot.payment_method,
    snapshot.settlement_status,
    snapshot.recognized_at,
    snapshot.recognition_source,
    snapshot.product_revenue,
    snapshot.delivery_revenue,
    snapshot.discount_amount,
    (
      snapshot.refund_amount
      + coalesce(adjustment.refund_amount_delta, 0)
    )::numeric(14,2) as refund_amount,
    snapshot.cogs,
    snapshot.cogs_complete,
    snapshot.courier_cost,
    snapshot.packaging_cost,
    (
      snapshot.courier_cost is not null
      and snapshot.packaging_cost is not null
    ) as fulfillment_costs_complete
  from public.order_financial_snapshots as snapshot
  left join refund_adjustments as adjustment
    on adjustment.order_id = snapshot.order_id
  where snapshot.recognition_status = 'Delivered'
)
select
  order_id,
  order_number,
  order_date,
  sales_channel,
  campaign_id,
  campaign_name_snapshot,
  payment_method,
  settlement_status,
  recognized_at,
  recognition_source,
  true as is_delivered,
  cogs_complete,
  fulfillment_costs_complete,
  product_revenue::numeric(14,2) as recognized_product_revenue,
  delivery_revenue::numeric(14,2) as recognized_delivery_revenue,
  discount_amount::numeric(14,2) as recognized_discount_amount,
  refund_amount::numeric(14,2) as recognized_refund_amount,
  (
    product_revenue + delivery_revenue - discount_amount - refund_amount
  )::numeric(14,2) as net_revenue,
  case when cogs_complete then cogs else null end::numeric(14,2)
    as recognized_cogs,
  case when cogs_complete then
    product_revenue + delivery_revenue - discount_amount
      - refund_amount - cogs
  else null end::numeric(14,2) as gross_profit,
  case when cogs_complete and fulfillment_costs_complete then
    product_revenue + delivery_revenue - discount_amount
      - refund_amount - cogs - courier_cost - packaging_cost
  else null end::numeric(14,2) as contribution_profit
from recognized;

create or replace view public.dashboard_reconciliation
with (security_invoker = true)
as
with recognized as (
  select * from public.dashboard_order_financials
), order_totals as (
  select
    count(*)::bigint as delivered_order_count,
    count(*) filter (where not cogs_complete)::bigint
      as delivered_orders_missing_cogs,
    count(*) filter (where not fulfillment_costs_complete)::bigint
      as delivered_orders_missing_fulfillment_costs,
    coalesce(sum(recognized_product_revenue), 0)::numeric(14,2)
      as product_revenue,
    coalesce(sum(net_revenue), 0)::numeric(14,2) as net_revenue,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(recognized_cogs), 0)::numeric(14,2)
      else null end as cogs,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(gross_profit), 0)::numeric(14,2)
      else null end as gross_profit,
    case when count(*) filter (
      where not cogs_complete or not fulfillment_costs_complete
    ) = 0
      then coalesce(sum(contribution_profit), 0)::numeric(14,2)
      else null end as contribution_profit
  from recognized
), ad_totals as (
  select coalesce(sum(amount), 0)::numeric(14,2) as ad_spend
  from public.daily_ad_spend
), expense_totals as (
  select coalesce(sum(amount), 0)::numeric(14,2) as expenses
  from public.expenses
)
select
  orders.delivered_order_count,
  orders.delivered_orders_missing_cogs,
  orders.delivered_orders_missing_fulfillment_costs,
  orders.product_revenue,
  orders.net_revenue,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
    then coalesce(orders.cogs, 0)::numeric(14,2)
    else null end as cogs,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
    then coalesce(orders.gross_profit, 0)::numeric(14,2)
    else null end as gross_profit,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
      and coalesce(
        orders.delivered_orders_missing_fulfillment_costs,
        0
      ) = 0
    then coalesce(orders.contribution_profit, 0)::numeric(14,2)
    else null end as contribution_profit,
  case when orders.delivered_order_count = 0 then 0
    else round(
      orders.net_revenue / orders.delivered_order_count,
      2
    ) end::numeric(14,2) as average_order_value,
  ads.ad_spend,
  expenses.expenses,
  case when orders.contribution_profit is null then null
    else (
      orders.contribution_profit - ads.ad_spend - expenses.expenses
    )::numeric(14,2) end as net_profit,
  case
    when orders.contribution_profit is null or orders.net_revenue = 0
      then null
    else round(
      (
        orders.contribution_profit - ads.ad_spend - expenses.expenses
      ) / orders.net_revenue * 100,
      2
    )
  end::numeric(8,2) as profit_margin
from order_totals as orders
cross join ad_totals as ads
cross join expense_totals as expenses;

create or replace view public.dashboard_daily_financials
with (security_invoker = true)
as
with orders_by_day as (
  select
    order_date as business_date,
    count(*)::bigint as delivered_order_count,
    count(*) filter (where not cogs_complete)::bigint
      as delivered_orders_missing_cogs,
    count(*) filter (where not fulfillment_costs_complete)::bigint
      as delivered_orders_missing_fulfillment_costs,
    coalesce(sum(recognized_product_revenue), 0)::numeric(14,2)
      as product_revenue,
    coalesce(sum(net_revenue), 0)::numeric(14,2) as net_revenue,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(recognized_cogs), 0)::numeric(14,2)
      else null end as cogs,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(gross_profit), 0)::numeric(14,2)
      else null end as gross_profit,
    case when count(*) filter (
      where not cogs_complete or not fulfillment_costs_complete
    ) = 0
      then coalesce(sum(contribution_profit), 0)::numeric(14,2)
      else null end as contribution_profit
  from public.dashboard_order_financials
  group by order_date
), expenses_by_day as (
  select
    expense_date as business_date,
    sum(amount)::numeric(14,2) as expenses
  from public.expenses
  group by expense_date
), ads_by_day as (
  select
    spend_date as business_date,
    sum(amount)::numeric(14,2) as ad_spend
  from public.daily_ad_spend
  group by spend_date
), business_dates as (
  select business_date from orders_by_day
  union
  select business_date from expenses_by_day
  union
  select business_date from ads_by_day
)
select
  dates.business_date,
  coalesce(orders.delivered_order_count, 0)::bigint
    as delivered_order_count,
  coalesce(orders.delivered_orders_missing_cogs, 0)::bigint
    as delivered_orders_missing_cogs,
  coalesce(
    orders.delivered_orders_missing_fulfillment_costs,
    0
  )::bigint as delivered_orders_missing_fulfillment_costs,
  coalesce(orders.product_revenue, 0)::numeric(14,2)
    as product_revenue,
  coalesce(orders.net_revenue, 0)::numeric(14,2) as net_revenue,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
    then coalesce(orders.cogs, 0)::numeric(14,2)
    else null end as cogs,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
    then coalesce(orders.gross_profit, 0)::numeric(14,2)
    else null end as gross_profit,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
      and coalesce(
        orders.delivered_orders_missing_fulfillment_costs,
        0
      ) = 0
    then coalesce(orders.contribution_profit, 0)::numeric(14,2)
    else null end as contribution_profit,
  case when coalesce(orders.delivered_order_count, 0) = 0 then 0
    else round(
      orders.net_revenue / orders.delivered_order_count,
      2
    ) end::numeric(14,2) as average_order_value,
  coalesce(expenses.expenses, 0)::numeric(14,2) as expenses,
  coalesce(ads.ad_spend, 0)::numeric(14,2) as ad_spend,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) > 0
      or coalesce(
        orders.delivered_orders_missing_fulfillment_costs,
        0
      ) > 0 then null
    else (
      coalesce(orders.contribution_profit, 0)
      - coalesce(expenses.expenses, 0)
      - coalesce(ads.ad_spend, 0)
    )::numeric(14,2) end as net_profit,
  case
    when coalesce(orders.delivered_orders_missing_cogs, 0) > 0
      or coalesce(
        orders.delivered_orders_missing_fulfillment_costs,
        0
      ) > 0
      or coalesce(orders.net_revenue, 0) = 0 then null
    else round(
      (
        coalesce(orders.contribution_profit, 0)
        - coalesce(expenses.expenses, 0)
        - coalesce(ads.ad_spend, 0)
      ) / orders.net_revenue * 100,
      2
    )
  end::numeric(8,2) as profit_margin
from business_dates as dates
left join orders_by_day as orders using (business_date)
left join expenses_by_day as expenses using (business_date)
left join ads_by_day as ads using (business_date);

-- This view is operational validation only. It intentionally reads mutable
-- shared tables and must never be used as a financial reporting source.
create or replace view public.dashboard_data_quality_checks
with (security_invoker = true)
as
select
  (
    select count(*) from public.order_items
    where order_id is null or product_id is null
  )::bigint as order_items_with_missing_links,
  (
    select count(*) from (
      select order_number from public.orders
      group by order_number having count(*) > 1
    ) as duplicates
  )::bigint as duplicate_order_numbers,
  (
    select count(*) from public.products
    where sku is null or btrim(sku) = ''
  )::bigint as products_with_missing_sku,
  (
    select count(*) from (
      select lower(btrim(sku)) from public.products
      where sku is not null and btrim(sku) <> ''
      group by lower(btrim(sku)) having count(*) > 1
    ) as duplicates
  )::bigint as duplicate_product_skus,
  (
    select count(*) from public.orders as orders
    where orders.dashboard_order_status = 'Delivered'
      and not exists (
        select 1 from public.order_items as item
        where item.order_id = orders.id
      )
  )::bigint as delivered_orders_without_items,
  (
    select count(*) from public.orders as orders
    where orders.dashboard_order_status = 'Delivered'
      and exists (
        select 1 from public.order_items as item
        where item.order_id = orders.id
      )
      and not exists (
        select 1 from public.order_financial_snapshots as snapshot
        where snapshot.order_id = orders.id
      )
  )::bigint as delivered_orders_missing_financial_snapshot,
  (
    select count(*)
    from public.order_financial_snapshots as snapshot
    where snapshot.product_revenue is distinct from (
      select coalesce(sum(
        item.quantity * coalesce(
          item.actual_unit_selling_price,
          item.unit_price
        )
      ), 0)::numeric(14,2)
      from public.order_items as item
      where item.order_id = snapshot.order_id
    )
  )::bigint as snapshot_product_revenue_mismatches,
  (
    select count(*)
    from public.order_financial_snapshots as snapshot
    where snapshot.cogs_complete
      and snapshot.cogs is distinct from (
        select sum(item.quantity * item.buying_cost_snapshot)::numeric(14,2)
        from public.order_items as item
        where item.order_id = snapshot.order_id
      )
  )::bigint as snapshot_cogs_mismatches;

create or replace function public.get_dashboard_financial_summary(
  p_start_date date default null,
  p_end_date date default null,
  p_sales_channel text default null,
  p_campaign_id uuid default null
)
returns table (
  delivered_order_count bigint,
  delivered_orders_missing_cogs bigint,
  delivered_orders_missing_fulfillment_costs bigint,
  product_revenue numeric(14,2),
  net_revenue numeric(14,2),
  cogs numeric(14,2),
  gross_profit numeric(14,2),
  contribution_profit numeric(14,2),
  average_order_value numeric(14,2),
  ad_spend numeric(14,2),
  expenses numeric(14,2),
  net_profit numeric(14,2),
  profit_margin numeric(8,2)
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(
    array[
      'owner'::public.dashboard_role,
      'admin'::public.dashboard_role,
      'viewer'::public.dashboard_role
    ]
  ) then
    raise exception 'Dashboard reporting access is required.'
      using errcode = '42501';
  end if;

  if p_start_date is not null and p_end_date is not null
     and p_start_date > p_end_date then
    raise exception 'Start date must not be after end date.'
      using errcode = '22023';
  end if;

  return query
  with filtered_orders as (
    select financial.*
    from public.dashboard_order_financials as financial
    where (p_start_date is null or financial.order_date >= p_start_date)
      and (p_end_date is null or financial.order_date <= p_end_date)
      and (
        p_sales_channel is null
        or lower(financial.sales_channel) = lower(p_sales_channel)
      )
      and (p_campaign_id is null or financial.campaign_id = p_campaign_id)
  ), order_totals as (
    select
      count(*)::bigint as delivered_order_count,
      count(*) filter (where not financial.cogs_complete)::bigint
        as delivered_orders_missing_cogs,
      count(*) filter (
        where not financial.fulfillment_costs_complete
      )::bigint
        as delivered_orders_missing_fulfillment_costs,
      coalesce(
        sum(financial.recognized_product_revenue),
        0
      )::numeric(14,2)
        as product_revenue,
      coalesce(sum(financial.net_revenue), 0)::numeric(14,2)
        as net_revenue,
      case when count(*) filter (
        where not financial.cogs_complete
      ) = 0
        then coalesce(
          sum(financial.recognized_cogs),
          0
        )::numeric(14,2)
        else null end as cogs,
      case when count(*) filter (
        where not financial.cogs_complete
      ) = 0
        then coalesce(sum(financial.gross_profit), 0)::numeric(14,2)
        else null end as gross_profit,
      case when count(*) filter (
        where not financial.cogs_complete
          or not financial.fulfillment_costs_complete
      ) = 0
        then coalesce(
          sum(financial.contribution_profit),
          0
        )::numeric(14,2)
        else null end as contribution_profit
    from filtered_orders as financial
  ), ad_totals as (
    select coalesce(sum(spend.amount), 0)::numeric(14,2) as ad_spend
    from public.daily_ad_spend as spend
    where (p_start_date is null or spend.spend_date >= p_start_date)
      and (p_end_date is null or spend.spend_date <= p_end_date)
      and (
        p_sales_channel is null
        or lower(spend.platform) = lower(p_sales_channel)
      )
      and (p_campaign_id is null or spend.campaign_id = p_campaign_id)
  ), expense_totals as (
    select coalesce(sum(expense.amount), 0)::numeric(14,2) as expenses
    from public.expenses as expense
    where (p_start_date is null or expense.expense_date >= p_start_date)
      and (p_end_date is null or expense.expense_date <= p_end_date)
      and (
        p_sales_channel is null
        or lower(expense.sales_channel) = lower(p_sales_channel)
      )
      and (p_campaign_id is null or expense.campaign_id = p_campaign_id)
  )
  select
    orders.delivered_order_count,
    orders.delivered_orders_missing_cogs,
    orders.delivered_orders_missing_fulfillment_costs,
    orders.product_revenue,
    orders.net_revenue,
    orders.cogs,
    orders.gross_profit,
    orders.contribution_profit,
    case when orders.delivered_order_count = 0 then 0
      else round(
        orders.net_revenue / orders.delivered_order_count,
        2
      ) end::numeric(14,2),
    ads.ad_spend,
    expenses.expenses,
    case when orders.contribution_profit is null then null
      else (
        orders.contribution_profit - ads.ad_spend - expenses.expenses
      )::numeric(14,2) end,
    case
      when orders.contribution_profit is null or orders.net_revenue = 0
        then null
      else round(
        (
          orders.contribution_profit - ads.ad_spend - expenses.expenses
        ) / orders.net_revenue * 100,
        2
      )
    end::numeric(8,2)
  from order_totals as orders
  cross join ad_totals as ads
  cross join expense_totals as expenses;
end
$function$;

revoke all on table public.dashboard_order_financials,
  public.dashboard_reconciliation, public.dashboard_daily_financials,
  public.dashboard_data_quality_checks
from public, anon;

grant select on table public.dashboard_order_financials,
  public.dashboard_reconciliation, public.dashboard_daily_financials,
  public.dashboard_data_quality_checks
to authenticated;

revoke all on function public.get_dashboard_financial_summary(
  date, date, text, uuid
) from public, anon;
grant execute on function public.get_dashboard_financial_summary(
  date, date, text, uuid
) to authenticated, service_role;

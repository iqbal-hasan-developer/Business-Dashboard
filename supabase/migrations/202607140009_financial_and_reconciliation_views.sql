create or replace view public.dashboard_order_financials
with (security_invoker = true)
as
with item_totals as (
  select
    item.order_id,
    count(*) as item_count,
    sum(item.quantity * coalesce(item.actual_unit_selling_price, item.unit_price))::numeric(12,2) as product_subtotal,
    bool_and(item.buying_cost_snapshot is not null) as cogs_complete,
    sum(item.quantity * item.buying_cost_snapshot)::numeric(12,2) as item_cogs
  from public.order_items item
  group by item.order_id
), calculated as (
  select
    orders.id as order_id,
    orders.order_number,
    orders.order_date,
    orders.sales_channel,
    orders.campaign_id,
    orders.dashboard_order_status,
    coalesce(items.item_count, 0) as item_count,
    coalesce(items.product_subtotal, 0)::numeric(12,2) as product_subtotal,
    coalesce(items.cogs_complete, false) as cogs_complete,
    items.item_cogs,
    orders.delivery_charge::numeric(12,2) as delivery_charged,
    orders.discount_amount,
    orders.refund_amount,
    coalesce(orders.courier_cost_snapshot, 0)::numeric(12,2) as courier_cost,
    orders.packaging_cost_snapshot,
    coalesce(orders.dashboard_order_status = 'Delivered', lower(orders.order_status) = 'delivered') as is_delivered
  from public.orders orders
  left join item_totals items on items.order_id = orders.id
)
select
  order_id, order_number, order_date, sales_channel, campaign_id, dashboard_order_status,
  item_count, cogs_complete, is_delivered,
  case when is_delivered then product_subtotal else 0 end::numeric(12,2) as recognized_product_revenue,
  case when is_delivered then greatest(product_subtotal + delivery_charged - discount_amount - refund_amount, 0) else 0 end::numeric(12,2) as net_revenue,
  case when is_delivered and cogs_complete then item_cogs when not is_delivered then 0 else null end::numeric(12,2) as recognized_cogs,
  case when is_delivered and cogs_complete then greatest(product_subtotal + delivery_charged - discount_amount - refund_amount, 0) - item_cogs when not is_delivered then 0 else null end::numeric(12,2) as gross_profit,
  case when is_delivered and cogs_complete then greatest(product_subtotal + delivery_charged - discount_amount - refund_amount, 0) - item_cogs - courier_cost - packaging_cost when not is_delivered then 0 else null end::numeric(12,2) as contribution_profit
from calculated;

create or replace view public.dashboard_reconciliation
with (security_invoker = true)
as
select
  count(*) filter (where is_delivered) as delivered_order_count,
  count(*) filter (where is_delivered and not cogs_complete) as delivered_orders_missing_cogs,
  coalesce(sum(recognized_product_revenue), 0)::numeric(14,2) as product_revenue,
  coalesce(sum(net_revenue), 0)::numeric(14,2) as net_revenue,
  case when count(*) filter (where is_delivered and not cogs_complete) = 0
    then coalesce(sum(recognized_cogs), 0)::numeric(14,2) else null end as cogs,
  case when count(*) filter (where is_delivered and not cogs_complete) = 0
    then coalesce(sum(gross_profit), 0)::numeric(14,2) else null end as gross_profit
from public.dashboard_order_financials;

create or replace view public.dashboard_daily_financials
with (security_invoker = true)
as
with orders_by_day as (
  select order_date as business_date,
    sum(recognized_product_revenue)::numeric(14,2) as product_revenue,
    sum(net_revenue)::numeric(14,2) as net_revenue,
    case when count(*) filter (where is_delivered and not cogs_complete) = 0
      then sum(recognized_cogs)::numeric(14,2) else null end as cogs,
    case when count(*) filter (where is_delivered and not cogs_complete) = 0
      then sum(contribution_profit)::numeric(14,2) else null end as contribution_profit
  from public.dashboard_order_financials group by order_date
), expenses_by_day as (
  select expense_date as business_date, sum(amount)::numeric(14,2) as expenses
  from public.expenses group by expense_date
), ads_by_day as (
  select spend_date as business_date, sum(amount)::numeric(14,2) as ad_spend
  from public.daily_ad_spend group by spend_date
), dates as (
  select business_date from orders_by_day union select business_date from expenses_by_day union select business_date from ads_by_day
)
select dates.business_date,
  coalesce(orders.product_revenue, 0)::numeric(14,2) as product_revenue,
  coalesce(orders.net_revenue, 0)::numeric(14,2) as net_revenue,
  orders.cogs,
  orders.contribution_profit,
  coalesce(expenses.expenses, 0)::numeric(14,2) as expenses,
  coalesce(ads.ad_spend, 0)::numeric(14,2) as ad_spend
from dates
left join orders_by_day orders using (business_date)
left join expenses_by_day expenses using (business_date)
left join ads_by_day ads using (business_date);

revoke all on public.dashboard_order_financials, public.dashboard_reconciliation, public.dashboard_daily_financials from anon;
grant select on public.dashboard_order_financials, public.dashboard_reconciliation, public.dashboard_daily_financials to authenticated;

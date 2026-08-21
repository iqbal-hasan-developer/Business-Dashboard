begin;

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
  if not public.dashboard_has_any_role(array[
    'owner', 'admin', 'viewer'
  ]::public.dashboard_role[]) then
    raise exception 'Dashboard reporting access is required.' using errcode = '42501';
  end if;
  if p_start_date is not null and p_end_date is not null
     and p_start_date > p_end_date then
    raise exception 'Start date must not be after end date.' using errcode = '22023';
  end if;

  return query
  with filtered_orders as (
    select financial.*
    from public.dashboard_order_financials as financial
    where (p_start_date is null or financial.order_date >= p_start_date)
      and (p_end_date is null or financial.order_date <= p_end_date)
      and (p_sales_channel is null
        or lower(financial.sales_channel) = lower(p_sales_channel))
      and (p_campaign_id is null or financial.campaign_id = p_campaign_id)
  ), orders as (
    select
      count(*)::bigint as delivered_order_count,
      count(*) filter (where not filtered.cogs_complete)::bigint as missing_cogs,
      count(*) filter (where not filtered.fulfillment_costs_complete)::bigint as missing_fulfillment,
      coalesce(sum(filtered.recognized_product_revenue), 0)::numeric(14,2) as product_revenue,
      coalesce(sum(filtered.net_revenue), 0)::numeric(14,2) as net_revenue,
      case when count(*) filter (where not filtered.cogs_complete) = 0
        then coalesce(sum(filtered.recognized_cogs), 0)::numeric(14,2) end as cogs,
      case when count(*) filter (where not filtered.cogs_complete) = 0
        then coalesce(sum(filtered.gross_profit), 0)::numeric(14,2) end as gross_profit,
      case when count(*) filter (
        where not filtered.cogs_complete or not filtered.fulfillment_costs_complete
      ) = 0 then coalesce(sum(filtered.contribution_profit), 0)::numeric(14,2)
        end as contribution_profit
    from filtered_orders as filtered
  ), ads as (
    select coalesce(sum(spend.amount), 0)::numeric(14,2) as ad_spend
    from public.daily_ad_spend as spend
    where (p_start_date is null or spend.spend_date >= p_start_date)
      and (p_end_date is null or spend.spend_date <= p_end_date)
      and (p_sales_channel is null or lower(spend.platform) = lower(p_sales_channel))
      and (p_campaign_id is null or spend.campaign_id = p_campaign_id)
  ), operating as (
    select coalesce(sum(expense.amount), 0)::numeric(14,2) as expenses
    from public.expenses as expense
    where expense.accounting_class = 'operating_expense'
      and (p_start_date is null or expense.expense_date >= p_start_date)
      and (p_end_date is null or expense.expense_date <= p_end_date)
      and (p_sales_channel is null
        or lower(expense.sales_channel) = lower(p_sales_channel))
      and (p_campaign_id is null or expense.campaign_id = p_campaign_id)
  )
  select
    orders.delivered_order_count,
    orders.missing_cogs,
    orders.missing_fulfillment,
    orders.product_revenue,
    orders.net_revenue,
    orders.cogs,
    orders.gross_profit,
    orders.contribution_profit,
    case when orders.delivered_order_count = 0 then 0 else round(
      orders.net_revenue / orders.delivered_order_count, 2
    ) end::numeric(14,2),
    ads.ad_spend,
    operating.expenses,
    case when orders.contribution_profit is null then null else
      (orders.contribution_profit - ads.ad_spend - operating.expenses)::numeric(14,2)
    end,
    case when orders.contribution_profit is null or orders.net_revenue = 0
      then null else round(
        (orders.contribution_profit - ads.ad_spend - operating.expenses)
          / orders.net_revenue * 100, 2
      ) end::numeric(8,2)
  from orders cross join ads cross join operating;
end
$function$;

revoke all on function public.get_dashboard_financial_summary(date, date, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_dashboard_financial_summary(date, date, text, uuid)
to authenticated, service_role;

commit;

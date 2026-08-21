begin;

-- Expose the immutable Delivered courier and packaging snapshots alongside
-- recognized COGS so the dashboard can render a complete, non-duplicated cost
-- breakdown without reading mutable order defaults or procurement cash outflow.

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
), return_cogs as (
  select
    movement.order_id,
    count(*) filter (
      where movement.cogs_reversal_poisha is null
    )::bigint as missing_cogs_reversal_count,
    coalesce(sum(movement.cogs_reversal_poisha), 0)::bigint
      as cogs_reversal_poisha
  from public.inventory_restoration_movements as movement
  group by movement.order_id
), recognized as (
  select
    snapshot.*,
    (
      snapshot.refund_amount
      + coalesce(refund.refund_amount_delta, 0)
    )::numeric(14,2) as adjusted_refund_amount,
    snapshot.cogs_complete
      and coalesce(returned.missing_cogs_reversal_count, 0) = 0
      as adjusted_cogs_complete,
    case when snapshot.cogs_complete
        and coalesce(returned.missing_cogs_reversal_count, 0) = 0
      then snapshot.cogs - public.dashboard_poisha_to_money(
        coalesce(returned.cogs_reversal_poisha, 0)
      )
      else null
    end::numeric(14,2) as adjusted_cogs
  from public.order_financial_snapshots as snapshot
  left join refund_adjustments as refund on refund.order_id = snapshot.order_id
  left join return_cogs as returned on returned.order_id = snapshot.order_id
  where snapshot.recognition_status = 'Delivered'
)
select
  order_id,
  order_number_snapshot as order_number,
  order_date,
  sales_channel,
  campaign_id,
  campaign_name_snapshot,
  payment_method,
  settlement_status,
  recognized_at,
  recognition_source,
  true as is_delivered,
  adjusted_cogs_complete as cogs_complete,
  (courier_cost is not null and packaging_cost is not null)
    as fulfillment_costs_complete,
  product_revenue::numeric(14,2) as recognized_product_revenue,
  delivery_revenue::numeric(14,2) as recognized_delivery_revenue,
  discount_amount::numeric(14,2) as recognized_discount_amount,
  adjusted_refund_amount::numeric(14,2) as recognized_refund_amount,
  (
    product_revenue + delivery_revenue
      - discount_amount - adjusted_refund_amount
  )::numeric(14,2) as net_revenue,
  adjusted_cogs::numeric(14,2) as recognized_cogs,
  case when adjusted_cogs_complete then
    product_revenue + delivery_revenue - discount_amount
      - adjusted_refund_amount - adjusted_cogs
  else null end::numeric(14,2) as gross_profit,
  case when adjusted_cogs_complete
      and courier_cost is not null and packaging_cost is not null then
    product_revenue + delivery_revenue - discount_amount
      - adjusted_refund_amount - adjusted_cogs
      - courier_cost - packaging_cost
  else null end::numeric(14,2) as contribution_profit,
  courier_cost::numeric(14,2) as recognized_courier_cost,
  packaging_cost::numeric(14,2) as recognized_packaging_cost
from recognized;

comment on column public.dashboard_order_financials.recognized_courier_cost is
  'Immutable courier or transportation cost recognized with the Delivered order.';
comment on column public.dashboard_order_financials.recognized_packaging_cost is
  'Immutable packaging cost recognized with the Delivered order.';

commit;

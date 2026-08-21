begin;

-- A control observation must be compared with order-derived receivables as of
-- the same business date. Later orders remain visible as current/post-control
-- receivables instead of distorting the historical control residual.

create or replace view public.dashboard_steadfast_receivable_reconciliation
with (security_invoker = true)
as
with latest_observation as (
  select actual_receivable,observed_on,reason
  from public.steadfast_receivable_observations
  order by observed_on desc,created_at desc
  limit 1
), calculated as (
  select
    coalesce(sum(component.active_collectible_receivable) filter (
      where observation.observed_on is null or component.order_date<=observation.observed_on
    ),0)::numeric(14,2) as calculated_receivable,
    coalesce(sum(component.gross_cod_receivable) filter (
      where observation.observed_on is null or component.order_date<=observation.observed_on
    ),0)::numeric(14,2) as gross_eligible_receivable,
    coalesce(sum(component.gross_cod_receivable) filter (
      where component.excluded_reversed_batch
        and (observation.observed_on is null or component.order_date<=observation.observed_on)
    ),0)::numeric(14,2) as reversed_batch_receivable,
    coalesce(sum(component.active_collectible_receivable),0)::numeric(14,2)
      as current_calculated_receivable,
    coalesce(sum(component.gross_cod_receivable),0)::numeric(14,2)
      as current_gross_eligible_receivable,
    coalesce(sum(component.active_collectible_receivable) filter (
      where observation.observed_on is not null and component.order_date>observation.observed_on
    ),0)::numeric(14,2) as post_observation_receivable
  from public.dashboard_steadfast_receivable_components component
  cross join latest_observation observation
)
select
  calculated.calculated_receivable,
  observation.actual_receivable,
  case when observation.actual_receivable is null then null
    else (observation.actual_receivable-calculated.calculated_receivable)::numeric(14,2) end
    as difference,
  observation.observed_on,
  observation.reason as observation_reason,
  calculated.gross_eligible_receivable,
  calculated.reversed_batch_receivable,
  calculated.current_calculated_receivable,
  calculated.current_gross_eligible_receivable,
  calculated.post_observation_receivable
from calculated
cross join latest_observation observation;

commit;

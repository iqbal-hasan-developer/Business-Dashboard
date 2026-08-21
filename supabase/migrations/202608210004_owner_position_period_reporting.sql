begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- One period-reporting source combines the active legacy classifications with
-- normalized owner-money-taken events. Legacy owner-held receipts use their
-- original receipt date as the effective money-taken date. Capital returned
-- from those funds is allocated capital-first across those receipts so every
-- daily row always satisfies amount taken = capital return + Due created.
create or replace view public.dashboard_owner_position_daily
with (security_invoker = true)
as
with active_unified as (
  select
    event.owner_label,
    event.event_date,
    event.amount::numeric(14,2) as owner_money_taken_in_period,
    event.capital_return_amount::numeric(14,2) as capital_return_in_period,
    event.excess_due_amount::numeric(14,2) as excess_due_in_period
  from public.dashboard_owner_money_taken_history event
  where event.event_type = 'taken'
    and not event.is_reversed
), legacy_owner_held_capital as (
  select
    capital.owner_label,
    coalesce(sum(capital.amount), 0)::numeric(14,2) as amount
  from public.dashboard_owner_capital_returns capital
  where capital.event_type = 'return'
    and not capital.is_reversed
    and capital.settlement_treatment = 'owner_held_business_funds'
    and not exists (
      select 1
      from public.owner_money_taken_events unified
      where unified.capital_return_id = capital.id
    )
  group by capital.owner_label
), legacy_receipts as (
  select
    held.id,
    held.owner_label,
    held.event_date,
    held.amount::numeric(14,2) as amount,
    coalesce(
      sum(held.amount) over (
        partition by held.owner_label
        order by held.event_date, held.created_at, held.id
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::numeric(14,2) as prior_receipts
  from public.dashboard_owner_held_funds held
  where held.event_type = 'receipt'
    and not held.is_reversed
    and not exists (
      select 1
      from public.owner_money_taken_events unified
      where unified.owner_held_event_id = held.id
    )
), classified_legacy_receipts as (
  select
    receipt.owner_label,
    receipt.event_date,
    receipt.amount::numeric(14,2) as owner_money_taken_in_period,
    least(
      receipt.amount,
      greatest(coalesce(capital.amount, 0) - receipt.prior_receipts, 0)
    )::numeric(14,2) as capital_return_in_period,
    (
      receipt.amount - least(
        receipt.amount,
        greatest(coalesce(capital.amount, 0) - receipt.prior_receipts, 0)
      )
    )::numeric(14,2) as excess_due_in_period
  from legacy_receipts receipt
  left join legacy_owner_held_capital capital using (owner_label)
), active_legacy_business_account_returns as (
  select
    capital.owner_label,
    capital.event_date,
    capital.amount::numeric(14,2) as owner_money_taken_in_period,
    capital.amount::numeric(14,2) as capital_return_in_period,
    0::numeric(14,2) as excess_due_in_period
  from public.dashboard_owner_capital_returns capital
  where capital.event_type = 'return'
    and not capital.is_reversed
    and capital.settlement_treatment = 'business_account'
    and not exists (
      select 1
      from public.owner_money_taken_events unified
      where unified.capital_return_id = capital.id
    )
), active_classifications as (
  select * from active_unified
  union all
  select * from classified_legacy_receipts
  union all
  select * from active_legacy_business_account_returns
)
select
  classification.owner_label,
  classification.event_date,
  sum(classification.owner_money_taken_in_period)::numeric(14,2)
    as owner_money_taken_in_period,
  sum(classification.capital_return_in_period)::numeric(14,2)
    as capital_return_in_period,
  sum(classification.excess_due_in_period)::numeric(14,2)
    as excess_due_in_period
from active_classifications classification
group by classification.owner_label, classification.event_date;

comment on view public.dashboard_owner_position_daily is
  'Authoritative active owner-money-taken classifications by effective date, combining legacy owner-held receipts and direct capital returns with normalized workflow events without reversal or linked-effect duplication.';

revoke all on table public.dashboard_owner_position_daily from public, anon;
grant select on table public.dashboard_owner_position_daily to authenticated;

commit;

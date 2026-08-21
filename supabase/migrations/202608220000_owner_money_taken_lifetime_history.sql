begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Row-level companion to dashboard_owner_position_daily. It uses the same
-- active legacy classification and linked-effect deduplication rules, while
-- retaining unified workflow audit rows so the UI can show reversal status.
create or replace view public.dashboard_owner_money_taken_lifetime_history
with (security_invoker = true)
as
with unified_audit as (
  select
    event.id,
    event.event_date,
    event.owner_label,
    event.event_type,
    event.amount::numeric(14,2) as amount,
    event.capital_return_amount::numeric(14,2) as capital_return_amount,
    event.excess_due_amount::numeric(14,2) as excess_due_amount,
    event.source_account_key,
    event.source_account_label,
    event.cash_movement_id,
    event.capital_return_id,
    event.owner_held_event_id,
    event.reversal_of_id,
    event.is_reversed,
    event.description,
    event.reference,
    event.created_at,
    'unified'::text as record_source,
    (event.event_type = 'taken' and not event.is_reversed) as can_reverse
  from public.dashboard_owner_money_taken_history event
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
    held.cash_movement_id,
    held.reason,
    held.created_at,
    ledger.account_key,
    ledger.account_label,
    ledger.reference,
    coalesce(
      sum(held.amount) over (
        partition by held.owner_label
        order by held.event_date, held.created_at, held.id
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::numeric(14,2) as prior_receipts
  from public.dashboard_owner_held_funds held
  left join public.dashboard_cash_ledger ledger
    on ledger.id = held.cash_movement_id
  where held.event_type = 'receipt'
    and not held.is_reversed
    and not exists (
      select 1
      from public.owner_money_taken_events unified
      where unified.owner_held_event_id = held.id
    )
), classified_legacy_receipts as (
  select
    receipt.id,
    receipt.event_date,
    receipt.owner_label,
    'taken'::text as event_type,
    receipt.amount,
    least(
      receipt.amount,
      greatest(coalesce(capital.amount, 0) - receipt.prior_receipts, 0)
    )::numeric(14,2) as capital_return_amount,
    (
      receipt.amount - least(
        receipt.amount,
        greatest(coalesce(capital.amount, 0) - receipt.prior_receipts, 0)
      )
    )::numeric(14,2) as excess_due_amount,
    coalesce(receipt.account_key, 'owner_held')::text as source_account_key,
    coalesce(receipt.account_label, 'Owner-held business funds')::text
      as source_account_label,
    receipt.cash_movement_id,
    null::uuid as capital_return_id,
    receipt.id as owner_held_event_id,
    null::uuid as reversal_of_id,
    false as is_reversed,
    coalesce(receipt.reason, 'Legacy owner-held business funds')::text as description,
    receipt.reference,
    receipt.created_at,
    'legacy_owner_held'::text as record_source,
    false as can_reverse
  from legacy_receipts receipt
  left join legacy_owner_held_capital capital using (owner_label)
), active_legacy_business_account_returns as (
  select
    capital.id,
    capital.event_date,
    capital.owner_label,
    'taken'::text as event_type,
    capital.amount::numeric(14,2) as amount,
    capital.amount::numeric(14,2) as capital_return_amount,
    0::numeric(14,2) as excess_due_amount,
    'business_account'::text as source_account_key,
    'Business account'::text as source_account_label,
    null::uuid as cash_movement_id,
    capital.id as capital_return_id,
    null::uuid as owner_held_event_id,
    null::uuid as reversal_of_id,
    false as is_reversed,
    capital.reason::text as description,
    null::text as reference,
    capital.created_at,
    'legacy_business_account_return'::text as record_source,
    false as can_reverse
  from public.dashboard_owner_capital_returns capital
  where capital.event_type = 'return'
    and not capital.is_reversed
    and capital.settlement_treatment = 'business_account'
    and not exists (
      select 1
      from public.owner_money_taken_events unified
      where unified.capital_return_id = capital.id
    )
)
select * from unified_audit
union all
select * from classified_legacy_receipts
union all
select * from active_legacy_business_account_returns;

comment on view public.dashboard_owner_money_taken_lifetime_history is
  'Authoritative row-level owner-money-taken lifetime history. Combines unified audit rows with active legacy classifications using the same capital-first and linked-effect deduplication contract as dashboard_owner_position_daily.';

revoke all on table public.dashboard_owner_money_taken_lifetime_history
from public, anon;
grant select on table public.dashboard_owner_money_taken_lifetime_history
to authenticated;

commit;

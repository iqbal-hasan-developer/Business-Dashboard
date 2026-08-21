-- DEVELOPMENT ONLY. Read-only preflight for the August 21 owner-money-taken
-- and SFC-31468898 correction. This file performs no writes.

with target_withdrawals as (
  select id,movement_date,transaction_type,account_key,amount,description,
    owner_label,reversal_of_id,correction_of_id,is_reversed
  from public.dashboard_cash_ledger
  where id in (
    'fa70fd15-a0b9-4767-8f83-fe8a71b5acee'::uuid,
    'd3f725c3-dc20-4689-8f2c-1760c8e08cbf'::uuid,
    '5c220104-7d5d-46b5-8a24-9f87c97e8f87'::uuid
  )
)
select 'target_withdrawals' as check_name, jsonb_agg(to_jsonb(target_withdrawals) order by owner_label) as result
from target_withdrawals
union all
select 'target_settlement', to_jsonb(s)
from (
  select id,settlement_date,settlement_reference,gross_cod_amount,
    fees_withheld,amount_received,receipt_treatment,receiving_method,
    exists(select 1 from public.settlement_reversals r where r.settlement_id=settlement_records.id) as is_reversed,
    (select count(*) from public.settlement_order_allocations a where a.settlement_id=settlement_records.id) as order_count,
    (select coalesce(sum(allocated_amount),0) from public.settlement_order_allocations a where a.settlement_id=settlement_records.id) as allocated_total
  from public.settlement_records
  where id='1b60b110-1ed6-4e92-b478-26fde666b7fa'::uuid
) s
union all
select 'owner_positions_before', jsonb_agg(to_jsonb(p) order by owner_label)
from public.dashboard_owner_capital_positions p
union all
select 'due_before', jsonb_agg(to_jsonb(d) order by owner_label)
from public.dashboard_owner_held_balances d
union all
select 'nasim_40_funding', to_jsonb(f)
from (
  select funding.id,funding.expense_id,funding.amount,funding.funding_treatment,
    funding.owner_label,event.id as owner_held_event_id,event.amount as owner_held_amount,
    exists(select 1 from public.financial_source_funding_reversals reversal where reversal.funding_id=funding.id) as is_reversed
  from public.financial_source_fundings funding
  join public.owner_held_fund_events event on event.funding_id=funding.id and event.event_type='spend'
  where funding.id='9a6b46ab-7e96-4218-bf57-2c3a9222af59'::uuid
) f
union all
select 'duplicate_reference_guard', jsonb_build_object(
  'active_sfc_batches',count(*) filter (where reversal.id is null),
  'all_sfc_batches',count(*)
)
from public.settlement_records settlement
left join public.settlement_reversals reversal on reversal.settlement_id=settlement.id
where settlement.settlement_reference='SFC-31468898';

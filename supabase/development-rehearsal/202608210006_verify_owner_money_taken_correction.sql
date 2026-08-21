-- DEVELOPMENT ONLY. Read-only post-write reconciliation.

select 'owner_positions' as check_name,jsonb_agg(to_jsonb(position) order by owner_label) as result
from public.dashboard_owner_capital_positions position
union all
select 'owner_money_taken',jsonb_agg(to_jsonb(history) order by owner_label)
from public.dashboard_owner_money_taken_history history
where event_type='taken' and reference='SFC-31468898'
union all
select 'settlement_batches',jsonb_agg(to_jsonb(batch) order by is_reversed desc)
from public.dashboard_steadfast_settlement_batches batch
where batch.settlement_reference='SFC-31468898'
   or batch.id='1b60b110-1ed6-4e92-b478-26fde666b7fa'
union all
select 'fee',jsonb_agg(to_jsonb(fee))
from (
  select expense.id,expense.expense_date,expense.category_key,expense.amount,
    expense.reference,funding.funding_treatment,funding.business_account_key,
    cash.id as cash_movement_id,cash.amount as cash_amount,cash.account_key
  from public.expenses expense
  join public.financial_source_fundings funding on funding.expense_id=expense.id
  join public.cash_movements cash on cash.funding_id=funding.id
  where expense.reference='SFC-31468898' and expense.amount=63
) fee
union all
select 'cash_reconciliation',jsonb_agg(to_jsonb(cash) order by account_key)
from public.dashboard_cash_account_reconciliation cash
where account_key in ('cash','bkash','nagad','bank')
union all
select 'financial_invariants',jsonb_build_object(
  'historical_investment',(select sum(historical_investment) from public.dashboard_owner_capital_positions),
  'capital_returned',(select sum(capital_returned) from public.dashboard_owner_capital_positions),
  'current_capital',(select sum(current_contributed_capital) from public.dashboard_owner_capital_positions),
  'due_from_owners',(select sum(due_from_owner) from public.dashboard_owner_capital_positions),
  'current_capital_less_due',(select sum(current_contributed_capital-due_from_owner) from public.dashboard_owner_capital_positions),
  'returned_plus_due',(select sum(capital_returned+due_from_owner) from public.dashboard_owner_capital_positions),
  'active_sfc_batches',(select count(*) from public.settlement_records settlement left join public.settlement_reversals reversal on reversal.settlement_id=settlement.id where settlement.settlement_reference='SFC-31468898' and reversal.id is null),
  'active_sfc_orders',(select count(*) from public.settlement_order_allocations allocation where allocation.settlement_id='a8210003-0001-4000-8000-000000000001'),
  'negative_capital_rows',(select count(*) from public.dashboard_owner_capital_positions where current_contributed_capital<0)
);

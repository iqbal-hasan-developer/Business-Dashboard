begin;

-- Use PostgreSQL word boundaries so account words such as "Nagad" do not
-- accidentally match the short advertising marker "ad".
create or replace view public.dashboard_historical_cash_reconciliation
with (security_invoker = true)
as
with active_funding as (
  select funding.*
  from public.financial_source_fundings funding
  left join public.financial_source_funding_reversals reversal on reversal.funding_id = funding.id
  where reversal.id is null
)
select
  case when expense.accounting_class = 'operating_expense' then 'expense' else 'procurement' end as record_type,
  expense.id as record_id,
  expense.expense_date as record_date,
  expense.description,
  expense.amount,
  'missing_funding_treatment'::text as issue_type,
  null::text as account_key,
  null::text as owner_label,
  null::uuid as cash_movement_id
from public.expenses expense
where not exists (select 1 from active_funding funding where funding.expense_id = expense.id)
union all
select
  'ad_spend', spend.id, spend.spend_date,
  spend.platform || coalesce(' - ' || spend.source_reference, ''), spend.amount,
  'missing_funding_treatment', null, null, null
from public.daily_ad_spend spend
where not exists (select 1 from active_funding funding where funding.ad_spend_id = spend.id)
union all
select
  'purchase_batch', batch.id, batch.purchase_date,
  batch.supplier || coalesce(' - ' || batch.supplier_reference, ''),
  public.dashboard_poisha_to_money(batch.landed_total_poisha),
  'missing_funding_treatment', null, null, null
from public.purchase_batches batch
where not exists (select 1 from active_funding funding where funding.purchase_batch_id = batch.id)
union all
select
  'owner_cash_movement', movement.id, movement.movement_date,
  movement.description, movement.amount, 'suspicious_owner_cash_entry',
  movement.account_key, movement.owner_label, movement.id
from public.cash_movements movement
where movement.transaction_type = 'owner_investment'
  and movement.reversal_of_id is null
  and not exists (select 1 from public.cash_movements reversal where reversal.reversal_of_id = movement.id)
  and lower(movement.description) ~ '\m(mal|product|ad|advert|dollar|delivery|khoroch|kenar|purchase)\M'
union all
select
  case when funding.expense_id is not null then 'expense'
    when funding.ad_spend_id is not null then 'ad_spend' else 'purchase_batch' end,
  coalesce(funding.expense_id, funding.ad_spend_id, funding.purchase_batch_id),
  funding.payment_date, coalesce(funding.notes, 'Posted business-account payment'),
  funding.amount, 'source_without_cash_movement', funding.business_account_key,
  funding.owner_label, null
from active_funding funding
where funding.funding_treatment = 'business_account_paid'
  and not exists (select 1 from public.cash_movements movement where movement.funding_id = funding.id);

revoke all on table public.dashboard_historical_cash_reconciliation from public, anon;
grant select on table public.dashboard_historical_cash_reconciliation to authenticated;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- A historical source can be confirmed paid even when the business account
-- that paid it can no longer be evidenced. This treatment confirms spending
-- without fabricating a Cash/bKash/Nagad/Bank movement or owner funding.

alter table public.financial_source_fundings
  drop constraint financial_source_fundings_treatment_allowed,
  add constraint financial_source_fundings_treatment_allowed check (
    funding_treatment in (
      'business_account_paid', 'owner_paid_personally',
      'owner_held_business_funds', 'historical_business_paid_account_unknown',
      'unpaid', 'already_represented'
    )
  ),
  drop constraint financial_source_fundings_shape,
  add constraint financial_source_fundings_shape check (
    (funding_treatment = 'business_account_paid'
      and payment_date is not null
      and nullif(btrim(business_account_key), '') is not null
      and owner_label is null
      and existing_cash_movement_id is null)
    or (funding_treatment in ('owner_paid_personally','owner_held_business_funds')
      and payment_date is not null
      and business_account_key is null
      and nullif(btrim(owner_label), '') is not null
      and existing_cash_movement_id is null)
    or (funding_treatment = 'historical_business_paid_account_unknown'
      and payment_date is not null
      and business_account_key is null
      and owner_label is null
      and existing_cash_movement_id is null)
    or (funding_treatment = 'unpaid'
      and payment_date is null
      and business_account_key is null
      and owner_label is null
      and existing_cash_movement_id is null)
    or (funding_treatment = 'already_represented'
      and payment_date is not null
      and nullif(btrim(business_account_key), '') is not null
      and owner_label is null
      and existing_cash_movement_id is not null)
  );

create or replace function public.dashboard_source_date(
  p_source_type text,
  p_source_id uuid
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  source_date date;
begin
  case lower(btrim(p_source_type))
    when 'expense' then
      select expense_date into source_date from public.expenses where id=p_source_id;
    when 'ad_spend' then
      select spend_date into source_date from public.daily_ad_spend where id=p_source_id;
    when 'purchase_batch' then
      select purchase_date into source_date from public.purchase_batches where id=p_source_id;
    else
      raise exception 'Unsupported financial source type' using errcode='22023';
  end case;
  if source_date is null then
    raise exception 'Financial source record not found' using errcode='P0002';
  end if;
  return source_date;
end
$function$;

create or replace function public.dashboard_enforce_one_active_source_funding()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.financial_source_fundings funding
    left join public.financial_source_funding_reversals reversal
      on reversal.funding_id=funding.id
    where reversal.id is null
      and ((new.expense_id is not null and funding.expense_id=new.expense_id)
        or (new.ad_spend_id is not null and funding.ad_spend_id=new.ad_spend_id)
        or (new.purchase_batch_id is not null and funding.purchase_batch_id=new.purchase_batch_id))
  ) then
    raise exception 'Financial source already has an active funding classification'
      using errcode='23505';
  end if;
  return new;
end
$function$;

drop trigger if exists financial_source_fundings_one_active on public.financial_source_fundings;
create trigger financial_source_fundings_one_active
before insert on public.financial_source_fundings
for each row execute function public.dashboard_enforce_one_active_source_funding();

create or replace function public.classify_historical_account_unknown_source(
  p_source_type text,
  p_source_id uuid,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  normalized_source text := lower(btrim(p_source_type));
  source_amount numeric := public.dashboard_source_amount(p_source_type,p_source_id);
  source_date date := public.dashboard_source_date(p_source_type,p_source_id);
  expense_source uuid := case when normalized_source='expense' then p_source_id end;
  ad_source uuid := case when normalized_source='ad_spend' then p_source_id end;
  batch_source uuid := case when normalized_source='purchase_batch' then p_source_id end;
  normalized_notes text := btrim(p_notes);
  fingerprint text;
  existing public.financial_source_fundings%rowtype;
  funding_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may classify historical funding' using errcode='42501';
  end if;
  if normalized_source not in ('expense','ad_spend','purchase_batch')
     or p_idempotency_key is null
     or char_length(coalesce(normalized_notes,'')) not between 3 and 500 then
    raise exception 'Source, evidence note, and idempotency key are required' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',normalized_source,p_source_id::text,
    'historical_business_paid_account_unknown',source_date::text,source_amount::text,normalized_notes));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_source || ':' || p_source_id::text,0)
  );
  select * into existing from public.financial_source_fundings
  where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for different funding values'
        using errcode='23505';
    end if;
    return existing.id;
  end if;
  insert into public.financial_source_fundings (
    expense_id,ad_spend_id,purchase_batch_id,funding_treatment,
    payment_date,business_account_key,amount,owner_label,existing_cash_movement_id,
    notes,idempotency_key,request_fingerprint,created_by
  ) values (
    expense_source,ad_source,batch_source,'historical_business_paid_account_unknown',
    source_date,null,source_amount,null,null,normalized_notes,p_idempotency_key,fingerprint,actor
  ) returning id into funding_id;
  return funding_id;
end
$function$;

create or replace function public.classify_historical_financial_source(
  p_source_type text,
  p_source_id uuid,
  p_funding_treatment text,
  p_payment_date date,
  p_business_account_key text,
  p_owner_label text,
  p_existing_cash_movement_id uuid,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_treatment text := lower(btrim(p_funding_treatment));
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may classify historical funding' using errcode='42501';
  end if;
  if normalized_treatment='historical_business_paid_account_unknown' then
    if (p_payment_date is not null and p_payment_date <> public.dashboard_source_date(p_source_type,p_source_id))
       or nullif(btrim(p_business_account_key),'') is not null
       or nullif(btrim(p_owner_label),'') is not null
       or p_existing_cash_movement_id is not null then
      raise exception 'Historical account-unknown funding cannot include guessed account or owner evidence'
        using errcode='22023';
    end if;
    return public.classify_historical_account_unknown_source(
      p_source_type,p_source_id,p_notes,p_idempotency_key
    );
  end if;
  return public.dashboard_insert_source_funding(
    p_source_type,p_source_id,p_funding_treatment,p_payment_date,
    p_business_account_key,p_owner_label,p_existing_cash_movement_id,
    p_notes,p_idempotency_key
  );
end
$function$;

create or replace view public.dashboard_spending_by_category
with (security_invoker = true)
as
with categories(category_key,category_label,sort_order) as (
  values
    ('procurement'::text,'Procurement'::text,1),
    ('supplier_freight'::text,'Supplier freight'::text,2),
    ('advertising'::text,'Advertising'::text,3),
    ('courier_fulfilment'::text,'Courier / fulfilment'::text,4),
    ('operating'::text,'Operating'::text,5)
), source_components as (
  select 'expense'::text as source_type,expense.id as source_id,
    case
      when expense.accounting_class in ('inventory_purchase','unallocated_procurement') then 'procurement'
      when expense.accounting_class='freight_in' then 'supplier_freight'
      when expense.category_key in ('courier','courier_cost','order_fulfillment','order_packaging')
        then 'courier_fulfilment'
      else 'operating' end as category_key,
    expense.amount::numeric(14,2) as component_amount
  from public.expenses expense
  union all
  select 'ad_spend',spend.id,'advertising',spend.amount::numeric(14,2)
  from public.daily_ad_spend spend
  union all
  select 'purchase_batch',batch.id,'procurement',
    public.dashboard_poisha_to_money(batch.merchandise_total_poisha)::numeric(14,2)
  from public.purchase_batches batch where batch.merchandise_total_poisha>0
  union all
  select 'purchase_batch',batch.id,'supplier_freight',
    public.dashboard_poisha_to_money(batch.freight_total_poisha)::numeric(14,2)
  from public.purchase_batches batch where batch.freight_total_poisha>0
), active_funding as (
  select
    case when funding.expense_id is not null then 'expense'
      when funding.ad_spend_id is not null then 'ad_spend' else 'purchase_batch' end as source_type,
    coalesce(funding.expense_id,funding.ad_spend_id,funding.purchase_batch_id) as source_id,
    funding.funding_treatment
  from public.financial_source_fundings funding
  left join public.financial_source_funding_reversals reversal on reversal.funding_id=funding.id
  where reversal.id is null
), totals as (
  select component.category_key,
    coalesce(sum(component.component_amount),0)::numeric(14,2) as recorded_source_total,
    coalesce(sum(component.component_amount) filter (
      where funding.funding_treatment is not null and funding.funding_treatment<>'unpaid'
    ),0)::numeric(14,2) as classified_paid_spending,
    coalesce(sum(component.component_amount) filter (
      where funding.funding_treatment='unpaid'
    ),0)::numeric(14,2) as unpaid_total,
    count(*) filter (where funding.source_id is null)::bigint as unresolved_source_count
  from source_components component
  left join active_funding funding
    on funding.source_type=component.source_type and funding.source_id=component.source_id
  group by component.category_key
), courier_deductions as (
  select coalesce(sum(settlement.fees_withheld),0)::numeric(14,2) as verified_spending
  from public.settlement_records settlement
  left join public.settlement_reversals reversal on reversal.settlement_id=settlement.id
  where settlement.confirmed_at is not null and reversal.id is null
), base as (
  select category.category_key,category.category_label,
    coalesce(total.recorded_source_total,0)::numeric(14,2) as recorded_source_total,
    coalesce(total.classified_paid_spending,0)::numeric(14,2) as classified_paid_spending,
    coalesce(total.unpaid_total,0)::numeric(14,2) as unpaid_total,
    coalesce(total.unresolved_source_count,0)::bigint as unresolved_source_count,
    case when coalesce(total.unresolved_source_count,0)=0
      then coalesce(total.classified_paid_spending,0)::numeric(14,2) end as total_spending,
    category.sort_order,
    case when category.category_key='courier_fulfilment'
      then courier_deductions.verified_spending else 0::numeric end::numeric(14,2)
      as independently_verified_spending
  from categories category
  left join totals total using (category_key)
  cross join courier_deductions
)
select
  base.category_key,
  base.category_label,
  base.recorded_source_total,
  base.classified_paid_spending,
  base.unpaid_total,
  base.unresolved_source_count,
  base.total_spending,
  base.sort_order,
  base.independently_verified_spending,
  case when base.total_spending is null then null
    when base.category_key='courier_fulfilment'
      and base.classified_paid_spending>0 and base.independently_verified_spending>0 then null
    else (base.total_spending+base.independently_verified_spending)::numeric(14,2) end
    as combined_spending,
  (base.category_key='courier_fulfilment'
    and base.classified_paid_spending>0 and base.independently_verified_spending>0)
    as overlap_review_required
from base
order by base.sort_order;

create or replace view public.dashboard_capital_spending_available_funds
with (security_invoker = true)
as
with capital as (
  select sum(cash_investment)::numeric(14,2) as owner_cash_investment,
    sum(non_cash_contribution)::numeric(14,2) as owner_non_cash_contribution,
    sum(historical_investment)::numeric(14,2) as historical_owner_investment,
    sum(capital_returned)::numeric(14,2) as total_capital_returned,
    sum(current_contributed_capital)::numeric(14,2) as current_contributed_capital
  from public.dashboard_owner_capital_positions
), cash_effects as (
  select coalesce(sum(case
    when ledger.transaction_type='owner_withdrawal' then -ledger.signed_amount
    when ledger.transaction_type='reversal' and original.transaction_type='owner_withdrawal'
      then -ledger.signed_amount else 0 end),0)::numeric(14,2) as owner_withdrawals
  from public.dashboard_cash_ledger ledger
  left join public.dashboard_cash_ledger original on original.id=ledger.reversal_of_id
), cash_control as (
  select sum(ledger_balance)::numeric(14,2) as ledger_business_cash,
    case when count(*) filter (where actual_balance is not null)=4
      then sum(actual_balance)::numeric(14,2) end as actual_business_cash
  from public.dashboard_cash_account_reconciliation
  where account_key in ('cash','bkash','nagad','bank')
), due_control as (
  select sum(ledger_due)::numeric(14,2) as ledger_due_from_owners,
    coalesce(sum(actual_due),0)::numeric(14,2) as actual_due_from_owners
  from public.dashboard_owner_held_balances
), cod_control as (
  select calculated_receivable,actual_receivable,difference
  from public.dashboard_steadfast_receivable_reconciliation
), spending as (
  select sum(classified_paid_spending)::numeric(14,2) as classified_paid_spending,
    case when sum(unresolved_source_count)=0
      then sum(classified_paid_spending)::numeric(14,2) end as total_business_spending,
    sum(unresolved_source_count)::bigint as unresolved_source_count,
    max(total_spending) filter (where category_key='procurement') as procurement_spending,
    max(total_spending) filter (where category_key='supplier_freight') as supplier_freight_spending,
    max(total_spending) filter (where category_key='advertising') as advertising_spending,
    max(combined_spending) filter (where category_key='courier_fulfilment') as courier_fulfilment_spending,
    max(total_spending) filter (where category_key='operating') as operating_spending,
    max(independently_verified_spending) filter (where category_key='courier_fulfilment')
      as verified_courier_fulfilment_spending,
    bool_or(overlap_review_required) as overlap_review_required,
    case when not bool_or(overlap_review_required) and sum(unresolved_source_count)=0
      then sum(classified_paid_spending+independently_verified_spending)::numeric(14,2) end
      as total_business_cash_spending
  from public.dashboard_spending_by_category
), inventory as (
  select known_inventory_value::numeric(14,2) from public.dashboard_procurement_summary
)
select
  capital.owner_cash_investment,
  capital.owner_non_cash_contribution,
  capital.historical_owner_investment as total_owner_investment_contribution,
  cash_effects.owner_withdrawals,
  spending.classified_paid_spending,
  spending.total_business_spending,
  spending.unresolved_source_count,
  cash_control.ledger_business_cash,
  cash_control.actual_business_cash,
  due_control.ledger_due_from_owners,
  due_control.actual_due_from_owners,
  cod_control.calculated_receivable as calculated_steadfast_receivable,
  cod_control.actual_receivable as confirmed_steadfast_receivable,
  case when cash_control.actual_business_cash is null or cod_control.actual_receivable is null
    then null else (cash_control.actual_business_cash+due_control.actual_due_from_owners
      +cod_control.actual_receivable)::numeric(14,2) end as total_available_receivable_funds,
  inventory.known_inventory_value,
  case when cash_control.actual_business_cash is null or cod_control.actual_receivable is null
    then null else ((cash_control.actual_business_cash-cash_control.ledger_business_cash)
      +(due_control.actual_due_from_owners-due_control.ledger_due_from_owners)
      +cod_control.difference)::numeric(14,2) end as unresolved_reconciliation_difference,
  capital.historical_owner_investment,
  capital.total_capital_returned,
  capital.current_contributed_capital,
  spending.procurement_spending,
  spending.supplier_freight_spending,
  spending.advertising_spending,
  spending.courier_fulfilment_spending,
  spending.operating_spending,
  spending.classified_paid_spending as confirmed_paid_source_spending,
  spending.verified_courier_fulfilment_spending,
  spending.total_business_cash_spending
from capital cross join cash_effects cross join cash_control cross join due_control
cross join cod_control cross join spending cross join inventory;

revoke all on function public.dashboard_source_date(text,uuid),
  public.dashboard_enforce_one_active_source_funding(),
  public.classify_historical_account_unknown_source(text,uuid,text,uuid)
from public,anon,authenticated,service_role;

commit;

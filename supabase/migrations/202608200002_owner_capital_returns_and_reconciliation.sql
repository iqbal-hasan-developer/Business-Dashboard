begin;

-- Capital returned to an owner is a balance-sheet distribution. It is neither
-- an expense nor a cash withdrawal when it is settled against business funds
-- already held by that owner. Keep the original investment immutable and append
-- a return plus an owner-held-fund spend atomically.

create table public.owner_capital_return_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('return', 'reversal')),
  event_date date not null,
  owner_label text not null check (owner_label in ('Nasim', 'Rifat', 'Ikbal')),
  amount numeric(12,2) not null check (amount > 0 and amount = trunc(amount, 2)),
  settlement_treatment text not null default 'owner_held_business_funds'
    check (settlement_treatment = 'owner_held_business_funds'),
  reversal_of_id uuid references public.owner_capital_return_events(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint owner_capital_return_events_shape check (
    (event_type = 'return' and reversal_of_id is null)
    or (event_type = 'reversal' and reversal_of_id is not null)
  )
);

create unique index owner_capital_return_events_reversal_uidx
  on public.owner_capital_return_events (reversal_of_id)
  where reversal_of_id is not null;
create index owner_capital_return_events_owner_date_idx
  on public.owner_capital_return_events (owner_label, event_date desc, created_at desc);

create trigger owner_capital_return_events_immutable
before update or delete on public.owner_capital_return_events
for each row execute function public.dashboard_reject_cash_movement_mutation();

alter table public.owner_capital_return_events enable row level security;
create policy "Dashboard users read owner capital returns"
on public.owner_capital_return_events for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

alter table public.owner_held_fund_events
  add column capital_return_id uuid
    references public.owner_capital_return_events(id) on delete restrict;

drop index if exists public.owner_held_fund_events_capital_return_uidx;
create unique index owner_held_fund_events_capital_return_uidx
  on public.owner_held_fund_events (capital_return_id)
  where capital_return_id is not null;

alter table public.owner_held_fund_events
  drop constraint owner_held_fund_events_shape,
  add constraint owner_held_fund_events_shape check (
    (event_type = 'spend'
      and settlement_id is null
      and cash_movement_id is null
      and original_owner_withdrawal_id is null
      and reversal_of_id is null
      and (
        (funding_id is not null and capital_return_id is null and reason is null)
        or (funding_id is null and capital_return_id is not null and reason is not null)
      ))
    or (event_type = 'receipt'
      and funding_id is null
      and capital_return_id is null
      and reversal_of_id is null
      and reason is not null
      and (
        (settlement_id is not null and cash_movement_id is null and original_owner_withdrawal_id is null)
        or (settlement_id is null and cash_movement_id is not null)
      ))
    or (event_type = 'reversal'
      and funding_id is null
      and settlement_id is null
      and cash_movement_id is null
      and original_owner_withdrawal_id is null
      and capital_return_id is null
      and reversal_of_id is not null
      and reason is not null)
  );

create or replace view public.dashboard_owner_held_funds
with (security_invoker = true)
as
select
  event.id,
  event.event_date,
  event.owner_label,
  event.event_type,
  event.amount,
  case
    when event.event_type = 'receipt' then event.amount
    when event.event_type = 'spend' then -event.amount
    when original.event_type = 'receipt' then -event.amount
    else event.amount
  end::numeric(12,2) as signed_amount,
  event.funding_id,
  event.settlement_id,
  event.cash_movement_id,
  event.original_owner_withdrawal_id,
  event.reversal_of_id,
  exists (
    select 1 from public.owner_held_fund_events reversal
    where reversal.reversal_of_id = event.id
  ) as is_reversed,
  event.reason,
  event.created_at,
  event.capital_return_id
from public.owner_held_fund_events event
left join public.owner_held_fund_events original on original.id = event.reversal_of_id;

create or replace view public.dashboard_owner_capital_returns
with (security_invoker = true)
as
select
  event.id,
  event.event_date,
  event.owner_label,
  event.event_type,
  event.amount,
  case when event.event_type = 'return' then event.amount else -event.amount end::numeric(12,2)
    as signed_returned_amount,
  event.settlement_treatment,
  event.reversal_of_id,
  exists (
    select 1 from public.owner_capital_return_events reversal
    where reversal.reversal_of_id = event.id
  ) as is_reversed,
  event.reason,
  event.created_at
from public.owner_capital_return_events event;

create or replace view public.dashboard_owner_capital_positions
with (security_invoker = true)
as
with owners(owner_label) as (
  values ('Nasim'::text), ('Rifat'::text), ('Ikbal'::text)
), cash_investment as (
  select ledger.owner_label,
    coalesce(sum(ledger.signed_amount) filter (
      where ledger.transaction_type = 'owner_investment'
        or (ledger.transaction_type = 'reversal' and original.transaction_type = 'owner_investment')
    ),0)::numeric(14,2) as cash_investment
  from public.dashboard_cash_ledger ledger
  left join public.dashboard_cash_ledger original on original.id = ledger.reversal_of_id
  where ledger.owner_label is not null
  group by ledger.owner_label
), non_cash as (
  select owner_label, coalesce(sum(signed_amount),0)::numeric(14,2) as non_cash_contribution
  from public.dashboard_owner_non_cash_capital
  group by owner_label
), returned as (
  select owner_label, coalesce(sum(signed_returned_amount),0)::numeric(14,2) as capital_returned
  from public.dashboard_owner_capital_returns
  group by owner_label
)
select
  owners.owner_label,
  coalesce(cash_investment.cash_investment,0)::numeric(14,2) as cash_investment,
  coalesce(non_cash.non_cash_contribution,0)::numeric(14,2) as non_cash_contribution,
  (coalesce(cash_investment.cash_investment,0)
    + coalesce(non_cash.non_cash_contribution,0))::numeric(14,2) as historical_investment,
  coalesce(returned.capital_returned,0)::numeric(14,2) as capital_returned,
  (coalesce(cash_investment.cash_investment,0)
    + coalesce(non_cash.non_cash_contribution,0)
    - coalesce(returned.capital_returned,0))::numeric(14,2) as current_contributed_capital
from owners
left join cash_investment using (owner_label)
left join non_cash using (owner_label)
left join returned using (owner_label);

create or replace function public.record_owner_capital_return_from_held(
  p_return_date date,
  p_owner_label text,
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  normalized_owner text := case lower(btrim(p_owner_label))
    when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' when 'ikbal' then 'Ikbal' end;
  normalized_reason text := btrim(p_reason);
  fingerprint text;
  existing public.owner_capital_return_events%rowtype;
  current_capital numeric;
  return_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may return owner capital' using errcode='42501';
  end if;
  if p_return_date is null or normalized_owner is null or p_amount is null
     or p_amount <= 0 or p_amount <> trunc(p_amount,2) or p_idempotency_key is null
     or char_length(coalesce(normalized_reason,'')) not between 3 and 500 then
    raise exception 'Invalid owner capital return values' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_return_date::text,
    normalized_owner, p_amount::text, normalized_reason));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-capital-and-held:' || normalized_owner, 0)
  );
  select * into existing from public.owner_capital_return_events
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different capital return'
        using errcode='23505';
    end if;
    return existing.id;
  end if;
  select position.current_contributed_capital into current_capital
  from public.dashboard_owner_capital_positions position
  where position.owner_label = normalized_owner;
  if coalesce(current_capital,0) < p_amount then
    raise exception 'Capital return exceeds current contributed capital' using errcode='23514';
  end if;
  if public.dashboard_owner_held_balance(normalized_owner) < p_amount then
    raise exception 'Capital return exceeds business funds held by owner' using errcode='23514';
  end if;
  insert into public.owner_capital_return_events (
    event_type,event_date,owner_label,amount,reason,idempotency_key,
    request_fingerprint,created_by
  ) values (
    'return',p_return_date,normalized_owner,p_amount,normalized_reason,
    p_idempotency_key,fingerprint,actor
  ) returning id into return_id;
  insert into public.owner_held_fund_events (
    event_type,event_date,owner_label,amount,capital_return_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'spend',p_return_date,normalized_owner,p_amount,return_id,
    'Capital returned to ' || normalized_owner || ': ' || normalized_reason,
    p_idempotency_key,fingerprint,actor
  );
  return return_id;
end
$function$;

create or replace function public.reverse_owner_capital_return_from_held(
  p_capital_return_id uuid,
  p_reversed_on date,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  normalized_reason text := btrim(p_reason);
  original public.owner_capital_return_events%rowtype;
  original_held public.owner_held_fund_events%rowtype;
  existing public.owner_capital_return_events%rowtype;
  fingerprint text;
  reversal_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse owner capital returns' using errcode='42501';
  end if;
  if p_capital_return_id is null or p_reversed_on is null or p_idempotency_key is null
     or char_length(coalesce(normalized_reason,'')) not between 3 and 500 then
    raise exception 'Invalid owner capital return reversal values' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',p_capital_return_id::text,
    p_reversed_on::text,normalized_reason));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-capital-return:' || p_capital_return_id::text, 0)
  );
  select * into existing from public.owner_capital_return_events
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different capital return reversal'
        using errcode='23505';
    end if;
    return existing.id;
  end if;
  select * into original from public.owner_capital_return_events
  where id=p_capital_return_id and event_type='return' for update;
  if not found or exists (
    select 1 from public.owner_capital_return_events reversal where reversal.reversal_of_id=original.id
  ) then
    raise exception 'Active owner capital return not found' using errcode='P0002';
  end if;
  select * into original_held from public.owner_held_fund_events
  where capital_return_id=original.id and event_type='spend' for update;
  if not found or exists (
    select 1 from public.owner_held_fund_events reversal where reversal.reversal_of_id=original_held.id
  ) then
    raise exception 'Linked owner-held capital return event not found' using errcode='P0002';
  end if;
  insert into public.owner_capital_return_events (
    event_type,event_date,owner_label,amount,reversal_of_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'reversal',p_reversed_on,original.owner_label,original.amount,original.id,
    normalized_reason,p_idempotency_key,fingerprint,actor
  ) returning id into reversal_id;
  insert into public.owner_held_fund_events (
    event_type,event_date,owner_label,amount,reversal_of_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'reversal',p_reversed_on,original.owner_label,original.amount,original_held.id,
    normalized_reason,p_idempotency_key,fingerprint,actor
  );
  return reversal_id;
end
$function$;

create or replace function public.reverse_owner_held_fund_transfer(
  p_owner_held_event_id uuid,
  p_reversed_on date,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  normalized_reason text := btrim(p_reason);
  original public.owner_held_fund_events%rowtype;
  original_cash public.cash_movements%rowtype;
  existing public.owner_held_fund_events%rowtype;
  fingerprint text;
  reversal_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse owner-held transfers' using errcode='42501';
  end if;
  if p_owner_held_event_id is null or p_reversed_on is null or p_idempotency_key is null
     or char_length(coalesce(normalized_reason,'')) not between 3 and 500 then
    raise exception 'Invalid owner-held transfer reversal values' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',p_owner_held_event_id::text,
    p_reversed_on::text,normalized_reason));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-held-transfer:' || p_owner_held_event_id::text, 0)
  );
  select * into existing from public.owner_held_fund_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different owner-held reversal'
        using errcode='23505';
    end if;
    return existing.id;
  end if;
  select * into original from public.owner_held_fund_events
  where id=p_owner_held_event_id and event_type='receipt' and cash_movement_id is not null
  for update;
  if not found or exists (
    select 1 from public.owner_held_fund_events reversal where reversal.reversal_of_id=original.id
  ) then
    raise exception 'Active owner-held transfer not found' using errcode='P0002';
  end if;
  select * into original_cash from public.cash_movements where id=original.cash_movement_id for update;
  if not found or exists (
    select 1 from public.cash_movements reversal where reversal.reversal_of_id=original_cash.id
  ) then
    raise exception 'Linked active cash transfer not found' using errcode='P0002';
  end if;
  insert into public.cash_movements (
    movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,reversal_of_id,idempotency_key,request_fingerprint,created_by
  ) values (
    p_reversed_on,'inflow','reversal',original_cash.account_key,original_cash.amount,
    'Reversal: ' || normalized_reason,original_cash.reference,original.owner_label,
    original_cash.id,p_idempotency_key::text || ':cash',fingerprint,actor
  );
  insert into public.owner_held_fund_events (
    event_type,event_date,owner_label,amount,reversal_of_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'reversal',p_reversed_on,original.owner_label,original.amount,original.id,
    normalized_reason,p_idempotency_key,fingerprint,actor
  ) returning id into reversal_id;
  return reversal_id;
end
$function$;

create or replace view public.dashboard_steadfast_receivable_components
with (security_invoker = true)
as
select
  eligible.order_id,
  eligible.order_number,
  eligible.order_date,
  eligible.customer_name,
  eligible.gross_cod_receivable,
  (reversed.settlement_id is not null) as excluded_reversed_batch,
  case when reversed.settlement_id is null then eligible.gross_cod_receivable else 0 end::numeric(14,2)
    as active_collectible_receivable,
  reversed.settlement_id as reversed_settlement_id,
  reversed.reversed_on,
  reversed.reversal_reason
from public.dashboard_steadfast_settlement_eligible_orders eligible
left join lateral (
  select allocation.settlement_id, reversal.reversed_on, reversal.reason as reversal_reason
  from public.settlement_order_allocations allocation
  join public.settlement_reversals reversal on reversal.settlement_id=allocation.settlement_id
  where allocation.order_id=eligible.order_id
  order by reversal.reversed_on desc, reversal.created_at desc
  limit 1
) reversed on true;

create or replace view public.dashboard_steadfast_receivable_reconciliation
with (security_invoker = true)
as
with calculated as (
  select
    coalesce(sum(active_collectible_receivable),0)::numeric(14,2) as calculated_receivable,
    coalesce(sum(gross_cod_receivable),0)::numeric(14,2) as gross_eligible_receivable,
    coalesce(sum(gross_cod_receivable) filter (where excluded_reversed_batch),0)::numeric(14,2)
      as reversed_batch_receivable
  from public.dashboard_steadfast_receivable_components
), latest_observation as (
  select actual_receivable, observed_on, reason
  from public.steadfast_receivable_observations
  order by observed_on desc, created_at desc
  limit 1
)
select
  calculated.calculated_receivable,
  observation.actual_receivable,
  case when observation.actual_receivable is null then null
    else (observation.actual_receivable-calculated.calculated_receivable)::numeric(14,2) end as difference,
  observation.observed_on,
  observation.reason as observation_reason,
  calculated.gross_eligible_receivable,
  calculated.reversed_batch_receivable
from calculated
left join latest_observation observation on true;

create or replace view public.dashboard_spending_by_category
with (security_invoker = true)
as
with categories(category_key, category_label, sort_order) as (
  values
    ('procurement'::text,'Procurement'::text,1),
    ('supplier_freight'::text,'Supplier freight'::text,2),
    ('advertising'::text,'Advertising'::text,3),
    ('courier_fulfilment'::text,'Courier / fulfilment'::text,4),
    ('operating'::text,'Operating'::text,5)
), source_components as (
  select 'expense'::text as source_type, expense.id as source_id,
    case
      when expense.accounting_class in ('inventory_purchase','unallocated_procurement') then 'procurement'
      when expense.accounting_class='freight_in' then 'supplier_freight'
      when expense.category_key in ('courier','courier_cost','order_fulfillment','order_packaging')
        then 'courier_fulfilment'
      else 'operating' end as category_key,
    expense.amount::numeric(14,2) as component_amount
  from public.expenses expense
  union all
  select 'ad_spend', spend.id, 'advertising', spend.amount::numeric(14,2)
  from public.daily_ad_spend spend
  union all
  select 'purchase_batch', batch.id, 'procurement',
    public.dashboard_poisha_to_money(batch.merchandise_total_poisha)::numeric(14,2)
  from public.purchase_batches batch
  where batch.merchandise_total_poisha > 0
  union all
  select 'purchase_batch', batch.id, 'supplier_freight',
    public.dashboard_poisha_to_money(batch.freight_total_poisha)::numeric(14,2)
  from public.purchase_batches batch
  where batch.freight_total_poisha > 0
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
      where funding.funding_treatment is not null and funding.funding_treatment <> 'unpaid'
    ),0)::numeric(14,2) as classified_paid_spending,
    coalesce(sum(component.component_amount) filter (
      where funding.funding_treatment='unpaid'
    ),0)::numeric(14,2) as unpaid_total,
    count(*) filter (where funding.source_id is null)::bigint as unresolved_source_count
  from source_components component
  left join active_funding funding
    on funding.source_type=component.source_type and funding.source_id=component.source_id
  group by component.category_key
)
select
  category.category_key,
  category.category_label,
  coalesce(total.recorded_source_total,0)::numeric(14,2) as recorded_source_total,
  coalesce(total.classified_paid_spending,0)::numeric(14,2) as classified_paid_spending,
  coalesce(total.unpaid_total,0)::numeric(14,2) as unpaid_total,
  coalesce(total.unresolved_source_count,0)::bigint as unresolved_source_count,
  case when coalesce(total.unresolved_source_count,0)=0
    then coalesce(total.classified_paid_spending,0)::numeric(14,2) end as total_spending,
  category.sort_order
from categories category
left join totals total using (category_key)
order by category.sort_order;

create or replace view public.dashboard_capital_spending_available_funds
with (security_invoker = true)
as
with capital as (
  select
    sum(cash_investment)::numeric(14,2) as owner_cash_investment,
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
    case when sum(unresolved_source_count)=0 then sum(classified_paid_spending)::numeric(14,2) end
      as total_business_spending,
    sum(unresolved_source_count)::bigint as unresolved_source_count,
    max(total_spending) filter (where category_key='procurement') as procurement_spending,
    max(total_spending) filter (where category_key='supplier_freight') as supplier_freight_spending,
    max(total_spending) filter (where category_key='advertising') as advertising_spending,
    max(total_spending) filter (where category_key='courier_fulfilment') as courier_fulfilment_spending,
    max(total_spending) filter (where category_key='operating') as operating_spending
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
  spending.operating_spending
from capital cross join cash_effects cross join cash_control cross join due_control
cross join cod_control cross join spending cross join inventory;

revoke all on table public.owner_capital_return_events,
  public.dashboard_owner_capital_returns,
  public.dashboard_owner_capital_positions,
  public.dashboard_steadfast_receivable_components,
  public.dashboard_spending_by_category
from public,anon;
grant select on table public.owner_capital_return_events,
  public.dashboard_owner_capital_returns,
  public.dashboard_owner_capital_positions,
  public.dashboard_steadfast_receivable_components,
  public.dashboard_spending_by_category
to authenticated;

revoke all on function public.record_owner_capital_return_from_held(date,text,numeric,text,uuid),
  public.reverse_owner_capital_return_from_held(uuid,date,text,uuid),
  public.reverse_owner_held_fund_transfer(uuid,date,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.record_owner_capital_return_from_held(date,text,numeric,text,uuid),
  public.reverse_owner_capital_return_from_held(uuid,date,text,uuid),
  public.reverse_owner_held_fund_transfer(uuid,date,text,uuid)
to authenticated;

commit;

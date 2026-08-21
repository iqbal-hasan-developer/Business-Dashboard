begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Money taken by an owner is one economic event with three possible effects:
-- cash always leaves a business account; available contributed capital is
-- returned first; only the excess becomes Due from Owner. All effects and
-- their reversals stay linked and append-only.

alter table public.cash_movements
  drop constraint if exists cash_movements_transaction_type_allowed,
  add constraint cash_movements_transaction_type_allowed check (
    transaction_type in (
      'owner_investment', 'owner_withdrawal', 'owner_money_taken',
      'operating_inflow', 'operating_outflow',
      'transfer_in', 'transfer_out', 'courier_settlement', 'expense',
      'ad_spend', 'procurement_payment', 'customer_payment',
      'owner_held_transfer', 'reversal'
    )
  );

create or replace function public.dashboard_require_owner_money_taken_workflow()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.transaction_type='owner_withdrawal' then
    raise exception 'Use record_owner_money_taken so capital and Due from Owner are classified atomically.'
      using errcode='22023';
  end if;
  return new;
end
$function$;

drop trigger if exists dashboard_require_owner_money_taken_workflow on public.cash_movements;
create trigger dashboard_require_owner_money_taken_workflow
before insert on public.cash_movements
for each row execute function public.dashboard_require_owner_money_taken_workflow();

revoke all on function public.dashboard_require_owner_money_taken_workflow()
from public,anon,authenticated,service_role;

alter table public.owner_capital_return_events
  drop constraint if exists owner_capital_return_events_settlement_treatment_check,
  add constraint owner_capital_return_events_settlement_treatment_check check (
    settlement_treatment in ('owner_held_business_funds', 'business_account')
  );

create or replace function public.dashboard_expense_category_allowed(p_category_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select lower(btrim(coalesce(p_category_key, ''))) = any (array[
    'operations',
    'business_transportation',
    'product_purchase',
    'inventory_purchase',
    'freight_in',
    'unallocated_procurement',
    'transportation',
    'packaging_supplies',
    'financial_fees',
    'software',
    'utilities',
    'professional_services',
    'other'
  ]::text[]);
$function$;

revoke all on function public.dashboard_expense_category_allowed(text)
from public,anon,authenticated,service_role;

create table public.owner_money_taken_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('taken', 'reversal')),
  event_date date not null,
  owner_label text not null check (owner_label in ('Nasim', 'Rifat', 'Ikbal')),
  amount numeric(12,2) not null check (amount > 0 and amount = trunc(amount, 2)),
  capital_return_amount numeric(12,2) not null check (
    capital_return_amount >= 0 and capital_return_amount = trunc(capital_return_amount, 2)
  ),
  excess_due_amount numeric(12,2) not null check (
    excess_due_amount >= 0 and excess_due_amount = trunc(excess_due_amount, 2)
  ),
  source_account_key text not null,
  cash_movement_id uuid not null unique references public.cash_movements(id) on delete restrict,
  capital_return_id uuid unique references public.owner_capital_return_events(id) on delete restrict,
  owner_held_event_id uuid unique references public.owner_held_fund_events(id) on delete restrict,
  reversal_of_id uuid unique references public.owner_money_taken_events(id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 3 and 240),
  reference text,
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint owner_money_taken_events_amount_shape check (
    amount = capital_return_amount + excess_due_amount
  ),
  constraint owner_money_taken_events_effect_shape check (
    (capital_return_amount = 0 and capital_return_id is null)
    or (capital_return_amount > 0 and capital_return_id is not null)
  ),
  constraint owner_money_taken_events_due_shape check (
    (excess_due_amount = 0 and owner_held_event_id is null)
    or (excess_due_amount > 0 and owner_held_event_id is not null)
  ),
  constraint owner_money_taken_events_reversal_shape check (
    (event_type = 'taken' and reversal_of_id is null)
    or (event_type = 'reversal' and reversal_of_id is not null)
  ),
  constraint owner_money_taken_events_reference_length check (
    reference is null or char_length(reference) <= 120
  )
);

create index owner_money_taken_events_owner_date_idx
  on public.owner_money_taken_events (owner_label, event_date desc, created_at desc);
create index owner_money_taken_events_date_idx
  on public.owner_money_taken_events (event_date desc, created_at desc);

create trigger owner_money_taken_events_immutable
before update or delete on public.owner_money_taken_events
for each row execute function public.dashboard_reject_cash_movement_mutation();

alter table public.owner_money_taken_events enable row level security;
create policy "Dashboard users read owner money taken"
on public.owner_money_taken_events for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

create or replace view public.dashboard_owner_money_taken_history
with (security_invoker = true)
as
select
  event.id,
  event.event_date,
  event.owner_label,
  event.event_type,
  event.amount,
  event.capital_return_amount,
  event.excess_due_amount,
  event.source_account_key,
  coalesce(account.label, event.source_account_key) as source_account_label,
  event.cash_movement_id,
  event.capital_return_id,
  event.owner_held_event_id,
  event.reversal_of_id,
  exists (
    select 1 from public.owner_money_taken_events reversal
    where reversal.reversal_of_id = event.id
  ) as is_reversed,
  event.description,
  event.reference,
  event.created_at
from public.owner_money_taken_events event
left join public.business_lookup_values account
  on account.lookup_type = 'cash_account'
 and account.lookup_key = event.source_account_key;

create or replace view public.dashboard_owner_position_daily
with (security_invoker = true)
as
select
  event.owner_label,
  event.event_date,
  sum(case when event.event_type = 'taken' then event.amount else -event.amount end)::numeric(14,2)
    as owner_money_taken_in_period,
  sum(case when event.event_type = 'taken' then event.capital_return_amount else -event.capital_return_amount end)::numeric(14,2)
    as capital_return_in_period,
  sum(case when event.event_type = 'taken' then event.excess_due_amount else -event.excess_due_amount end)::numeric(14,2)
    as excess_due_in_period
from public.owner_money_taken_events event
group by event.owner_label, event.event_date;

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
), taken as (
  select owner_label,
    coalesce(sum(owner_money_taken_in_period),0)::numeric(14,2) as owner_money_taken,
    coalesce(sum(capital_return_in_period),0)::numeric(14,2) as money_taken_capital_return,
    coalesce(sum(excess_due_in_period),0)::numeric(14,2) as money_taken_excess_due
  from public.dashboard_owner_position_daily
  group by owner_label
)
select
  owners.owner_label,
  coalesce(cash_investment.cash_investment,0)::numeric(14,2) as cash_investment,
  coalesce(non_cash.non_cash_contribution,0)::numeric(14,2) as non_cash_contribution,
  (coalesce(cash_investment.cash_investment,0)
    + coalesce(non_cash.non_cash_contribution,0))::numeric(14,2) as historical_investment,
  greatest(coalesce(returned.capital_returned,0),0)::numeric(14,2) as capital_returned,
  greatest(
    coalesce(cash_investment.cash_investment,0)
      + coalesce(non_cash.non_cash_contribution,0)
      - coalesce(returned.capital_returned,0),
    0
  )::numeric(14,2) as current_contributed_capital,
  coalesce(held.ledger_due,0)::numeric(14,2) as due_from_owner,
  coalesce(taken.owner_money_taken,0)::numeric(14,2) as owner_money_taken,
  coalesce(taken.money_taken_capital_return,0)::numeric(14,2) as money_taken_capital_return,
  coalesce(taken.money_taken_excess_due,0)::numeric(14,2) as money_taken_excess_due,
  (greatest(coalesce(returned.capital_returned,0),0)
    + coalesce(held.ledger_due,0))::numeric(14,2) as cumulative_money_returned_or_due
from owners
left join cash_investment using (owner_label)
left join non_cash using (owner_label)
left join returned using (owner_label)
left join taken using (owner_label)
left join public.dashboard_owner_held_balances held using (owner_label);

create or replace function public.record_owner_money_taken(
  p_event_date date,
  p_owner_label text,
  p_amount numeric,
  p_source_account_key text,
  p_description text,
  p_reference text,
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
  normalized_account text := lower(btrim(p_source_account_key));
  normalized_description text := btrim(p_description);
  normalized_reference text := nullif(btrim(p_reference), '');
  fingerprint text;
  existing public.owner_money_taken_events%rowtype;
  current_capital numeric(14,2);
  capital_portion numeric(12,2);
  due_portion numeric(12,2);
  cash_id uuid;
  capital_id uuid;
  due_id uuid;
  new_id uuid;
  capital_key uuid;
  due_key uuid;
begin
  if actor is null or not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then
    raise exception 'Owner or admin access is required to record money taken by an owner' using errcode='42501';
  end if;
  if p_event_date is null or p_event_date > (now() at time zone 'Asia/Dhaka')::date
     or normalized_owner is null
     or normalized_account not in ('cash','bkash','nagad','bank')
     or not exists (
       select 1 from public.business_lookup_values
       where lookup_type='cash_account' and lookup_key=normalized_account and is_active
     )
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
     or p_amount <> trunc(p_amount,2)
     or char_length(coalesce(normalized_description,'')) not between 3 and 240
     or char_length(coalesce(normalized_reference,'')) > 120
     or p_idempotency_key is null then
    raise exception 'Invalid owner-money-taken values' using errcode='22023';
  end if;

  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_event_date::text,
    normalized_owner, p_amount::text, normalized_account, normalized_description,
    coalesce(normalized_reference,'')));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-money-taken-request:' || p_idempotency_key::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-capital-and-held:' || normalized_owner,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-held:' || normalized_owner,0));

  select * into existing from public.owner_money_taken_events
  where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for different owner-money-taken values' using errcode='23505';
    end if;
    return existing.id;
  end if;

  select current_contributed_capital into current_capital
  from public.dashboard_owner_capital_positions where owner_label=normalized_owner;
  capital_portion := least(p_amount, greatest(coalesce(current_capital,0),0))::numeric(12,2);
  due_portion := (p_amount-capital_portion)::numeric(12,2);

  insert into public.cash_movements (
    movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,idempotency_key,request_fingerprint,created_by
  ) values (
    p_event_date,'outflow','owner_money_taken',normalized_account,p_amount,
    normalized_description,normalized_reference,normalized_owner,
    p_idempotency_key::text || ':cash',fingerprint,actor
  ) returning id into cash_id;

  if capital_portion > 0 then
    capital_key := (
      substr(md5(p_idempotency_key::text || ':capital'),1,8) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),9,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),13,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),17,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),21,12)
    )::uuid;
    insert into public.owner_capital_return_events (
      event_type,event_date,owner_label,amount,settlement_treatment,reason,
      idempotency_key,request_fingerprint,created_by
    ) values (
      'return',p_event_date,normalized_owner,capital_portion,'business_account',
      'Capital portion of owner money taken: ' || normalized_description,
      capital_key,fingerprint,actor
    ) returning id into capital_id;
  end if;

  if due_portion > 0 then
    due_key := (
      substr(md5(p_idempotency_key::text || ':due'),1,8) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),9,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),13,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),17,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),21,12)
    )::uuid;
    insert into public.owner_held_fund_events (
      event_type,event_date,owner_label,amount,cash_movement_id,reason,
      idempotency_key,request_fingerprint,created_by
    ) values (
      'receipt',p_event_date,normalized_owner,due_portion,cash_id,
      'Excess beyond contributed capital: ' || normalized_description,
      due_key,fingerprint,actor
    ) returning id into due_id;
  end if;

  insert into public.owner_money_taken_events (
    event_type,event_date,owner_label,amount,capital_return_amount,excess_due_amount,
    source_account_key,cash_movement_id,capital_return_id,owner_held_event_id,
    description,reference,idempotency_key,request_fingerprint,created_by
  ) values (
    'taken',p_event_date,normalized_owner,p_amount,capital_portion,due_portion,
    normalized_account,cash_id,capital_id,due_id,normalized_description,
    normalized_reference,p_idempotency_key,fingerprint,actor
  ) returning id into new_id;
  return new_id;
end
$function$;

create or replace function public.reverse_owner_money_taken(
  p_owner_money_taken_id uuid,
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
  original public.owner_money_taken_events%rowtype;
  existing public.owner_money_taken_events%rowtype;
  original_cash public.cash_movements%rowtype;
  original_capital public.owner_capital_return_events%rowtype;
  original_due public.owner_held_fund_events%rowtype;
  fingerprint text;
  cash_reversal_id uuid;
  capital_reversal_id uuid;
  due_reversal_id uuid;
  new_id uuid;
  capital_key uuid;
  due_key uuid;
begin
  if actor is null or not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse owner money taken' using errcode='42501';
  end if;
  if p_owner_money_taken_id is null or p_reversed_on is null
     or p_reversed_on > (now() at time zone 'Asia/Dhaka')::date
     or char_length(coalesce(normalized_reason,'')) not between 3 and 500
     or p_idempotency_key is null then
    raise exception 'Invalid owner-money-taken reversal values' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',p_owner_money_taken_id::text,
    p_reversed_on::text,normalized_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-money-taken-request:' || p_idempotency_key::text,0));

  select * into existing from public.owner_money_taken_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different owner-money-taken reversal' using errcode='23505';
    end if;
    return existing.id;
  end if;

  select * into original from public.owner_money_taken_events
  where id=p_owner_money_taken_id and event_type='taken' for update;
  if not found or exists (
    select 1 from public.owner_money_taken_events reversal where reversal.reversal_of_id=original.id
  ) then
    raise exception 'Active owner-money-taken event not found' using errcode='P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-capital-and-held:' || original.owner_label,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-held:' || original.owner_label,0));

  select * into original_cash from public.cash_movements where id=original.cash_movement_id for update;
  if not found or exists (select 1 from public.cash_movements where reversal_of_id=original_cash.id) then
    raise exception 'Linked active cash effect not found' using errcode='P0002';
  end if;
  insert into public.cash_movements (
    movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,reversal_of_id,idempotency_key,request_fingerprint,created_by
  ) values (
    p_reversed_on,'inflow','reversal',original_cash.account_key,original_cash.amount,
    'Reversal: ' || normalized_reason,original_cash.reference,original.owner_label,
    original_cash.id,p_idempotency_key::text || ':cash',fingerprint,actor
  ) returning id into cash_reversal_id;

  if original.capital_return_id is not null then
    select * into original_capital from public.owner_capital_return_events
    where id=original.capital_return_id and event_type='return' for update;
    if not found or exists (select 1 from public.owner_capital_return_events where reversal_of_id=original_capital.id) then
      raise exception 'Linked active capital-return effect not found' using errcode='P0002';
    end if;
    capital_key := (
      substr(md5(p_idempotency_key::text || ':capital'),1,8) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),9,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),13,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),17,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':capital'),21,12)
    )::uuid;
    insert into public.owner_capital_return_events (
      event_type,event_date,owner_label,amount,settlement_treatment,reversal_of_id,
      reason,idempotency_key,request_fingerprint,created_by
    ) values (
      'reversal',p_reversed_on,original.owner_label,original.capital_return_amount,
      original_capital.settlement_treatment,original_capital.id,normalized_reason,
      capital_key,fingerprint,actor
    ) returning id into capital_reversal_id;
  end if;

  if original.owner_held_event_id is not null then
    select * into original_due from public.owner_held_fund_events
    where id=original.owner_held_event_id and event_type='receipt' for update;
    if not found or exists (select 1 from public.owner_held_fund_events where reversal_of_id=original_due.id) then
      raise exception 'Linked active Due-from-Owner effect not found' using errcode='P0002';
    end if;
    due_key := (
      substr(md5(p_idempotency_key::text || ':due'),1,8) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),9,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),13,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),17,4) || '-' ||
      substr(md5(p_idempotency_key::text || ':due'),21,12)
    )::uuid;
    insert into public.owner_held_fund_events (
      event_type,event_date,owner_label,amount,reversal_of_id,reason,
      idempotency_key,request_fingerprint,created_by
    ) values (
      'reversal',p_reversed_on,original.owner_label,original.excess_due_amount,
      original_due.id,normalized_reason,due_key,fingerprint,actor
    ) returning id into due_reversal_id;
  end if;

  insert into public.owner_money_taken_events (
    event_type,event_date,owner_label,amount,capital_return_amount,excess_due_amount,
    source_account_key,cash_movement_id,capital_return_id,owner_held_event_id,
    reversal_of_id,description,reference,idempotency_key,request_fingerprint,created_by
  ) values (
    'reversal',p_reversed_on,original.owner_label,original.amount,
    original.capital_return_amount,original.excess_due_amount,original.source_account_key,
    cash_reversal_id,capital_reversal_id,due_reversal_id,original.id,
    'Reversal: ' || normalized_reason,original.reference,p_idempotency_key,fingerprint,actor
  ) returning id into new_id;
  return new_id;
end
$function$;

-- Keep the older held-funds capital-return reversal valid now that capital
-- returns can also be settled from a business account.
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-capital-return:' || p_capital_return_id::text,0));
  select * into existing from public.owner_capital_return_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different capital return reversal' using errcode='23505';
    end if;
    return existing.id;
  end if;
  select * into original from public.owner_capital_return_events
  where id=p_capital_return_id and event_type='return' and settlement_treatment='owner_held_business_funds' for update;
  if not found or exists (select 1 from public.owner_capital_return_events where reversal_of_id=original.id) then
    raise exception 'Active owner-held capital return not found' using errcode='P0002';
  end if;
  select * into original_held from public.owner_held_fund_events
  where capital_return_id=original.id and event_type='spend' for update;
  if not found or exists (select 1 from public.owner_held_fund_events where reversal_of_id=original_held.id) then
    raise exception 'Linked owner-held capital return event not found' using errcode='P0002';
  end if;
  insert into public.owner_capital_return_events (
    event_type,event_date,owner_label,amount,settlement_treatment,reversal_of_id,
    reason,idempotency_key,request_fingerprint,created_by
  ) values (
    'reversal',p_reversed_on,original.owner_label,original.amount,original.settlement_treatment,
    original.id,normalized_reason,p_idempotency_key,fingerprint,actor
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

revoke all on table public.owner_money_taken_events,
  public.dashboard_owner_money_taken_history,
  public.dashboard_owner_position_daily
from public,anon;
grant select on table public.owner_money_taken_events,
  public.dashboard_owner_money_taken_history,
  public.dashboard_owner_position_daily
to authenticated;

revoke all on function public.record_owner_money_taken(date,text,numeric,text,text,text,uuid),
  public.reverse_owner_money_taken(uuid,date,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.record_owner_money_taken(date,text,numeric,text,text,text,uuid),
  public.reverse_owner_money_taken(uuid,date,text,uuid)
to authenticated;

commit;

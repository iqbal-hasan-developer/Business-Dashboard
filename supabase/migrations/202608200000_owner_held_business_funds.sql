begin;

-- Business money temporarily held or spent by an owner is an accountable
-- business asset. It is neither owner capital nor cash in a tracked account.

alter table public.financial_source_fundings
  drop constraint if exists financial_source_fundings_treatment_allowed,
  add constraint financial_source_fundings_treatment_allowed check (
    funding_treatment in (
      'business_account_paid', 'owner_paid_personally',
      'owner_held_business_funds', 'unpaid', 'already_represented'
    )
  ),
  drop constraint if exists financial_source_fundings_shape,
  add constraint financial_source_fundings_shape check (
    (funding_treatment = 'business_account_paid'
      and payment_date is not null
      and nullif(btrim(business_account_key), '') is not null
      and owner_label is null
      and existing_cash_movement_id is null)
    or (funding_treatment in ('owner_paid_personally', 'owner_held_business_funds')
      and payment_date is not null
      and business_account_key is null
      and nullif(btrim(owner_label), '') is not null
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

alter table public.cash_movements
  drop constraint if exists cash_movements_transaction_type_allowed,
  add constraint cash_movements_transaction_type_allowed check (
    transaction_type in (
      'owner_investment', 'owner_withdrawal',
      'operating_inflow', 'operating_outflow',
      'transfer_in', 'transfer_out', 'courier_settlement', 'expense',
      'ad_spend', 'procurement_payment', 'customer_payment',
      'owner_held_transfer', 'reversal'
    )
  ),
  drop constraint if exists cash_movements_correction_shape,
  add constraint cash_movements_correction_shape check (
    correction_of_id is null
    or (
      transaction_type in ('owner_investment', 'owner_withdrawal', 'owner_held_transfer')
      and reversal_of_id is null
      and order_id is null
      and settlement_id is null
      and expense_id is null
    )
  );

create table public.owner_held_fund_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('receipt', 'spend', 'reversal')),
  event_date date not null,
  owner_label text not null check (owner_label in ('Nasim', 'Rifat', 'Ikbal')),
  amount numeric(12,2) not null check (amount > 0 and amount = trunc(amount, 2)),
  funding_id uuid references public.financial_source_fundings(id) on delete restrict,
  settlement_id uuid references public.settlement_records(id) on delete restrict,
  cash_movement_id uuid references public.cash_movements(id) on delete restrict,
  original_owner_withdrawal_id uuid references public.cash_movements(id) on delete restrict,
  reversal_of_id uuid references public.owner_held_fund_events(id) on delete restrict,
  reason text,
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint owner_held_fund_events_shape check (
    (event_type = 'spend'
      and funding_id is not null
      and settlement_id is null
      and cash_movement_id is null
      and original_owner_withdrawal_id is null
      and reversal_of_id is null
      and reason is null)
    or (event_type = 'receipt'
      and funding_id is null
      and reversal_of_id is null
      and reason is not null
      and (
        (settlement_id is not null and cash_movement_id is null and original_owner_withdrawal_id is null)
        or (settlement_id is null and cash_movement_id is not null)
      ))
    or (event_type = 'reversal'
      and funding_id is null
      and settlement_id is null
      and original_owner_withdrawal_id is null
      and reversal_of_id is not null
      and reason is not null)
  )
);

create table public.owner_held_balance_observations (
  id uuid primary key default gen_random_uuid(),
  owner_label text not null check (owner_label in ('Nasim', 'Rifat', 'Ikbal')),
  observed_on date not null,
  actual_due numeric(12,2) not null check (actual_due >= 0 and actual_due = trunc(actual_due, 2)),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.steadfast_receivable_observations (
  id uuid primary key default gen_random_uuid(),
  observed_on date not null,
  actual_receivable numeric(12,2) not null check (
    actual_receivable >= 0 and actual_receivable = trunc(actual_receivable, 2)
  ),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.financial_source_funding_reversals
  add column if not exists owner_held_reversal_id uuid
    references public.owner_held_fund_events(id) on delete restrict;

alter table public.settlement_records
  add column if not exists receipt_treatment text not null default 'business_account',
  add column if not exists owner_label text,
  drop constraint if exists settlement_records_receipt_treatment_allowed,
  add constraint settlement_records_receipt_treatment_allowed check (
    receipt_treatment in ('business_account', 'owner_held_business_funds')
  ),
  drop constraint if exists settlement_records_receipt_shape,
  add constraint settlement_records_receipt_shape check (
    confirmed_at is null
    or (receipt_treatment = 'business_account'
      and receiving_method in ('bkash', 'bank_transfer')
      and owner_label is null)
    or (receipt_treatment = 'owner_held_business_funds'
      and receiving_method is null
      and receiving_account_label is null
      and receiving_account_last4 is null
      and owner_label in ('Nasim', 'Rifat', 'Ikbal'))
  ),
  drop constraint if exists settlement_records_confirmed_totals_reconcile,
  add constraint settlement_records_confirmed_totals_reconcile check (
    confirmed_at is null or (
      courier = 'Steadfast'
      and gross_cod_amount is not null
      and gross_cod_amount > 0
      and fees_withheld >= 0
      and amount_received > 0
      and amount_received = gross_cod_amount - fees_withheld
      and idempotency_key is not null
      and request_fingerprint is not null
      and status = 'reconciled'
    )
  );

alter table public.settlement_reversals
  add column if not exists owner_held_reversal_id uuid
    references public.owner_held_fund_events(id) on delete restrict;

create unique index owner_held_fund_events_funding_uidx
  on public.owner_held_fund_events (funding_id)
  where funding_id is not null and event_type = 'spend';
create unique index owner_held_fund_events_settlement_uidx
  on public.owner_held_fund_events (settlement_id)
  where settlement_id is not null and event_type = 'receipt';
create unique index owner_held_fund_events_cash_uidx
  on public.owner_held_fund_events (cash_movement_id)
  where cash_movement_id is not null;
create unique index owner_held_fund_events_withdrawal_uidx
  on public.owner_held_fund_events (original_owner_withdrawal_id)
  where original_owner_withdrawal_id is not null;
create unique index owner_held_fund_events_reversal_uidx
  on public.owner_held_fund_events (reversal_of_id)
  where reversal_of_id is not null;
create index owner_held_fund_events_owner_date_idx
  on public.owner_held_fund_events (owner_label, event_date desc, created_at desc);
create index owner_held_balance_observations_latest_idx
  on public.owner_held_balance_observations (owner_label, observed_on desc, created_at desc);
create index steadfast_receivable_observations_latest_idx
  on public.steadfast_receivable_observations (observed_on desc, created_at desc);

create trigger owner_held_fund_events_immutable
before update or delete on public.owner_held_fund_events
for each row execute function public.dashboard_reject_funding_history_mutation();
create trigger owner_held_balance_observations_immutable
before update or delete on public.owner_held_balance_observations
for each row execute function public.dashboard_reject_funding_history_mutation();
create trigger steadfast_receivable_observations_immutable
before update or delete on public.steadfast_receivable_observations
for each row execute function public.dashboard_reject_funding_history_mutation();

alter table public.owner_held_fund_events enable row level security;
alter table public.owner_held_balance_observations enable row level security;
alter table public.steadfast_receivable_observations enable row level security;

create policy "Dashboard users read owner-held funds"
on public.owner_held_fund_events for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));
create policy "Dashboard users read owner-held observations"
on public.owner_held_balance_observations for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));
create policy "Dashboard users read Steadfast observations"
on public.steadfast_receivable_observations for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

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
  event.created_at
from public.owner_held_fund_events event
left join public.owner_held_fund_events original on original.id = event.reversal_of_id;

create or replace view public.dashboard_owner_held_balances
with (security_invoker = true)
as
with owners(owner_label) as (
  values ('Nasim'::text), ('Rifat'::text), ('Ikbal'::text)
), ledger as (
  select owner_label, sum(signed_amount)::numeric(14,2) as ledger_due
  from public.dashboard_owner_held_funds
  group by owner_label
), latest_observation as (
  select distinct on (owner_label)
    owner_label, actual_due, observed_on, reason, created_at
  from public.owner_held_balance_observations
  order by owner_label, observed_on desc, created_at desc
)
select
  owners.owner_label,
  coalesce(ledger.ledger_due, 0)::numeric(14,2) as ledger_due,
  observation.actual_due,
  case when observation.actual_due is null then null
    else (observation.actual_due - coalesce(ledger.ledger_due, 0))::numeric(14,2) end as difference,
  observation.observed_on,
  observation.reason as observation_reason
from owners
left join ledger using (owner_label)
left join latest_observation observation using (owner_label);

create or replace view public.dashboard_steadfast_receivable_reconciliation
with (security_invoker = true)
as
with calculated as (
  select coalesce(sum(gross_cod_receivable), 0)::numeric(14,2) as calculated_receivable
  from public.dashboard_steadfast_settlement_eligible_orders
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
    else (observation.actual_receivable - calculated.calculated_receivable)::numeric(14,2) end as difference,
  observation.observed_on,
  observation.reason as observation_reason
from calculated
left join latest_observation observation on true;

create or replace function public.dashboard_owner_held_balance(p_owner_label text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(signed_amount), 0)::numeric(14,2)
  from public.dashboard_owner_held_funds
  where owner_label = case lower(btrim(p_owner_label))
    when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' when 'ikbal' then 'Ikbal' end;
$function$;

create or replace function public.dashboard_insert_source_funding(
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
  actor uuid := (select auth.uid());
  normalized_source text := lower(btrim(p_source_type));
  normalized_treatment text := lower(btrim(p_funding_treatment));
  normalized_account text := nullif(lower(btrim(p_business_account_key)), '');
  normalized_owner text := case lower(btrim(p_owner_label))
    when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' when 'ikbal' then 'Ikbal' end;
  source_amount numeric := public.dashboard_source_amount(p_source_type, p_source_id);
  expense_source uuid := case when normalized_source = 'expense' then p_source_id end;
  ad_source uuid := case when normalized_source = 'ad_spend' then p_source_id end;
  batch_source uuid := case when normalized_source = 'purchase_batch' then p_source_id end;
  existing public.financial_source_fundings%rowtype;
  existing_cash public.cash_movements%rowtype;
  fingerprint text;
  funding_id uuid;
  cash_type text;
begin
  if p_idempotency_key is null
     or normalized_treatment not in (
       'business_account_paid', 'owner_paid_personally',
       'owner_held_business_funds', 'unpaid', 'already_represented'
     ) then
    raise exception 'Invalid source-funding values' using errcode = '22023';
  end if;
  if normalized_treatment in ('business_account_paid', 'already_represented') then
    if p_payment_date is null or normalized_account is null then
      raise exception 'Business account and payment date are required' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.business_lookup_values
      where lookup_type = 'cash_account' and lookup_key = normalized_account and is_active
    ) then
      raise exception 'Cash account is not active' using errcode = '22023';
    end if;
  elsif normalized_treatment in ('owner_paid_personally', 'owner_held_business_funds') then
    if p_payment_date is null or normalized_owner is null then
      raise exception 'Payment date and approved owner are required' using errcode = '22023';
    end if;
  elsif p_payment_date is not null or normalized_account is not null
     or normalized_owner is not null or p_existing_cash_movement_id is not null then
    raise exception 'Unpaid funding must not include payment evidence' using errcode = '22023';
  end if;

  if normalized_treatment = 'already_represented' then
    select * into existing_cash from public.cash_movements
    where id = p_existing_cash_movement_id for share;
    if not found
       or existing_cash.amount <> source_amount
       or existing_cash.movement_type not in ('outflow', 'transfer_out')
       or existing_cash.account_key <> normalized_account
       or existing_cash.movement_date <> p_payment_date
       or existing_cash.reversal_of_id is not null
       or exists (select 1 from public.cash_movements r where r.reversal_of_id = existing_cash.id) then
      raise exception 'Existing cash movement does not match the source payment' using errcode = '22023';
    end if;
  elsif p_existing_cash_movement_id is not null then
    raise exception 'Existing movement is allowed only for already represented funding' using errcode = '22023';
  end if;

  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', normalized_source,
    p_source_id::text, normalized_treatment, coalesce(p_payment_date::text, ''),
    coalesce(normalized_account, ''), coalesce(normalized_owner, ''),
    coalesce(p_existing_cash_movement_id::text, ''), coalesce(btrim(p_notes), '')));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_source || ':' || p_source_id::text, 0)
  );
  if normalized_treatment = 'owner_held_business_funds' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('owner-held:' || normalized_owner, 0)
    );
  end if;
  select * into existing from public.financial_source_fundings
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for different funding values'
        using errcode = '23505';
    end if;
    return existing.id;
  end if;
  if exists (
    select 1
    from public.financial_source_fundings funding
    left join public.financial_source_funding_reversals reversal
      on reversal.funding_id = funding.id
    where reversal.id is null
      and ((normalized_source = 'expense' and funding.expense_id = p_source_id)
        or (normalized_source = 'ad_spend' and funding.ad_spend_id = p_source_id)
        or (normalized_source = 'purchase_batch' and funding.purchase_batch_id = p_source_id))
  ) then
    raise exception 'Financial source already has an active funding classification'
      using errcode = '23505';
  end if;
  if normalized_treatment = 'owner_held_business_funds'
     and public.dashboard_owner_held_balance(normalized_owner) < source_amount then
    raise exception 'Owner-held business funds are insufficient for this payment'
      using errcode = '23514';
  end if;

  insert into public.financial_source_fundings (
    expense_id, ad_spend_id, purchase_batch_id, funding_treatment,
    payment_date, business_account_key, amount, owner_label,
    existing_cash_movement_id, notes, idempotency_key, request_fingerprint,
    created_by
  ) values (
    expense_source, ad_source, batch_source, normalized_treatment,
    p_payment_date, normalized_account, source_amount, normalized_owner,
    p_existing_cash_movement_id, nullif(btrim(p_notes), ''),
    p_idempotency_key, fingerprint, actor
  ) returning id into funding_id;

  if normalized_treatment = 'business_account_paid' then
    cash_type := case
      when normalized_source = 'ad_spend' then 'ad_spend'
      when normalized_source = 'purchase_batch' then 'procurement_payment'
      when exists (select 1 from public.expenses where id = p_source_id
        and accounting_class <> 'operating_expense') then 'procurement_payment'
      else 'expense'
    end;
    insert into public.cash_movements (
      movement_date, movement_type, transaction_type, account_key, amount,
      expense_id, description, reference, funding_id, idempotency_key,
      request_fingerprint, created_by
    ) values (
      p_payment_date, 'outflow', cash_type, normalized_account, source_amount,
      expense_source, case cash_type
        when 'ad_spend' then 'Advertising-spend payment'
        when 'procurement_payment' then 'Inventory-procurement payment'
        else 'Operating-expense payment' end,
      null, funding_id, p_idempotency_key::text || ':cash', fingerprint, actor
    );
  elsif normalized_treatment = 'owner_paid_personally' then
    insert into public.owner_non_cash_capital_events (
      funding_id, event_type, event_date, owner_label, amount, created_by
    ) values (
      funding_id, 'contribution', p_payment_date, normalized_owner,
      source_amount, actor
    );
  elsif normalized_treatment = 'owner_held_business_funds' then
    insert into public.owner_held_fund_events (
      event_type, event_date, owner_label, amount, funding_id,
      idempotency_key, request_fingerprint, created_by
    ) values (
      'spend', p_payment_date, normalized_owner, source_amount, funding_id,
      p_idempotency_key, fingerprint, actor
    );
  end if;
  return funding_id;
end
$function$;

create or replace function public.pay_unpaid_financial_source(
  p_source_type text,
  p_source_id uuid,
  p_funding_treatment text,
  p_payment_date date,
  p_business_account_key text,
  p_owner_label text,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  unpaid public.financial_source_fundings%rowtype;
  normalized_source text := lower(btrim(p_source_type));
  reversal_key uuid := gen_random_uuid();
  fingerprint text;
begin
  if not public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]) then
    raise exception 'Not authorized to post source payments' using errcode = '42501';
  end if;
  if lower(btrim(p_funding_treatment)) not in (
       'business_account_paid', 'owner_paid_personally', 'owner_held_business_funds'
     ) or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Payment treatment and reason are required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_source || ':' || p_source_id::text, 0)
  );
  select funding.* into unpaid
  from public.financial_source_fundings funding
  left join public.financial_source_funding_reversals reversal on reversal.funding_id = funding.id
  where reversal.id is null and funding.funding_treatment = 'unpaid'
    and ((normalized_source = 'expense' and funding.expense_id = p_source_id)
      or (normalized_source = 'ad_spend' and funding.ad_spend_id = p_source_id)
      or (normalized_source = 'purchase_batch' and funding.purchase_batch_id = p_source_id))
  for update of funding;
  if not found then
    raise exception 'Active unpaid source classification not found' using errcode = 'P0002';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', unpaid.id::text,
    p_funding_treatment, p_payment_date::text, coalesce(p_business_account_key, ''),
    coalesce(p_owner_label, ''), btrim(p_reason)));
  insert into public.financial_source_funding_reversals (
    funding_id, reversed_on, reason, idempotency_key, request_fingerprint, created_by
  ) values (
    unpaid.id, p_payment_date, btrim(p_reason), reversal_key, fingerprint, (select auth.uid())
  );
  return public.dashboard_insert_source_funding(
    normalized_source, p_source_id, p_funding_treatment, p_payment_date,
    p_business_account_key, p_owner_label, null, p_reason, p_idempotency_key
  );
end
$function$;

create or replace function public.reverse_financial_source_funding(
  p_funding_id uuid,
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
  funding public.financial_source_fundings%rowtype;
  original_cash public.cash_movements%rowtype;
  original_capital public.owner_non_cash_capital_events%rowtype;
  original_held public.owner_held_fund_events%rowtype;
  cash_reversal uuid;
  capital_reversal uuid;
  held_reversal uuid;
  reversal_id uuid;
  existing public.financial_source_funding_reversals%rowtype;
  fingerprint text;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse source funding' using errcode = '42501';
  end if;
  if p_reversed_on is null or p_idempotency_key is null
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Reversal date, reason, and idempotency key are required' using errcode = '22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_funding_id::text,
    p_reversed_on::text, btrim(p_reason)));
  select * into existing from public.financial_source_funding_reversals
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different funding reversal'
        using errcode = '23505';
    end if;
    return existing.id;
  end if;
  select * into funding from public.financial_source_fundings
  where id = p_funding_id for update;
  if not found then raise exception 'Funding record not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.financial_source_funding_reversals where funding_id = funding.id) then
    raise exception 'Funding record was already reversed' using errcode = '23505';
  end if;
  if funding.funding_treatment = 'business_account_paid' then
    select * into original_cash from public.cash_movements where funding_id = funding.id for share;
    if not found then raise exception 'Linked cash movement not found' using errcode = 'P0002'; end if;
    insert into public.cash_movements (
      movement_date, movement_type, transaction_type, account_key, amount,
      description, reference, reversal_of_id, idempotency_key,
      request_fingerprint, created_by
    ) values (
      p_reversed_on, 'inflow', 'reversal', original_cash.account_key,
      original_cash.amount, 'Reversal: ' || btrim(p_reason), original_cash.reference,
      original_cash.id, p_idempotency_key::text || ':cash', fingerprint, actor
    ) returning id into cash_reversal;
  elsif funding.funding_treatment = 'owner_paid_personally' then
    select * into original_capital from public.owner_non_cash_capital_events
    where funding_id = funding.id and event_type = 'contribution' for share;
    if not found then raise exception 'Linked owner contribution not found' using errcode = 'P0002'; end if;
    insert into public.owner_non_cash_capital_events (
      funding_id, event_type, event_date, owner_label, amount,
      reversal_of_id, reason, created_by
    ) values (
      funding.id, 'reversal', p_reversed_on, original_capital.owner_label,
      original_capital.amount, original_capital.id, btrim(p_reason), actor
    ) returning id into capital_reversal;
  elsif funding.funding_treatment = 'owner_held_business_funds' then
    select * into original_held from public.owner_held_fund_events
    where funding_id = funding.id and event_type = 'spend' for share;
    if not found then raise exception 'Linked owner-held spending event not found' using errcode = 'P0002'; end if;
    insert into public.owner_held_fund_events (
      event_type, event_date, owner_label, amount, reversal_of_id, reason,
      idempotency_key, request_fingerprint, created_by
    ) values (
      'reversal', p_reversed_on, original_held.owner_label, original_held.amount,
      original_held.id, btrim(p_reason), p_idempotency_key, fingerprint, actor
    ) returning id into held_reversal;
  end if;
  insert into public.financial_source_funding_reversals (
    funding_id, reversed_on, reason, cash_reversal_id,
    owner_capital_reversal_id, owner_held_reversal_id,
    idempotency_key, request_fingerprint, created_by
  ) values (
    funding.id, p_reversed_on, btrim(p_reason), cash_reversal,
    capital_reversal, held_reversal, p_idempotency_key, fingerprint, actor
  ) returning id into reversal_id;
  return reversal_id;
end
$function$;

create or replace function public.record_owner_held_fund_transfer(
  p_transfer_date date,
  p_owner_label text,
  p_business_account_key text,
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
  normalized_account text := lower(btrim(p_business_account_key));
  fingerprint text;
  existing public.owner_held_fund_events%rowtype;
  cash_id uuid;
  event_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then
    raise exception 'Owner or admin access is required' using errcode = '42501';
  end if;
  if p_transfer_date is null or normalized_owner is null or p_amount is null or p_amount <= 0
     or p_amount <> trunc(p_amount,2) or p_idempotency_key is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500
     or normalized_account not in ('cash','bkash','nagad','bank')
     or not exists (select 1 from public.business_lookup_values where lookup_type='cash_account'
       and lookup_key=normalized_account and is_active) then
    raise exception 'Invalid owner-held transfer values' using errcode = '22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_transfer_date::text,
    normalized_owner, normalized_account, p_amount::text, btrim(p_reason)));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-held:' || normalized_owner, 0)
  );
  select * into existing from public.owner_held_fund_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different owner-held transfer' using errcode='23505';
    end if;
    return existing.id;
  end if;
  insert into public.cash_movements (
    movement_date,movement_type,transaction_type,account_key,amount,description,
    owner_label,idempotency_key,request_fingerprint,created_by
  ) values (
    p_transfer_date,'outflow','owner_held_transfer',normalized_account,p_amount,
    'Business funds transferred to ' || normalized_owner,normalized_owner,
    p_idempotency_key::text || ':cash',fingerprint,actor
  ) returning id into cash_id;
  insert into public.owner_held_fund_events (
    event_type,event_date,owner_label,amount,cash_movement_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'receipt',p_transfer_date,normalized_owner,p_amount,cash_id,btrim(p_reason),
    p_idempotency_key,fingerprint,actor
  ) returning id into event_id;
  return event_id;
end
$function$;

create or replace function public.reclassify_owner_withdrawal_as_held(
  p_original_movement_id uuid,
  p_reclassified_on date,
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
  original public.cash_movements%rowtype;
  existing public.owner_held_fund_events%rowtype;
  fingerprint text;
  replacement_cash_id uuid;
  event_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reclassify owner withdrawals' using errcode='42501';
  end if;
  if p_reclassified_on is null or p_idempotency_key is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Reclassification date, reason, and idempotency key are required' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',p_original_movement_id::text,
    p_reclassified_on::text,btrim(p_reason)));
  select * into existing from public.owner_held_fund_events where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different reclassification' using errcode='23505';
    end if;
    return existing.id;
  end if;
  select * into original from public.cash_movements where id=p_original_movement_id for update;
  if not found or original.transaction_type <> 'owner_withdrawal'
     or original.owner_label not in ('Nasim','Rifat','Ikbal')
     or original.reversal_of_id is not null
     or exists (select 1 from public.cash_movements r where r.reversal_of_id=original.id) then
    raise exception 'Active owner withdrawal not found' using errcode='P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-held:' || original.owner_label, 0)
  );
  insert into public.cash_movements (
    movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,reversal_of_id,idempotency_key,request_fingerprint,created_by
  ) values (
    p_reclassified_on,'inflow','reversal',original.account_key,original.amount,
    'Reclassification reversal: ' || btrim(p_reason),original.reference,original.owner_label,
    original.id,p_idempotency_key::text || ':reversal',fingerprint,actor
  );
  insert into public.cash_movements (
    movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,correction_of_id,idempotency_key,request_fingerprint,created_by
  ) values (
    original.movement_date,'outflow','owner_held_transfer',original.account_key,original.amount,
    'Business funds held by ' || original.owner_label,original.reference,original.owner_label,
    original.id,p_idempotency_key::text || ':replacement',fingerprint,actor
  ) returning id into replacement_cash_id;
  insert into public.owner_held_fund_events (
    event_type,event_date,owner_label,amount,cash_movement_id,original_owner_withdrawal_id,
    reason,idempotency_key,request_fingerprint,created_by
  ) values (
    'receipt',original.movement_date,original.owner_label,original.amount,replacement_cash_id,
    original.id,btrim(p_reason),p_idempotency_key,fingerprint,actor
  ) returning id into event_id;
  return event_id;
end
$function$;

create or replace function public.record_owner_held_balance_observation(
  p_owner_label text,
  p_observed_on date,
  p_actual_due numeric,
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
  fingerprint text;
  existing public.owner_held_balance_observations%rowtype;
  new_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may record owner-held control balances' using errcode='42501';
  end if;
  if normalized_owner is null or p_observed_on is null or p_actual_due is null or p_actual_due < 0
     or p_actual_due <> trunc(p_actual_due,2) or p_idempotency_key is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Invalid owner-held observation values' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',normalized_owner,p_observed_on::text,
    p_actual_due::text,btrim(p_reason)));
  select * into existing from public.owner_held_balance_observations where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then raise exception 'Idempotency key conflict' using errcode='23505'; end if;
    return existing.id;
  end if;
  insert into public.owner_held_balance_observations (
    owner_label,observed_on,actual_due,reason,idempotency_key,request_fingerprint,created_by
  ) values (normalized_owner,p_observed_on,p_actual_due,btrim(p_reason),p_idempotency_key,fingerprint,actor)
  returning id into new_id;
  return new_id;
end
$function$;

create or replace function public.record_steadfast_receivable_observation(
  p_observed_on date,
  p_actual_receivable numeric,
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
  fingerprint text;
  existing public.steadfast_receivable_observations%rowtype;
  new_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may record Steadfast control balances' using errcode='42501';
  end if;
  if p_observed_on is null or p_actual_receivable is null or p_actual_receivable < 0
     or p_actual_receivable <> trunc(p_actual_receivable,2) or p_idempotency_key is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Invalid Steadfast observation values' using errcode='22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',p_observed_on::text,
    p_actual_receivable::text,btrim(p_reason)));
  select * into existing from public.steadfast_receivable_observations where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then raise exception 'Idempotency key conflict' using errcode='23505'; end if;
    return existing.id;
  end if;
  insert into public.steadfast_receivable_observations (
    observed_on,actual_receivable,reason,idempotency_key,request_fingerprint,created_by
  ) values (p_observed_on,p_actual_receivable,btrim(p_reason),p_idempotency_key,fingerprint,actor)
  returning id into new_id;
  return new_id;
end
$function$;

revoke all on table public.owner_held_fund_events,
  public.owner_held_balance_observations,
  public.steadfast_receivable_observations
from public, anon, authenticated, service_role;
grant select on table public.owner_held_fund_events,
  public.owner_held_balance_observations,
  public.steadfast_receivable_observations
to authenticated;

revoke all on table public.dashboard_owner_held_funds,
  public.dashboard_owner_held_balances,
  public.dashboard_steadfast_receivable_reconciliation
from public, anon;
grant select on table public.dashboard_owner_held_funds,
  public.dashboard_owner_held_balances,
  public.dashboard_steadfast_receivable_reconciliation
to authenticated;

revoke all on function public.dashboard_owner_held_balance(text),
  public.record_owner_held_fund_transfer(date,text,text,numeric,text,uuid),
  public.reclassify_owner_withdrawal_as_held(uuid,date,text,uuid),
  public.record_owner_held_balance_observation(text,date,numeric,text,uuid),
  public.record_steadfast_receivable_observation(date,numeric,text,uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_owner_held_fund_transfer(date,text,text,numeric,text,uuid)
to authenticated;
grant execute on function public.reclassify_owner_withdrawal_as_held(uuid,date,text,uuid),
  public.record_owner_held_balance_observation(text,date,numeric,text,uuid),
  public.record_steadfast_receivable_observation(date,numeric,text,uuid)
to authenticated;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if to_regclass('public.cash_movements') is null
     or to_regclass('public.expenses') is null
     or to_regclass('public.daily_ad_spend') is null
     or to_regclass('public.purchase_batches') is null then
    raise exception 'Cash source-funding prerequisites are missing.';
  end if;
end
$preflight$;

create table public.financial_source_fundings (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.expenses(id) on delete restrict,
  ad_spend_id uuid references public.daily_ad_spend(id) on delete restrict,
  purchase_batch_id uuid references public.purchase_batches(id) on delete restrict,
  funding_treatment text not null,
  payment_date date,
  business_account_key text,
  amount numeric(12,2) not null,
  owner_label text,
  existing_cash_movement_id uuid references public.cash_movements(id) on delete restrict,
  notes text,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_source_fundings_one_source check (
    ((expense_id is not null)::integer
      + (ad_spend_id is not null)::integer
      + (purchase_batch_id is not null)::integer) = 1
  ),
  constraint financial_source_fundings_treatment_allowed check (
    funding_treatment in (
      'business_account_paid', 'owner_paid_personally', 'unpaid',
      'already_represented'
    )
  ),
  constraint financial_source_fundings_amount_positive check (
    amount > 0 and amount = trunc(amount, 2)
  ),
  constraint financial_source_fundings_shape check (
    (funding_treatment = 'business_account_paid'
      and payment_date is not null
      and nullif(btrim(business_account_key), '') is not null
      and owner_label is null
      and existing_cash_movement_id is null)
    or (funding_treatment = 'owner_paid_personally'
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
  )
);

create table public.owner_non_cash_capital_events (
  id uuid primary key default gen_random_uuid(),
  funding_id uuid not null references public.financial_source_fundings(id) on delete restrict,
  event_type text not null check (event_type in ('contribution', 'reversal')),
  event_date date not null,
  owner_label text not null,
  amount numeric(12,2) not null check (amount > 0 and amount = trunc(amount, 2)),
  reversal_of_id uuid references public.owner_non_cash_capital_events(id) on delete restrict,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint owner_non_cash_capital_events_shape check (
    (event_type = 'contribution' and reversal_of_id is null and reason is null)
    or (event_type = 'reversal' and reversal_of_id is not null
      and nullif(btrim(reason), '') is not null)
  )
);

create table public.financial_source_funding_reversals (
  id uuid primary key default gen_random_uuid(),
  funding_id uuid not null unique references public.financial_source_fundings(id) on delete restrict,
  reversed_on date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  cash_reversal_id uuid references public.cash_movements(id) on delete restrict,
  owner_capital_reversal_id uuid references public.owner_non_cash_capital_events(id) on delete restrict,
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.cash_account_balance_observations (
  id uuid primary key default gen_random_uuid(),
  account_key text not null,
  observed_on date not null,
  actual_balance numeric(12,2) not null check (
    actual_balance >= 0 and actual_balance = trunc(actual_balance, 2)
  ),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cash_movements
  add column if not exists funding_id uuid
    references public.financial_source_fundings(id) on delete restrict;

alter table public.cash_movements
  drop constraint if exists cash_movements_transaction_type_allowed,
  add constraint cash_movements_transaction_type_allowed check (
    transaction_type in (
      'owner_investment', 'owner_withdrawal',
      'operating_inflow', 'operating_outflow',
      'transfer_in', 'transfer_out', 'courier_settlement', 'expense',
      'ad_spend', 'procurement_payment', 'customer_payment', 'reversal'
    )
  );

create unique index financial_source_fundings_idempotency_uidx
  on public.financial_source_fundings (idempotency_key);
create unique index financial_source_fundings_existing_cash_uidx
  on public.financial_source_fundings (existing_cash_movement_id)
  where existing_cash_movement_id is not null;
create index financial_source_fundings_expense_idx
  on public.financial_source_fundings (expense_id) where expense_id is not null;
create index financial_source_fundings_ad_spend_idx
  on public.financial_source_fundings (ad_spend_id) where ad_spend_id is not null;
create index financial_source_fundings_purchase_batch_idx
  on public.financial_source_fundings (purchase_batch_id) where purchase_batch_id is not null;
create unique index cash_movements_funding_uidx
  on public.cash_movements (funding_id) where funding_id is not null;
create unique index owner_non_cash_capital_funding_uidx
  on public.owner_non_cash_capital_events (funding_id)
  where event_type = 'contribution';
create unique index owner_non_cash_capital_reversal_uidx
  on public.owner_non_cash_capital_events (reversal_of_id)
  where reversal_of_id is not null;
create index cash_account_observations_latest_idx
  on public.cash_account_balance_observations
  (account_key, observed_on desc, created_at desc);

create or replace function public.dashboard_reject_funding_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Posted funding and reconciliation history is append-only; create an audited reversal instead.'
    using errcode = 'P0001';
end
$function$;

create trigger financial_source_fundings_immutable
before update or delete on public.financial_source_fundings
for each row execute function public.dashboard_reject_funding_history_mutation();
create trigger owner_non_cash_capital_events_immutable
before update or delete on public.owner_non_cash_capital_events
for each row execute function public.dashboard_reject_funding_history_mutation();
create trigger financial_source_funding_reversals_immutable
before update or delete on public.financial_source_funding_reversals
for each row execute function public.dashboard_reject_funding_history_mutation();
create trigger cash_account_balance_observations_immutable
before update or delete on public.cash_account_balance_observations
for each row execute function public.dashboard_reject_funding_history_mutation();

create or replace function public.dashboard_source_amount(
  p_source_type text,
  p_source_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  source_amount numeric;
begin
  case lower(btrim(p_source_type))
    when 'expense' then
      select amount into source_amount from public.expenses where id = p_source_id;
    when 'ad_spend' then
      select amount into source_amount from public.daily_ad_spend where id = p_source_id;
    when 'purchase_batch' then
      select public.dashboard_poisha_to_money(landed_total_poisha)
      into source_amount from public.purchase_batches where id = p_source_id;
    else
      raise exception 'Unsupported financial source type' using errcode = '22023';
  end case;
  if source_amount is null then
    raise exception 'Financial source record not found' using errcode = 'P0002';
  end if;
  return source_amount;
end
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
  normalized_owner text := nullif(btrim(p_owner_label), '');
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
       'business_account_paid', 'owner_paid_personally', 'unpaid',
       'already_represented'
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
  elsif normalized_treatment = 'owner_paid_personally' then
    if p_payment_date is null or normalized_owner not in ('Nasim', 'Rifat', 'Ikbal') then
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
  end if;
  return funding_id;
end
$function$;

create or replace function public.record_funded_expense(
  p_expense_date date,
  p_category_key text,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_campaign_id uuid,
  p_sales_channel text,
  p_reference text,
  p_funding_treatment text,
  p_payment_date date,
  p_business_account_key text,
  p_owner_label text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  expense_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]) then
    raise exception 'Not authorized to record expenses' using errcode = '42501';
  end if;
  if p_expense_date is null
     or not public.dashboard_expense_category_allowed(p_category_key)
     or char_length(btrim(coalesce(p_description, ''))) not between 2 and 500
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
     or p_amount <> trunc(p_amount, 2)
     or char_length(coalesce(p_payment_method, '')) > 80
     or char_length(coalesce(p_sales_channel, '')) > 100
     or char_length(coalesce(p_reference, '')) > 160 then
    raise exception 'Invalid expense values' using errcode = '22023';
  end if;
  insert into public.expenses (
    expense_date, category_key, description, amount, payment_method,
    campaign_id, sales_channel, reference, created_by, updated_by
  ) values (
    p_expense_date, lower(btrim(p_category_key)), btrim(p_description), p_amount,
    nullif(btrim(p_payment_method), ''), p_campaign_id,
    nullif(btrim(p_sales_channel), ''), nullif(btrim(p_reference), ''),
    actor, actor
  ) returning id into expense_id;
  perform public.dashboard_insert_source_funding(
    'expense', expense_id, p_funding_treatment, p_payment_date,
    p_business_account_key, p_owner_label, null, null, p_idempotency_key
  );
  return expense_id;
end
$function$;

create or replace function public.record_funded_ad_spend(
  p_campaign_id uuid,
  p_spend_date date,
  p_platform text,
  p_amount numeric,
  p_source_reference text,
  p_funding_treatment text,
  p_payment_date date,
  p_business_account_key text,
  p_owner_label text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  spend_id uuid;
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin', 'data_entry']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record advertising spend' using errcode = '42501';
  end if;
  if p_spend_date is null or nullif(btrim(p_platform), '') is null
     or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 2) then
    raise exception 'Invalid advertising-spend values' using errcode = '22023';
  end if;
  insert into public.daily_ad_spend (
    campaign_id, spend_date, platform, amount, source_reference,
    created_by, updated_by
  ) values (
    p_campaign_id, p_spend_date, btrim(p_platform), p_amount,
    nullif(btrim(p_source_reference), ''), actor, actor
  ) returning id into spend_id;
  perform public.dashboard_insert_source_funding(
    'ad_spend', spend_id, p_funding_treatment, p_payment_date,
    p_business_account_key, p_owner_label, null, null, p_idempotency_key
  );
  return spend_id;
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
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may classify historical funding' using errcode = '42501';
  end if;
  return public.dashboard_insert_source_funding(
    p_source_type, p_source_id, p_funding_treatment, p_payment_date,
    p_business_account_key, p_owner_label, p_existing_cash_movement_id,
    p_notes, p_idempotency_key
  );
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
  if lower(btrim(p_funding_treatment)) not in ('business_account_paid', 'owner_paid_personally')
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
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
  cash_reversal uuid;
  capital_reversal uuid;
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
  end if;
  insert into public.financial_source_funding_reversals (
    funding_id, reversed_on, reason, cash_reversal_id,
    owner_capital_reversal_id, idempotency_key, request_fingerprint, created_by
  ) values (
    funding.id, p_reversed_on, btrim(p_reason), cash_reversal,
    capital_reversal, p_idempotency_key, fingerprint, actor
  ) returning id into reversal_id;
  return reversal_id;
end
$function$;

create or replace function public.record_cash_account_balance_observation(
  p_account_key text,
  p_observed_on date,
  p_actual_balance numeric,
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
  normalized_account text := lower(btrim(p_account_key));
  fingerprint text;
  existing public.cash_account_balance_observations%rowtype;
  new_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may record actual account balances' using errcode = '42501';
  end if;
  if p_observed_on is null or p_actual_balance is null or p_actual_balance < 0
     or p_actual_balance <> trunc(p_actual_balance, 2)
     or p_idempotency_key is null
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500
     or not exists (select 1 from public.business_lookup_values
       where lookup_type = 'cash_account' and lookup_key = normalized_account and is_active) then
    raise exception 'Invalid account observation values' using errcode = '22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', normalized_account,
    p_observed_on::text, p_actual_balance::text, btrim(p_reason)));
  select * into existing from public.cash_account_balance_observations
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for different account values' using errcode = '23505';
    end if;
    return existing.id;
  end if;
  insert into public.cash_account_balance_observations (
    account_key, observed_on, actual_balance, reason, idempotency_key,
    request_fingerprint, created_by
  ) values (
    normalized_account, p_observed_on, p_actual_balance, btrim(p_reason),
    p_idempotency_key, fingerprint, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

create or replace view public.dashboard_owner_non_cash_capital
with (security_invoker = true)
as
select
  event.id,
  event.funding_id,
  event.event_date,
  event.owner_label,
  event.event_type,
  event.amount,
  case when event.event_type = 'contribution' then event.amount else -event.amount end
    as signed_amount,
  event.reversal_of_id,
  exists (select 1 from public.owner_non_cash_capital_events reversal
    where reversal.reversal_of_id = event.id) as is_reversed,
  event.reason,
  event.created_at
from public.owner_non_cash_capital_events event;

create or replace view public.dashboard_active_source_fundings
with (security_invoker = true)
as
select funding.id as funding_id,
  case when funding.expense_id is not null then 'expense'
    when funding.ad_spend_id is not null then 'ad_spend' else 'purchase_batch' end as source_type,
  coalesce(funding.expense_id, funding.ad_spend_id, funding.purchase_batch_id) as source_id,
  coalesce(expense.expense_date, spend.spend_date, batch.purchase_date) as source_date,
  coalesce(expense.description, spend.platform || coalesce(' - ' || spend.source_reference, ''),
    batch.supplier || coalesce(' - ' || batch.supplier_reference, '')) as description,
  funding.amount,
  funding.funding_treatment,
  funding.payment_date,
  funding.business_account_key,
  funding.owner_label,
  funding.existing_cash_movement_id,
  generated_cash.id as generated_cash_movement_id,
  funding.created_at
from public.financial_source_fundings funding
left join public.financial_source_funding_reversals reversal on reversal.funding_id = funding.id
left join public.expenses expense on expense.id = funding.expense_id
left join public.daily_ad_spend spend on spend.id = funding.ad_spend_id
left join public.purchase_batches batch on batch.id = funding.purchase_batch_id
left join public.cash_movements generated_cash on generated_cash.funding_id = funding.id
where reversal.id is null;

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
  and lower(movement.description) ~ '(mal|product|ad |advert|dollar|delivery|khoroch|kenar|purchase)'
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

create or replace view public.dashboard_cash_account_reconciliation
with (security_invoker = true)
as
with accounts as (
  select lookup_key as account_key, label as account_label
  from public.business_lookup_values
  where lookup_type = 'cash_account' and is_active
), ledger as (
  select account_key,
    sum(case when movement_type in ('inflow', 'transfer_in') then amount else -amount end) as balance
  from public.cash_movements group by account_key
), latest_observation as (
  select distinct on (account_key)
    account_key, actual_balance, observed_on, reason, created_at
  from public.cash_account_balance_observations
  order by account_key, observed_on desc, created_at desc
), unresolved as (
  select account_key, count(*)::bigint as unresolved_count, sum(amount) as unresolved_amount
  from public.dashboard_historical_cash_reconciliation
  where account_key is not null group by account_key
)
select
  account.account_key,
  account.account_label,
  coalesce(ledger.balance, 0)::numeric(14,2) as ledger_balance,
  observation.actual_balance,
  case when observation.actual_balance is null then null
    else (observation.actual_balance - coalesce(ledger.balance, 0))::numeric(14,2) end as difference,
  observation.observed_on,
  observation.reason as observation_reason,
  coalesce(unresolved.unresolved_count, 0)::bigint as unresolved_count,
  coalesce(unresolved.unresolved_amount, 0)::numeric(14,2) as unresolved_amount
from accounts account
left join ledger on ledger.account_key = account.account_key
left join latest_observation observation on observation.account_key = account.account_key
left join unresolved on unresolved.account_key = account.account_key;

alter table public.financial_source_fundings enable row level security;
alter table public.owner_non_cash_capital_events enable row level security;
alter table public.financial_source_funding_reversals enable row level security;
alter table public.cash_account_balance_observations enable row level security;

create policy "Dashboard users read source funding"
on public.financial_source_fundings for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));
create policy "Dashboard users read owner non-cash capital"
on public.owner_non_cash_capital_events for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));
create policy "Dashboard users read source funding reversals"
on public.financial_source_funding_reversals for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));
create policy "Dashboard users read account observations"
on public.cash_account_balance_observations for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

revoke all on table public.financial_source_fundings,
  public.owner_non_cash_capital_events,
  public.financial_source_funding_reversals,
  public.cash_account_balance_observations from public, anon, authenticated, service_role;
grant select on table public.financial_source_fundings,
  public.owner_non_cash_capital_events,
  public.financial_source_funding_reversals,
  public.cash_account_balance_observations to authenticated;

revoke all on table public.dashboard_owner_non_cash_capital,
  public.dashboard_active_source_fundings,
  public.dashboard_historical_cash_reconciliation,
  public.dashboard_cash_account_reconciliation from public, anon;
grant select on table public.dashboard_owner_non_cash_capital,
  public.dashboard_active_source_fundings,
  public.dashboard_historical_cash_reconciliation,
  public.dashboard_cash_account_reconciliation to authenticated;

revoke all on function public.record_expense(date,text,text,numeric,text,uuid,text,text),
  public.record_daily_ad_spend(uuid,date,text,numeric,text) from authenticated;
revoke all on function public.dashboard_source_amount(text,uuid),
  public.dashboard_insert_source_funding(text,uuid,text,date,text,text,uuid,text,uuid),
  public.dashboard_reject_funding_history_mutation()
from public, anon, authenticated, service_role;
revoke all on function public.record_funded_expense(date,text,text,numeric,text,uuid,text,text,text,date,text,text,uuid),
  public.record_funded_ad_spend(uuid,date,text,numeric,text,text,date,text,text,uuid),
  public.classify_historical_financial_source(text,uuid,text,date,text,text,uuid,text,uuid),
  public.pay_unpaid_financial_source(text,uuid,text,date,text,text,text,uuid),
  public.reverse_financial_source_funding(uuid,date,text,uuid),
  public.record_cash_account_balance_observation(text,date,numeric,text,uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_funded_expense(date,text,text,numeric,text,uuid,text,text,text,date,text,text,uuid),
  public.record_funded_ad_spend(uuid,date,text,numeric,text,text,date,text,text,uuid),
  public.pay_unpaid_financial_source(text,uuid,text,date,text,text,text,uuid)
to authenticated;
grant execute on function public.classify_historical_financial_source(text,uuid,text,date,text,text,uuid,text,uuid),
  public.reverse_financial_source_funding(uuid,date,text,uuid),
  public.record_cash_account_balance_observation(text,date,numeric,text,uuid)
to authenticated;

commit;

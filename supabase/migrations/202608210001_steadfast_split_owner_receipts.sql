begin;

create table public.settlement_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlement_records(id) on delete restrict,
  receipt_treatment text not null check (receipt_treatment = 'owner_held_business_funds'),
  owner_label text not null check (owner_label in ('Nasim', 'Rifat', 'Ikbal')),
  amount numeric(12,2) not null check (amount > 0 and amount = trunc(amount, 2)),
  owner_held_event_id uuid not null unique references public.owner_held_fund_events(id) on delete restrict,
  allocation_type text not null check (allocation_type in ('receipt', 'reversal')),
  reversal_of_id uuid references public.settlement_receipt_allocations(id) on delete restrict,
  source_reference text not null unique check (char_length(source_reference) between 3 and 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint settlement_receipt_allocations_shape check (
    (allocation_type = 'receipt' and reversal_of_id is null)
    or (allocation_type = 'reversal' and reversal_of_id is not null)
  )
);

create unique index settlement_receipt_allocations_active_owner_uidx
  on public.settlement_receipt_allocations (settlement_id, owner_label)
  where allocation_type = 'receipt';
create unique index settlement_receipt_allocations_reversal_uidx
  on public.settlement_receipt_allocations (reversal_of_id)
  where reversal_of_id is not null;
create index settlement_receipt_allocations_settlement_idx
  on public.settlement_receipt_allocations (settlement_id, created_at);
create index settlement_receipt_allocations_owner_idx
  on public.settlement_receipt_allocations (owner_label, created_at desc);

create trigger settlement_receipt_allocations_immutable
before update or delete on public.settlement_receipt_allocations
for each row execute function public.dashboard_reject_funding_history_mutation();

alter table public.settlement_receipt_allocations enable row level security;
create policy "Dashboard users read settlement receipt allocations"
on public.settlement_receipt_allocations for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

do $migration_check$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
  from public.settlement_records settlement
  where settlement.confirmed_at is not null
    and settlement.receipt_treatment = 'owner_held_business_funds'
    and not exists (
      select 1
      from public.owner_held_fund_events event
      where event.settlement_id = settlement.id
        and event.event_type = 'receipt'
        and event.owner_label = settlement.owner_label
        and event.amount = settlement.amount_received
    );
  if invalid_count <> 0 then
    raise exception 'Cannot backfill % owner-held settlements because their immutable receipt evidence does not reconcile.', invalid_count;
  end if;

  select count(*) into invalid_count
  from (
    select settlement.id
    from public.settlement_records settlement
    join public.owner_held_fund_events event
      on event.settlement_id = settlement.id and event.event_type = 'receipt'
    where settlement.confirmed_at is not null
      and settlement.receipt_treatment = 'owner_held_business_funds'
    group by settlement.id, settlement.amount_received
    having count(*) <> 1 or sum(event.amount) <> settlement.amount_received
  ) invalid;
  if invalid_count <> 0 then
    raise exception 'Cannot backfill % owner-held settlements because their receipt count or total is invalid.', invalid_count;
  end if;
end
$migration_check$;

insert into public.settlement_receipt_allocations (
  settlement_id, receipt_treatment, owner_label, amount, owner_held_event_id,
  allocation_type, source_reference, created_by, created_at
)
select
  settlement.id, 'owner_held_business_funds', event.owner_label, event.amount, event.id,
  'receipt', 'legacy-settlement:' || settlement.id::text, event.created_by, event.created_at
from public.settlement_records settlement
join public.owner_held_fund_events event
  on event.settlement_id = settlement.id and event.event_type = 'receipt'
where settlement.confirmed_at is not null
  and settlement.receipt_treatment = 'owner_held_business_funds'
on conflict (source_reference) do nothing;

insert into public.settlement_receipt_allocations (
  settlement_id, receipt_treatment, owner_label, amount, owner_held_event_id,
  allocation_type, reversal_of_id, source_reference, created_by, created_at
)
select
  original_allocation.settlement_id, 'owner_held_business_funds', reversal_event.owner_label,
  reversal_event.amount, reversal_event.id, 'reversal', original_allocation.id,
  'legacy-settlement-reversal:' || reversal_event.id::text,
  reversal_event.created_by, reversal_event.created_at
from public.settlement_receipt_allocations original_allocation
join public.owner_held_fund_events reversal_event
  on reversal_event.reversal_of_id = original_allocation.owner_held_event_id
 and reversal_event.event_type = 'reversal'
where original_allocation.allocation_type = 'receipt'
on conflict (source_reference) do nothing;

do $migration_verify$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
  from public.settlement_records settlement
  where settlement.confirmed_at is not null
    and settlement.receipt_treatment = 'owner_held_business_funds'
    and (
      select coalesce(sum(allocation.amount), 0)
      from public.settlement_receipt_allocations allocation
      where allocation.settlement_id = settlement.id and allocation.allocation_type = 'receipt'
    ) <> settlement.amount_received;
  if invalid_count <> 0 then
    raise exception 'Owner-held settlement allocation backfill failed exact-total verification for % settlements.', invalid_count;
  end if;
end
$migration_verify$;

drop index if exists public.owner_held_fund_events_settlement_uidx;
create unique index owner_held_fund_events_settlement_owner_uidx
  on public.owner_held_fund_events (settlement_id, owner_label)
  where settlement_id is not null and event_type = 'receipt';

alter table public.settlement_records
  drop constraint settlement_records_receipt_shape,
  add constraint settlement_records_receipt_shape check (
    confirmed_at is null
    or (receipt_treatment = 'business_account'
      and receiving_method in ('bkash', 'bank_transfer')
      and owner_label is null)
    or (receipt_treatment = 'owner_held_business_funds'
      and receiving_method is null
      and receiving_account_label is null
      and receiving_account_last4 is null
      and (owner_label is null or owner_label in ('Nasim', 'Rifat', 'Ikbal')))
  );

create or replace view public.dashboard_steadfast_settlement_receipt_allocations
with (security_invoker = true)
as
select
  allocation.id,
  allocation.settlement_id,
  allocation.owner_label,
  allocation.amount,
  allocation.owner_held_event_id,
  reversal.id is not null as is_reversed,
  reversal.id as reversal_allocation_id,
  reversal.owner_held_event_id as reversal_owner_held_event_id,
  allocation.created_at
from public.settlement_receipt_allocations allocation
left join public.settlement_receipt_allocations reversal
  on reversal.reversal_of_id = allocation.id and reversal.allocation_type = 'reversal'
where allocation.allocation_type = 'receipt';

create or replace function public.record_steadfast_cod_settlement_v3(
  p_settlement_date date,
  p_receipt_treatment text,
  p_receiving_method text,
  p_owner_allocations jsonb,
  p_gross_cod_amount numeric,
  p_deductions numeric,
  p_net_received numeric,
  p_orders jsonb,
  p_idempotency_key uuid,
  p_courier_reference text default null,
  p_receiving_account_label text default null,
  p_receiving_account_last4 text default null,
  p_receiving_transaction_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  normalized_treatment text := lower(btrim(p_receipt_treatment));
  normalized_method text := nullif(lower(btrim(p_receiving_method)), '');
  normalized_courier_reference text := nullif(btrim(p_courier_reference), '');
  normalized_label text := nullif(btrim(p_receiving_account_label), '');
  normalized_last4 text := nullif(btrim(p_receiving_account_last4), '');
  normalized_tx_reference text := nullif(btrim(p_receiving_transaction_reference), '');
  normalized_note text := nullif(btrim(p_note), '');
  normalized_allocations jsonb := '[]'::jsonb;
  fingerprint text;
  existing_id uuid;
  existing_fingerprint text;
  selected_count integer;
  eligible_count integer;
  allocation_count integer;
  selected_total numeric(14,2);
  allocation_total numeric(14,2);
  compatibility_owner text;
  new_id uuid;
  allocation record;
  event_id uuid;
  child_key uuid;
begin
  if actor_id is null or not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then
    raise exception 'Owner or admin access is required.' using errcode = '42501';
  end if;
  if p_settlement_date is null or p_settlement_date > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Settlement date must be a valid current or historical Dhaka business date.' using errcode = '22023';
  end if;
  if normalized_treatment not in ('business_account', 'owner_held_business_funds') then
    raise exception 'Choose business-account receipt or owner-held business funds.' using errcode = '22023';
  end if;
  if p_gross_cod_amount <= 0 or p_deductions < 0 or p_net_received <= 0
    or p_net_received <> p_gross_cod_amount - p_deductions
    or p_gross_cod_amount <> trunc(p_gross_cod_amount, 2)
    or p_deductions <> trunc(p_deductions, 2)
    or p_net_received <> trunc(p_net_received, 2) then
    raise exception 'Net received must equal gross COD less deductions using exact 2-decimal amounts.' using errcode = '22023';
  end if;
  if normalized_last4 is not null and normalized_last4 !~ '^[0-9]{2,4}$' then
    raise exception 'Only a masked final 2 to 4 digits may be stored.' using errcode = '22023';
  end if;
  if normalized_label is not null and length(normalized_label) > 80
    or normalized_courier_reference is not null and length(normalized_courier_reference) > 160
    or normalized_tx_reference is not null and length(normalized_tx_reference) > 160
    or normalized_note is not null and length(normalized_note) > 500 then
    raise exception 'Settlement text exceeds the supported length.' using errcode = '22023';
  end if;
  if concat_ws(' ', normalized_label, normalized_note) ~* '(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number|routing[ -]?number)' then
    raise exception 'Do not store credentials or full private account details.' using errcode = '22023';
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_orders) <> 'array'
    or jsonb_array_length(p_orders) = 0 or jsonb_array_length(p_orders) > 100 then
    raise exception 'A request key and at least one order are required.' using errcode = '22023';
  end if;

  if normalized_treatment = 'business_account' then
    if normalized_method not in ('bkash', 'bank_transfer')
      or (p_owner_allocations is not null and p_owner_allocations <> '[]'::jsonb) then
      raise exception 'A business receipt requires one valid business account and no owner allocations.' using errcode = '22023';
    end if;
  else
    if normalized_method is not null or normalized_label is not null or normalized_last4 is not null
      or jsonb_typeof(p_owner_allocations) <> 'array'
      or jsonb_array_length(p_owner_allocations) < 1 or jsonb_array_length(p_owner_allocations) > 3 then
      raise exception 'Owner-held receipt requires one to three owner allocations and no business cash destination.' using errcode = '22023';
    end if;

    select jsonb_agg(jsonb_build_object('owner_label', canonical_owner, 'amount', amount) order by canonical_owner),
           count(*), sum(amount)::numeric(14,2), min(canonical_owner) filter (where true)
      into normalized_allocations, allocation_count, allocation_total, compatibility_owner
    from (
      select case lower(btrim(item->>'owner_label'))
               when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' when 'ikbal' then 'Ikbal'
             end as canonical_owner,
             case when jsonb_typeof(item->'amount') = 'number' then (item->>'amount')::numeric end as amount
      from jsonb_array_elements(p_owner_allocations) item
    ) parsed;

    if exists (
      select 1 from jsonb_array_elements(p_owner_allocations) item
      where jsonb_typeof(item) <> 'object'
        or case when jsonb_typeof(item) = 'object'
          then (select count(*) from jsonb_object_keys(item)) <> 2
            or not (item ? 'owner_label' and item ? 'amount')
          else false end
    ) or exists (
      select 1 from jsonb_array_elements(normalized_allocations) item
      where item->>'owner_label' is null or item->>'amount' is null
        or (item->>'amount')::numeric <= 0
        or (item->>'amount')::numeric <> trunc((item->>'amount')::numeric, 2)
    ) then
      raise exception 'Every owner allocation requires one canonical owner and a positive exact 2-decimal amount.' using errcode = '22023';
    end if;
    if (select count(distinct item->>'owner_label') from jsonb_array_elements(normalized_allocations) item) <> allocation_count then
      raise exception 'An owner may appear only once in a settlement.' using errcode = '22023';
    end if;
    if allocation_total <> p_net_received then
      raise exception 'Owner allocations must equal net received exactly.' using errcode = '22023';
    end if;
    if allocation_count <> 1 then compatibility_owner := null; end if;
  end if;

  fingerprint := pg_catalog.md5(jsonb_build_object(
    'date', p_settlement_date, 'receipt_treatment', normalized_treatment,
    'method', normalized_method, 'owner_allocations', normalized_allocations,
    'gross', p_gross_cod_amount, 'deductions', p_deductions, 'net', p_net_received,
    'orders', p_orders, 'courier_reference', normalized_courier_reference,
    'label', normalized_label, 'last4', normalized_last4,
    'transaction_reference', normalized_tx_reference, 'note', normalized_note
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('settlement-request:' || p_idempotency_key::text, 0));
  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.settlement_records where idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint = fingerprint then return existing_id; end if;
    raise exception 'The request key was already used with different settlement details.' using errcode = '23505';
  end if;

  select count(*), count(distinct value->>'order_id') into selected_count, eligible_count
  from jsonb_array_elements(p_orders);
  if selected_count <> eligible_count or exists (
    select 1 from jsonb_array_elements(p_orders) item
    where item->>'order_id' is null or item->>'expected_updated_at' is null
  ) then
    raise exception 'Selected orders must be unique and include freshness evidence.' using errcode = '22023';
  end if;

  perform orders.id from public.orders orders
  where orders.id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item)
  order by orders.id for update;

  select count(*), coalesce(sum(eligible.gross_cod_receivable), 0)::numeric(14,2)
    into eligible_count, selected_total
  from public.dashboard_steadfast_settlement_eligible_orders eligible
  join jsonb_array_elements(p_orders) item
    on eligible.order_id = (item->>'order_id')::uuid
   and eligible.updated_at = (item->>'expected_updated_at')::timestamptz;
  if eligible_count <> selected_count then
    raise exception 'One or more orders are stale, ineligible, non-COD, not Delivered, or already settled.' using errcode = 'P0001';
  end if;
  if selected_total <> p_gross_cod_amount then
    raise exception 'Selected order receivables do not reconcile to gross COD.' using errcode = 'P0001';
  end if;

  if normalized_treatment = 'owner_held_business_funds' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-held:' || (item->>'owner_label'), 0))
    from jsonb_array_elements(normalized_allocations) item order by item->>'owner_label';
  end if;

  insert into public.settlement_records (
    courier, settlement_reference, settlement_date, amount_received, fees_withheld,
    status, notes, created_by, updated_by, receiving_method,
    receiving_account_label, receiving_account_last4, receiving_transaction_reference,
    gross_cod_amount, idempotency_key, request_fingerprint, confirmed_at,
    receipt_treatment, owner_label
  ) values (
    'Steadfast', normalized_courier_reference, p_settlement_date, p_net_received, p_deductions,
    'reconciled', normalized_note, actor_id, actor_id, normalized_method,
    normalized_label, normalized_last4, normalized_tx_reference,
    p_gross_cod_amount, p_idempotency_key, fingerprint, now(),
    normalized_treatment, compatibility_owner
  ) returning id into new_id;

  insert into public.settlement_order_allocations (settlement_id, order_id, allocated_amount, created_by)
  select new_id, eligible.order_id, eligible.gross_cod_receivable, actor_id
  from public.dashboard_steadfast_settlement_eligible_orders eligible
  join jsonb_array_elements(p_orders) item on eligible.order_id = (item->>'order_id')::uuid;

  if normalized_treatment = 'business_account' then
    insert into public.cash_movements (
      movement_date, movement_type, account_key, amount, settlement_id, description, created_by
    ) values (
      p_settlement_date, 'inflow', normalized_method, p_net_received, new_id,
      'Steadfast COD settlement receipt', actor_id
    );
  else
    for allocation in
      select item->>'owner_label' as owner_label, (item->>'amount')::numeric(12,2) as amount
      from jsonb_array_elements(normalized_allocations) item order by item->>'owner_label'
    loop
      child_key := (
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),1,8) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),9,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),13,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),17,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),21,12)
      )::uuid;
      insert into public.owner_held_fund_events (
        event_type, event_date, owner_label, amount, settlement_id, reason,
        idempotency_key, request_fingerprint, created_by
      ) values (
        'receipt', p_settlement_date, allocation.owner_label, allocation.amount, new_id,
        coalesce(normalized_note, 'Steadfast settlement received by owner for the business'),
        child_key, fingerprint, actor_id
      ) returning id into event_id;
      insert into public.settlement_receipt_allocations (
        settlement_id, receipt_treatment, owner_label, amount, owner_held_event_id,
        allocation_type, source_reference, created_by
      ) values (
        new_id, normalized_treatment, allocation.owner_label, allocation.amount, event_id,
        'receipt', 'settlement:' || new_id::text || ':owner:' || lower(allocation.owner_label), actor_id
      );
    end loop;
  end if;

  update public.orders set settlement_status = 'Settled', updated_at = now()
  where id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item);
  return new_id;
end
$function$;

create or replace function public.reverse_steadfast_cod_settlement(
  p_settlement_id uuid,
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
  settlement public.settlement_records%rowtype;
  original_cash public.cash_movements%rowtype;
  existing public.settlement_reversals%rowtype;
  fingerprint text;
  cash_reversal_id uuid;
  first_held_reversal_id uuid;
  held_reversal_id uuid;
  new_id uuid;
  allocation public.settlement_receipt_allocations%rowtype;
  child_key uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse confirmed settlements' using errcode = '42501';
  end if;
  if p_settlement_id is null or p_reversed_on is null or p_idempotency_key is null
     or nullif(normalized_reason, '') is null or char_length(normalized_reason) > 500 then
    raise exception 'Settlement, date, reason, and idempotency key are required' using errcode = '22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_settlement_id::text, p_reversed_on::text, normalized_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into existing from public.settlement_reversals where idempotency_key = p_idempotency_key::text;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different settlement reversal' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into settlement from public.settlement_records where id = p_settlement_id for update;
  if not found or settlement.confirmed_at is null or settlement.courier <> 'Steadfast' then
    raise exception 'Confirmed Steadfast settlement not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.settlement_reversals where settlement_id = settlement.id) then
    raise exception 'Settlement was already reversed' using errcode = '23505';
  end if;

  if settlement.receipt_treatment = 'owner_held_business_funds' then
    if (select coalesce(sum(amount),0) from public.settlement_receipt_allocations
        where settlement_id=settlement.id and allocation_type='receipt') <> settlement.amount_received then
      raise exception 'Settlement owner allocations are missing or do not reconcile' using errcode = 'P0001';
    end if;
    for allocation in
      select * from public.settlement_receipt_allocations
      where settlement_id=settlement.id and allocation_type='receipt'
      order by owner_label for update
    loop
      if exists (select 1 from public.settlement_receipt_allocations where reversal_of_id=allocation.id) then
        raise exception 'Settlement owner allocation was already reversed' using errcode = '23505';
      end if;
      child_key := (
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),1,8) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),9,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),13,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),17,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),21,12)
      )::uuid;
      insert into public.owner_held_fund_events (
        event_type,event_date,owner_label,amount,reversal_of_id,reason,
        idempotency_key,request_fingerprint,created_by
      ) values (
        'reversal',p_reversed_on,allocation.owner_label,allocation.amount,
        allocation.owner_held_event_id,normalized_reason,child_key,fingerprint,actor
      ) returning id into held_reversal_id;
      if first_held_reversal_id is null then first_held_reversal_id := held_reversal_id; end if;
      insert into public.settlement_receipt_allocations (
        settlement_id,receipt_treatment,owner_label,amount,owner_held_event_id,
        allocation_type,reversal_of_id,source_reference,created_by
      ) values (
        settlement.id,'owner_held_business_funds',allocation.owner_label,allocation.amount,held_reversal_id,
        'reversal',allocation.id,'settlement-reversal:' || p_idempotency_key::text || ':owner:' || lower(allocation.owner_label),actor
      );
    end loop;
  else
    select * into original_cash from public.cash_movements where settlement_id = settlement.id for update;
    if not found then raise exception 'Settlement cash receipt is missing' using errcode = 'P0001'; end if;
    insert into public.cash_movements (
      movement_date, movement_type, transaction_type, account_key, amount,
      description, reference, reversal_of_id, idempotency_key, request_fingerprint, created_by
    ) values (
      p_reversed_on, 'outflow', 'reversal', original_cash.account_key,
      original_cash.amount, 'Reversal: ' || normalized_reason,
      settlement.settlement_reference, original_cash.id, p_idempotency_key::text,
      fingerprint, actor
    ) returning id into cash_reversal_id;
  end if;

  insert into public.settlement_reversals (
    settlement_id, reversed_on, reason, cash_reversal_id, owner_held_reversal_id,
    idempotency_key, request_fingerprint, created_by
  ) values (
    settlement.id, p_reversed_on, normalized_reason, cash_reversal_id, first_held_reversal_id,
    p_idempotency_key::text, fingerprint, actor
  ) returning id into new_id;

  update public.orders set settlement_status = 'Awaiting', updated_at = now()
  where id in (select order_id from public.settlement_order_allocations where settlement_id = settlement.id);
  return new_id;
end
$function$;

revoke all on table public.settlement_receipt_allocations,
  public.dashboard_steadfast_settlement_receipt_allocations
from public, anon;
grant select on table public.settlement_receipt_allocations,
  public.dashboard_steadfast_settlement_receipt_allocations
to authenticated, service_role;

revoke all on function public.record_steadfast_cod_settlement_v3(
  date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text
), public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.record_steadfast_cod_settlement_v3(
  date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text
), public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)
to authenticated;

commit;

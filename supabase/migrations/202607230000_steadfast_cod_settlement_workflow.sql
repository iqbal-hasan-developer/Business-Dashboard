-- Minimal, full-order Steadfast COD settlement workflow.
-- This migration is intentionally local-only until it is reviewed and applied
-- through the NexaNotion Business Dashboard Dev SQL Editor.

alter table public.settlement_records
  add column if not exists receiving_method text,
  add column if not exists receiving_account_label text,
  add column if not exists receiving_account_last4 text,
  add column if not exists receiving_transaction_reference text,
  add column if not exists gross_cod_amount numeric(14,2),
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint text,
  add column if not exists confirmed_at timestamptz;

alter table public.settlement_records
  drop constraint if exists settlement_records_receiving_method_allowed,
  add constraint settlement_records_receiving_method_allowed check (
    receiving_method is null or receiving_method in ('bkash', 'bank_transfer')
  ),
  drop constraint if exists settlement_records_account_last4_masked,
  add constraint settlement_records_account_last4_masked check (
    receiving_account_last4 is null or receiving_account_last4 ~ '^[0-9]{2,4}$'
  ),
  drop constraint if exists settlement_records_confirmed_totals_reconcile,
  add constraint settlement_records_confirmed_totals_reconcile check (
    confirmed_at is null or (
      courier = 'Steadfast'
      and receiving_method is not null
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

-- Keep the existing audit event while avoiding a second copy of masked account
-- destination fields, transaction references, notes, and request fingerprints.
create or replace function public.dashboard_audit_safe_payload(
  source_table text,
  source_row jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when source_row is null then null
    when source_table = 'dashboard_user_profiles' then source_row - array[
      'email', 'display_name', 'created_at', 'updated_at'
    ]
    when source_table = 'orders' then source_row - array[
      'customer_name', 'customer_phone', 'customer_address', 'customer_note',
      'delivery_area', 'customer_location', 'external_reference',
      'payment_transaction_id', 'payment_number', 'created_at', 'updated_at'
    ]
    when source_table = 'contact_messages' then source_row - array[
      'name', 'phone', 'email', 'subject', 'message', 'created_at'
    ]
    when source_table = 'product_business_data' then source_row - array[
      'internal_notes', 'created_at', 'updated_at'
    ]
    when source_table = 'settlement_records' then source_row - array[
      'notes', 'receiving_account_label', 'receiving_account_last4',
      'receiving_transaction_reference', 'request_fingerprint',
      'created_at', 'updated_at'
    ]
    when source_table = 'expenses' then source_row - array[
      'description', 'reference', 'created_at', 'updated_at'
    ]
    when source_table = 'cash_movements' then source_row - array[
      'description', 'created_at'
    ]
    else source_row - array['created_at', 'updated_at']
  end;
$function$;

create unique index if not exists settlement_records_idempotency_key_unique
  on public.settlement_records (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists settlement_records_receiving_reference_unique
  on public.settlement_records (receiving_method, lower(receiving_transaction_reference))
  where receiving_transaction_reference is not null;

create unique index if not exists settlement_order_allocations_order_unique
  on public.settlement_order_allocations (order_id);

create unique index if not exists cash_movements_settlement_unique
  on public.cash_movements (settlement_id)
  where settlement_id is not null;

create index if not exists settlement_records_history_idx
  on public.settlement_records (settlement_date desc, created_at desc);

create or replace function public.dashboard_reject_confirmed_settlement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Confirmed settlement evidence cannot be deleted.' using errcode = 'P0001';
  end if;
  if old.confirmed_at is not null then
    raise exception 'Confirmed settlement evidence is immutable; correction is deferred.' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

drop trigger if exists dashboard_reject_confirmed_settlement_mutation on public.settlement_records;
create trigger dashboard_reject_confirmed_settlement_mutation
before update or delete on public.settlement_records
for each row execute function public.dashboard_reject_confirmed_settlement_mutation();

create or replace function public.dashboard_reject_settlement_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Settlement allocation and cash evidence is immutable; correction is deferred.' using errcode = 'P0001';
end
$function$;

drop trigger if exists dashboard_reject_settlement_allocation_mutation on public.settlement_order_allocations;
create trigger dashboard_reject_settlement_allocation_mutation
before update or delete on public.settlement_order_allocations
for each row execute function public.dashboard_reject_settlement_evidence_mutation();

create or replace function public.dashboard_reject_settlement_cash_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.settlement_id is not null then
    raise exception 'Settlement cash evidence is immutable; correction is deferred.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

drop trigger if exists dashboard_reject_settlement_cash_mutation on public.cash_movements;
create trigger dashboard_reject_settlement_cash_mutation
before update or delete on public.cash_movements
for each row execute function public.dashboard_reject_settlement_cash_mutation();

create or replace function public.dashboard_validate_settlement_status_evidence()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.settlement_status is not distinct from old.settlement_status then
    return new;
  end if;
  if new.settlement_status = 'Partially Settled' then
    raise exception 'Partial COD settlements are not supported.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.settlement_status = 'Settled' then
    raise exception 'Settled COD correction or reversal is deferred.' using errcode = 'P0001';
  end if;
  if new.settlement_status = 'Settled' and not exists (
    select 1 from public.settlement_order_allocations allocation
    where allocation.order_id = new.id
  ) then
    raise exception 'Settlement status requires confirmed allocation evidence.' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

drop trigger if exists dashboard_validate_settlement_status_evidence on public.orders;
create trigger dashboard_validate_settlement_status_evidence
before update of settlement_status on public.orders
for each row execute function public.dashboard_validate_settlement_status_evidence();

drop trigger if exists dashboard_validate_initial_settlement_status on public.orders;
create trigger dashboard_validate_initial_settlement_status
before insert on public.orders
for each row execute function public.dashboard_validate_settlement_status_evidence();

create or replace view public.dashboard_steadfast_settlement_eligible_orders
with (security_invoker = true)
as
select
  orders.id as order_id,
  orders.order_number,
  financials.order_date,
  orders.customer_name,
  orders.updated_at,
  financials.net_revenue::numeric(14,2) as gross_cod_receivable
from public.orders as orders
join public.dashboard_order_financials as financials on financials.order_id = orders.id
left join public.settlement_order_allocations as allocation on allocation.order_id = orders.id
where lower(financials.payment_method) = 'cod'
  and coalesce(orders.dashboard_order_status, orders.order_status) = 'Delivered'
  and coalesce(orders.settlement_status, financials.settlement_status) <> 'Settled'
  and financials.net_revenue > 0
  and allocation.order_id is null;

create or replace view public.dashboard_steadfast_settlement_batches
with (security_invoker = true)
as
select
  settlement.id,
  settlement.settlement_date,
  settlement.courier,
  settlement.receiving_method,
  settlement.receiving_account_label,
  settlement.receiving_account_last4,
  settlement.receiving_transaction_reference,
  settlement.settlement_reference,
  settlement.gross_cod_amount,
  settlement.fees_withheld as deductions,
  settlement.amount_received as net_received,
  settlement.notes,
  settlement.confirmed_at,
  count(allocation.order_id)::integer as order_count
from public.settlement_records as settlement
left join public.settlement_order_allocations as allocation on allocation.settlement_id = settlement.id
where settlement.confirmed_at is not null
group by settlement.id;

create or replace view public.dashboard_steadfast_settlement_batch_orders
with (security_invoker = true)
as
select
  allocation.settlement_id,
  allocation.order_id,
  orders.order_number,
  orders.customer_name,
  allocation.allocated_amount::numeric(14,2) as allocated_amount
from public.settlement_order_allocations as allocation
join public.orders as orders on orders.id = allocation.order_id;

revoke all on table public.dashboard_steadfast_settlement_eligible_orders,
  public.dashboard_steadfast_settlement_batches,
  public.dashboard_steadfast_settlement_batch_orders
from public, anon;
grant select on table public.dashboard_steadfast_settlement_eligible_orders,
  public.dashboard_steadfast_settlement_batches,
  public.dashboard_steadfast_settlement_batch_orders
to authenticated, service_role;

create or replace function public.record_steadfast_cod_settlement(
  p_settlement_date date,
  p_receiving_method text,
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
  normalized_method text := lower(btrim(p_receiving_method));
  normalized_courier_reference text := nullif(btrim(p_courier_reference), '');
  normalized_label text := nullif(btrim(p_receiving_account_label), '');
  normalized_last4 text := nullif(btrim(p_receiving_account_last4), '');
  normalized_tx_reference text := nullif(btrim(p_receiving_transaction_reference), '');
  normalized_note text := nullif(btrim(p_note), '');
  fingerprint text;
  existing_id uuid;
  existing_fingerprint text;
  selected_count integer;
  eligible_count integer;
  selected_total numeric(14,2);
  new_id uuid;
begin
  if actor_id is null or not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Owner or admin access is required.' using errcode = '42501';
  end if;
  if p_settlement_date is null or p_settlement_date > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Settlement date must be a valid current or historical Dhaka business date.' using errcode = '22023';
  end if;
  if normalized_method not in ('bkash', 'bank_transfer') then
    raise exception 'Receiving method must be bKash or bank transfer.' using errcode = '22023';
  end if;
  if normalized_method = 'bkash' and normalized_label is not null then
    raise exception 'Account labels are only stored for bank transfers.' using errcode = '22023';
  end if;
  if p_gross_cod_amount <= 0 or p_deductions < 0 or p_net_received <= 0
    or p_net_received <> p_gross_cod_amount - p_deductions then
    raise exception 'Net received must equal gross COD less deductions and remain positive.' using errcode = '22023';
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

  fingerprint := md5(jsonb_build_object(
    'date', p_settlement_date, 'method', normalized_method,
    'gross', p_gross_cod_amount, 'deductions', p_deductions, 'net', p_net_received,
    'orders', p_orders, 'courier_reference', normalized_courier_reference,
    'label', normalized_label, 'last4', normalized_last4,
    'transaction_reference', normalized_tx_reference, 'note', normalized_note
  )::text);

  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.settlement_records where idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint = fingerprint then return existing_id; end if;
    raise exception 'The request key was already used with different settlement details.' using errcode = '23505';
  end if;

  select count(*), count(distinct value->>'order_id')
    into selected_count, eligible_count
  from jsonb_array_elements(p_orders);
  if selected_count <> eligible_count or exists (
    select 1 from jsonb_array_elements(p_orders) item
    where item->>'order_id' is null or item->>'expected_updated_at' is null
  ) then
    raise exception 'Selected orders must be unique and include freshness evidence.' using errcode = '22023';
  end if;

  perform orders.id
  from public.orders as orders
  where orders.id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item)
  order by orders.id
  for update;

  select count(*), coalesce(sum(eligible.gross_cod_receivable), 0)::numeric(14,2)
    into eligible_count, selected_total
  from public.dashboard_steadfast_settlement_eligible_orders as eligible
  join jsonb_array_elements(p_orders) item
    on eligible.order_id = (item->>'order_id')::uuid
   and eligible.updated_at = (item->>'expected_updated_at')::timestamptz;

  if eligible_count <> selected_count then
    raise exception 'One or more orders are stale, ineligible, non-COD, not Delivered, or already settled.' using errcode = 'P0001';
  end if;
  if selected_total <> p_gross_cod_amount then
    raise exception 'Selected order receivables do not reconcile to gross COD.' using errcode = 'P0001';
  end if;

  insert into public.settlement_records (
    courier, settlement_reference, settlement_date, amount_received, fees_withheld,
    status, notes, created_by, updated_by, receiving_method,
    receiving_account_label, receiving_account_last4,
    receiving_transaction_reference, gross_cod_amount, idempotency_key,
    request_fingerprint, confirmed_at
  ) values (
    'Steadfast', normalized_courier_reference, p_settlement_date, p_net_received, p_deductions,
    'reconciled', normalized_note, actor_id, actor_id, normalized_method,
    normalized_label, normalized_last4, normalized_tx_reference, p_gross_cod_amount,
    p_idempotency_key, fingerprint, now()
  ) returning id into new_id;

  insert into public.settlement_order_allocations (
    settlement_id, order_id, allocated_amount, created_by
  )
  select new_id, eligible.order_id, eligible.gross_cod_receivable, actor_id
  from public.dashboard_steadfast_settlement_eligible_orders as eligible
  join jsonb_array_elements(p_orders) item on eligible.order_id = (item->>'order_id')::uuid;

  insert into public.cash_movements (
    movement_date, movement_type, account_key, amount, settlement_id, description, created_by
  ) values (
    p_settlement_date, 'inflow', normalized_method, p_net_received, new_id,
    'Steadfast COD settlement receipt', actor_id
  );

  update public.orders
  set settlement_status = 'Settled', updated_at = now()
  where id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item);

  return new_id;
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select id, request_fingerprint into existing_id, existing_fingerprint
      from public.settlement_records where idempotency_key = p_idempotency_key;
      if existing_id is not null and existing_fingerprint = fingerprint then return existing_id; end if;
    end if;
    raise;
end
$function$;

revoke all on function public.record_steadfast_cod_settlement(
  date, text, numeric, numeric, numeric, jsonb, uuid, text, text, text, text, text
) from public, anon, service_role;
grant execute on function public.record_steadfast_cod_settlement(
  date, text, numeric, numeric, numeric, jsonb, uuid, text, text, text, text, text
) to authenticated;

revoke all on function public.dashboard_reject_confirmed_settlement_mutation(),
  public.dashboard_reject_settlement_evidence_mutation(),
  public.dashboard_reject_settlement_cash_mutation(),
  public.dashboard_validate_settlement_status_evidence()
from public, anon, authenticated, service_role;

comment on function public.record_steadfast_cod_settlement(
  date, text, numeric, numeric, numeric, jsonb, uuid, text, text, text, text, text
) is 'Atomically confirms one immutable full-order Steadfast COD settlement, allocations, status evidence, and cash receipt.';

-- Owner-only, append-only correction for an incorrectly confirmed Steadfast
-- settlement. Original batch, allocations, and cash receipt remain immutable.

create table if not exists public.settlement_reversals (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null unique references public.settlement_records(id) on delete restrict,
  reversed_on date not null,
  reason text not null,
  cash_reversal_id uuid not null unique references public.cash_movements(id) on delete restrict,
  idempotency_key text not null unique,
  request_fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint settlement_reversals_reason_present check (
    nullif(btrim(reason), '') is not null and char_length(reason) <= 500
  )
);

alter table public.settlement_reversals enable row level security;
drop policy if exists "Dashboard owners and admins read settlement reversals" on public.settlement_reversals;
create policy "Dashboard owners and admins read settlement reversals"
on public.settlement_reversals for select to authenticated
using (public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]));

revoke all on table public.settlement_reversals from public, anon, authenticated, service_role;
grant select on table public.settlement_reversals to authenticated;

drop trigger if exists dashboard_reject_settlement_reversal_mutation on public.settlement_reversals;
create trigger dashboard_reject_settlement_reversal_mutation
before update or delete on public.settlement_reversals
for each row execute function public.dashboard_reject_settlement_evidence_mutation();
drop trigger if exists dashboard_audit_change on public.settlement_reversals;
create trigger dashboard_audit_change
after insert on public.settlement_reversals
for each row execute function public.dashboard_write_audit_history();

drop index if exists public.settlement_order_allocations_order_unique;
create index if not exists settlement_order_allocations_order_history_idx
  on public.settlement_order_allocations (order_id, created_at desc);

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
    if new.settlement_status = 'Awaiting' and exists (
      select 1
      from public.settlement_order_allocations allocation
      join public.settlement_reversals reversal on reversal.settlement_id = allocation.settlement_id
      where allocation.order_id = new.id
    ) then return new; end if;
    raise exception 'Settled COD status requires owner reversal evidence.' using errcode = 'P0001';
  end if;
  if new.settlement_status = 'Settled' and not exists (
    select 1
    from public.settlement_order_allocations allocation
    left join public.settlement_reversals reversal on reversal.settlement_id = allocation.settlement_id
    where allocation.order_id = new.id and reversal.id is null
  ) then
    raise exception 'Settlement status requires active confirmed allocation evidence.' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

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
left join public.settlement_order_allocations allocation on allocation.order_id = orders.id
left join public.settlement_reversals reversal on reversal.settlement_id = allocation.settlement_id
where lower(financials.payment_method) = 'cod'
  and coalesce(orders.dashboard_order_status, orders.order_status) = 'Delivered'
  and coalesce(orders.settlement_status, financials.settlement_status) <> 'Settled'
  and financials.net_revenue > 0
group by orders.id, financials.order_date, financials.net_revenue
having count(allocation.order_id) filter (where reversal.id is null) = 0;

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
  count(allocation.order_id)::integer as order_count,
  reversal.id is not null as is_reversed,
  reversal.reversed_on,
  reversal.reason as reversal_reason
from public.settlement_records settlement
left join public.settlement_order_allocations allocation on allocation.settlement_id = settlement.id
left join public.settlement_reversals reversal on reversal.settlement_id = settlement.id
where settlement.confirmed_at is not null
group by settlement.id, reversal.id;

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
  new_id uuid;
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
  select * into original_cash from public.cash_movements where settlement_id = settlement.id for update;
  if not found then raise exception 'Settlement cash receipt is missing' using errcode = 'P0001'; end if;

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, reversal_of_id, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_reversed_on, 'outflow', 'reversal', original_cash.account_key,
    original_cash.amount, 'Reversal: ' || normalized_reason,
    settlement.settlement_reference, original_cash.id, p_idempotency_key::text,
    fingerprint, actor
  ) returning id into cash_reversal_id;

  insert into public.settlement_reversals (
    settlement_id, reversed_on, reason, cash_reversal_id,
    idempotency_key, request_fingerprint, created_by
  ) values (
    settlement.id, p_reversed_on, normalized_reason, cash_reversal_id,
    p_idempotency_key::text, fingerprint, actor
  ) returning id into new_id;

  update public.orders
  set settlement_status = 'Awaiting', updated_at = now()
  where id in (
    select allocation.order_id from public.settlement_order_allocations allocation
    where allocation.settlement_id = settlement.id
  );
  return new_id;
end
$function$;

revoke all on function public.reverse_steadfast_cod_settlement(uuid, date, text, uuid)
from public, anon, service_role;
grant execute on function public.reverse_steadfast_cod_settlement(uuid, date, text, uuid)
to authenticated;
revoke all on function public.dashboard_validate_settlement_status_evidence()
from public, anon, authenticated, service_role;

revoke all on table public.dashboard_steadfast_settlement_eligible_orders,
  public.dashboard_steadfast_settlement_batches from public, anon;
grant select on table public.dashboard_steadfast_settlement_eligible_orders,
  public.dashboard_steadfast_settlement_batches to authenticated;

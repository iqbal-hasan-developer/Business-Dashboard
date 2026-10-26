begin;

create table if not exists public.rejected_cod_courier_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  evidence_date date not null,
  courier text not null,
  tracking_code text not null,
  courier_outcome text not null,
  rejection_reason text not null,
  customer_delivery_charge_recovery numeric(14,2) not null,
  courier_charge numeric(14,2) not null,
  expected_net_adjustment numeric(14,2) generated always as
    ((customer_delivery_charge_recovery - courier_charge)::numeric(14,2)) stored,
  evidence_status text not null default 'provisional',
  idempotency_key uuid not null,
  request_fingerprint text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint rejected_cod_adjustment_order_unique unique (order_id),
  constraint rejected_cod_adjustment_idempotency_unique unique (idempotency_key),
  constraint rejected_cod_adjustment_tracking_unique unique (tracking_code),
  constraint rejected_cod_adjustment_courier check (courier = 'Steadfast'),
  constraint rejected_cod_adjustment_outcome check (courier_outcome = 'Partial Delivered'),
  constraint rejected_cod_adjustment_reason check (rejection_reason = 'Customer rejected'),
  constraint rejected_cod_adjustment_status check (evidence_status = 'provisional'),
  constraint rejected_cod_adjustment_exact_money check (
    customer_delivery_charge_recovery >= 0
    and courier_charge >= 0
    and customer_delivery_charge_recovery = trunc(customer_delivery_charge_recovery, 2)
    and courier_charge = trunc(courier_charge, 2)
  ),
  constraint rejected_cod_adjustment_tracking_format check (
    tracking_code ~ '^SFR[0-9A-Z]{8,40}$'
  )
);

create table if not exists public.rejected_cod_adjustment_settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.rejected_cod_courier_adjustments(id) on delete restrict,
  settlement_id uuid not null references public.settlement_records(id) on delete restrict,
  customer_delivery_charge_recovery numeric(14,2) not null,
  courier_charge numeric(14,2) not null,
  net_adjustment numeric(14,2) not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint rejected_cod_allocation_batch_unique unique (adjustment_id, settlement_id),
  constraint rejected_cod_allocation_exact_money check (
    customer_delivery_charge_recovery >= 0
    and courier_charge >= 0
    and customer_delivery_charge_recovery = trunc(customer_delivery_charge_recovery, 2)
    and courier_charge = trunc(courier_charge, 2)
    and net_adjustment = customer_delivery_charge_recovery - courier_charge
  )
);

create index if not exists rejected_cod_adjustment_history_idx
  on public.rejected_cod_courier_adjustments (evidence_date desc, created_at desc);
create index if not exists rejected_cod_allocation_adjustment_idx
  on public.rejected_cod_adjustment_settlement_allocations (adjustment_id, created_at desc);
create index if not exists rejected_cod_allocation_settlement_idx
  on public.rejected_cod_adjustment_settlement_allocations (settlement_id);

alter table public.rejected_cod_courier_adjustments enable row level security;
alter table public.rejected_cod_adjustment_settlement_allocations enable row level security;

drop policy if exists rejected_cod_adjustments_select on public.rejected_cod_courier_adjustments;
create policy rejected_cod_adjustments_select
on public.rejected_cod_courier_adjustments for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

drop policy if exists rejected_cod_allocations_select on public.rejected_cod_adjustment_settlement_allocations;
create policy rejected_cod_allocations_select
on public.rejected_cod_adjustment_settlement_allocations for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]));

revoke all on table public.rejected_cod_courier_adjustments,
  public.rejected_cod_adjustment_settlement_allocations
from public, anon, authenticated;
grant select on table public.rejected_cod_courier_adjustments,
  public.rejected_cod_adjustment_settlement_allocations
to authenticated, service_role;

create or replace function public.dashboard_reject_rejected_cod_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Rejected COD evidence is append-only; use linked settlement reversal evidence.' using errcode = 'P0001';
end
$function$;

drop trigger if exists dashboard_reject_rejected_cod_adjustment_mutation
  on public.rejected_cod_courier_adjustments;
create trigger dashboard_reject_rejected_cod_adjustment_mutation
before update or delete on public.rejected_cod_courier_adjustments
for each row execute function public.dashboard_reject_rejected_cod_evidence_mutation();

drop trigger if exists dashboard_reject_rejected_cod_allocation_mutation
  on public.rejected_cod_adjustment_settlement_allocations;
create trigger dashboard_reject_rejected_cod_allocation_mutation
before update or delete on public.rejected_cod_adjustment_settlement_allocations
for each row execute function public.dashboard_reject_rejected_cod_evidence_mutation();

drop trigger if exists dashboard_audit_change on public.rejected_cod_courier_adjustments;
create trigger dashboard_audit_change
after insert or update or delete on public.rejected_cod_courier_adjustments
for each row execute function public.dashboard_write_audit_history();

drop trigger if exists dashboard_audit_change on public.rejected_cod_adjustment_settlement_allocations;
create trigger dashboard_audit_change
after insert or update or delete on public.rejected_cod_adjustment_settlement_allocations
for each row execute function public.dashboard_write_audit_history();

create or replace view public.dashboard_steadfast_settlement_eligible_rejected_adjustments
with (security_invoker = true)
as
select
  adjustment.id as adjustment_id,
  adjustment.order_id,
  orders.order_number,
  orders.order_date,
  orders.customer_name,
  orders.sales_channel,
  orders.campaign_id,
  adjustment.tracking_code,
  adjustment.courier_outcome,
  adjustment.created_at as expected_created_at,
  adjustment.customer_delivery_charge_recovery::numeric(14,2) as gross_cod_recovery,
  adjustment.courier_charge::numeric(14,2) as courier_charge,
  adjustment.expected_net_adjustment::numeric(14,2) as expected_net_adjustment
from public.rejected_cod_courier_adjustments as adjustment
join public.orders as orders on orders.id = adjustment.order_id
where adjustment.evidence_status = 'provisional'
  and coalesce(orders.dashboard_order_status, initcap(orders.order_status)) = 'Cancelled'
  and coalesce(orders.dashboard_payment_status, initcap(orders.payment_status)) = 'Unpaid'
  and coalesce(orders.settlement_status, 'Awaiting') = 'Awaiting'
  and not exists (
    select 1
    from public.rejected_cod_adjustment_settlement_allocations as allocation
    where allocation.adjustment_id = adjustment.id
      and not exists (
        select 1 from public.settlement_reversals as reversal
        where reversal.settlement_id = allocation.settlement_id
      )
  );

create or replace view public.dashboard_rejected_cod_adjustments
with (security_invoker = true)
as
select
  adjustment.id,
  adjustment.order_id,
  orders.order_number,
  adjustment.evidence_date,
  adjustment.courier,
  adjustment.tracking_code,
  adjustment.courier_outcome,
  adjustment.rejection_reason,
  adjustment.customer_delivery_charge_recovery,
  adjustment.courier_charge,
  adjustment.expected_net_adjustment,
  adjustment.evidence_status,
  case when active_allocation.settlement_id is null
    then 'Awaiting confirmation' else 'Confirmed' end as settlement_confirmation_status,
  active_allocation.settlement_id,
  active_allocation.settlement_date,
  active_allocation.settlement_reference,
  adjustment.created_at
from public.rejected_cod_courier_adjustments as adjustment
join public.orders as orders on orders.id = adjustment.order_id
left join lateral (
  select allocation.settlement_id, settlement.settlement_date, settlement.settlement_reference
  from public.rejected_cod_adjustment_settlement_allocations as allocation
  join public.settlement_records as settlement on settlement.id = allocation.settlement_id
  where allocation.adjustment_id = adjustment.id
    and not exists (
      select 1 from public.settlement_reversals as reversal
      where reversal.settlement_id = allocation.settlement_id
    )
  order by allocation.created_at desc
  limit 1
) as active_allocation on true;

create or replace view public.dashboard_rejected_cod_adjustment_financials
with (security_invoker = true)
as
select
  settlement.settlement_date as event_date,
  adjustment.order_id,
  orders.order_number,
  orders.sales_channel,
  orders.campaign_id,
  allocation.customer_delivery_charge_recovery::numeric(14,2) as delivery_charge_recovery,
  allocation.courier_charge::numeric(14,2) as courier_cost,
  allocation.net_adjustment::numeric(14,2) as net_adjustment,
  allocation.settlement_id,
  allocation.created_at as recognized_at
from public.rejected_cod_adjustment_settlement_allocations as allocation
join public.rejected_cod_courier_adjustments as adjustment on adjustment.id = allocation.adjustment_id
join public.orders as orders on orders.id = adjustment.order_id
join public.settlement_records as settlement on settlement.id = allocation.settlement_id
where settlement.confirmed_at is not null
  and not exists (
    select 1 from public.settlement_reversals as reversal
    where reversal.settlement_id = allocation.settlement_id
  );

create or replace view public.dashboard_steadfast_settlement_batch_rejected_adjustments
with (security_invoker = true)
as
select
  allocation.settlement_id,
  adjustment.id as adjustment_id,
  adjustment.order_id,
  orders.order_number,
  orders.customer_name,
  adjustment.tracking_code,
  allocation.customer_delivery_charge_recovery,
  allocation.courier_charge,
  allocation.net_adjustment
from public.rejected_cod_adjustment_settlement_allocations as allocation
join public.rejected_cod_courier_adjustments as adjustment on adjustment.id = allocation.adjustment_id
join public.orders as orders on orders.id = adjustment.order_id;

revoke all on table public.dashboard_steadfast_settlement_eligible_rejected_adjustments,
  public.dashboard_rejected_cod_adjustments,
  public.dashboard_rejected_cod_adjustment_financials,
  public.dashboard_steadfast_settlement_batch_rejected_adjustments
from public, anon;
grant select on table public.dashboard_steadfast_settlement_eligible_rejected_adjustments,
  public.dashboard_rejected_cod_adjustments,
  public.dashboard_rejected_cod_adjustment_financials,
  public.dashboard_steadfast_settlement_batch_rejected_adjustments
to authenticated, service_role;

create or replace function public.record_rejected_cod_courier_adjustment(
  p_order_id uuid,
  p_evidence_date date,
  p_tracking_code text,
  p_courier_outcome text,
  p_rejection_reason text,
  p_customer_delivery_charge_recovery numeric,
  p_courier_charge numeric,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  normalized_tracking text := upper(btrim(p_tracking_code));
  target_order public.orders%rowtype;
  fingerprint text;
  existing public.rejected_cod_courier_adjustments%rowtype;
  new_id uuid;
begin
  if actor_id is null or not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then
    raise exception 'Owner or admin access is required.' using errcode = '42501';
  end if;
  if p_order_id is null or p_evidence_date is null or p_idempotency_key is null
    or normalized_tracking !~ '^SFR[0-9A-Z]{8,40}$'
    or p_courier_outcome <> 'Partial Delivered'
    or p_rejection_reason <> 'Customer rejected'
    or p_customer_delivery_charge_recovery < 0 or p_courier_charge < 0
    or p_customer_delivery_charge_recovery <> trunc(p_customer_delivery_charge_recovery, 2)
    or p_courier_charge <> trunc(p_courier_charge, 2) then
    raise exception 'Complete rejected COD evidence with exact 2-decimal amounts is required.' using errcode = '22023';
  end if;

  fingerprint := pg_catalog.md5(jsonb_build_object(
    'order_id',p_order_id,'evidence_date',p_evidence_date,'tracking_code',normalized_tracking,
    'courier_outcome',p_courier_outcome,'rejection_reason',p_rejection_reason,
    'recovery',p_customer_delivery_charge_recovery,'courier_charge',p_courier_charge
  )::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rejected-cod-request:' || p_idempotency_key::text,0));
  select * into existing from public.rejected_cod_courier_adjustments
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint = fingerprint then return existing.id; end if;
    raise exception 'The request key was already used with different rejected COD evidence.' using errcode = '23505';
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if target_order.courier <> 'Steadfast'
    or lower(target_order.payment_method) <> 'cod'
    or coalesce(target_order.dashboard_order_status, initcap(target_order.order_status)) <> 'Cancelled'
    or coalesce(target_order.dashboard_payment_status, initcap(target_order.payment_status)) <> 'Unpaid'
    or coalesce(target_order.settlement_status,'Awaiting') <> 'Awaiting'
    or exists (select 1 from public.order_financial_snapshots where order_id = p_order_id)
    or exists (
      select 1 from public.settlement_order_allocations as allocation
      where allocation.order_id = p_order_id
        and not exists (select 1 from public.settlement_reversals where settlement_id = allocation.settlement_id)
    ) then
    raise exception 'Order must be cancelled, Unpaid COD, Awaiting settlement, and have no Delivered financial or active settlement evidence.' using errcode = 'P0001';
  end if;

  insert into public.rejected_cod_courier_adjustments (
    order_id,evidence_date,courier,tracking_code,courier_outcome,rejection_reason,
    customer_delivery_charge_recovery,courier_charge,evidence_status,
    idempotency_key,request_fingerprint,created_by
  ) values (
    p_order_id,p_evidence_date,'Steadfast',normalized_tracking,p_courier_outcome,p_rejection_reason,
    p_customer_delivery_charge_recovery,p_courier_charge,'provisional',
    p_idempotency_key,fingerprint,actor_id
  ) returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.record_rejected_cod_courier_adjustment(uuid,date,text,text,text,numeric,numeric,uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_rejected_cod_courier_adjustment(uuid,date,text,text,text,numeric,numeric,uuid)
to authenticated;

commit;

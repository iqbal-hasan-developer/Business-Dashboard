begin;

-- Direct customer collections settle legacy owner-delivery COD orders without
-- relabeling the receipt as Steadfast or changing immutable Delivered snapshots.
alter table public.settlement_records
  drop constraint settlement_records_confirmed_totals_reconcile,
  add constraint settlement_records_confirmed_totals_reconcile check (
    confirmed_at is null or (
      (courier = 'Steadfast' or (
        courier = 'Owner delivery'
        and receipt_treatment = 'owner_held_business_funds'
        and owner_label is not null
        and fees_withheld = 0
      ))
      and gross_cod_amount is not null and gross_cod_amount > 0
      and fees_withheld >= 0 and amount_received > 0
      and amount_received = gross_cod_amount - fees_withheld
      and idempotency_key is not null and request_fingerprint is not null
      and status = 'reconciled'
    )
  );

create or replace function public.record_owner_delivery_held_settlement(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_received_on date,
  p_owner_label text,
  p_idempotency_key uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  target public.orders%rowtype;
  existing public.settlement_records%rowtype;
  normalized_owner text := case lower(btrim(p_owner_label))
    when 'ikbal' then 'Ikbal' when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' end;
  normalized_note text := nullif(btrim(p_note), '');
  fingerprint text;
  receipt_amount numeric(14,2);
  new_id uuid;
  event_id uuid;
begin
  if actor is null or not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then
    raise exception 'Owner or admin access is required.' using errcode = '42501';
  end if;
  if p_order_id is null or p_expected_updated_at is null or p_received_on is null
    or p_idempotency_key is null or normalized_owner is null
    or p_received_on > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Order, freshness evidence, valid date, canonical owner and request key are required.' using errcode = '22023';
  end if;
  if char_length(normalized_note) > 500
    or coalesce(normalized_note,'') ~* '(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number)' then
    raise exception 'Use a short receipt note without private account details.' using errcode = '22023';
  end if;
  fingerprint := md5(jsonb_build_object('workflow','owner_delivery_held_settlement',
    'order',p_order_id,'expected_updated_at',p_expected_updated_at,'received_on',p_received_on,
    'owner',normalized_owner,'note',normalized_note)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('settlement-request:' || p_idempotency_key::text,0));
  select * into existing from public.settlement_records where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint is distinct from fingerprint then
      raise exception 'The request key was already used with different settlement details.' using errcode = '23505';
    end if;
    return existing.id;
  end if;
  select * into target from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if target.updated_at is distinct from p_expected_updated_at then
    raise exception 'Order changed; refresh before recording collection.' using errcode = '40001';
  end if;
  if lower(btrim(coalesce(target.courier,''))) <> 'owner delivery' then
    raise exception 'Direct owner collection requires an owner-delivery order.' using errcode = '22023';
  end if;
  if p_received_on < coalesce(target.order_date,(target.created_at at time zone 'Asia/Dhaka')::date) then
    raise exception 'Receipt date cannot precede the order date.' using errcode = '22023';
  end if;
  select gross_cod_receivable into receipt_amount
  from public.dashboard_steadfast_settlement_eligible_orders where order_id=p_order_id;
  if receipt_amount is null or receipt_amount <= 0 or receipt_amount <> trunc(receipt_amount,2) then
    raise exception 'Order must be Delivered with a positive unsettled COD receivable.' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.order_financial_adjustments where order_id=p_order_id)
    or coalesce(target.refund_amount,0) <> 0 then
    raise exception 'Adjusted or refunded orders require a dedicated collection review.' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.cash_movements movement
    where movement.order_id=p_order_id and movement.movement_type in ('inflow','transfer_in')
      and movement.reversal_of_id is null
      and not exists(select 1 from public.cash_movements reversal where reversal.reversal_of_id=movement.id)) then
    raise exception 'Order already has an active cash receipt.' using errcode = '23505';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-held:' || normalized_owner,0));
  insert into public.settlement_records (
    courier,settlement_reference,settlement_date,amount_received,fees_withheld,status,notes,
    created_by,updated_by,gross_cod_amount,idempotency_key,request_fingerprint,confirmed_at,
    receipt_treatment,owner_label
  ) values (
    'Owner delivery','OWNER-DELIVERY-' || target.order_number,p_received_on,receipt_amount,0,
    'reconciled',coalesce(normalized_note,'Full payment collected directly from customer and held for the business'),
    actor,actor,receipt_amount,p_idempotency_key,fingerprint,now(),'owner_held_business_funds',normalized_owner
  ) returning id into new_id;
  insert into public.settlement_order_allocations(settlement_id,order_id,allocated_amount,created_by)
  values(new_id,p_order_id,receipt_amount,actor);
  insert into public.owner_held_fund_events(
    event_type,event_date,owner_label,amount,settlement_id,reason,idempotency_key,request_fingerprint,created_by
  ) values (
    'receipt',p_received_on,normalized_owner,receipt_amount,new_id,
    coalesce(normalized_note,'Full payment collected directly from customer and held for the business'),
    p_idempotency_key,fingerprint,actor
  ) returning id into event_id;
  insert into public.settlement_receipt_allocations(
    settlement_id,receipt_treatment,owner_label,amount,owner_held_event_id,allocation_type,source_reference,created_by
  ) values (
    new_id,'owner_held_business_funds',normalized_owner,receipt_amount,event_id,'receipt',
    'owner-delivery:' || new_id::text || ':owner:' || lower(normalized_owner),actor
  );
  update public.orders set settlement_status='Settled',updated_at=now() where id=p_order_id;
  return new_id;
end
$function$;

revoke all on function public.record_owner_delivery_held_settlement(uuid,timestamptz,date,text,uuid,text) from public,anon,service_role;
grant execute on function public.record_owner_delivery_held_settlement(uuid,timestamptz,date,text,uuid,text) to authenticated;
comment on function public.record_owner_delivery_held_settlement(uuid,timestamptz,date,text,uuid,text)
  is 'Atomically settles a full owner-delivery COD collection into owner-held funds without cash or Delivered snapshot changes.';

-- Preserve the existing append-only reversal workflow for direct collections.
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
  if not found or settlement.confirmed_at is null or settlement.courier not in ('Steadfast','Owner delivery') then
    raise exception 'Confirmed settlement not found' using errcode = 'P0002';
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


commit;

begin;

-- A repayment moves business funds from an owner back into a business cash
-- account. It reduces Due from Owner, but it is neither new owner capital nor
-- business income. Cash-linked spend events keep that effect in the existing
-- append-only owner-held ledger.
alter table public.owner_held_fund_events
  drop constraint owner_held_fund_events_shape,
  add constraint owner_held_fund_events_shape check (
    (event_type = 'spend'
      and settlement_id is null
      and original_owner_withdrawal_id is null
      and reversal_of_id is null
      and (
        (funding_id is not null
          and capital_return_id is null
          and cash_movement_id is null
          and reason is null)
        or (funding_id is null
          and capital_return_id is not null
          and cash_movement_id is null
          and reason is not null)
        or (funding_id is null
          and capital_return_id is null
          and cash_movement_id is not null
          and reason is not null)
      ))
    or (event_type = 'receipt'
      and funding_id is null
      and capital_return_id is null
      and reversal_of_id is null
      and reason is not null
      and (
        (settlement_id is not null
          and cash_movement_id is null
          and original_owner_withdrawal_id is null)
        or (settlement_id is null
          and cash_movement_id is not null)
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

create or replace function public.reclassify_owner_investment_as_held_repayment(
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
  normalized_reason text := btrim(p_reason);
  original public.cash_movements%rowtype;
  existing public.owner_held_fund_events%rowtype;
  fingerprint text;
  replacement_cash_id uuid;
  repayment_event_id uuid;
begin
  if actor is null
     or not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reclassify owner investments as repayments'
      using errcode = '42501';
  end if;
  if p_original_movement_id is null
     or p_reclassified_on is null
     or p_reclassified_on > (now() at time zone 'Asia/Dhaka')::date
     or p_idempotency_key is null
     or char_length(coalesce(normalized_reason, '')) not between 3 and 500 then
    raise exception 'Original investment, correction date, reason, and request key are required'
      using errcode = '22023';
  end if;

  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',
    p_original_movement_id::text,
    p_reclassified_on::text,
    normalized_reason
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-investment-repayment:' || p_original_movement_id::text, 0)
  );

  select * into existing
  from public.owner_held_fund_events
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different repayment correction'
        using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into original
  from public.cash_movements
  where id = p_original_movement_id
  for update;
  if not found
     or original.transaction_type <> 'owner_investment'
     or original.owner_label not in ('Nasim', 'Rifat', 'Ikbal')
     or original.reversal_of_id is not null
     or original.correction_of_id is not null
     or original.order_id is not null
     or original.settlement_id is not null
     or original.expense_id is not null
     or p_reclassified_on < original.movement_date
     or exists (
       select 1 from public.cash_movements reversal
       where reversal.reversal_of_id = original.id
     )
     or exists (
       select 1 from public.cash_movements correction
       where correction.correction_of_id = original.id
     ) then
    raise exception 'Active owner investment eligible for repayment correction was not found'
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.business_lookup_values
    where lookup_type = 'cash_account'
      and lookup_key = original.account_key
      and is_active
  ) then
    raise exception 'The original business cash account is not active'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-held:' || original.owner_label, 0)
  );
  if public.dashboard_owner_held_balance(original.owner_label) < original.amount then
    raise exception 'Repayment cannot exceed the active Due from Owner balance'
      using errcode = '22023';
  end if;

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, owner_label, reversal_of_id, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_reclassified_on, 'outflow', 'reversal', original.account_key, original.amount,
    'Reclassification reversal: ' || normalized_reason, original.reference,
    original.owner_label, original.id, p_idempotency_key::text || ':reversal',
    fingerprint, actor
  );

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, owner_label, correction_of_id, idempotency_key,
    request_fingerprint, created_by
  ) values (
    original.movement_date, 'inflow', 'owner_held_transfer', original.account_key,
    original.amount, 'Owner-held business funds repaid by ' || original.owner_label,
    original.reference, original.owner_label, original.id,
    p_idempotency_key::text || ':replacement', fingerprint, actor
  ) returning id into replacement_cash_id;

  insert into public.owner_held_fund_events (
    event_type, event_date, owner_label, amount, cash_movement_id, reason,
    idempotency_key, request_fingerprint, created_by
  ) values (
    'spend', original.movement_date, original.owner_label, original.amount,
    replacement_cash_id, normalized_reason, p_idempotency_key, fingerprint, actor
  ) returning id into repayment_event_id;

  return repayment_event_id;
end
$function$;

create or replace function public.reverse_owner_held_fund_repayment(
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
  reversal_event_id uuid;
begin
  if actor is null
     or not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse owner-held repayments'
      using errcode = '42501';
  end if;
  if p_owner_held_event_id is null
     or p_reversed_on is null
     or p_reversed_on > (now() at time zone 'Asia/Dhaka')::date
     or p_idempotency_key is null
     or char_length(coalesce(normalized_reason, '')) not between 3 and 500 then
    raise exception 'Repayment, reversal date, reason, and request key are required'
      using errcode = '22023';
  end if;

  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',
    p_owner_held_event_id::text,
    p_reversed_on::text,
    normalized_reason
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-held-repayment:' || p_owner_held_event_id::text, 0)
  );

  select * into existing
  from public.owner_held_fund_events
  where idempotency_key = p_idempotency_key;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different repayment reversal'
        using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into original
  from public.owner_held_fund_events
  where id = p_owner_held_event_id
    and event_type = 'spend'
    and funding_id is null
    and capital_return_id is null
    and cash_movement_id is not null
  for update;
  if not found
     or p_reversed_on < original.event_date
     or exists (
       select 1 from public.owner_held_fund_events reversal
       where reversal.reversal_of_id = original.id
     ) then
    raise exception 'Active owner-held repayment was not found'
      using errcode = 'P0002';
  end if;

  select * into original_cash
  from public.cash_movements
  where id = original.cash_movement_id
  for update;
  if not found
     or original_cash.transaction_type <> 'owner_held_transfer'
     or original_cash.movement_type <> 'inflow'
     or exists (
       select 1 from public.cash_movements reversal
       where reversal.reversal_of_id = original_cash.id
     ) then
    raise exception 'Linked active repayment cash movement was not found'
      using errcode = 'P0002';
  end if;

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, owner_label, reversal_of_id, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_reversed_on, 'outflow', 'reversal', original_cash.account_key,
    original_cash.amount, 'Reversal: ' || normalized_reason,
    original_cash.reference, original.owner_label, original_cash.id,
    p_idempotency_key::text || ':cash', fingerprint, actor
  );

  insert into public.owner_held_fund_events (
    event_type, event_date, owner_label, amount, reversal_of_id, reason,
    idempotency_key, request_fingerprint, created_by
  ) values (
    'reversal', p_reversed_on, original.owner_label, original.amount,
    original.id, normalized_reason, p_idempotency_key, fingerprint, actor
  ) returning id into reversal_event_id;

  return reversal_event_id;
end
$function$;

revoke all on function public.reclassify_owner_investment_as_held_repayment(
  uuid, date, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.reclassify_owner_investment_as_held_repayment(
  uuid, date, text, uuid
) to authenticated;

revoke all on function public.reverse_owner_held_fund_repayment(
  uuid, date, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.reverse_owner_held_fund_repayment(
  uuid, date, text, uuid
) to authenticated;

commit;

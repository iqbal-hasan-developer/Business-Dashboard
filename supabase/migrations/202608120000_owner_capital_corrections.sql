-- Owner-capital maintenance stays append-only. An edit appends one reversing
-- movement plus one corrected replacement atomically; a UI delete uses the
-- existing owner-only reversal RPC. No financial ledger row is hard-deleted.

alter table public.cash_movements
  add column if not exists correction_of_id uuid
    references public.cash_movements(id) on delete restrict;

alter table public.cash_movements
  drop constraint if exists cash_movements_correction_shape,
  add constraint cash_movements_correction_shape check (
    correction_of_id is null
    or (
      transaction_type in ('owner_investment', 'owner_withdrawal')
      and reversal_of_id is null
      and order_id is null
      and settlement_id is null
      and expense_id is null
    )
  ),
  drop constraint if exists cash_movements_single_correction_link,
  add constraint cash_movements_single_correction_link check (
    not (reversal_of_id is not null and correction_of_id is not null)
  );

create unique index if not exists cash_movements_correction_unique
  on public.cash_movements (correction_of_id)
  where correction_of_id is not null;

create or replace function public.edit_dashboard_owner_capital_movement(
  p_original_id uuid,
  p_movement_date date,
  p_transaction_type text,
  p_account_key text,
  p_amount numeric,
  p_description text,
  p_reference text,
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
  actor uuid := (select auth.uid());
  normalized_type text := lower(btrim(p_transaction_type));
  normalized_account text := lower(btrim(p_account_key));
  normalized_description text := btrim(p_description);
  normalized_reference text := nullif(btrim(p_reference), '');
  normalized_owner text;
  normalized_reason text := btrim(p_reason);
  movement_direction text;
  fingerprint text;
  reversal_fingerprint text;
  original public.cash_movements%rowtype;
  existing public.cash_movements%rowtype;
  correction_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may edit owner capital movements' using errcode = '42501';
  end if;

  normalized_owner := case lower(btrim(p_owner_label))
    when 'nasim' then 'Nasim'
    when 'rifat' then 'Rifat'
    when 'ikbal' then 'Ikbal'
    else null
  end;

  if p_original_id is null
     or p_movement_date is null
     or normalized_type is null
     or normalized_type not in ('owner_investment', 'owner_withdrawal')
     or nullif(normalized_account, '') is null
     or nullif(normalized_description, '') is null
     or normalized_owner is null
     or nullif(normalized_reason, '') is null
     or char_length(normalized_reason) < 3
     or char_length(normalized_reason) > 500
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
     or p_amount <> trunc(p_amount, 2)
     or p_idempotency_key is null then
    raise exception 'Invalid owner capital correction values' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.business_lookup_values
    where lookup_type = 'cash_account'
      and lookup_key = normalized_account
      and is_active
  ) then
    raise exception 'Cash account is not active' using errcode = '22023';
  end if;

  movement_direction := case when normalized_type = 'owner_investment' then 'inflow' else 'outflow' end;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',
    p_original_id::text, p_movement_date::text, normalized_type,
    normalized_account, p_amount::text, normalized_description,
    coalesce(normalized_reference, ''), normalized_owner, normalized_reason
  ));
  reversal_fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',
    'owner-capital-edit-reversal', p_original_id::text,
    p_idempotency_key::text, normalized_reason
  ));

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select * into existing
  from public.cash_movements
  where idempotency_key = p_idempotency_key::text;
  if found then
    if existing.request_fingerprint <> fingerprint
       or existing.correction_of_id is distinct from p_original_id then
      raise exception 'Idempotency key was already used for different owner capital values'
        using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into original
  from public.cash_movements
  where id = p_original_id
  for update;
  if not found then
    raise exception 'Owner capital movement not found' using errcode = 'P0002';
  end if;
  if original.transaction_type not in ('owner_investment', 'owner_withdrawal')
     or original.order_id is not null
     or original.settlement_id is not null
     or original.expense_id is not null
     or original.reversal_of_id is not null then
    raise exception 'Original movement is not owner capital' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.cash_movements reversal
    where reversal.reversal_of_id = original.id
  ) then
    raise exception 'Cash movement was already reversed' using errcode = '23505';
  end if;

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, owner_label, reversal_of_id, idempotency_key,
    request_fingerprint, created_by
  ) values (
    current_date,
    case when original.movement_type in ('inflow', 'transfer_in') then 'outflow' else 'inflow' end,
    'reversal', original.account_key, original.amount,
    'Correction: ' || normalized_reason, original.reference, original.owner_label,
    original.id, p_idempotency_key::text || ':reversal',
    reversal_fingerprint, actor
  );

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, owner_label, correction_of_id, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_movement_date, movement_direction, normalized_type, normalized_account,
    p_amount, normalized_description, normalized_reference, normalized_owner,
    original.id, p_idempotency_key::text, fingerprint, actor
  ) returning id into correction_id;

  return correction_id;
end
$function$;

revoke all on function public.edit_dashboard_owner_capital_movement(
  uuid, date, text, text, numeric, text, text, text, text, uuid
) from public, anon, service_role;
grant execute on function public.edit_dashboard_owner_capital_movement(
  uuid, date, text, text, numeric, text, text, text, text, uuid
) to authenticated;

create or replace view public.dashboard_cash_ledger
with (security_invoker = true)
as
select
  movement.id,
  movement.movement_date,
  movement.movement_type,
  movement.transaction_type,
  movement.account_key,
  coalesce(account.label, movement.account_key) as account_label,
  movement.amount,
  case when movement.movement_type in ('inflow', 'transfer_in')
    then movement.amount else -movement.amount end as signed_amount,
  case
    when movement.transaction_type in ('owner_investment', 'owner_withdrawal')
      then case when movement.movement_type in ('inflow', 'transfer_in') then movement.amount else -movement.amount end
    when movement.transaction_type = 'reversal'
      and original.transaction_type in ('owner_investment', 'owner_withdrawal')
      then case when movement.movement_type in ('inflow', 'transfer_in') then movement.amount else -movement.amount end
    else 0::numeric
  end as owner_investment_effect,
  sum(case when movement.movement_type in ('inflow', 'transfer_in')
    then movement.amount else -movement.amount end)
    over (order by movement.movement_date, movement.created_at, movement.id) as running_balance,
  sum(case when movement.movement_type in ('inflow', 'transfer_in')
    then movement.amount else -movement.amount end)
    over (partition by movement.account_key order by movement.movement_date, movement.created_at, movement.id) as account_running_balance,
  movement.description,
  movement.reference,
  movement.owner_label,
  movement.order_id,
  movement.settlement_id,
  movement.expense_id,
  movement.reversal_of_id,
  exists (
    select 1 from public.cash_movements reversal
    where reversal.reversal_of_id = movement.id
  ) as is_reversed,
  movement.created_at,
  movement.correction_of_id
from public.cash_movements movement
left join public.cash_movements original on original.id = movement.reversal_of_id
left join public.business_lookup_values account
  on account.lookup_type = 'cash_account'
 and account.lookup_key = movement.account_key;

revoke all on table public.dashboard_cash_ledger from public, anon;
grant select on table public.dashboard_cash_ledger to authenticated;

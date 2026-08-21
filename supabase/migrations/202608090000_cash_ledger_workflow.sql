-- Launch-MVP cash ledger: classified manual entries, owner investment,
-- idempotency, append-only reversal, and authoritative balance read models.
-- Stored database money remains exact numeric(12,2) BDT; application money is
-- converted to integer poisha at the repository boundary.

alter table public.cash_movements
  add column if not exists transaction_type text,
  add column if not exists reference text,
  add column if not exists owner_label text,
  add column if not exists reversal_of_id uuid
    references public.cash_movements(id) on delete restrict,
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text;

-- The prior settlement-only guard blocks updates to settlement-linked rows.
-- Remove it inside this migration transaction before the one-time classification
-- backfill; the all-row append-only guard is installed below before commit.
drop trigger if exists dashboard_reject_settlement_cash_mutation on public.cash_movements;

update public.cash_movements
set transaction_type = case
  when settlement_id is not null then 'courier_settlement'
  when expense_id is not null then 'expense'
  when movement_type = 'transfer_in' then 'transfer_in'
  when movement_type = 'transfer_out' then 'transfer_out'
  when movement_type = 'inflow' then 'operating_inflow'
  else 'operating_outflow'
end,
account_key = case when settlement_id is not null and account_key = 'bank_transfer' then 'bank' else account_key end
where transaction_type is null
   or (settlement_id is not null and account_key = 'bank_transfer');

create or replace function public.dashboard_classify_cash_movement()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.settlement_id is not null and new.account_key = 'bank_transfer' then
    new.account_key := 'bank';
  end if;
  if new.transaction_type is null then
    new.transaction_type := case
      when new.settlement_id is not null then 'courier_settlement'
      when new.expense_id is not null then 'expense'
      when new.movement_type = 'transfer_in' then 'transfer_in'
      when new.movement_type = 'transfer_out' then 'transfer_out'
      when new.movement_type = 'inflow' then 'operating_inflow'
      else 'operating_outflow'
    end;
  end if;
  return new;
end
$function$;

drop trigger if exists dashboard_classify_cash_movement on public.cash_movements;
create trigger dashboard_classify_cash_movement
before insert on public.cash_movements
for each row execute function public.dashboard_classify_cash_movement();

alter table public.cash_movements
  alter column transaction_type set not null;

alter table public.cash_movements
  drop constraint if exists cash_movements_transaction_type_allowed,
  add constraint cash_movements_transaction_type_allowed check (
    transaction_type in (
      'owner_investment', 'owner_withdrawal',
      'operating_inflow', 'operating_outflow',
      'transfer_in', 'transfer_out', 'courier_settlement', 'expense',
      'reversal'
    )
  ),
  drop constraint if exists cash_movements_reversal_shape,
  add constraint cash_movements_reversal_shape check (
    (transaction_type = 'reversal') = (reversal_of_id is not null)
  ),
  drop constraint if exists cash_movements_idempotency_shape,
  add constraint cash_movements_idempotency_shape check (
    (idempotency_key is null and request_fingerprint is null)
    or (nullif(btrim(idempotency_key), '') is not null
      and nullif(btrim(request_fingerprint), '') is not null)
  );

create unique index if not exists cash_movements_idempotency_key_unique
  on public.cash_movements (idempotency_key)
  where idempotency_key is not null;
create unique index if not exists cash_movements_reversal_unique
  on public.cash_movements (reversal_of_id)
  where reversal_of_id is not null;
create index if not exists cash_movements_account_history_idx
  on public.cash_movements (account_key, movement_date desc, created_at desc);

create or replace function public.dashboard_reject_cash_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Cash ledger entries are append-only; create an audited reversal instead.'
    using errcode = 'P0001';
end
$function$;

drop trigger if exists dashboard_reject_settlement_cash_mutation on public.cash_movements;
drop trigger if exists dashboard_reject_cash_movement_mutation on public.cash_movements;
create trigger dashboard_reject_cash_movement_mutation
before update or delete on public.cash_movements
for each row execute function public.dashboard_reject_cash_movement_mutation();

create or replace function public.record_dashboard_cash_movement(
  p_movement_date date,
  p_transaction_type text,
  p_account_key text,
  p_amount numeric,
  p_description text,
  p_reference text,
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
  normalized_type text := lower(btrim(p_transaction_type));
  normalized_account text := lower(btrim(p_account_key));
  normalized_description text := btrim(p_description);
  normalized_reference text := nullif(btrim(p_reference), '');
  normalized_owner text := nullif(btrim(p_owner_label), '');
  movement_direction text;
  fingerprint text;
  existing public.cash_movements%rowtype;
  new_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]) then
    raise exception 'Not authorized to record cash movements' using errcode = '42501';
  end if;
  if p_movement_date is null
     or normalized_type not in ('owner_investment', 'owner_withdrawal', 'operating_inflow', 'operating_outflow')
     or nullif(normalized_account, '') is null
     or nullif(normalized_description, '') is null
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
     or p_amount <> trunc(p_amount, 2)
     or p_idempotency_key is null then
    raise exception 'Invalid cash movement values' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.business_lookup_values
    where lookup_type = 'cash_account'
      and lookup_key = normalized_account
      and is_active
  ) then
    raise exception 'Cash account is not active' using errcode = '22023';
  end if;

  movement_direction := case
    when normalized_type in ('owner_investment', 'operating_inflow') then 'inflow'
    else 'outflow'
  end;
  if normalized_type in ('owner_investment', 'owner_withdrawal') then
    normalized_owner := coalesce(
      normalized_owner,
      (select nullif(btrim(display_name), '') from public.dashboard_user_profiles where user_id = actor),
      'Owner'
    );
  else
    normalized_owner := null;
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|',
    p_movement_date::text, normalized_type, normalized_account,
    p_amount::text, normalized_description,
    coalesce(normalized_reference, ''), coalesce(normalized_owner, '')
  ));

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into existing from public.cash_movements
  where idempotency_key = p_idempotency_key::text;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for different cash values' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    description, reference, owner_label, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_movement_date, movement_direction, normalized_type, normalized_account,
    p_amount, normalized_description, normalized_reference, normalized_owner,
    p_idempotency_key::text, fingerprint, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

create or replace function public.reverse_dashboard_cash_movement(
  p_original_id uuid,
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
  existing public.cash_movements%rowtype;
  fingerprint text;
  new_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse cash movements' using errcode = '42501';
  end if;
  if p_original_id is null or p_idempotency_key is null
     or nullif(normalized_reason, '') is null or char_length(normalized_reason) > 500 then
    raise exception 'Original entry, reason, and idempotency key are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_original_id::text, normalized_reason));
  select * into existing from public.cash_movements
  where idempotency_key = p_idempotency_key::text;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different reversal' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into original from public.cash_movements where id = p_original_id for update;
  if not found then raise exception 'Cash movement not found' using errcode = 'P0002'; end if;
  if original.transaction_type not in ('owner_investment', 'owner_withdrawal', 'operating_inflow', 'operating_outflow')
     or original.order_id is not null or original.settlement_id is not null or original.expense_id is not null
     or original.reversal_of_id is not null then
    raise exception 'This entry requires a source-specific correction workflow' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_movements where reversal_of_id = original.id) then
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
    'Reversal: ' || normalized_reason, original.reference, original.owner_label,
    original.id, p_idempotency_key::text, fingerprint, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.record_cash_movement(
  date, text, text, numeric, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.record_dashboard_cash_movement(
  date, text, text, numeric, text, text, text, uuid
) from public, anon, service_role;
grant execute on function public.record_dashboard_cash_movement(
  date, text, text, numeric, text, text, text, uuid
) to authenticated;
revoke all on function public.reverse_dashboard_cash_movement(uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.reverse_dashboard_cash_movement(uuid, text, uuid)
  to authenticated;

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
  exists (select 1 from public.cash_movements reversal where reversal.reversal_of_id = movement.id) as is_reversed,
  movement.created_at
from public.cash_movements movement
left join public.cash_movements original on original.id = movement.reversal_of_id
left join public.business_lookup_values account
  on account.lookup_type = 'cash_account'
 and account.lookup_key = movement.account_key;

create or replace view public.dashboard_cash_account_balances
with (security_invoker = true)
as
select
  account_key,
  max(account_label) as account_label,
  sum(signed_amount) as balance
from public.dashboard_cash_ledger
group by account_key;

revoke all on table public.dashboard_cash_ledger,
  public.dashboard_cash_account_balances from public, anon;
grant select on table public.dashboard_cash_ledger,
  public.dashboard_cash_account_balances to authenticated;

revoke all on function public.dashboard_classify_cash_movement(),
  public.dashboard_reject_cash_movement_mutation()
from public, anon, authenticated, service_role;

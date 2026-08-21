begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regclass('public.expenses') is null
     or to_regclass('public.audit_history') is null
     or to_regprocedure('public.record_expense(date,text,text,numeric,text,uuid,text,text)') is null then
    raise exception 'Expense-management prerequisites are missing.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.audit_history'::regclass
      and attname = 'reason' and attnum > 0 and not attisdropped
  ) then
    raise exception 'Apply the audited marketing-workspace migration before expense management.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.expenses'::regclass
      and tgname = 'dashboard_audit_change' and not tgisinternal
  ) then
    raise exception 'The expense audit trigger is missing.';
  end if;
end
$preflight$;

create or replace function public.dashboard_expense_category_allowed(p_category_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select lower(btrim(coalesce(p_category_key, ''))) = any (array[
    'operations',
    'product_purchase',
    'transportation',
    'packaging_supplies',
    'software',
    'utilities',
    'professional_services',
    'other'
  ]::text[]);
$function$;

revoke all on function public.dashboard_expense_category_allowed(text)
from public, anon, authenticated, service_role;

create or replace function public.record_expense(
  p_expense_date date,
  p_category_key text,
  p_description text,
  p_amount numeric,
  p_payment_method text default null,
  p_campaign_id uuid default null,
  p_sales_channel text default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_id uuid;
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
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
  if p_campaign_id is not null
     and not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campaign does not exist' using errcode = '23503';
  end if;

  insert into public.expenses (
    expense_date, category_key, description, amount, payment_method,
    campaign_id, sales_channel, reference, created_by, updated_by
  ) values (
    p_expense_date, lower(btrim(p_category_key)), btrim(p_description), p_amount,
    nullif(btrim(p_payment_method), ''), p_campaign_id,
    nullif(btrim(p_sales_channel), ''), nullif(btrim(p_reference), ''),
    actor, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

create or replace function public.edit_dashboard_expense(
  p_expense_id uuid,
  p_expense_date date,
  p_category_key text,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_campaign_id uuid,
  p_sales_channel text,
  p_reference text,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_row public.expenses%rowtype;
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to edit expenses' using errcode = '42501';
  end if;
  if p_expense_date is null
     or not public.dashboard_expense_category_allowed(p_category_key)
     or char_length(btrim(coalesce(p_description, ''))) not between 2 and 500
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
     or p_amount <> trunc(p_amount, 2)
     or char_length(coalesce(p_payment_method, '')) > 80
     or char_length(coalesce(p_sales_channel, '')) > 100
     or char_length(coalesce(p_reference, '')) > 160
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500
     or p_expected_updated_at is null then
    raise exception 'Invalid expense correction values' using errcode = '22023';
  end if;
  if p_campaign_id is not null
     and not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campaign does not exist' using errcode = '23503';
  end if;

  select * into current_row
  from public.expenses
  where id = p_expense_id
  for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if current_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Expense changed; refresh and try again' using errcode = '40001';
  end if;
  if exists (select 1 from public.cash_movements where expense_id = p_expense_id) then
    raise exception 'Expense is linked to a cash movement' using errcode = '23503';
  end if;

  perform set_config('nexanotion.audit_reason', btrim(p_reason), true);
  update public.expenses
  set expense_date = p_expense_date,
      category_key = lower(btrim(p_category_key)),
      description = btrim(p_description),
      amount = p_amount,
      payment_method = nullif(btrim(p_payment_method), ''),
      campaign_id = p_campaign_id,
      sales_channel = nullif(btrim(p_sales_channel), ''),
      reference = nullif(btrim(p_reference), ''),
      updated_by = (select auth.uid())
  where id = p_expense_id;
  return p_expense_id;
end
$function$;

create or replace function public.delete_dashboard_expense(
  p_expense_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_row public.expenses%rowtype;
begin
  if not public.dashboard_has_any_role(
    array['owner']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to delete expenses' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500
     or p_expected_updated_at is null then
    raise exception 'A deletion reason is required' using errcode = '22023';
  end if;

  select * into current_row
  from public.expenses
  where id = p_expense_id
  for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if current_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Expense changed; refresh and try again' using errcode = '40001';
  end if;
  if exists (select 1 from public.cash_movements where expense_id = p_expense_id) then
    raise exception 'Expense is linked to a cash movement' using errcode = '23503';
  end if;

  perform set_config('nexanotion.audit_reason', btrim(p_reason), true);
  delete from public.expenses where id = p_expense_id;
  return p_expense_id;
end
$function$;

revoke all on function public.record_expense(
  date, text, text, numeric, text, uuid, text, text
), public.edit_dashboard_expense(
  uuid, date, text, text, numeric, text, uuid, text, text, text, timestamptz
), public.delete_dashboard_expense(
  uuid, text, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.record_expense(
  date, text, text, numeric, text, uuid, text, text
), public.edit_dashboard_expense(
  uuid, date, text, text, numeric, text, uuid, text, text, text, timestamptz
), public.delete_dashboard_expense(
  uuid, text, timestamptz
) to authenticated;

commit;

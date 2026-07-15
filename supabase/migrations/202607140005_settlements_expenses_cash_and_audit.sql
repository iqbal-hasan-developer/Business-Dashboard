create table if not exists public.settlement_records (
  id uuid primary key default gen_random_uuid(),
  courier text not null,
  settlement_reference text,
  settlement_date date not null,
  amount_received numeric(12,2) not null,
  fees_withheld numeric(12,2) not null default 0,
  status text not null default 'pending',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_records_amount_nonnegative
    check (amount_received >= 0 and fees_withheld >= 0),
  constraint settlement_records_status_allowed check (
    status in ('pending', 'partially_reconciled', 'reconciled', 'void')
  )
);

create unique index if not exists settlement_records_reference_uidx
  on public.settlement_records (courier, settlement_reference)
  where settlement_reference is not null;

create table if not exists public.settlement_order_allocations (
  settlement_id uuid not null
    references public.settlement_records(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  allocated_amount numeric(12,2) not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (settlement_id, order_id),
  constraint settlement_order_allocations_amount_positive
    check (allocated_amount > 0)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_key text not null,
  description text not null,
  amount numeric(12,2) not null,
  payment_method text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sales_channel text,
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0)
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  movement_date date not null,
  movement_type text not null,
  account_key text not null,
  amount numeric(12,2) not null,
  order_id uuid references public.orders(id) on delete set null,
  settlement_id uuid references public.settlement_records(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  description text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cash_movements_type_allowed check (
    movement_type in ('inflow', 'outflow', 'transfer_in', 'transfer_out')
  ),
  constraint cash_movements_amount_positive check (amount > 0),
  constraint cash_movements_single_source check (
    ((order_id is not null)::integer
      + (settlement_id is not null)::integer
      + (expense_id is not null)::integer) <= 1
  )
);

create table if not exists public.audit_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb,
  constraint audit_history_action_allowed
    check (action in ('INSERT', 'UPDATE', 'DELETE'))
);

comment on table public.audit_history is
  'Field-minimized audit metadata. No automatic purge is enabled; retention requires owner approval.';

drop trigger if exists settlement_records_set_updated_at
  on public.settlement_records;
create trigger settlement_records_set_updated_at
before update on public.settlement_records
for each row execute function public.dashboard_set_updated_at();

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.dashboard_set_updated_at();

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
      'notes', 'created_at', 'updated_at'
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

revoke all on function public.dashboard_audit_safe_payload(text, jsonb)
  from public, anon;
grant execute on function public.dashboard_audit_safe_payload(text, jsonb)
  to authenticated, service_role;

create or replace function public.dashboard_write_audit_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  raw_old jsonb;
  raw_new jsonb;
  safe_old jsonb;
  safe_new jsonb;
  changed_old jsonb;
  changed_new jsonb;
  record_key text;
begin
  raw_old := case when tg_op in ('UPDATE', 'DELETE')
    then to_jsonb(old) else null end;
  raw_new := case when tg_op in ('INSERT', 'UPDATE')
    then to_jsonb(new) else null end;

  safe_old := public.dashboard_audit_safe_payload(tg_table_name, raw_old);
  safe_new := public.dashboard_audit_safe_payload(tg_table_name, raw_new);

  if tg_op = 'UPDATE' then
    select
      coalesce(jsonb_object_agg(changed.key, safe_old -> changed.key), '{}'::jsonb),
      coalesce(jsonb_object_agg(changed.key, safe_new -> changed.key), '{}'::jsonb)
    into changed_old, changed_new
    from (
      select key
      from jsonb_object_keys(
        coalesce(safe_old, '{}'::jsonb) || coalesce(safe_new, '{}'::jsonb)
      ) as keys(key)
      where safe_old -> key is distinct from safe_new -> key
    ) as changed;

    if changed_old = '{}'::jsonb and changed_new = '{}'::jsonb then
      return new;
    end if;
  else
    changed_old := safe_old;
    changed_new := safe_new;
  end if;

  record_key := coalesce(
    raw_new ->> 'id',
    raw_new ->> 'product_id',
    raw_new ->> 'order_id',
    raw_new ->> 'setting_key',
    raw_new ->> 'lookup_key',
    raw_old ->> 'id',
    raw_old ->> 'product_id',
    raw_old ->> 'order_id',
    raw_old ->> 'setting_key',
    raw_old ->> 'lookup_key',
    'unknown'
  );

  insert into public.audit_history (
    table_name,
    record_id,
    action,
    changed_by,
    old_values,
    new_values
  ) values (
    tg_table_name,
    record_key,
    tg_op,
    (select auth.uid()),
    changed_old,
    changed_new
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function public.dashboard_write_audit_history()
  from public, anon;
grant execute on function public.dashboard_write_audit_history()
  to authenticated, service_role;

do $audit_triggers$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'dashboard_user_profiles',
    'product_business_data',
    'business_settings',
    'business_lookup_values',
    'campaigns',
    'daily_ad_spend',
    'orders',
    'order_items',
    'order_financial_snapshots',
    'order_financial_adjustments',
    'settlement_records',
    'settlement_order_allocations',
    'expenses',
    'cash_movements'
  ] loop
    execute format(
      'drop trigger if exists dashboard_audit_change on public.%I',
      audited_table
    );
    execute format(
      'create trigger dashboard_audit_change after insert or update or delete on public.%I for each row execute function public.dashboard_write_audit_history()',
      audited_table
    );
  end loop;
end
$audit_triggers$;

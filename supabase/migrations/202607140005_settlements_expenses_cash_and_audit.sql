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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_records_amount_nonnegative check (amount_received >= 0 and fees_withheld >= 0),
  constraint settlement_records_status_allowed check (status in ('pending', 'partially_reconciled', 'reconciled', 'void'))
);

create unique index if not exists settlement_records_reference_uidx
  on public.settlement_records (courier, settlement_reference) where settlement_reference is not null;

create table if not exists public.settlement_order_allocations (
  settlement_id uuid not null references public.settlement_records(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  allocated_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  primary key (settlement_id, order_id),
  constraint settlement_order_allocations_amount_positive check (allocated_amount > 0)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_key text not null,
  description text not null,
  amount numeric(12,2) not null,
  payment_method text,
  reference text,
  created_by uuid references auth.users(id) on delete set null,
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
  constraint cash_movements_type_allowed check (movement_type in ('inflow', 'outflow', 'transfer_in', 'transfer_out')),
  constraint cash_movements_amount_positive check (amount > 0),
  constraint cash_movements_single_source check (
    ((order_id is not null)::integer + (settlement_id is not null)::integer + (expense_id is not null)::integer) <= 1
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
  request_id text,
  constraint audit_history_action_allowed check (action in ('INSERT', 'UPDATE', 'DELETE'))
);

drop trigger if exists settlement_records_set_updated_at on public.settlement_records;
create trigger settlement_records_set_updated_at before update on public.settlement_records
for each row execute function public.dashboard_set_updated_at();
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function public.dashboard_set_updated_at();

create or replace function public.dashboard_write_audit_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  record_key text;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  record_key := coalesce(new_row ->> 'id', new_row ->> 'product_id', new_row ->> 'order_id',
                         new_row ->> 'setting_key', new_row ->> 'lookup_key',
                         old_row ->> 'id', old_row ->> 'product_id', old_row ->> 'order_id',
                         old_row ->> 'setting_key', old_row ->> 'lookup_key', 'unknown');
  insert into public.audit_history (table_name, record_id, action, changed_by, old_values, new_values)
  values (tg_table_name, record_key, tg_op, (select auth.uid()), old_row, new_row);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'product_business_data', 'business_settings', 'campaigns', 'daily_ad_spend',
    'orders', 'order_items', 'order_financial_snapshots', 'settlement_records',
    'settlement_order_allocations', 'expenses', 'cash_movements'
  ] loop
    execute format('drop trigger if exists dashboard_audit_change on public.%I', table_name);
    execute format('create trigger dashboard_audit_change after insert or update or delete on public.%I for each row execute function public.dashboard_write_audit_history()', table_name);
  end loop;
end $$;

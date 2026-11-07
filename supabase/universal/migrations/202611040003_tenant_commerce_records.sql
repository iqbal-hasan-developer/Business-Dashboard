-- Canonical, store-scoped commerce records for the clean-install product.
-- External identifiers and source states stay alongside normalized fields.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  source_store_id uuid,
  external_id text,
  sku text,
  name text not null check (length(btrim(name)) between 1 and 500),
  description text,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price numeric(20, 6) check (price is null or price >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, source_store_id)
    references public.stores (workspace_id, id) on delete restrict,
  check (external_id is null or source_store_id is not null)
);

create unique index products_store_external_id_idx
  on public.products (workspace_id, source_store_id, external_id)
  where external_id is not null;
create index products_workspace_status_idx on public.products (workspace_id, status, name);
create index products_workspace_sku_idx on public.products (workspace_id, sku) where sku is not null;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  product_id uuid not null,
  external_id text,
  sku text,
  name text not null default 'Default',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price numeric(20, 6) not null check (price >= 0),
  compare_at_price numeric(20, 6) check (compare_at_price is null or compare_at_price >= 0),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, product_id, id),
  foreign key (workspace_id, product_id)
    references public.products (workspace_id, id) on delete restrict
);

create unique index product_variants_external_id_idx
  on public.product_variants (workspace_id, product_id, external_id)
  where external_id is not null;
create index product_variants_workspace_sku_idx
  on public.product_variants (workspace_id, sku) where sku is not null;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  store_id uuid not null,
  external_id text,
  email text,
  phone text,
  full_name text not null check (length(btrim(full_name)) between 1 and 500),
  marketing_consent boolean,
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create unique index customers_store_external_id_idx
  on public.customers (workspace_id, store_id, external_id)
  where external_id is not null;
create index customers_workspace_email_idx
  on public.customers (workspace_id, lower(email)) where email is not null;
create index customers_workspace_phone_idx
  on public.customers (workspace_id, phone) where phone is not null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  store_id uuid not null,
  customer_id uuid,
  external_id text,
  order_number text not null,
  status text not null check (status in ('pending', 'confirmed', 'processing', 'fulfilled', 'cancelled', 'refunded', 'partially_refunded')),
  payment_status text not null check (payment_status in ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed')),
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled', 'partial', 'fulfilled', 'cancelled')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(20, 6) not null default 0 check (subtotal >= 0),
  discount_total numeric(20, 6) not null default 0 check (discount_total >= 0),
  shipping_total numeric(20, 6) not null default 0 check (shipping_total >= 0),
  tax_total numeric(20, 6) not null default 0 check (tax_total >= 0),
  refund_total numeric(20, 6) not null default 0 check (refund_total >= 0),
  total numeric(20, 6) not null check (total >= 0),
  source_status text,
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  placed_at timestamptz not null,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict,
  foreign key (workspace_id, customer_id)
    references public.customers (workspace_id, id) on delete restrict
);

create unique index orders_store_external_id_idx
  on public.orders (workspace_id, store_id, external_id)
  where external_id is not null;
create unique index orders_store_order_number_idx
  on public.orders (workspace_id, store_id, order_number);
create index orders_workspace_placed_at_idx on public.orders (workspace_id, placed_at desc);
create index orders_workspace_status_idx on public.orders (workspace_id, status, placed_at desc);
create index orders_workspace_customer_idx on public.orders (workspace_id, customer_id, placed_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  order_id uuid not null,
  product_variant_id uuid,
  product_name_snapshot text not null,
  sku_snapshot text,
  quantity numeric(20, 6) not null check (quantity > 0),
  unit_price numeric(20, 6) not null check (unit_price >= 0),
  discount_total numeric(20, 6) not null default 0 check (discount_total >= 0),
  tax_total numeric(20, 6) not null default 0 check (tax_total >= 0),
  line_total numeric(20, 6) not null check (line_total >= 0),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, order_id)
    references public.orders (workspace_id, id) on delete restrict,
  foreign key (workspace_id, product_variant_id)
    references public.product_variants (workspace_id, id) on delete restrict
);

create index order_items_workspace_order_idx on public.order_items (workspace_id, order_id);
create index order_items_workspace_variant_idx
  on public.order_items (workspace_id, product_variant_id) where product_variant_id is not null;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  order_id uuid not null,
  external_id text,
  amount numeric(20, 6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  reason text,
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, order_id)
    references public.orders (workspace_id, id) on delete restrict
);

create unique index refunds_order_external_id_idx
  on public.refunds (workspace_id, order_id, external_id) where external_id is not null;
create index refunds_workspace_order_idx on public.refunds (workspace_id, order_id, created_at desc);

create table public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  order_id uuid not null,
  external_id text,
  status text not null check (status in ('pending', 'in_transit', 'delivered', 'failed', 'cancelled')),
  carrier text,
  tracking_number text,
  tracking_url text,
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, order_id)
    references public.orders (workspace_id, id) on delete restrict
);

create unique index fulfillments_order_external_id_idx
  on public.fulfillments (workspace_id, order_id, external_id) where external_id is not null;
create index fulfillments_workspace_status_idx on public.fulfillments (workspace_id, status, created_at desc);

create table public.inventory_levels (
  workspace_id uuid not null,
  store_id uuid not null,
  product_variant_id uuid not null,
  quantity numeric(20, 6) not null check (quantity >= 0),
  source text not null check (source in ('store_sync', 'manual_count')),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, store_id, product_variant_id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict,
  foreign key (workspace_id, product_variant_id)
    references public.product_variants (workspace_id, id) on delete restrict
);

create index inventory_levels_workspace_quantity_idx
  on public.inventory_levels (workspace_id, quantity, observed_at);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  store_id uuid not null,
  product_variant_id uuid not null,
  movement_type text not null check (movement_type in ('receipt', 'sale', 'refund', 'adjustment', 'transfer', 'sync')),
  quantity_delta numeric(20, 6) not null check (quantity_delta <> 0),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  source_reference text,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict,
  foreign key (workspace_id, product_variant_id)
    references public.product_variants (workspace_id, id) on delete restrict
);

create index inventory_movements_workspace_variant_idx
  on public.inventory_movements (workspace_id, store_id, product_variant_id, created_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  store_id uuid,
  category text not null check (length(btrim(category)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 1000),
  amount numeric(20, 6) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  expense_date date not null,
  status text not null default 'paid' check (status in ('draft', 'unpaid', 'paid', 'void')),
  source text not null default 'manual' check (source in ('manual', 'imported')),
  source_reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create index expenses_workspace_date_idx on public.expenses (workspace_id, expense_date desc, created_at desc);
create index expenses_workspace_store_date_idx
  on public.expenses (workspace_id, store_id, expense_date desc) where store_id is not null;

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  store_id uuid,
  order_id uuid,
  entry_type text not null check (entry_type in ('revenue', 'refund', 'cogs', 'shipping', 'tax', 'fee', 'expense', 'adjustment')),
  amount numeric(20, 6) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_at timestamptz not null,
  source_type text not null check (source_type in ('store_sync', 'manual', 'calculated')),
  source_reference text,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  note text,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict,
  foreign key (workspace_id, order_id)
    references public.orders (workspace_id, id) on delete restrict
);

create index financial_entries_workspace_date_idx
  on public.financial_entries (workspace_id, effective_at desc, entry_type);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  store_id uuid not null,
  entity_type text not null check (entity_type in ('products', 'orders', 'customers', 'inventory', 'refunds', 'fulfillments')),
  mode text not null check (mode in ('manual', 'scheduled', 'webhook')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  error_code text,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create index sync_runs_workspace_store_idx on public.sync_runs (workspace_id, store_id, created_at desc);
create index sync_runs_workspace_status_idx on public.sync_runs (workspace_id, status, created_at desc);

create table public.sync_checkpoints (
  workspace_id uuid not null,
  store_id uuid not null,
  entity_type text not null check (entity_type in ('products', 'orders', 'customers', 'inventory', 'refunds', 'fulfillments')),
  cursor text,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, store_id, entity_type),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create table public.webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  store_id uuid not null,
  provider_event_id text not null check (length(btrim(provider_event_id)) between 1 and 500),
  topic text not null check (length(btrim(topic)) between 1 and 200),
  payload_sha256 bytea not null check (octet_length(payload_sha256) = 32),
  status text not null default 'received' check (status in ('received', 'queued', 'processed', 'failed', 'ignored')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, store_id, provider_event_id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create index webhook_receipts_workspace_status_idx
  on public.webhook_receipts (workspace_id, status, received_at desc);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  store_id uuid,
  job_type text not null check (length(btrim(job_type)) between 1 and 120),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create index background_jobs_ready_idx on public.background_jobs (available_at, created_at)
  where status in ('queued', 'failed');
create index background_jobs_workspace_status_idx
  on public.background_jobs (workspace_id, status, created_at desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 120),
  entity_type text not null check (length(btrim(entity_type)) between 1 and 120),
  entity_id uuid,
  reason text,
  event_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(event_metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index audit_events_workspace_time_idx on public.audit_events (workspace_id, created_at desc);

create or replace function public.prevent_tenant_workspace_transfer()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.workspace_id <> old.workspace_id then
    raise exception 'Tenant record workspace ownership cannot be changed.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.prevent_tenant_workspace_transfer()
  from public, anon, authenticated, service_role;

do $workspace_transfer_guards$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'products', 'product_variants', 'customers', 'orders', 'order_items',
    'refunds', 'fulfillments', 'inventory_levels', 'inventory_movements',
    'expenses', 'financial_entries', 'sync_runs', 'sync_checkpoints',
    'webhook_receipts', 'background_jobs', 'audit_events'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.prevent_tenant_workspace_transfer()',
      tenant_table || '_keep_workspace',
      tenant_table
    );
  end loop;
end
$workspace_transfer_guards$;

do $workspace_rls$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'products', 'product_variants', 'customers', 'orders', 'order_items',
    'refunds', 'fulfillments', 'inventory_levels', 'inventory_movements',
    'expenses', 'financial_entries', 'sync_runs', 'sync_checkpoints',
    'webhook_receipts', 'background_jobs', 'audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', tenant_table);
    execute format('alter table public.%I force row level security', tenant_table);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', tenant_table);
    execute format('grant select on table public.%I to authenticated', tenant_table);
    if tenant_table in ('financial_entries', 'audit_events') then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.current_workspace_role(workspace_id) in (%L, %L))',
        tenant_table || '_owner_admin_read', tenant_table, 'owner', 'admin'
      );
    elsif tenant_table = 'customers' then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.current_workspace_role(workspace_id) in (%L, %L, %L, %L))',
        tenant_table || '_team_read', tenant_table, 'owner', 'admin', 'manager', 'staff'
      );
    else
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.current_workspace_role(workspace_id) is not null)',
        tenant_table || '_members_read', tenant_table
      );
    end if;
  end loop;
end
$workspace_rls$;

-- Catalog changes are limited to owners, admins, and managers. Catalog rows
-- remain archived rather than hard-deleted so synced history keeps its links.
grant insert, update on table public.products, public.product_variants to authenticated;
create policy products_managers_insert on public.products for insert to authenticated
  with check (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));
create policy products_managers_update on public.products for update to authenticated
  using (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'))
  with check (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));
create policy product_variants_managers_insert on public.product_variants for insert to authenticated
  with check (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));
create policy product_variants_managers_update on public.product_variants for update to authenticated
  using (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'))
  with check (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));

-- Expense corrections require an audited workflow; direct member edits and
-- deletes are withheld until that workflow is available.
grant insert on table public.expenses to authenticated;
create policy expenses_managers_insert on public.expenses for insert to authenticated
  with check (
    public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager')
    and created_by = (select auth.uid())
  );
-- Queue/sync/finance writes use service_role only. Those application paths must
-- scope every operation by workspace_id and store_id; service_role bypasses RLS.
grant select, insert, update on table
  public.customers, public.orders, public.order_items, public.refunds,
  public.fulfillments, public.inventory_levels, public.inventory_movements,
  public.financial_entries, public.sync_runs, public.sync_checkpoints,
  public.webhook_receipts, public.background_jobs, public.audit_events
  to service_role;
grant select, update on table public.stores to service_role;
grant select, insert, update, delete on table public.store_credentials to service_role;


-- Phase 3 application fields, controlled writes, and private migration ledger.

alter table public.products
  add column category text,
  add column brand text,
  add column image_urls text[] not null default '{}';

alter table public.product_variants
  add column barcode text,
  add column attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes) = 'object'),
  add column reorder_level numeric(20, 6) not null default 0
    check (reorder_level >= 0);

create table public.product_variant_costs (
  workspace_id uuid not null,
  product_variant_id uuid not null,
  cost_price numeric(20, 6) check (cost_price is null or cost_price >= 0),
  private_notes text,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, product_variant_id),
  foreign key (workspace_id, product_variant_id)
    references public.product_variants (workspace_id, id) on delete restrict
);
alter table public.product_variant_costs enable row level security;
alter table public.product_variant_costs force row level security;
revoke all on table public.product_variant_costs from public, anon, authenticated, service_role;
grant select on table public.product_variant_costs to authenticated;
create policy product_variant_costs_managers_read on public.product_variant_costs
  for select to authenticated
  using (public.current_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));
grant select, insert, update on table public.product_variant_costs to service_role;

alter table public.customers
  add column billing_address jsonb not null default '{}'::jsonb
    check (jsonb_typeof(billing_address) = 'object'),
  add column shipping_address jsonb not null default '{}'::jsonb
    check (jsonb_typeof(shipping_address) = 'object'),
  add column notes text;

alter table public.orders
  add column payment_method text,
  add column shipping_cost numeric(20, 6) check (shipping_cost is null or shipping_cost >= 0),
  add column customer_name_snapshot text,
  add column customer_phone_snapshot text,
  add column shipping_address_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(shipping_address_snapshot) = 'object'),
  add column source text not null default 'manual';

alter table public.order_items
  add column unit_cost numeric(20, 6) check (unit_cost is null or unit_cost >= 0),
  add column image_url_snapshot text,
  add column attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes) = 'object');

alter table public.inventory_levels
  add column reorder_level numeric(20, 6) not null default 0
    check (reorder_level >= 0);

alter table public.expenses
  add column accounting_class text not null default 'operating_expense'
    check (accounting_class in ('operating_expense', 'inventory_purchase', 'freight_in', 'unallocated_procurement', 'other')),
  add column payment_method text,
  add column receipt_reference text,
  add column notes text;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in ('pending', 'confirmed', 'processing', 'fulfilled', 'cancelled',
    'returned', 'refunded', 'partially_refunded')
);
alter table public.orders drop constraint orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (
  payment_status in ('pending', 'authorized', 'partially_paid', 'paid',
    'partially_refunded', 'refunded', 'failed')
);
alter table public.financial_entries drop constraint financial_entries_entry_type_check;
alter table public.financial_entries add constraint financial_entries_entry_type_check check (
  entry_type in ('revenue', 'discount', 'refund', 'cogs', 'shipping_income',
    'shipping_cost', 'tax', 'fee', 'expense', 'inventory_purchase', 'freight_in', 'adjustment')
);

-- Import ledger contains hashes and source identifiers only. It is never exposed
-- through PostgREST and does not store customer rows, credentials, or raw JSON.
create table public.legacy_import_runs (
  id uuid primary key,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  store_id uuid not null,
  source_owner_id uuid not null references auth.users(id) on delete restrict,
  target_owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('running', 'completed', 'completed_with_holds', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create table public.legacy_import_records (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  source_table text not null check (length(btrim(source_table)) between 1 and 120),
  source_id text not null check (length(btrim(source_id)) between 1 and 240),
  target_table text not null check (length(btrim(target_table)) between 1 and 120),
  target_id uuid not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  primary key (workspace_id, source_table, source_id)
);

create table public.legacy_import_holds (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  source_table text not null,
  source_id text not null,
  reason_code text not null check (length(btrim(reason_code)) between 1 and 120),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (workspace_id, source_table, source_id)
);

revoke all on table public.legacy_import_runs, public.legacy_import_records,
  public.legacy_import_holds from public, anon, authenticated, service_role;
alter table public.legacy_import_runs enable row level security;
alter table public.legacy_import_runs force row level security;
alter table public.legacy_import_records enable row level security;
alter table public.legacy_import_records force row level security;
alter table public.legacy_import_holds enable row level security;
alter table public.legacy_import_holds force row level security;

create or replace function public.save_workspace_product(
  p_workspace_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_name text,
  p_description text,
  p_sku text,
  p_category text,
  p_brand text,
  p_image_urls text[],
  p_status text,
  p_currency text,
  p_price numeric,
  p_cost_price numeric,
  p_barcode text,
  p_variant_name text,
  p_attributes jsonb,
  p_reorder_level numeric
)
returns table (product_id uuid, variant_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  resolved_product_id uuid := p_product_id;
  resolved_variant_id uuid := p_variant_id;
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Workspace catalog permission is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or length(p_name) > 500
     or p_status not in ('active', 'draft', 'archived')
     or p_currency !~ '^[A-Z]{3}$'
     or p_price is null or p_price < 0 or (p_cost_price is not null and p_cost_price < 0)
     or p_reorder_level < 0
     or jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) <> 'object'
     or cardinality(coalesce(p_image_urls, '{}'::text[])) > 20
     or exists (select 1 from unnest(coalesce(p_image_urls, '{}'::text[])) as urls(image_url)
       where length(image_url) > 2048 or image_url !~* '^https://') then
    raise exception 'Product values are invalid.' using errcode = '22023';
  end if;

  if resolved_product_id is null then
    insert into public.products (workspace_id, name, description, sku, category, brand,
      image_urls, status, currency, price)
    values (p_workspace_id, btrim(p_name), nullif(btrim(p_description), ''),
      nullif(btrim(p_sku), ''), nullif(btrim(p_category), ''), nullif(btrim(p_brand), ''),
      coalesce(p_image_urls, '{}'::text[]), p_status, p_currency, p_price)
    returning id into resolved_product_id;
  else
    update public.products set name = btrim(p_name),
      description = nullif(btrim(p_description), ''), sku = nullif(btrim(p_sku), ''),
      category = nullif(btrim(p_category), ''), brand = nullif(btrim(p_brand), ''),
      image_urls = coalesce(p_image_urls, '{}'::text[]), status = p_status,
      currency = p_currency, price = p_price, updated_at = now()
    where id = resolved_product_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Product was not found in this workspace.' using errcode = '42501'; end if;
  end if;

  if resolved_variant_id is null then
    insert into public.product_variants (workspace_id, product_id, sku, barcode, name,
      currency, price, attributes, reorder_level)
    values (p_workspace_id, resolved_product_id, nullif(btrim(p_sku), ''),
      nullif(btrim(p_barcode), ''), coalesce(nullif(btrim(p_variant_name), ''), 'Default'),
      p_currency, p_price, coalesce(p_attributes, '{}'::jsonb), p_reorder_level)
    returning id into resolved_variant_id;
  else
    update public.product_variants set sku = nullif(btrim(p_sku), ''),
      barcode = nullif(btrim(p_barcode), ''),
      name = coalesce(nullif(btrim(p_variant_name), ''), 'Default'),
      currency = p_currency, price = p_price,
      attributes = coalesce(p_attributes, '{}'::jsonb), reorder_level = p_reorder_level,
      updated_at = now()
    where id = resolved_variant_id and product_id = resolved_product_id
      and workspace_id = p_workspace_id;
    if not found then raise exception 'Product variant was not found in this workspace.' using errcode = '42501'; end if;
  end if;

  insert into public.product_variant_costs (workspace_id, product_variant_id, cost_price, private_notes, updated_by)
  values (p_workspace_id, resolved_variant_id, p_cost_price, null, actor_id)
  on conflict (workspace_id, product_variant_id) do update
    set cost_price = excluded.cost_price, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (p_workspace_id, actor_id, case when p_product_id is null then 'product.created' else 'product.updated' end,
    'product', resolved_product_id);
  return query select resolved_product_id, resolved_variant_id;
end
$function$;

revoke all on function public.save_workspace_product(uuid, uuid, uuid, text, text, text,
  text, text, text[], text, text, numeric, numeric, text, text, jsonb, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.save_workspace_product(uuid, uuid, uuid, text, text, text,
  text, text, text[], text, text, numeric, numeric, text, text, jsonb, numeric)
  to authenticated;

create or replace function public.archive_workspace_product(p_workspace_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Workspace catalog permission is required.' using errcode = '42501';
  end if;
  update public.products set status = 'archived', updated_at = now()
  where id = p_product_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Product was not found in this workspace.' using errcode = '42501'; end if;
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (p_workspace_id, actor_id, 'product.archived', 'product', p_product_id);
end
$function$;
revoke all on function public.archive_workspace_product(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.archive_workspace_product(uuid, uuid) to authenticated;

create or replace function public.adjust_workspace_inventory(
  p_workspace_id uuid,
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity_delta numeric,
  p_idempotency_key text,
  p_reason text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  movement_id uuid;
  resulting_quantity numeric(20, 6);
  prior public.inventory_movements%rowtype;
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Workspace inventory permission is required.' using errcode = '42501';
  end if;
  if p_quantity_delta = 0 or nullif(btrim(p_idempotency_key), '') is null
     or length(p_idempotency_key) > 240 or nullif(btrim(p_reason), '') is null then
    raise exception 'Inventory adjustment values are invalid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.workspace_id = p_workspace_id)
     or not exists (select 1 from public.product_variants v where v.id = p_variant_id and v.workspace_id = p_workspace_id) then
    raise exception 'Inventory references must belong to this workspace.' using errcode = '42501';
  end if;

  insert into public.inventory_movements (workspace_id, store_id, product_variant_id,
    movement_type, quantity_delta, idempotency_key, source_reference, note, actor_id)
  values (p_workspace_id, p_store_id, p_variant_id, 'adjustment', p_quantity_delta,
    btrim(p_idempotency_key), btrim(p_idempotency_key), btrim(p_reason), actor_id)
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into movement_id;

  if movement_id is null then
    select * into prior from public.inventory_movements
    where workspace_id = p_workspace_id and idempotency_key = btrim(p_idempotency_key);
    if prior.store_id <> p_store_id or prior.product_variant_id <> p_variant_id
       or prior.quantity_delta <> p_quantity_delta or prior.note <> btrim(p_reason) then
      raise exception 'Inventory idempotency key was reused with different values.' using errcode = '23505';
    end if;
    select quantity into resulting_quantity from public.inventory_levels
    where workspace_id = p_workspace_id and store_id = p_store_id and product_variant_id = p_variant_id;
    return coalesce(resulting_quantity, 0);
  end if;

  if p_quantity_delta < 0 and not exists (
    select 1 from public.inventory_levels l where l.workspace_id = p_workspace_id
      and l.store_id = p_store_id and l.product_variant_id = p_variant_id
  ) then
    raise exception 'Inventory adjustment would make stock negative.' using errcode = '23514';
  end if;

  insert into public.inventory_levels (workspace_id, store_id, product_variant_id, quantity,
    reorder_level, source, observed_at)
  values (p_workspace_id, p_store_id, p_variant_id, greatest(p_quantity_delta, 0), 0,
    'manual_count', now())
  on conflict (workspace_id, store_id, product_variant_id) do update
    set quantity = public.inventory_levels.quantity + p_quantity_delta,
      source = 'manual_count', observed_at = now(), updated_at = now()
  where public.inventory_levels.quantity + excluded.quantity >= 0
  returning quantity into resulting_quantity;
  if resulting_quantity is null then
    raise exception 'Inventory adjustment would make stock negative.' using errcode = '23514';
  end if;

  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id, reason,
    event_metadata)
  values (p_workspace_id, actor_id, 'inventory.adjusted', 'product_variant', p_variant_id,
    btrim(p_reason), jsonb_build_object('movement_id', movement_id, 'quantity_delta', p_quantity_delta));
  return resulting_quantity;
end
$function$;
revoke all on function public.adjust_workspace_inventory(uuid, uuid, uuid, numeric, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.adjust_workspace_inventory(uuid, uuid, uuid, numeric, text, text)
  to authenticated;

create or replace function public.set_workspace_order_status(
  p_workspace_id uuid, p_order_id uuid, p_status text, p_payment_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  current_order public.orders%rowtype;
  order_item record;
  changed_quantity numeric(20, 6);
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager', 'staff') then
    raise exception 'Workspace order permission is required.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'confirmed', 'processing', 'fulfilled', 'cancelled', 'returned', 'refunded', 'partially_refunded')
     or p_payment_status not in ('pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'failed') then
    raise exception 'Order status values are invalid.' using errcode = '22023';
  end if;
  select * into current_order from public.orders
  where id = p_order_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Order was not found in this workspace.' using errcode = '42501'; end if;
  if (p_status = 'refunded' and current_order.refund_total < current_order.total)
     or (p_status = 'partially_refunded' and (current_order.refund_total <= 0 or current_order.refund_total >= current_order.total))
     or (p_payment_status = 'refunded' and current_order.refund_total < current_order.total)
     or (p_payment_status = 'partially_refunded' and (current_order.refund_total <= 0 or current_order.refund_total >= current_order.total)) then
    raise exception 'Refund status must match recorded refund amounts.' using errcode = '23514';
  end if;
  if p_status = 'fulfilled' and current_order.status <> 'fulfilled' then
    for order_item in select * from public.order_items
      where workspace_id = p_workspace_id and order_id = p_order_id order by id
    loop
      if order_item.product_variant_id is null then
        raise exception 'Order item has no workspace product variant.' using errcode = '23514';
      end if;
      update public.inventory_levels set quantity = quantity - order_item.quantity,
        source = 'manual_count', observed_at = now(), updated_at = now()
      where workspace_id = p_workspace_id and store_id = current_order.store_id
        and product_variant_id = order_item.product_variant_id and quantity >= order_item.quantity
      returning quantity into changed_quantity;
      if not found then raise exception 'Insufficient inventory to fulfill the order.' using errcode = '23514'; end if;
      insert into public.inventory_movements (workspace_id, store_id, product_variant_id,
        movement_type, quantity_delta, idempotency_key, source_reference, note, actor_id)
      values (p_workspace_id, current_order.store_id, order_item.product_variant_id, 'sale',
        -order_item.quantity, 'order-fulfilled:' || p_order_id::text || ':' || order_item.id::text,
        p_order_id::text, 'Stock issued when order was fulfilled', actor_id);
    end loop;
    insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
      currency, effective_at, source_type, source_reference, idempotency_key, note)
    values (p_workspace_id, current_order.store_id, p_order_id, 'revenue', current_order.subtotal,
      current_order.currency, now(), 'calculated', p_order_id::text, 'order-revenue:' || p_order_id::text,
      'Product subtotal recognized on fulfillment')
    on conflict (workspace_id, idempotency_key) do nothing;
    if current_order.discount_total > 0 then
      insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
        currency, effective_at, source_type, source_reference, idempotency_key, note)
      values (p_workspace_id, current_order.store_id, p_order_id, 'discount', current_order.discount_total,
        current_order.currency, now(), 'calculated', p_order_id::text, 'order-discount:' || p_order_id::text,
        'Order discount recognized on fulfillment') on conflict (workspace_id, idempotency_key) do nothing;
    end if;
    if current_order.shipping_total > 0 then
      insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
        currency, effective_at, source_type, source_reference, idempotency_key, note)
      values (p_workspace_id, current_order.store_id, p_order_id, 'shipping_income', current_order.shipping_total,
        current_order.currency, now(), 'calculated', p_order_id::text, 'order-shipping-income:' || p_order_id::text,
        'Shipping income recognized on fulfillment') on conflict (workspace_id, idempotency_key) do nothing;
    end if;
    if current_order.tax_total > 0 then
      insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
        currency, effective_at, source_type, source_reference, idempotency_key, note)
      values (p_workspace_id, current_order.store_id, p_order_id, 'tax', current_order.tax_total,
        current_order.currency, now(), 'calculated', p_order_id::text, 'order-tax:' || p_order_id::text,
        'Order tax recognized on fulfillment') on conflict (workspace_id, idempotency_key) do nothing;
    end if;
    if current_order.shipping_cost > 0 then
      insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
        currency, effective_at, source_type, source_reference, idempotency_key, note)
      values (p_workspace_id, current_order.store_id, p_order_id, 'shipping_cost', current_order.shipping_cost,
        current_order.currency, now(), 'calculated', p_order_id::text, 'order-shipping-cost:' || p_order_id::text,
        'Shipping cost recognized on fulfillment') on conflict (workspace_id, idempotency_key) do nothing;
    end if;
    if not exists (select 1 from public.order_items where workspace_id = p_workspace_id
        and order_id = p_order_id and unit_cost is null) then
      insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
        currency, effective_at, source_type, source_reference, idempotency_key, note)
      select p_workspace_id, current_order.store_id, p_order_id, 'cogs',
        coalesce(sum(item.quantity * item.unit_cost), 0), current_order.currency, now(),
        'calculated', p_order_id::text, 'order-cogs:' || p_order_id::text,
        'Product cost snapshot recognized on fulfillment'
      from public.order_items item where item.workspace_id = p_workspace_id and item.order_id = p_order_id
      on conflict (workspace_id, idempotency_key) do nothing;
    end if;
  end if;
  update public.orders set status = p_status, payment_status = p_payment_status,
    fulfillment_status = case when p_status = 'fulfilled' then 'fulfilled'
      when p_status = 'cancelled' and current_order.fulfillment_status <> 'fulfilled' then 'cancelled'
      else fulfillment_status end,
    updated_at = now()
  where id = p_order_id and workspace_id = p_workspace_id;
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (p_workspace_id, actor_id, 'order.status_updated', 'order', p_order_id);
end
$function$;
revoke all on function public.set_workspace_order_status(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_workspace_order_status(uuid, uuid, text, text)
  to authenticated;

create or replace function public.record_workspace_refund(
  p_workspace_id uuid, p_order_id uuid, p_amount numeric, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  order_row public.orders%rowtype;
  refund_id uuid;
  next_refund numeric(20, 6);
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Workspace refund permission is required.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or nullif(btrim(p_reason), '') is null or length(p_reason) > 500 then
    raise exception 'Refund amount and reason are required.' using errcode = '22023';
  end if;
  select * into order_row from public.orders where id = p_order_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Order was not found in this workspace.' using errcode = '42501'; end if;
  next_refund := order_row.refund_total + p_amount;
  if next_refund > order_row.total then raise exception 'Refund would exceed the order total.' using errcode = '23514'; end if;
  insert into public.refunds (workspace_id, order_id, amount, currency, status, reason, refunded_at)
  values (p_workspace_id, p_order_id, p_amount, order_row.currency, 'succeeded', btrim(p_reason), now())
  returning id into refund_id;
  update public.orders set refund_total = next_refund,
    status = case when next_refund >= total then 'refunded' else 'partially_refunded' end,
    payment_status = case when next_refund >= total then 'refunded' else 'partially_refunded' end,
    updated_at = now()
  where id = p_order_id and workspace_id = p_workspace_id;
  insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount,
    currency, effective_at, source_type, source_reference, idempotency_key, note)
  values (p_workspace_id, order_row.store_id, p_order_id, 'refund', p_amount, order_row.currency,
    now(), 'manual', refund_id::text, 'refund:' || refund_id::text, btrim(p_reason));
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id, reason)
  values (p_workspace_id, actor_id, 'refund.recorded', 'order', p_order_id, btrim(p_reason));
  return refund_id;
end
$function$;
revoke all on function public.record_workspace_refund(uuid, uuid, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.record_workspace_refund(uuid, uuid, numeric, text) to authenticated;

create or replace function public.save_workspace_expense(
  p_workspace_id uuid, p_expense_id uuid, p_category text, p_description text,
  p_amount numeric, p_currency text, p_expense_date date, p_status text,
  p_accounting_class text, p_payment_method text, p_receipt_reference text, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  resolved_id uuid := p_expense_id;
  previous_row public.expenses%rowtype;
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Workspace expense permission is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_category), '') is null or length(p_category) > 120
     or nullif(btrim(p_description), '') is null or length(p_description) > 1000
     or p_amount <= 0 or p_currency !~ '^[A-Z]{3}$' or p_expense_date is null
     or p_status not in ('draft', 'unpaid', 'paid', 'void')
     or p_accounting_class not in ('operating_expense', 'inventory_purchase', 'freight_in', 'unallocated_procurement', 'other') then
    raise exception 'Expense values are invalid.' using errcode = '22023';
  end if;
  if resolved_id is null then
    insert into public.expenses (workspace_id, category, description, amount, currency,
      expense_date, status, accounting_class, payment_method, receipt_reference, notes, created_by)
    values (p_workspace_id, btrim(p_category), btrim(p_description), p_amount, p_currency,
      p_expense_date, p_status, p_accounting_class, nullif(btrim(p_payment_method), ''),
      nullif(btrim(p_receipt_reference), ''), nullif(btrim(p_notes), ''), actor_id)
    returning id into resolved_id;
  else
    select * into previous_row from public.expenses
    where id = resolved_id and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Expense was not found in this workspace.' using errcode = '42501'; end if;
    if previous_row.status <> 'draft' then
      raise exception 'Posted expenses are immutable; void and replace them with an audited correction.' using errcode = '23514';
    end if;
    update public.expenses set category = btrim(p_category), description = btrim(p_description),
      amount = p_amount, currency = p_currency, expense_date = p_expense_date,
      status = p_status, accounting_class = p_accounting_class,
      payment_method = nullif(btrim(p_payment_method), ''),
      receipt_reference = nullif(btrim(p_receipt_reference), ''),
      notes = nullif(btrim(p_notes), ''), updated_at = now()
    where id = resolved_id and workspace_id = p_workspace_id;
    insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id, event_metadata)
    values (p_workspace_id, actor_id, 'expense.draft_updated', 'expense', resolved_id,
      jsonb_build_object('previous_amount', previous_row.amount, 'new_amount', p_amount));
  end if;
  if p_status in ('paid', 'unpaid') then
    insert into public.financial_entries (workspace_id, entry_type, amount, currency, effective_at,
      source_type, source_reference, idempotency_key, note)
    select p_workspace_id, case p_accounting_class
        when 'inventory_purchase' then 'inventory_purchase'
        when 'freight_in' then 'freight_in'
        else 'expense'
      end,
      p_amount, p_currency, p_expense_date::timestamp at time zone 'Asia/Dhaka',
      'manual', 'expense:' || resolved_id::text, 'expense:' || resolved_id::text,
      'Workspace expense entry'
    where p_accounting_class in ('operating_expense', 'inventory_purchase', 'freight_in', 'other')
    on conflict (workspace_id, idempotency_key) do nothing;
  end if;
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (p_workspace_id, actor_id, case when p_expense_id is null then 'expense.created' else 'expense.updated' end,
    'expense', resolved_id);
  return resolved_id;
end
$function$;
revoke all on function public.save_workspace_expense(uuid, uuid, text, text, numeric,
  text, date, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.save_workspace_expense(uuid, uuid, text, text, numeric,
  text, date, text, text, text, text, text) to authenticated;

create index orders_workspace_payment_idx on public.orders (workspace_id, payment_status, placed_at desc);
create index customers_workspace_last_seen_idx on public.customers (workspace_id, last_seen_at desc);
create index products_workspace_category_idx on public.products (workspace_id, category, status);

create or replace function public.workspace_reporting_metrics(
  p_workspace_id uuid, p_start_date date, p_end_date date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin') then
    raise exception 'Workspace owner or administrator access is required.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or p_end_date - p_start_date > 366 then
    raise exception 'Reporting date range is invalid.' using errcode = '22023';
  end if;

  with entries as (
    select entry_type, amount, currency, effective_at
    from public.financial_entries
    where workspace_id = p_workspace_id
      and effective_at >= (p_start_date::timestamp at time zone 'Asia/Dhaka')
      and effective_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Dhaka')
  ), totals as (
    select currency,
      coalesce(sum(amount) filter (where entry_type = 'revenue'), 0) as revenue,
      coalesce(sum(amount) filter (where entry_type = 'discount'), 0) as discounts,
      coalesce(sum(amount) filter (where entry_type = 'refund'), 0) as refunds,
      coalesce(sum(amount) filter (where entry_type = 'cogs'), 0) as cogs,
      coalesce(sum(amount) filter (where entry_type = 'shipping_income'), 0) as shipping_income,
      coalesce(sum(amount) filter (where entry_type = 'shipping_cost'), 0) as shipping_cost,
      coalesce(sum(amount) filter (where entry_type = 'fee'), 0) as fees,
      coalesce(sum(amount) filter (where entry_type = 'expense'), 0) as expenses
    from entries group by currency
  ), order_totals as (
    select orders.currency, count(*) as completed_orders, coalesce(sum(orders.total), 0) as order_value,
      count(*) filter (where not exists (select 1 from public.financial_entries revenue
        where revenue.workspace_id = orders.workspace_id and revenue.order_id = orders.id and revenue.entry_type = 'revenue')) as missing_revenue_orders,
      count(*) filter (where not exists (select 1 from public.financial_entries cogs
        where cogs.workspace_id = orders.workspace_id and cogs.order_id = orders.id and cogs.entry_type = 'cogs')) as missing_cogs_orders,
      count(*) filter (where orders.refund_total > 0 and not exists (select 1 from public.financial_entries refund_entry
        where refund_entry.workspace_id = orders.workspace_id and refund_entry.order_id = orders.id and refund_entry.entry_type = 'refund')) as missing_refund_orders,
      count(*) filter (where orders.shipping_cost is null or (orders.shipping_cost > 0 and not exists (
        select 1 from public.financial_entries shipping_entry where shipping_entry.workspace_id = orders.workspace_id
          and shipping_entry.order_id = orders.id and shipping_entry.entry_type = 'shipping_cost'))) as missing_shipping_cost_orders
    from public.orders
    where orders.workspace_id = p_workspace_id
      and orders.status in ('fulfilled', 'partially_refunded', 'refunded')
      and orders.placed_at >= (p_start_date::timestamp at time zone 'Asia/Dhaka')
      and orders.placed_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Dhaka')
    group by orders.currency
  ), currencies as (
    select currency from totals union select currency from order_totals
  ), daily as (
    select (effective_at at time zone 'Asia/Dhaka')::date as day, currency, sum(amount) as revenue
    from entries where entry_type = 'revenue'
    group by 1, 2 order by 1
  ), best_sellers as (
    select item.product_name_snapshot as name, sum(item.quantity) as quantity,
      sum(item.line_total) as sales, order_row.currency
    from public.order_items item
    join public.orders order_row on order_row.workspace_id = item.workspace_id and order_row.id = item.order_id
    where item.workspace_id = p_workspace_id
      and order_row.status in ('fulfilled', 'partially_refunded', 'refunded')
      and order_row.placed_at >= (p_start_date::timestamp at time zone 'Asia/Dhaka')
      and order_row.placed_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Dhaka')
    group by item.product_name_snapshot, order_row.currency
    order by sum(item.quantity) desc limit 10
  ), inventory_alerts as (
    select count(*) as count
    from public.inventory_levels level
    join public.product_variants variant on variant.workspace_id = level.workspace_id and variant.id = level.product_variant_id
    where level.workspace_id = p_workspace_id
      and level.quantity <= greatest(level.reorder_level, variant.reorder_level)
  ), customer_growth as (
    select (first_seen_at at time zone 'Asia/Dhaka')::date as day, count(*) as customers
    from public.customers
    where workspace_id = p_workspace_id and first_seen_at is not null
      and first_seen_at >= (p_start_date::timestamp at time zone 'Asia/Dhaka')
      and first_seen_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Dhaka')
    group by 1 order by 1
  ), recent_orders as (
    select id, order_number, status, payment_status, currency, total, placed_at
    from public.orders where workspace_id = p_workspace_id
    order by placed_at desc limit 10
  )
  select jsonb_build_object(
    'totals', coalesce((select jsonb_agg(jsonb_build_object(
      'currency', currencies.currency, 'orders', coalesce(order_totals.completed_orders, 0),
      'missing_revenue_orders', coalesce(order_totals.missing_revenue_orders, 0),
      'missing_cogs_orders', coalesce(order_totals.missing_cogs_orders, 0),
      'missing_refund_orders', coalesce(order_totals.missing_refund_orders, 0),
      'missing_shipping_cost_orders', coalesce(order_totals.missing_shipping_cost_orders, 0),
      'average_order_value', case when coalesce(order_totals.completed_orders, 0) = 0 then 0 else order_totals.order_value / order_totals.completed_orders end,
      'revenue', coalesce(totals.revenue, 0), 'discounts', coalesce(totals.discounts, 0), 'refunds', coalesce(totals.refunds, 0),
      'cogs', coalesce(totals.cogs, 0), 'shipping_income', coalesce(totals.shipping_income, 0), 'shipping_cost', coalesce(totals.shipping_cost, 0),
      'fees', coalesce(totals.fees, 0), 'expenses', coalesce(totals.expenses, 0),
      'gross_profit', case when coalesce(order_totals.missing_revenue_orders, 0) + coalesce(order_totals.missing_cogs_orders, 0) + coalesce(order_totals.missing_refund_orders, 0) = 0
        then coalesce(totals.revenue, 0) - coalesce(totals.discounts, 0) - coalesce(totals.refunds, 0) - coalesce(totals.cogs, 0) else null end,
      'net_profit', case when coalesce(order_totals.missing_revenue_orders, 0) + coalesce(order_totals.missing_cogs_orders, 0)
        + coalesce(order_totals.missing_refund_orders, 0) + coalesce(order_totals.missing_shipping_cost_orders, 0) = 0
        then coalesce(totals.revenue, 0) - coalesce(totals.discounts, 0) - coalesce(totals.refunds, 0) - coalesce(totals.cogs, 0)
        + coalesce(totals.shipping_income, 0) - coalesce(totals.shipping_cost, 0) - coalesce(totals.fees, 0) - coalesce(totals.expenses, 0)
        else null end
    ) order by currencies.currency) from currencies left join totals using (currency) left join order_totals using (currency)), '[]'::jsonb),
    'daily_revenue', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'currency', currency, 'revenue', revenue) order by day) from daily), '[]'::jsonb),
    'best_sellers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'sales', sales, 'currency', currency) order by quantity desc) from best_sellers), '[]'::jsonb),
    'low_stock_count', coalesce((select count from inventory_alerts), 0),
    'customer_growth', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'customers', customers) order by day) from customer_growth), '[]'::jsonb),
    'recent_orders', coalesce((select jsonb_agg(jsonb_build_object('order_number', order_number, 'status', status,
      'payment_status', payment_status, 'currency', currency, 'total', total, 'placed_at', placed_at) order by placed_at desc) from recent_orders), '[]'::jsonb)
  ) into result;
  return result;
end
$function$;

revoke all on function public.workspace_reporting_metrics(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.workspace_reporting_metrics(uuid, date, date) to authenticated;

create index financial_entries_workspace_type_date_idx
  on public.financial_entries (workspace_id, entry_type, effective_at desc);

create or replace function public.create_workspace_order(
  p_workspace_id uuid, p_store_id uuid, p_order_number text, p_customer_name text,
  p_customer_phone text, p_customer_address jsonb, p_payment_method text, p_items jsonb,
  p_discount numeric, p_shipping_total numeric, p_shipping_cost numeric, p_tax_total numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  customer_id uuid;
  order_id uuid;
  line jsonb;
  variant_row public.product_variants%rowtype;
  item_quantity numeric(20, 6);
  item_price numeric(20, 6);
  item_cost numeric(20, 6);
  item_subtotal numeric(20, 6) := 0;
  order_currency text;
  customer_phone text := nullif(btrim(p_customer_phone), '');
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager', 'staff') then
    raise exception 'Workspace order permission is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stores where id = p_store_id and workspace_id = p_workspace_id and is_active)
     or nullif(btrim(p_order_number), '') is null or length(p_order_number) > 120
     or nullif(btrim(p_customer_name), '') is null or length(p_customer_name) > 500
     or jsonb_typeof(p_customer_address) <> 'object'
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100
     or coalesce(p_discount, -1) < 0 or coalesce(p_shipping_total, -1) < 0
     or coalesce(p_shipping_cost, -1) < 0 or coalesce(p_tax_total, -1) < 0 then
    raise exception 'Order values are invalid.' using errcode = '22023';
  end if;

  if customer_phone is not null then
    select id into customer_id from public.customers
    where workspace_id = p_workspace_id and store_id = p_store_id and phone = customer_phone
    order by created_at limit 1;
  end if;
  if customer_id is null then
    insert into public.customers (workspace_id, store_id, phone, full_name, shipping_address, first_seen_at, last_seen_at)
    values (p_workspace_id, p_store_id, customer_phone, btrim(p_customer_name), p_customer_address, now(), now())
    returning id into customer_id;
  else
    update public.customers set last_seen_at = now(), updated_at = now()
    where id = customer_id and workspace_id = p_workspace_id;
  end if;

  for line in select value from jsonb_array_elements(p_items)
  loop
    if nullif(line->>'variant_id', '') is null then raise exception 'Order item variant is required.' using errcode = '22023'; end if;
    select variant.* into variant_row from public.product_variants variant
    join public.products product on product.workspace_id = variant.workspace_id and product.id = variant.product_id
    where variant.id = (line->>'variant_id')::uuid and variant.workspace_id = p_workspace_id and product.status = 'active';
    if not found then raise exception 'Order item is not an active product in this workspace.' using errcode = '42501'; end if;
    item_quantity := (line->>'quantity')::numeric;
    item_price := (line->>'unit_price')::numeric;
    if item_quantity <= 0 or item_price < 0 or item_quantity > 1000000 or item_price > 99999999999999 then
      raise exception 'Order item quantity or price is invalid.' using errcode = '22023';
    end if;
    if order_currency is null then order_currency := variant_row.currency;
    elsif order_currency <> variant_row.currency then raise exception 'Order items must use one currency.' using errcode = '22023'; end if;
    item_subtotal := item_subtotal + item_quantity * item_price;
  end loop;
  if p_discount > item_subtotal then raise exception 'Discount cannot exceed the item subtotal.' using errcode = '22023'; end if;

  insert into public.orders (workspace_id, store_id, customer_id, order_number, status,
    payment_status, fulfillment_status, payment_method, currency, subtotal, discount_total,
    shipping_total, shipping_cost, tax_total, total, customer_name_snapshot, customer_phone_snapshot,
    shipping_address_snapshot, source, source_status, placed_at)
  values (p_workspace_id, p_store_id, customer_id, btrim(p_order_number), 'pending', 'pending',
    'unfulfilled', nullif(btrim(p_payment_method), ''), order_currency, item_subtotal, p_discount,
    p_shipping_total, p_shipping_cost, p_tax_total, item_subtotal - p_discount + p_shipping_total + p_tax_total,
    btrim(p_customer_name), customer_phone, p_customer_address, 'manual', 'manual', now())
  returning id into order_id;

  for line in select value from jsonb_array_elements(p_items)
  loop
    select variant.* into variant_row from public.product_variants variant
    where variant.id = (line->>'variant_id')::uuid and variant.workspace_id = p_workspace_id;
    item_quantity := (line->>'quantity')::numeric;
    item_price := (line->>'unit_price')::numeric;
    select cost_price into item_cost from public.product_variant_costs
    where workspace_id = p_workspace_id and product_variant_id = variant_row.id;
    insert into public.order_items (workspace_id, order_id, product_variant_id, product_name_snapshot,
      sku_snapshot, quantity, unit_price, unit_cost, line_total, source_metadata)
    select p_workspace_id, order_id, variant_row.id, product.name, variant_row.sku,
      item_quantity, item_price, item_cost, item_quantity * item_price,
      jsonb_build_object('origin', 'manual_workspace_order')
    from public.products product
    where product.id = variant_row.product_id and product.workspace_id = p_workspace_id;
  end loop;
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (p_workspace_id, actor_id, 'order.created', 'order', order_id);
  return order_id;
end
$function$;

revoke all on function public.create_workspace_order(uuid, uuid, text, text, text, jsonb, text, jsonb, numeric, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.create_workspace_order(uuid, uuid, text, text, text, jsonb, text, jsonb, numeric, numeric, numeric, numeric)
  to authenticated;

create or replace function public.save_workspace_customer_notes(
  p_workspace_id uuid, p_customer_id uuid, p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or coalesce(public.current_workspace_role(p_workspace_id), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Workspace customer permission is required.' using errcode = '42501';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'Customer notes are too long.' using errcode = '22023';
  end if;
  update public.customers set notes = nullif(btrim(p_notes), ''), updated_at = now()
  where id = p_customer_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Customer was not found in this workspace.' using errcode = '42501'; end if;
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (p_workspace_id, actor_id, 'customer.notes_updated', 'customer', p_customer_id);
end
$function$;
revoke all on function public.save_workspace_customer_notes(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.save_workspace_customer_notes(uuid, uuid, text) to authenticated;

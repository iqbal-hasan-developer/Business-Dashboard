-- DEVELOPMENT ONLY. Never add this file to the production migration history.
-- Requires an explicit session acknowledgement and an empty storefront schema.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $baseline_guard$
declare
  existing_relations text[];
begin
  if current_setting('nexanotion.development_baseline_ack', true)
       is distinct from 'confirmed-empty-development-project' then
    raise exception 'Development baseline aborted: acknowledgement is missing.';
  end if;

  select array_agg(class.relname order by class.relname)
  into existing_relations
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p', 'v', 'm', 'f');

  if existing_relations is not null then
    raise exception
      'Development baseline aborted: public relations already exist: %',
      array_to_string(existing_relations, ', ');
  end if;
end
$baseline_guard$;

create extension if not exists pgcrypto;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id),
  name text not null,
  slug text unique not null,
  short_description text,
  description text,
  price numeric not null,
  compare_at_price numeric,
  image_url text,
  gallery_urls text[] default '{}',
  stock integer default 0,
  is_active boolean default true,
  is_best_seller boolean default false,
  is_new boolean default false,
  is_offer boolean default false,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  sku text,
  low_stock_threshold integer not null default 5,
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  inventory_tracking boolean not null default true,
  constraint products_price_nonnegative check (price >= 0),
  constraint products_compare_at_price_nonnegative
    check (compare_at_price is null or compare_at_price >= 0),
  constraint products_stock_nonnegative check (stock >= 0)
);

alter table public.products add constraint products_low_stock_threshold_nonnegative
  check (low_stock_threshold >= 0) not valid;
alter table public.products add constraint products_sort_order_nonnegative
  check (sort_order >= 0) not valid;
alter table public.categories add constraint categories_sort_order_nonnegative
  check (sort_order is null or sort_order >= 0) not valid;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  delivery_area text not null,
  customer_note text,
  payment_method text not null,
  payment_status text not null default 'unpaid',
  order_status text not null default 'pending',
  subtotal numeric not null,
  delivery_charge numeric not null default 80,
  total numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  payment_transaction_id text,
  payment_number text,
  constraint orders_payment_method_allowed
    check (payment_method in ('cod', 'bkash', 'nagad')),
  constraint orders_payment_status_allowed
    check (payment_status in ('unpaid', 'pending', 'verified', 'failed', 'refunded')),
  constraint orders_order_status_allowed
    check (order_status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  constraint orders_subtotal_nonnegative check (subtotal >= 0),
  constraint orders_delivery_charge_nonnegative check (delivery_charge >= 0),
  constraint orders_total_nonnegative check (total >= 0)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  product_slug text not null,
  product_image_url text,
  unit_price numeric not null,
  quantity integer not null,
  line_total numeric not null,
  created_at timestamptz default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_nonnegative check (unit_price >= 0),
  constraint order_items_line_total_nonnegative check (line_total >= 0)
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  subject text,
  message text not null,
  status text default 'new',
  created_at timestamptz default now(),
  constraint contact_messages_status_allowed
    check (status in ('new', 'read', 'replied', 'archived'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.decrement_product_stock(
  product_id uuid,
  requested_quantity integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  if requested_quantity <= 0 then
    return false;
  end if;

  update public.products
  set stock = stock - requested_quantity,
      updated_at = now()
  where id = product_id
    and inventory_tracking = true
    and stock >= requested_quantity;

  return found;
end;
$function$;

create index categories_active_sort_idx
  on public.categories (is_active, sort_order, name);
create index products_active_category_idx
  on public.products (is_active, category_id);
create index products_slug_idx on public.products (slug);
create index products_active_sort_idx
  on public.products (is_active, sort_order, created_at desc);
create index products_low_stock_idx
  on public.products (inventory_tracking, stock, low_stock_threshold);
create index products_sku_idx on public.products (sku);
create index orders_lookup_idx
  on public.orders (order_number, customer_phone);
create index orders_manual_payment_status_idx
  on public.orders (payment_method, payment_status)
  where payment_transaction_id is not null;
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index contact_messages_status_created_idx
  on public.contact_messages (status, created_at desc);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.contact_messages enable row level security;

create policy "Public can read active categories"
on public.categories for select to anon, authenticated
using (is_active = true);

create policy "Public can read active products"
on public.products for select to anon, authenticated
using (is_active = true);

revoke all on table public.categories, public.products, public.orders,
  public.order_items, public.contact_messages from public;
grant all on table public.categories, public.products, public.orders,
  public.order_items, public.contact_messages to anon, authenticated, service_role;

grant execute on function public.set_updated_at()
  to public, anon, authenticated, service_role;

revoke execute on function public.decrement_product_stock(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.decrement_product_stock(uuid, integer)
  to service_role;

commit;

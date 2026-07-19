-- Authenticated owner/admin product catalog management without inventory writes.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if to_regclass('public.products') is null
     or to_regclass('public.product_business_data') is null
     or to_regclass('public.categories') is null
     or to_regprocedure('public.dashboard_has_any_role(public.dashboard_role[])') is null then
    raise exception 'Product catalog management prerequisites are missing.';
  end if;
  if to_regprocedure('public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)') is not null
     or to_regprocedure('public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)') is not null then
    raise exception 'Product catalog management RPCs already exist.';
  end if;
  if exists (
    select 1 from public.products group by lower(btrim(slug)) having count(*) > 1
  ) then
    raise exception 'Case-insensitive duplicate product slugs must be resolved first.';
  end if;
  if has_table_privilege('authenticated', 'public.products', 'INSERT')
     or has_table_privilege('authenticated', 'public.products', 'UPDATE')
     or has_table_privilege('authenticated', 'public.product_business_data', 'INSERT')
     or has_table_privilege('authenticated', 'public.product_business_data', 'UPDATE') then
    raise exception 'Authenticated direct catalog write privileges changed unexpectedly.';
  end if;
end
$preflight$;

create unique index if not exists products_slug_ci_uidx
  on public.products (lower(btrim(slug)));

create or replace function public.create_dashboard_product(
  p_name text,
  p_slug text,
  p_sku text,
  p_price numeric,
  p_is_active boolean default true,
  p_category_id uuid default null,
  p_buying_price numeric default 0,
  p_reorder_level integer default 0,
  p_dashboard_sku text default null,
  p_variation text default null,
  p_internal_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  product_key uuid := gen_random_uuid();
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to manage products' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null
     or nullif(btrim(p_slug), '') is null
     or nullif(btrim(p_sku), '') is null
     or p_price is null or p_price < 0
     or p_buying_price is null or p_buying_price < 0
     or p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Invalid product values' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.products where lower(btrim(slug)) = lower(btrim(p_slug))
  ) or exists (
    select 1 from public.products where lower(btrim(sku)) = lower(btrim(p_sku))
  ) or (nullif(btrim(p_dashboard_sku), '') is not null and exists (
    select 1 from public.product_business_data
    where lower(btrim(sku_override)) = lower(btrim(p_dashboard_sku))
  )) then
    raise exception 'Product slug or SKU already exists' using errcode = '23505';
  end if;

  insert into public.products (
    id, category_id, name, slug, sku, price, stock, is_active
  ) values (
    product_key, p_category_id, btrim(p_name), btrim(p_slug), btrim(p_sku),
    p_price, 0, coalesce(p_is_active, true)
  );

  insert into public.product_business_data (
    product_id, sku_override, variation, buying_price,
    buying_price_verified_at, buying_price_verified_by,
    reorder_level, internal_notes, created_by, updated_by
  ) values (
    product_key, nullif(btrim(p_dashboard_sku), ''),
    nullif(btrim(p_variation), ''), p_buying_price, now(), actor,
    p_reorder_level, nullif(btrim(p_internal_notes), ''), actor, actor
  );

  return product_key;
end
$function$;

revoke all on function public.create_dashboard_product(
  text, text, text, numeric, boolean, uuid, numeric, integer, text, text, text
) from public, anon, service_role;
grant execute on function public.create_dashboard_product(
  text, text, text, numeric, boolean, uuid, numeric, integer, text, text, text
) to authenticated;

create or replace function public.update_dashboard_product(
  p_product_id uuid,
  p_name text,
  p_slug text,
  p_sku text,
  p_price numeric,
  p_is_active boolean,
  p_category_id uuid default null,
  p_buying_price numeric default 0,
  p_reorder_level integer default 0,
  p_dashboard_sku text default null,
  p_variation text default null,
  p_internal_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to manage products' using errcode = '42501';
  end if;
  if p_product_id is null
     or nullif(btrim(p_name), '') is null
     or nullif(btrim(p_slug), '') is null
     or nullif(btrim(p_sku), '') is null
     or p_price is null or p_price < 0
     or p_buying_price is null or p_buying_price < 0
     or p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Invalid product values' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.products
    where id <> p_product_id and lower(btrim(slug)) = lower(btrim(p_slug))
  ) or exists (
    select 1 from public.products
    where id <> p_product_id and lower(btrim(sku)) = lower(btrim(p_sku))
  ) or (nullif(btrim(p_dashboard_sku), '') is not null and exists (
    select 1 from public.product_business_data
    where product_id <> p_product_id
      and lower(btrim(sku_override)) = lower(btrim(p_dashboard_sku))
  )) then
    raise exception 'Product slug or SKU already exists' using errcode = '23505';
  end if;

  update public.products
  set category_id = p_category_id,
      name = btrim(p_name),
      slug = btrim(p_slug),
      sku = btrim(p_sku),
      price = p_price,
      is_active = coalesce(p_is_active, true)
  where id = p_product_id;

  insert into public.product_business_data (
    product_id, sku_override, variation, buying_price,
    buying_price_verified_at, buying_price_verified_by,
    reorder_level, internal_notes, created_by, updated_by
  ) values (
    p_product_id, nullif(btrim(p_dashboard_sku), ''),
    nullif(btrim(p_variation), ''), p_buying_price, now(), actor,
    p_reorder_level, nullif(btrim(p_internal_notes), ''), actor, actor
  )
  on conflict (product_id) do update set
    sku_override = excluded.sku_override,
    variation = excluded.variation,
    buying_price = excluded.buying_price,
    buying_price_verified_at = excluded.buying_price_verified_at,
    buying_price_verified_by = excluded.buying_price_verified_by,
    reorder_level = excluded.reorder_level,
    internal_notes = excluded.internal_notes,
    updated_by = excluded.updated_by;

  return p_product_id;
end
$function$;

revoke all on function public.update_dashboard_product(
  uuid, text, text, text, numeric, boolean, uuid, numeric, integer,
  text, text, text
) from public, anon, service_role;
grant execute on function public.update_dashboard_product(
  uuid, text, text, text, numeric, boolean, uuid, numeric, integer,
  text, text, text
) to authenticated;

do $postcondition$
declare
  create_rpc regprocedure := to_regprocedure(
    'public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'
  );
  update_rpc regprocedure := to_regprocedure(
    'public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'
  );
begin
  if create_rpc is null or update_rpc is null
     or not has_function_privilege('authenticated', create_rpc, 'EXECUTE')
     or not has_function_privilege('authenticated', update_rpc, 'EXECUTE')
     or has_function_privilege('anon', create_rpc, 'EXECUTE')
     or has_function_privilege('anon', update_rpc, 'EXECUTE')
     or has_function_privilege('service_role', create_rpc, 'EXECUTE')
     or has_function_privilege('service_role', update_rpc, 'EXECUTE') then
    raise exception 'Product catalog management RPC postcondition failed.';
  end if;
end
$postcondition$;

commit;

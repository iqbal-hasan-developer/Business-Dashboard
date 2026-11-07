-- Reconcile the optional pg_trgm path from migration 006 on PostgreSQL 17.
-- PGlite has no pg_trgm package and continues to exercise ILIKE without the
-- performance indexes; the real PostgreSQL 17 verification path must install it.
do $migration$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_trgm')
     or current_setting('server_version_num')::integer between 170000 and 179999 then
    execute 'create extension if not exists pg_trgm with schema extensions';

    if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_trgm') then
      raise exception 'pg_trgm is available but was not installed in this PostgreSQL database';
    end if;

    if (select n.nspname from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm') <> 'extensions' then
      alter extension pg_trgm set schema extensions;
    end if;

    create index if not exists products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
    create index if not exists products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops) where sku is not null;
    create index if not exists orders_number_trgm_idx on public.orders using gin (order_number extensions.gin_trgm_ops);
    create index if not exists orders_customer_name_trgm_idx on public.orders using gin (customer_name_snapshot extensions.gin_trgm_ops) where customer_name_snapshot is not null;
    create index if not exists orders_customer_phone_trgm_idx on public.orders using gin (customer_phone_snapshot extensions.gin_trgm_ops) where customer_phone_snapshot is not null;
    create index if not exists customers_name_trgm_idx on public.customers using gin (full_name extensions.gin_trgm_ops);
    create index if not exists customers_email_trgm_idx on public.customers using gin (email extensions.gin_trgm_ops) where email is not null;
    create index if not exists customers_phone_trgm_idx on public.customers using gin (phone extensions.gin_trgm_ops) where phone is not null;
    create index if not exists variants_name_trgm_idx on public.product_variants using gin (name extensions.gin_trgm_ops);
    create index if not exists variants_sku_trgm_idx on public.product_variants using gin (sku extensions.gin_trgm_ops) where sku is not null;
    create index if not exists variants_barcode_trgm_idx on public.product_variants using gin (barcode extensions.gin_trgm_ops) where barcode is not null;
    create index if not exists expenses_description_trgm_idx on public.expenses using gin (description extensions.gin_trgm_ops);
    create index if not exists expenses_category_trgm_idx on public.expenses using gin (category extensions.gin_trgm_ops);
  end if;
end
$migration$;

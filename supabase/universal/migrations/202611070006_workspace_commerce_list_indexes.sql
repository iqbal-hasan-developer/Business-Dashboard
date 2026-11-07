-- Phase 4 list access patterns: workspace filters, deterministic page ordering,
-- exact/range filters, and substring searches used by the server list reader.
create index products_workspace_updated_page_idx
  on public.products (workspace_id, updated_at desc, id);
create index products_workspace_price_page_idx
  on public.products (workspace_id, price, id);
create index orders_workspace_total_page_idx
  on public.orders (workspace_id, total, id);
create index orders_workspace_number_page_idx
  on public.orders (workspace_id, order_number, id);
create index customers_workspace_name_page_idx
  on public.customers (workspace_id, full_name, id);
create index customers_workspace_created_page_idx
  on public.customers (workspace_id, created_at desc, id);
create index product_variants_workspace_name_page_idx
  on public.product_variants (workspace_id, name, id);
create index product_variants_workspace_price_page_idx
  on public.product_variants (workspace_id, price, id);
create index expenses_workspace_amount_page_idx
  on public.expenses (workspace_id, amount, id);
create index expenses_workspace_category_page_idx
  on public.expenses (workspace_id, category, id);

-- Substring search remains functionally available through ILIKE when pg_trgm
-- is absent, but it will not have trigram indexes. The PostgreSQL 17 CI check
-- requires this extension and fails if these indexes are not created. PGlite
-- omits pg_trgm and therefore only exercises this migration's fallback path.
do $migration$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_trgm') then
    create extension if not exists pg_trgm with schema extensions;
    if (select n.nspname from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm') <> 'extensions' then
      -- pg_trgm is relocatable; normalize a preinstalled copy before using
      -- the schema-qualified operator class below.
      alter extension pg_trgm set schema extensions;
    end if;
    create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
    create index products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops) where sku is not null;
    create index orders_number_trgm_idx on public.orders using gin (order_number extensions.gin_trgm_ops);
    create index orders_customer_name_trgm_idx on public.orders using gin (customer_name_snapshot extensions.gin_trgm_ops) where customer_name_snapshot is not null;
    create index orders_customer_phone_trgm_idx on public.orders using gin (customer_phone_snapshot extensions.gin_trgm_ops) where customer_phone_snapshot is not null;
    create index customers_name_trgm_idx on public.customers using gin (full_name extensions.gin_trgm_ops);
    create index customers_email_trgm_idx on public.customers using gin (email extensions.gin_trgm_ops) where email is not null;
    create index customers_phone_trgm_idx on public.customers using gin (phone extensions.gin_trgm_ops) where phone is not null;
    create index variants_name_trgm_idx on public.product_variants using gin (name extensions.gin_trgm_ops);
    create index variants_sku_trgm_idx on public.product_variants using gin (sku extensions.gin_trgm_ops) where sku is not null;
    create index variants_barcode_trgm_idx on public.product_variants using gin (barcode extensions.gin_trgm_ops) where barcode is not null;
    create index expenses_description_trgm_idx on public.expenses using gin (description extensions.gin_trgm_ops);
    create index expenses_category_trgm_idx on public.expenses using gin (category extensions.gin_trgm_ops);
  end if;
end
$migration$;

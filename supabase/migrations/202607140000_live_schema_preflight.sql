-- Read-only compatibility gate. This migration intentionally makes no schema changes.
-- It must run first against the separate development project and should be reviewed
-- against a fresh schema dump before any later migration is applied.
do $$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.products') is null then missing := array_append(missing, 'public.products'); end if;
  if to_regclass('public.orders') is null then missing := array_append(missing, 'public.orders'); end if;
  if to_regclass('public.order_items') is null then missing := array_append(missing, 'public.order_items'); end if;

  if array_length(missing, 1) is not null then
    raise exception 'Dashboard compatibility preflight failed. Missing tables: %', array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'id' and data_type = 'uuid') then
    raise exception 'Expected public.products.id to be uuid. Verify the live schema before continuing.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name in ('id', 'category_id', 'name', 'slug', 'sku', 'price', 'stock', 'is_active', 'created_at', 'updated_at')) group by table_name having count(*) = 10) then
    raise exception 'Expected legacy product compatibility columns are missing. Verify the live schema before continuing.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'id' and data_type = 'uuid') then
    raise exception 'Expected public.orders.id to be uuid. Verify the live schema before continuing.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('id', 'order_number', 'customer_name', 'customer_phone', 'customer_address', 'delivery_area', 'customer_note', 'payment_method', 'payment_status', 'order_status', 'subtotal', 'delivery_charge', 'total', 'created_at', 'updated_at')) group by table_name having count(*) = 15) then
    raise exception 'Expected legacy order compatibility columns are missing. Verify the live schema before continuing.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name in ('id', 'order_id', 'product_id', 'product_name', 'product_slug', 'unit_price', 'quantity', 'line_total', 'created_at')) group by table_name having count(*) = 9) then
    raise exception 'Expected legacy order_items compatibility columns are missing. Verify the live schema before continuing.';
  end if;
end $$;

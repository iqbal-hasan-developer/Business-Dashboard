-- Read-only compatibility and data-quality gate. This migration intentionally
-- performs no DDL or DML. It must pass before any dashboard object is created.

do $preflight$
declare
  missing text[] := '{}';
  issue_count bigint;
  target_function oid;
  public_can_execute boolean;
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'PostgreSQL 15 or newer is required for NULLS NOT DISTINCT.';
  end if;

  if to_regclass('public.categories') is null then missing := array_append(missing, 'public.categories'); end if;
  if to_regclass('public.contact_messages') is null then missing := array_append(missing, 'public.contact_messages'); end if;
  if to_regclass('public.products') is null then missing := array_append(missing, 'public.products'); end if;
  if to_regclass('public.orders') is null then missing := array_append(missing, 'public.orders'); end if;
  if to_regclass('public.order_items') is null then missing := array_append(missing, 'public.order_items'); end if;

  if array_length(missing, 1) is not null then
    raise exception 'Dashboard compatibility preflight failed. Missing tables: %',
      array_to_string(missing, ', ');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    raise exception 'Expected public.products.id to be uuid.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name in (
        'id', 'category_id', 'name', 'slug', 'sku', 'price', 'stock',
        'inventory_tracking', 'is_active', 'created_at', 'updated_at'
      )
    group by table_name having count(*) = 11
  ) then
    raise exception 'Expected storefront product columns are missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name in (
        'id', 'order_number', 'customer_name', 'customer_phone',
        'customer_address', 'delivery_area', 'customer_note', 'payment_method',
        'payment_status', 'order_status', 'subtotal', 'delivery_charge', 'total',
        'created_at', 'updated_at', 'payment_transaction_id', 'payment_number'
      )
    group by table_name having count(*) = 17
  ) then
    raise exception 'Expected storefront order columns are missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_items'
      and column_name in (
        'id', 'order_id', 'product_id', 'product_name', 'product_slug',
        'product_image_url', 'unit_price', 'quantity', 'line_total', 'created_at'
      )
    group by table_name having count(*) = 10
  ) then
    raise exception 'Expected storefront order-item columns are missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_order_number_key'
      and contype = 'u'
  ) then
    raise exception 'Expected the existing unique order-number constraint.';
  end if;

  if (
    select count(*)
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and conname in (
        'orders_payment_method_allowed',
        'orders_payment_status_allowed',
        'orders_order_status_allowed'
      )
  ) <> 3 then
    raise exception 'Expected the confirmed storefront order constraints.';
  end if;

  if to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception 'Expected Supabase API roles are missing.';
  end if;

  target_function := to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )::oid;
  if target_function is null then
    raise exception 'Expected decrement_product_stock(uuid, integer).';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = target_function
      and prosecdef
      and pg_get_function_result(oid) = 'boolean'
  ) then
    raise exception 'The stock function is not the confirmed SECURITY DEFINER boolean overload.';
  end if;

  select coalesce(bool_or(
    acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), false)
  into public_can_execute
  from pg_proc as function_record
  cross join lateral aclexplode(
    coalesce(
      function_record.proacl,
      acldefault('f'::"char", function_record.proowner)
    )
  ) as acl
  where function_record.oid = target_function;

  if public_can_execute
     or has_function_privilege('anon', target_function, 'EXECUTE')
     or has_function_privilege('authenticated', target_function, 'EXECUTE')
     or not has_function_privilege('service_role', target_function, 'EXECUTE') then
    raise exception 'The verified stock-function ACL is not present.';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure('public.set_updated_at()')
      and not prosecdef
      and pg_get_function_result(oid) = 'trigger'
  ) then
    raise exception 'Expected public.set_updated_at() to be a SECURITY INVOKER trigger function.';
  end if;

  select count(*) into issue_count
  from public.orders
  where payment_method is null
     or lower(payment_method) not in (
       'cod', 'bkash', 'nagad', 'cash', 'bank_transfer'
     );
  if issue_count > 0 then
    raise exception 'Preflight blocked: % orders use unsupported payment values.', issue_count;
  end if;

  select count(*) into issue_count
  from public.orders
  where order_status is null
     or payment_status is null
     or lower(order_status) not in (
       'pending', 'confirmed', 'processing', 'shipped', 'delivered',
       'cancelled'
     )
     or lower(payment_status) not in (
       'unpaid', 'pending', 'verified', 'failed', 'refunded'
     );
  if issue_count > 0 then
    raise exception 'Preflight blocked: % orders use unsupported status values.', issue_count;
  end if;

  select count(*) into issue_count
  from public.orders
  where created_at is null;
  if issue_count > 0 then
    raise exception 'Preflight blocked: % orders have no trustworthy creation timestamp.', issue_count;
  end if;

  select count(*) into issue_count
  from public.order_items
  where order_id is null or product_id is null;
  if issue_count > 0 then
    raise exception 'Preflight blocked: % order items have nullable order/product links.', issue_count;
  end if;

  select count(*) into issue_count
  from (
    select order_number from public.orders
    group by order_number having count(*) > 1
  ) as duplicates;
  if issue_count > 0 then
    raise exception 'Preflight blocked: % duplicate order numbers exist.', issue_count;
  end if;

  select count(*) into issue_count
  from public.products
  where sku is null or btrim(sku) = '';
  if issue_count > 0 then
    raise exception 'Preflight blocked: % products require an approved SKU backfill.', issue_count;
  end if;

  select count(*) into issue_count
  from (
    select lower(btrim(sku)) from public.products
    group by lower(btrim(sku)) having count(*) > 1
  ) as duplicate_skus;
  if issue_count > 0 then
    raise exception 'Preflight blocked: % case-insensitive duplicate SKUs exist.', issue_count;
  end if;

  select count(*) into issue_count
  from public.orders as orders
  where lower(orders.order_status) = 'delivered'
    and not exists (
      select 1 from public.order_items as item
      where item.order_id = orders.id
    );
  if issue_count > 0 then
    raise exception 'Preflight blocked: % Delivered orders have no items.', issue_count;
  end if;
end
$preflight$;
